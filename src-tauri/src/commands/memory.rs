//! Tauri IPC commands for persona files and daily memories.

use std::path::Path;

use devpilot_memory::{DailyMemory, PersonaFiles, search_memory};

use crate::AppState;
use tauri::State;

/// Load all persona files (SOUL.md, USER.md, MEMORY.md, AGENTS.md) from a workspace directory.
#[tauri::command(rename_all = "camelCase")]
pub async fn load_persona_files_cmd(
    _state: State<'_, AppState>,
    workspace_dir: String,
) -> Result<PersonaFiles, String> {
    let path = Path::new(&workspace_dir);
    PersonaFiles::load(path)
        .await
        .map_err(|e| format!("Failed to load persona files: {e}"))
}

/// Save (create or overwrite) a single persona file.
#[tauri::command(rename_all = "camelCase")]
pub async fn save_persona_file_cmd(
    _state: State<'_, AppState>,
    workspace_dir: String,
    file_type: String,
    content: String,
) -> Result<(), String> {
    let path = Path::new(&workspace_dir);

    // Load existing persona files first
    let mut persona = PersonaFiles::load(path)
        .await
        .map_err(|e| format!("Failed to load existing persona files: {e}"))?;

    // Update the specific file
    let trimmed = content.trim().to_owned();
    let value = if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    };

    match file_type.as_str() {
        "SOUL.md" => persona.soul_md = value,
        "USER.md" => persona.user_md = value,
        "MEMORY.md" => persona.memory_md = value,
        "AGENTS.md" => persona.agents_md = value,
        _ => return Err(format!("Unknown persona file type: {file_type}")),
    }

    persona
        .save(path)
        .await
        .map_err(|e| format!("Failed to save persona file: {e}"))
}

/// List daily memories, most recent first.
#[tauri::command(rename_all = "camelCase")]
pub async fn list_daily_memories_cmd(
    _state: State<'_, AppState>,
    data_dir: String,
    limit: Option<u32>,
) -> Result<Vec<devpilot_memory::DailyEntry>, String> {
    let path = Path::new(&data_dir);
    let limit = limit.map(|l| l as usize).unwrap_or(0);
    DailyMemory::list_entries(path, limit)
        .await
        .map_err(|e| format!("Failed to list memories: {e}"))
}

/// Search across persona files and daily memories by query string.
#[tauri::command(rename_all = "camelCase")]
pub async fn search_memories_cmd(
    _state: State<'_, AppState>,
    workspace_dir: String,
    data_dir: String,
    query: String,
) -> Result<Vec<MemorySearchResult>, String> {
    let ws_path = Path::new(&workspace_dir);
    let data_path = Path::new(&data_dir);

    let persona = PersonaFiles::load(ws_path)
        .await
        .map_err(|e| format!("Failed to load persona: {e}"))?;

    let daily = DailyMemory::list_entries(data_path, 0)
        .await
        .map_err(|e| format!("Failed to list daily entries: {e}"))?;

    let hits = search_memory(&persona, &daily, &query);
    Ok(hits
        .into_iter()
        .map(|h| MemorySearchResult {
            source: h.source,
            snippet: h.snippet,
        })
        .collect())
}

/// Create (or append to) a daily memory for a given date.
#[tauri::command(rename_all = "camelCase")]
pub async fn create_daily_memory_cmd(
    _state: State<'_, AppState>,
    data_dir: String,
    date: String,
    content: String,
) -> Result<(), String> {
    let path = Path::new(&data_dir);
    DailyMemory::create_entry(path, &date, &content)
        .await
        .map_err(|e| format!("Failed to create daily memory: {e}"))
}

/// Serializable search result for IPC — mirrors [`MemorySearchHit`] but with
/// `Serialize` so Tauri can return it to the frontend.
#[derive(Debug, serde::Serialize)]
pub struct MemorySearchResult {
    pub source: String,
    pub snippet: String,
}
