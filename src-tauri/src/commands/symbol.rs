//! Tauri commands for the code symbol index.

use std::path::Path;

use devpilot_index::{IndexStats, SearchResult};
use tauri::State;

use crate::AppState;

/// Index all supported source files in a directory.
#[tauri::command(rename_all = "camelCase")]
pub async fn index_directory(
    state: State<'_, AppState>,
    root_path: String,
) -> Result<IndexStats, String> {
    let root = Path::new(&root_path);
    if !root.exists() {
        return Err(format!("Path does not exist: {root_path}"));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {root_path}"));
    }

    let index = state.symbol_index.lock().await;
    index
        .index_directory(root)
        .await
        .map_err(|e| format!("Indexing failed: {e}"))?;

    Ok(index.stats().await)
}

/// Clear the entire symbol index.
#[tauri::command(rename_all = "camelCase")]
pub async fn clear_symbol_index(state: State<'_, AppState>) -> Result<(), String> {
    let index = state.symbol_index.lock().await;
    index.clear().await;
    Ok(())
}

/// Search for symbols matching the given query.
#[tauri::command(rename_all = "camelCase")]
pub async fn search_symbols(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let index = state.symbol_index.lock().await;
    Ok(index.search(&query).await)
}

/// Get current index statistics.
#[tauri::command(rename_all = "camelCase")]
pub async fn get_index_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    let index = state.symbol_index.lock().await;
    Ok(index.stats().await)
}
