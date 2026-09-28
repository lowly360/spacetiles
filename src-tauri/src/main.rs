#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[cfg(target_os = "macos")]
mod menu;
mod scanner;
use scanner::{Job, Snapshot, Tree};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex,
    },
};

#[derive(Default)]
struct AppState {
    current: Mutex<Option<Arc<Job>>>,
    next_id: AtomicU64,
}
fn current_job(state: &AppState, scan_id: u64) -> Result<Arc<Job>, String> {
    state
        .current
        .lock()
        .map_err(|_| "scan_state_unavailable")?
        .as_ref()
        .filter(|job| job.id == scan_id)
        .cloned()
        .ok_or_else(|| "scan_replaced".into())
}
#[tauri::command]
async fn start_scan(path: String, state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("absolute_path_required".into());
    }
    // Canonicalization resolves a selected root symlink; descendants are never followed.
    let root = std::fs::canonicalize(&path).map_err(|e| format!("folder_access_failed: {e}"))?;
    if !root.is_dir() {
        return Err("directory_required".into());
    }
    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let job = Arc::new(Job {
        id,
        cancel: AtomicBool::new(false),
        tree: Mutex::new(Tree::new(root)),
    });
    {
        let mut current = state.current.lock().map_err(|_| "scan_state_unavailable")?;
        if let Some(previous) = current.take() {
            previous.cancel.store(true, Ordering::Relaxed);
        }
        *current = Some(job.clone());
    }
    tauri::async_runtime::spawn_blocking(move || scanner::scan(job));
    Ok(id)
}
#[tauri::command]
fn cancel_scan(scan_id: u64, state: tauri::State<'_, AppState>) -> Result<(), String> {
    current_job(&state, scan_id)?
        .cancel
        .store(true, Ordering::Relaxed);
    Ok(())
}
#[tauri::command]
async fn get_snapshot(
    scan_id: u64,
    node_id: usize,
    allocated: bool,
    files_only: bool,
    state: tauri::State<'_, AppState>,
) -> Result<Snapshot, String> {
    let job = current_job(&state, scan_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        job.tree
            .lock()
            .map_err(|_| "scan_data_unavailable".to_string())?
            .snapshot(scan_id, node_id, allocated, files_only)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn reveal_item(
    scan_id: u64,
    node_id: usize,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let job = current_job(&state, scan_id)?;
    let path = job
        .tree
        .lock()
        .map_err(|_| "scan_data_unavailable")?
        .path(node_id)
        .ok_or("item_not_found")?;
    if std::fs::symlink_metadata(&path).is_err() {
        return Err("item_unavailable".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("reveal_failed".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("finder_macos_only".into())
    }
}
#[tauri::command]
fn open_privacy_settings() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy")
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("settings_failed".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("settings_macos_only".into())
    }
}
// Read language preference rather than region (e.g. an English UI in China).
#[tauri::command]
fn preferred_language() -> String {
    #[cfg(target_os = "macos")]
    {
        objc2_foundation::NSLocale::preferredLanguages()
            .firstObject()
            .map(|language| language.to_string())
            .unwrap_or_else(|| "en".into())
    }
    #[cfg(not(target_os = "macos"))]
    {
        "en".into()
    }
}
#[tauri::command]
fn set_menu_language(app: tauri::AppHandle, language: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    app.set_menu(menu::localized_menu(&app, language == "zh").map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "macos"))]
    let _ = (app, language);
    Ok(())
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_menu(menu::localized_menu(
                app.handle(),
                preferred_language()
                    .to_ascii_lowercase()
                    .split(['-', '_'])
                    .next()
                    == Some("zh"),
            )?)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_scan,
            cancel_scan,
            get_snapshot,
            reveal_item,
            open_privacy_settings,
            preferred_language,
            set_menu_language
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start SpaceTiles");
}
