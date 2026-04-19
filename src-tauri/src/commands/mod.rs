use crate::AppState;
use devpilot_store::{MessageInfo, PingResponse, SessionInfo, SettingEntry, UsageRecord};
use tauri::State;

pub mod llm;
pub mod tools;

/// Health check / ping command.
#[tauri::command]
pub fn ping() -> PingResponse {
    PingResponse {
        message: "DevPilot is running!".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    }
}

// ── Sessions ──────────────────────────────────────────

/// List all sessions ordered by most recently updated.
#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_sessions().map_err(|e| e.to_string())
}

/// Get a single session by ID.
#[tauri::command]
pub fn get_session(state: State<'_, AppState>, id: String) -> Result<SessionInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_session(&id).map_err(|e| e.to_string())
}

/// Create a new session.
#[tauri::command]
pub fn create_session(
    state: State<'_, AppState>,
    title: String,
    model: String,
    provider: String,
) -> Result<SessionInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_session(&title, &model, &provider)
        .map_err(|e| e.to_string())
}

/// Delete a session and all its messages (CASCADE).
#[tauri::command]
pub fn delete_session(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_session(&id).map_err(|e| e.to_string())
}

/// Update session title.
#[tauri::command]
pub fn update_session_title(
    state: State<'_, AppState>,
    id: String,
    title: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_session_title(&id, &title)
        .map_err(|e| e.to_string())
}

// ── Messages ──────────────────────────────────────────

/// Get all messages for a session, ordered chronologically.
#[tauri::command(rename_all = "camelCase")]
pub fn get_session_messages(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<MessageInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_session_messages(&session_id)
        .map_err(|e| e.to_string())
}

/// Add a message to a session.
#[tauri::command(rename_all = "camelCase")]
pub fn add_message(
    state: State<'_, AppState>,
    session_id: String,
    role: String,
    content: String,
    model: Option<String>,
    tool_calls: Option<String>,
    tool_call_id: Option<String>,
) -> Result<MessageInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.add_message(
        &session_id,
        &role,
        &content,
        model.as_deref(),
        tool_calls.as_deref(),
        tool_call_id.as_deref(),
    )
    .map_err(|e| e.to_string())
}

// ── Settings ──────────────────────────────────────────

/// Get a setting value by key.
#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_setting(&key).map_err(|e| e.to_string())
}

/// Set a setting value (upsert).
#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

/// List all settings.
#[tauri::command]
pub fn list_settings(state: State<'_, AppState>) -> Result<Vec<SettingEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_settings().map_err(|e| e.to_string())
}

// ── Usage ─────────────────────────────────────────────

/// Get usage records for a session.
#[tauri::command(rename_all = "camelCase")]
pub fn get_session_usage(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<UsageRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_session_usage(&session_id).map_err(|e| e.to_string())
}

/// Get all usage records.
#[tauri::command]
pub fn get_total_usage(state: State<'_, AppState>) -> Result<Vec<UsageRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_total_usage().map_err(|e| e.to_string())
}
