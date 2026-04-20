use crate::AppState;
use devpilot_store::{
    CheckpointInfo, MessageInfo, PingResponse, ProviderRecord, SessionInfo, SettingEntry,
    UsageRecord,
};
use tauri::State;

pub mod bridge;
pub mod data;
pub mod llm;
pub mod mcp;
pub mod media;
pub mod memory;
pub mod sandbox;
pub mod scheduler;
pub mod search;
pub mod skills;
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

/// Get usage records for a specific session.
#[tauri::command(rename_all = "camelCase")]
pub fn get_session_usage(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<UsageRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_session_usage(&session_id).map_err(|e| e.to_string())
}

// ── Session Metadata ──────────────────────────────────

/// Update the working directory for a session.
#[tauri::command(rename_all = "camelCase")]
pub fn set_session_working_dir(
    state: State<'_, AppState>,
    id: String,
    working_dir: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_session_working_dir(&id, &working_dir)
        .map_err(|e| e.to_string())
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

// ── Checkpoints ────────────────────────────────────────

/// Create a checkpoint for a session (snapshot current state for rewind).
#[tauri::command(rename_all = "camelCase")]
pub fn create_checkpoint(
    state: State<'_, AppState>,
    session_id: String,
    message_id: String,
    summary: String,
    token_count: i64,
) -> Result<CheckpointInfo, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_checkpoint(&session_id, &message_id, &summary, token_count)
        .map_err(|e| e.to_string())
}

/// List all checkpoints for a session.
#[tauri::command(rename_all = "camelCase")]
pub fn list_checkpoints(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<CheckpointInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_checkpoints(&session_id).map_err(|e| e.to_string())
}

/// Rewind a session to a specific checkpoint.
#[tauri::command]
pub fn rewind_checkpoint(
    state: State<'_, AppState>,
    checkpoint_id: String,
) -> Result<usize, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.rewind_to_checkpoint(&checkpoint_id)
        .map_err(|e| e.to_string())
}

// ── Data Import / Export ──────────────────────────────

/// Export all sessions with their messages as a JSON string.
/// The resulting JSON can be used with `import_sessions` to restore data.
#[tauri::command]
pub fn export_sessions(state: State<'_, AppState>) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let sessions = db.list_sessions().map_err(|e| e.to_string())?;

    let mut export = Vec::with_capacity(sessions.len());
    for session in &sessions {
        let messages = db
            .get_session_messages(&session.id)
            .map_err(|e| e.to_string())?;
        export.push(serde_json::json!({
            "session": session,
            "messages": messages,
        }));
    }

    let result = serde_json::json!({
        "version": env!("CARGO_PKG_VERSION"),
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "sessions": export,
    });

    serde_json::to_string_pretty(&result).map_err(|e| e.to_string())
}

/// Import sessions from a JSON string (as produced by `export_sessions`).
///
/// - Sessions with existing IDs are skipped (no overwrite).
/// - Returns the number of sessions and messages imported.
#[tauri::command(rename_all = "camelCase")]
pub fn import_sessions(
    state: State<'_, AppState>,
    json_data: String,
) -> Result<ImportResult, String> {
    let data: serde_json::Value =
        serde_json::from_str(&json_data).map_err(|e| format!("Invalid JSON: {e}"))?;

    let sessions = data["sessions"]
        .as_array()
        .ok_or("Missing 'sessions' array in import data")?;

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get existing session IDs to avoid duplicates
    let existing = db.list_sessions().map_err(|e| e.to_string())?;
    let existing_ids: std::collections::HashSet<&str> =
        existing.iter().map(|s| s.id.as_str()).collect();

    let mut sessions_imported = 0usize;
    let mut messages_imported = 0usize;

    for entry in sessions {
        let session = entry.get("session").ok_or("Missing 'session' in entry")?;
        let empty = Vec::new();
        let messages = entry
            .get("messages")
            .and_then(|m| m.as_array())
            .unwrap_or(&empty);

        let session_id = session["id"].as_str().ok_or("Session missing 'id' field")?;

        // Skip if session already exists
        if existing_ids.contains(session_id) {
            continue;
        }

        // Create the session using store's method
        let title = session["title"].as_str().unwrap_or("Imported Session");
        let model = session["model"].as_str().unwrap_or("unknown");
        let provider = session["provider"].as_str().unwrap_or("unknown");

        // Create with the original ID by using a direct SQL insert
        db.import_session_with_id(session_id, title, model, provider)
            .map_err(|e| e.to_string())?;

        // Update session metadata fields
        if let Some(working_dir) = session["workingDir"].as_str() {
            let _ = db.set_session_working_dir(session_id, working_dir);
        }

        // Import messages
        for msg in messages {
            let role = msg["role"].as_str().unwrap_or("user");
            let content = msg["content"].as_str().unwrap_or("");
            let model_val = msg["model"].as_str();
            let tool_calls = msg["toolCalls"].as_str();
            let tool_call_id = msg["toolCallId"].as_str();

            db.add_message(
                session_id,
                role,
                content,
                model_val,
                tool_calls,
                tool_call_id,
            )
            .map_err(|e| e.to_string())?;

            messages_imported += 1;
        }

        sessions_imported += 1;
    }

    Ok(ImportResult {
        sessions_imported,
        messages_imported,
    })
}

/// Result of an import operation.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub sessions_imported: usize,
    pub messages_imported: usize,
}

// ── Compact ────────────────────────────────────────────

/// Compact (context-compress) a session's messages in the database.
/// Returns the number of messages removed.
#[tauri::command(rename_all = "camelCase")]
pub fn compact_session(
    state: State<'_, AppState>,
    session_id: String,
    keep_last: Option<usize>,
) -> Result<CompactResult, String> {
    use devpilot_core::compact::{CompactStrategy, compact_messages};
    use devpilot_protocol::{ContentBlock, Message, MessageRole};

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Load messages from DB
    let msg_infos = db
        .get_session_messages(&session_id)
        .map_err(|e| e.to_string())?;

    // Convert to protocol Messages
    let mut messages: Vec<Message> = Vec::with_capacity(msg_infos.len());
    for mi in &msg_infos {
        let role = match mi.role.as_str() {
            "user" => MessageRole::User,
            "assistant" => MessageRole::Assistant,
            "system" => MessageRole::System,
            "tool" => MessageRole::Tool,
            _ => continue,
        };
        let content = if let Some(ref tc_json) = mi.tool_calls {
            if let Ok(blocks) =
                serde_json::from_str::<Vec<devpilot_protocol::ContentBlock>>(tc_json)
            {
                blocks
            } else {
                vec![ContentBlock::Text {
                    text: mi.content.clone(),
                }]
            }
        } else {
            vec![ContentBlock::Text {
                text: mi.content.clone(),
            }]
        };
        messages.push(Message {
            role,
            content,
            name: None,
            tool_call_id: mi.tool_call_id.clone(),
        });
    }

    // Apply compact strategy
    let strategy = CompactStrategy::Summarize {
        keep_last: keep_last.unwrap_or(20),
    };
    let result = compact_messages(&mut messages, strategy);

    // Rebuild the messages in DB: delete all, re-insert compacted
    // First delete all messages for this session
    db.delete_session_messages(&session_id)
        .map_err(|e| e.to_string())?;

    // Re-insert compacted messages
    for msg in &messages {
        let role_str = match msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
        };
        let text = msg.text_content();
        let tool_calls = msg
            .content
            .iter()
            .filter_map(|b| match b {
                ContentBlock::ToolUse { .. } => Some(true),
                _ => None,
            })
            .next()
            .is_some()
            .then(|| serde_json::to_string(&msg.content).unwrap_or_default());

        db.add_message(
            &session_id,
            role_str,
            &text,
            None as Option<&str>,
            tool_calls.as_deref(),
            None as Option<&str>,
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(CompactResult {
        messages_removed: result.messages_removed,
        summary_added: result.summary_added,
    })
}

/// Result of a compact operation returned to the frontend.
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactResult {
    pub messages_removed: usize,
    pub summary_added: bool,
}
