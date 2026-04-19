//! Tauri commands for file search.

use crate::AppState;
use devpilot_search::{SearchEngine, SearchMode, SearchQuery};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Search request from frontend.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    /// Search query string.
    pub query: String,
    /// Search mode: "content" or "files" (default).
    pub mode: Option<String>,
    /// Root directory to search in.
    pub root: Option<String>,
    /// File glob filter (e.g., "*.rs").
    pub file_glob: Option<String>,
    /// Maximum results.
    pub max_results: Option<usize>,
}

/// A single search match.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// File path.
    pub path: String,
    /// Matched line number (content mode only).
    pub line_number: Option<usize>,
    /// Matched line content (content mode only).
    pub line_content: Option<String>,
    /// Fuzzy score (files mode only).
    pub score: Option<f64>,
}

/// Execute a file search.
#[tauri::command(rename_all = "camelCase")]
pub async fn search_files(
    _state: State<'_, AppState>,
    req: SearchRequest,
) -> Result<Vec<SearchResult>, String> {
    let mode = match req.mode.as_deref() {
        Some("content") => SearchMode::Content,
        _ => SearchMode::Files,
    };

    let query = SearchQuery {
        pattern: req.query,
        path: req.root.unwrap_or_else(|| ".".into()),
        mode,
        max_results: req.max_results.unwrap_or(50),
        file_glob: req.file_glob,
    };

    let engine = SearchEngine::new();
    let matches = engine
        .search(query)
        .await
        .map_err(|e| format!("Search failed: {e}"))?;

    Ok(matches
        .into_iter()
        .map(|m| SearchResult {
            path: m.path,
            line_number: m.line_number,
            line_content: m.line_text,
            score: m.score,
        })
        .collect())
}
