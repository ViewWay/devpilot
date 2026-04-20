//! Tauri commands for file and message search.

use crate::AppState;
use devpilot_search::{SearchEngine, SearchMode, SearchQuery};
use devpilot_store::SearchParams;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Search request from frontend (file search).
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

/// A single search match (file search).
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

// ── Conversation search ──────────────────────────────

/// Execute a conversation (message) search.
///
/// Searches across all stored messages using SQLite LIKE matching.
#[tauri::command(rename_all = "camelCase")]
pub async fn search_messages(
    state: State<'_, AppState>,
    query: String,
    session_id: Option<String>,
    role: Option<String>,
    limit: Option<usize>,
) -> Result<Vec<devpilot_store::MessageSearchResult>, String> {
    let db = state.db.lock().map_err(|e| format!("DB lock: {e}"))?;
    let params = SearchParams {
        query,
        session_id,
        limit,
        role,
    };
    db.search_messages(&params)
        .map_err(|e| format!("Search failed: {e}"))
}

// ── Directory listing ───────────────────────────────────

/// A single entry in a directory listing.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    /// File or directory name.
    pub name: String,
    /// Full path relative to root.
    pub path: String,
    /// Entry type: "file" or "directory".
    pub entry_type: String,
    /// File size in bytes (0 for directories).
    pub size: u64,
    /// Last modified timestamp (seconds since epoch).
    pub modified: Option<u64>,
}

/// List the contents of a directory.
///
/// Returns direct children sorted: directories first, then files, both
/// alphabetically. Respects `.gitignore` if present.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_directory(
    path: String,
    show_hidden: Option<bool>,
) -> Result<Vec<DirEntry>, String> {
    use std::fs;
    use std::time::UNIX_EPOCH;

    let show_hidden = show_hidden.unwrap_or(false);
    let root = std::path::Path::new(&path);

    if !root.exists() {
        return Err(format!("Path does not exist: {path}"));
    }
    if !root.is_dir() {
        return Err(format!("Path is not a directory: {path}"));
    }

    let mut entries: Vec<DirEntry> = Vec::new();
    let read_dir = fs::read_dir(root).map_err(|e| format!("Failed to read dir: {e}"))?;

    for entry in read_dir {
        let entry = entry.map_err(|e| format!("Dir entry error: {e}"))?;
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless requested
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry
            .metadata()
            .map_err(|e| format!("Metadata error: {e}"))?;
        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };
        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().to_string(),
            entry_type: if is_dir {
                "directory".to_string()
            } else {
                "file".to_string()
            },
            size,
            modified,
        });
    }

    // Sort: directories first, then files; alphabetical within each group.
    entries.sort_by(|a, b| {
        b.entry_type
            .cmp(&a.entry_type)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

// ── File reading ──────────────────────────────────────

/// Result of reading a text file.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    /// File content as UTF-8 string.
    pub content: String,
    /// Total number of lines.
    pub total_lines: usize,
}

/// Safely read a text file's contents.
///
/// Validates that the path points to a regular file (not a directory, symlink,
/// etc.) and reads it as UTF-8. Returns the content and line count.
#[tauri::command(rename_all = "camelCase")]
pub async fn read_text_file(path: String) -> Result<FileReadResult, String> {
    use std::fs;
    use std::path::Path;

    let file_path = Path::new(&path);

    // Security: reject symlinks — only allow regular files
    if file_path.is_symlink() {
        return Err("Symlinks are not allowed".to_string());
    }
    if !file_path.exists() {
        return Err(format!("File not found: {path}"));
    }
    if file_path.is_dir() {
        return Err(format!("Path is a directory, not a file: {path}"));
    }

    let metadata = fs::symlink_metadata(&path).map_err(|e| format!("Metadata error: {e}"))?;
    if !metadata.is_file() {
        return Err(format!("Not a regular file: {path}"));
    }

    // Size guard: reject files > 10 MB
    if metadata.len() > 10 * 1024 * 1024 {
        return Err(format!(
            "File too large ({} bytes, max 10 MB)",
            metadata.len()
        ));
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Read error: {e}"))?;
    let total_lines = content.lines().count();

    Ok(FileReadResult {
        content,
        total_lines,
    })
}
