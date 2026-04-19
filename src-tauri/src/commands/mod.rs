use crate::AppState;
use devpilot_store::{
    MessageInfo, PingResponse, ProviderRecord, SessionInfo, SettingEntry, UsageRecord,
};
use tauri::State;

pub mod bridge;
pub mod llm;
pub mod media;
pub mod sandbox;
pub mod scheduler;
pub mod search;
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

/// Update a message's content (used after streaming to persist final content).
#[tauri::command(rename_all = "camelCase")]
pub fn update_message_content(
    state: State<'_, AppState>,
    message_id: String,
    content: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_message_content(&message_id, &content)
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

/// Get all usage records.
#[tauri::command]
pub fn get_total_usage(state: State<'_, AppState>) -> Result<Vec<UsageRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_total_usage().map_err(|e| e.to_string())
}

// ── Providers ─────────────────────────────────────────

/// List all persisted providers.
#[tauri::command]
pub fn list_providers(state: State<'_, AppState>) -> Result<Vec<ProviderRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_providers().map_err(|e| e.to_string())
}

/// Get a single provider by ID.
#[tauri::command]
pub fn get_provider(state: State<'_, AppState>, id: String) -> Result<ProviderRecord, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_provider(&id).map_err(|e| e.to_string())
}

/// Create or update a provider configuration with optional API key.
#[tauri::command(rename_all = "camelCase")]
pub fn upsert_provider(
    state: State<'_, AppState>,
    provider: ProviderRecord,
    api_key: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.upsert_provider_with_key(&provider, api_key.as_deref())
        .map_err(|e| e.to_string())
}

/// Get the decrypted API key for a provider.
#[tauri::command(rename_all = "camelCase")]
pub fn get_provider_api_key(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_provider_api_key(&id).map_err(|e| e.to_string())
}

/// Delete a provider by ID.
#[tauri::command]
pub fn delete_provider(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_provider(&id).map_err(|e| e.to_string())
}
