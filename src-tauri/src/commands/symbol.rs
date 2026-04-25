//! Tauri commands for the code symbol index.
//!
//! Provides endpoints for indexing a project directory, searching symbols,
//! and querying index statistics.

use std::path::Path;

use devpilot_index::{IndexStats, SearchResult};
use tauri::State;

use crate::AppState;

// ── Index management ──────────────────────────────────

/// Index all supported source files in a directory.
///
/// Re-indexes if the index already contains data — old symbols for re-encountered
/// files are replaced atomically. Returns updated index statistics.
#[tauri::command(rename_all = "camelCase")]
pub fn index_directory(
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

    let index = state
        .symbol_index
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    index
        .index_directory(root)
        .map_err(|e| format!("Indexing failed: {e}"))?;

    Ok(index.stats())
}

/// Clear the entire symbol index.
#[tauri::command(rename_all = "camelCase")]
pub fn clear_symbol_index(state: State<'_, AppState>) -> Result<(), String> {
    let index = state
        .symbol_index
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    index.clear();
    Ok(())
}

// ── Symbol search ─────────────────────────────────────

/// Search for symbols matching the given query.
///
/// Uses fuzzy matching on symbol names and full paths.
/// Returns results sorted by relevance (best first), capped at 50.
#[tauri::command(rename_all = "camelCase")]
pub fn search_symbols(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<SearchResult>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let index = state
        .symbol_index
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    Ok(index.search(&query))
}

// ── Index stats ───────────────────────────────────────

/// Get current index statistics (file count, symbol count, languages, etc.).
#[tauri::command(rename_all = "camelCase")]
pub fn get_index_stats(state: State<'_, AppState>) -> Result<IndexStats, String> {
    let index = state
        .symbol_index
        .lock()
        .map_err(|e| format!("Lock error: {e}"))?;
    Ok(index.stats())
}
