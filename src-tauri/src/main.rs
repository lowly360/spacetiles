#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
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
        .map_err(|_| "扫描状态不可用")?
        .as_ref()
        .filter(|job| job.id == scan_id)
        .cloned()
        .ok_or_else(|| "扫描已被替换，请刷新视图".into())
}
#[tauri::command]
async fn start_scan(path: String, state: tauri::State<'_, AppState>) -> Result<u64, String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() {
        return Err("请选择绝对路径目录".into());
    }
    // Canonicalization resolves a selected root symlink; descendants are never followed.
    let root = std::fs::canonicalize(&path)
        .map_err(|e| format!("无法访问所选目录：{e}。请检查隐私与安全性中的文件访问权限。"))?;
    if !root.is_dir() {
        return Err("请选择一个目录".into());
    }
    let id = state.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let job = Arc::new(Job {
        id,
        cancel: AtomicBool::new(false),
        tree: Mutex::new(Tree::new(root)),
    });
    {
        let mut current = state.current.lock().map_err(|_| "扫描状态不可用")?;
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
            .map_err(|_| "扫描数据不可用".to_string())?
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
        .map_err(|_| "扫描数据不可用")?
        .path(node_id)
        .ok_or("找不到该项目")?;
    if std::fs::symlink_metadata(&path).is_err() {
        return Err("项目已移动、删除或不可访问，请重新扫描".into());
    }
    #[cfg(target_os = "macos")]
    {
        let status = std::process::Command::new("/usr/bin/open")
            .arg("-R")
            .arg(path)
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err("无法在 Finder 中显示该项目".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("首版仅支持 macOS Finder".into())
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
            return Err("请手动打开系统设置 → 隐私与安全性".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("此设置入口仅适用于 macOS".into())
    }
}
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_scan,
            cancel_scan,
            get_snapshot,
            reveal_item,
            open_privacy_settings
        ])
        .run(tauri::generate_context!())
        .expect("无法启动 SpaceTiles");
}
