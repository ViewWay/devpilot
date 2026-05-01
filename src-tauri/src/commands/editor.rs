//! Tauri commands for editor integration — open in external editor, read/write file content.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command as StdCommand;

use crate::AppState;
use tauri::State;

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

/// Resolve and validate that a file path is within the session's working directory.
///
/// Returns the canonicalized path on success, or an error if the path escapes the working dir.
fn validate_path_in_workdir(path: &str, working_dir: &str) -> Result<PathBuf, String> {
    let target = Path::new(path);

    // Canonicalize the working directory (it must exist)
    let canonical_workdir = Path::new(working_dir)
        .canonicalize()
        .map_err(|e| format!("Invalid working directory '{}': {}", working_dir, e))?;

    // For the target path, we need to handle the case where it doesn't exist yet (for writes).
    // Use parent canonicalization + join for non-existent paths.
    let canonical_target = if target.exists() {
        target
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path '{}': {}", path, e))?
    } else {
        // For non-existent paths, canonicalize the parent and join the filename
        let parent = target.parent().unwrap_or(Path::new("."));
        let file_name = target
            .file_name()
            .ok_or_else(|| format!("Invalid file path: {}", path))?;

        let canonical_parent = parent
            .canonicalize()
            .map_err(|e| format!("Failed to resolve parent directory for '{}': {}", path, e))?;
        canonical_parent.join(file_name)
    };

    // Check that the resolved target starts with the canonical working directory
    if !canonical_target.starts_with(&canonical_workdir) {
        return Err(format!(
            "Access denied: path '{}' is outside the session working directory '{}'",
            path, working_dir
        ));
    }

    Ok(canonical_target)
}

/// Read a file's content as UTF-8 string.
///
/// The file path must be within the session's working directory.
#[tauri::command(rename_all = "camelCase")]
pub fn read_file_content(
    state: State<'_, AppState>,
    session_id: Option<String>,
    path: String,
) -> Result<String, String> {
    let p = validate_editor_path(&state, session_id.as_deref(), &path, false)?;

    if !p.exists() {
        return Err(format!("File not found: {}", path));
    }
    if !p.is_file() {
        return Err(format!("Not a file: {}", path));
    }
    fs::read_to_string(&p).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Write content to a file (creates or overwrites).
///
/// The file path must be within the session's working directory.
#[tauri::command(rename_all = "camelCase")]
pub fn write_file_content(
    state: State<'_, AppState>,
    session_id: Option<String>,
    path: String,
    content: String,
) -> Result<(), String> {
    let p = validate_editor_path(&state, session_id.as_deref(), &path, true)?;

    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create parent dir: {}", e))?;
    }
    fs::write(&p, &content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

/// Resolve the path against the session's working directory with boundary check.
///
/// If `session_id` is provided, the path is validated against the session's working_dir.
/// If `session_id` is `None` (backward compat), the path is allowed through without restriction.
fn validate_editor_path(
    state: &AppState,
    session_id: Option<&str>,
    path: &str,
    _is_write: bool,
) -> Result<PathBuf, String> {
    match session_id {
        Some(sid) => {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            let session = db.get_session(sid).map_err(|e| e.to_string())?;
            let working_dir = session
                .working_dir
                .ok_or_else(|| "Session has no working directory set".to_string())?;
            validate_path_in_workdir(path, &working_dir)
        }
        None => {
            // No session provided — allow through for backward compatibility
            Ok(PathBuf::from(path))
        }
    }
}
