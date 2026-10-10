use serde::Deserialize;
use std::path::Path;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemAction {
    OpenFinder,
    CopyPath,
    OpenTerminal,
}

pub fn perform_item_action(path: &Path, action: ItemAction) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::{io::Write, process::Stdio};
        match action {
            ItemAction::CopyPath => {
                // Copy the original absolute path without shell escaping or lossy UTF-8.
                // stdin keeps file names out of shell commands, including quotes and $().
                let text = path.to_str().ok_or("path_encoding_unsupported")?;
                let mut child = std::process::Command::new("/usr/bin/pbcopy")
                    .env("LC_ALL", "en_US.UTF-8")
                    .stdin(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("copy_path_failed: {e}"))?;
                let written = child.stdin.take().unwrap().write_all(text.as_bytes());
                let status = child.wait().map_err(|e| format!("copy_path_failed: {e}"))?;
                written.map_err(|e| format!("copy_path_failed: {e}"))?;
                if !status.success() {
                    return Err("copy_path_failed".into());
                }
            }
            ItemAction::OpenFinder => {
                std::fs::symlink_metadata(path).map_err(|_| "item_unavailable")?;
                let mut command = std::process::Command::new("/usr/bin/open");
                if path.is_dir() {
                    command.args(["-b", "com.apple.finder"]);
                } else {
                    command.arg("-R");
                }
                let status = command
                    .arg("--")
                    .arg(path)
                    .status()
                    .map_err(|e| format!("finder_open_failed: {e}"))?;
                if !status.success() {
                    return Err("finder_open_failed".into());
                }
            }
            ItemAction::OpenTerminal => {
                let directory = terminal_directory(path)?;
                // LaunchServices opens the directory in Terminal. No AppleScript or
                // interpolated cd command is needed, so special characters stay literal.
                let status = std::process::Command::new("/usr/bin/open")
                    .args(["-b", "com.apple.Terminal", "--"])
                    .arg(directory)
                    .status()
                    .map_err(|e| format!("terminal_open_failed: {e}"))?;
                if !status.success() {
                    return Err("terminal_open_failed".into());
                }
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (path, action);
        Err("file_actions_macos_only".into())
    }
}

#[cfg(target_os = "macos")]
fn terminal_directory(path: &Path) -> Result<&Path, String> {
    let metadata = std::fs::metadata(path).map_err(|_| "item_unavailable")?;
    if metadata.is_dir() {
        Ok(path)
    } else {
        path.parent().ok_or_else(|| "directory_unavailable".into())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn terminal_uses_selected_directory_or_file_parent_without_changing_names() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("中文 空格 ' \" $(echo injected)");
        std::fs::create_dir(&folder).unwrap();
        let file = folder.join("文件.txt");
        std::fs::write(&file, [1]).unwrap();
        assert_eq!(terminal_directory(&folder).unwrap(), folder);
        assert_eq!(terminal_directory(&file).unwrap(), folder);
        assert_eq!(terminal_directory(Path::new("/")).unwrap(), Path::new("/"));
        assert_eq!(
            terminal_directory(&folder.join("missing")).unwrap_err(),
            "item_unavailable"
        );
    }
}
