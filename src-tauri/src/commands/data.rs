//! Tauri commands for full data export/import (backup & restore).
//!
//! Also includes Claude Code session import commands.

use crate::AppState;
use devpilot_store::{
    ClaudeImportResult, ClaudeThreadInfo, ExportData, ImportResult, ImportStrategy,
    find_claude_threads_dir, scan_claude_threads,
};
use std::path::PathBuf;
use tauri::State;

/// Export all user data as a JSON string.
#[tauri::command]
pub fn export_data(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let data = db.export_all().map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
}

/// Import data from a JSON string with a given conflict strategy.
#[tauri::command(rename_all = "camelCase")]
pub fn import_data(
    state: State<'_, AppState>,
    json_data: String,
    strategy: String,
) -> Result<ImportResult, String> {
    let data: ExportData =
        serde_json::from_str(&json_data).map_err(|e| format!("Invalid export JSON: {e}"))?;

    let strat = match strategy.as_str() {
        "overwrite" => ImportStrategy::Overwrite,
        "merge" => ImportStrategy::Merge,
        "skipExisting" => ImportStrategy::SkipExisting,
        other => {
            return Err(format!(
                "Unknown import strategy: '{other}'. Use 'overwrite', 'merge', or 'skipExisting'."
            ));
        }
    };

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.import_all(&data, strat).map_err(|e| e.to_string())
}

/// Export all data and write to a file at the given path.
#[tauri::command(rename_all = "camelCase")]
pub fn export_to_file(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let data = db.export_all().map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Failed to write export file: {e}"))
}

/// Read an export file and import the data.
#[tauri::command(rename_all = "camelCase")]
pub fn import_from_file(
    state: State<'_, AppState>,
    path: String,
    strategy: String,
) -> Result<ImportResult, String> {
    let json_data =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read import file: {e}"))?;
    import_data(state, json_data, strategy)
}

// ── Claude Code Import ─────────────────────────────────

/// Scan for Claude Code thread files in the default directory.
///
/// Returns a list of discovered thread files with metadata.
#[tauri::command]
pub fn scan_claude_threads_cmd(
    state: State<'_, AppState>,
) -> Result<Vec<ClaudeThreadInfo>, String> {
    let _ = state; // State not needed for scanning, but required by Tauri command signature
    let dir = find_claude_threads_dir()
        .ok_or_else(|| "Claude Code threads directory not found. Ensure Claude Code is installed and has existing sessions.".to_string())?;
    scan_claude_threads(&dir).map_err(|e| format!("Failed to scan Claude threads: {e}"))
}

/// Scan a specific directory for Claude Code thread files.
#[tauri::command(rename_all = "camelCase")]
pub fn scan_claude_threads_from(
    state: State<'_, AppState>,
    directory: String,
) -> Result<Vec<ClaudeThreadInfo>, String> {
    let _ = state;
    let path = PathBuf::from(&directory);
    scan_claude_threads(&path).map_err(|e| format!("Failed to scan directory '{}': {e}", directory))
}

/// Import a single Claude Code JSONL thread file as a new DevPilot session.
///
/// Returns the new session ID and imported message count.
#[tauri::command(rename_all = "camelCase")]
pub fn import_claude_thread(
    state: State<'_, AppState>,
    jsonl_path: String,
) -> Result<String, String> {
    let path = PathBuf::from(&jsonl_path);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let (session, count) = db
        .import_claude_thread(&path)
        .map_err(|e| format!("Failed to import Claude thread: {e}"))?;
    Ok(format!(
        "{{\"sessionId\":\"{}\",\"messagesImported\":{}}}",
        session.id, count
    ))
}

/// Import multiple Claude Code JSONL thread files in batch.
#[tauri::command(rename_all = "camelCase")]
pub fn import_claude_threads_batch(
    state: State<'_, AppState>,
    jsonl_paths: Vec<String>,
) -> Result<ClaudeImportResult, String> {
    let paths: Vec<PathBuf> = jsonl_paths.iter().map(PathBuf::from).collect();
    let path_refs: Vec<&std::path::Path> = paths.iter().map(|p| p.as_path()).collect();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.import_claude_threads_batch(&path_refs)
        .map_err(|e| format!("Failed to batch import Claude threads: {e}"))
}
