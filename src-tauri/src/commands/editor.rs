//! Tauri commands for editor integration — open in external editor, read/write file content.

use std::fs;
use std::path::Path;
use std::process::Command as StdCommand;

/// Open a file in the user's preferred editor.
///
/// Resolution order:
/// 1. `$VISUAL` environment variable
/// 2. `$EDITOR` environment variable
/// 3. Try common editors: `code`, `cursor`, `vim`, `nano`, `vi`
///
/// If `line` is provided and the editor supports it (e.g. VS Code: `code --goto file:line`),
/// the editor will attempt to open at that line number.
#[tauri::command(rename_all = "camelCase")]
pub async fn open_in_editor(path: String, line: Option<u32>) -> Result<String, String> {
    // Try $VISUAL first, then $EDITOR
    let editor = std::env::var("VISUAL")
        .ok()
        .or_else(|| std::env::var("EDITOR").ok());

    if let Some(ref ed) = editor {
        return launch_editor(ed, &path, line);
    }

    // Try common editors
    let candidates = [
        "code", "cursor", "vim", "nano", "vi", "emacs", "subl", "atom", "zed",
    ];
    for cmd in candidates {
        if which_command(cmd) {
            return launch_editor(cmd, &path, line);
        }
    }

    Err(
        "No editor found. Set $EDITOR or $VISUAL environment variable, or install VS Code / vim."
            .to_string(),
    )
}

/// Check if a command exists on PATH.
fn which_command(cmd: &str) -> bool {
    #[cfg(target_os = "windows")]
    {
        StdCommand::new("where")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        StdCommand::new("which")
            .arg(cmd)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// Launch the editor with the given file path.
fn launch_editor(editor: &str, path: &str, line: Option<u32>) -> Result<String, String> {
    let result = match editor {
        // Editors that support --goto file:line
        "code" | "cursor" | "zed" => {
            if let Some(ln) = line {
                StdCommand::new(editor)
                    .arg("--goto")
                    .arg(format!("{}:{}", path, ln))
                    .spawn()
            } else {
                StdCommand::new(editor).arg(path).spawn()
            }
        }
        // Editors that support +line syntax
        "vim" | "vi" | "nano" | "emacs" => {
            if let Some(ln) = line {
                StdCommand::new(editor)
                    .arg(format!("+{}", ln))
                    .arg(path)
                    .spawn()
            } else {
                StdCommand::new(editor).arg(path).spawn()
            }
        }
        // Sublime Text
        "subl" => {
            if let Some(ln) = line {
                StdCommand::new(editor)
                    .arg(format!("{}:{}", path, ln))
                    .spawn()
            } else {
                StdCommand::new(editor).arg(path).spawn()
            }
        }
        // Generic: just open with the file path
        _ => StdCommand::new(editor).arg(path).spawn(),
    };

    match result {
        Ok(_) => Ok(format!("Opened {} in {}", path, editor)),
        Err(e) => Err(format!("Failed to open editor '{}': {}", editor, e)),
    }
}

/// Read a file's content as UTF-8 string.
#[tauri::command(rename_all = "camelCase")]
pub fn read_file_content(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }
    fs::read_to_string(p).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write content to a file (creates or overwrites).
#[tauri::command(rename_all = "camelCase")]
pub fn write_file_content(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(p, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}
