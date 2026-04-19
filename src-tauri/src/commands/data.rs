//! Tauri commands for full data export/import (backup & restore).

use crate::AppState;
use devpilot_store::{ExportData, ImportResult, ImportStrategy};
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
