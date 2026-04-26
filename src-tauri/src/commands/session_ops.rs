//! Tauri commands for advanced session operations.
//!
//! Provides session export (with format options), fork (branch from a message),
//! and rewind (truncate messages after a given index).

use crate::AppState;
use devpilot_store::SessionInfo;
use tauri::State;

// ── Commands ─────────────────────────────────────────

/// Export a session in the specified format.
///
/// Supported formats: "json", "markdown", "txt".
/// Optional flags control what is included in the export.
#[tauri::command]
pub async fn session_export(
    state: State<'_, AppState>,
    session_id: String,
    format: String,
    include_metadata: Option<bool>,
    include_tool_calls: Option<bool>,
    include_thinking: Option<bool>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let session = db.get_session(&session_id).map_err(|e| e.to_string())?;
    let messages = db
        .get_session_messages(&session_id)
        .map_err(|e| e.to_string())?;

    let include_meta = include_metadata.unwrap_or(true);
    let include_tools = include_tool_calls.unwrap_or(true);
    let include_think = include_thinking.unwrap_or(false);

    match format.as_str() {
        "json" => export_json(
            &session,
            &messages,
            include_meta,
            include_tools,
            include_think,
        ),
        "markdown" | "md" => export_markdown(
            &session,
            &messages,
            include_meta,
            include_tools,
            include_think,
        ),
        "txt" | "text" => export_text(
            &session,
            &messages,
            include_meta,
            include_tools,
            include_think,
        ),
        other => Err(format!(
            "Unsupported export format: '{}'. Use 'json', 'markdown', or 'txt'.",
            other
        )),
    }
}

/// Fork a session, creating a new session that copies messages up to (and
/// including) `from_message_index`.
///
/// Returns the new session's ID.
#[tauri::command]
pub async fn session_fork(
    state: State<'_, AppState>,
    session_id: String,
    from_message_index: usize,
    new_title: Option<String>,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let source = db.get_session(&session_id).map_err(|e| e.to_string())?;
    let messages = db
        .get_session_messages(&session_id)
        .map_err(|e| e.to_string())?;

    if from_message_index >= messages.len() {
        return Err(format!(
            "from_message_index {} is out of bounds (session has {} messages)",
            from_message_index,
            messages.len()
        ));
    }

    let title = new_title.unwrap_or_else(|| format!("{} (fork)", source.title));
    let new_session = db
        .create_session(&title, &source.model, &source.provider)
        .map_err(|e| e.to_string())?;

    // Copy over the working directory if set
    if let Some(ref wd) = source.working_dir {
        let _ = db.set_session_working_dir(&new_session.id, wd);
    }

    // Copy messages up to and including the specified index
    for msg in messages.iter().take(from_message_index + 1) {
        db.add_message(
            &new_session.id,
            &msg.role,
            &msg.content,
            msg.model.as_deref(),
            msg.tool_calls.as_deref(),
            msg.tool_call_id.as_deref(),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(new_session.id)
}

/// Rewind a session by deleting all messages after the given index.
///
/// Returns the number of messages removed.
#[tauri::command]
pub async fn session_rewind(
    state: State<'_, AppState>,
    session_id: String,
    to_message_index: usize,
) -> Result<u32, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let messages = db
        .get_session_messages(&session_id)
        .map_err(|e| e.to_string())?;

    if to_message_index >= messages.len() {
        return Err(format!(
            "to_message_index {} is out of bounds (session has {} messages)",
            to_message_index,
            messages.len()
        ));
    }

    // Find the message at the target index — we delete all messages with
    // created_at strictly after this one.
    let keep_msg = &messages[to_message_index];
    let keep_time = &keep_msg.created_at;

    // Count messages to remove
    let to_remove: u32 = messages[to_message_index..]
        .iter()
        .skip(1) // keep the target message itself
        .count() as u32;

    // Delete messages after the target
    db.rewind_messages_after(&session_id, keep_time)
        .map_err(|e| e.to_string())?;

    Ok(to_remove)
}

// ── Export helpers ────────────────────────────────────

fn export_json(
    session: &SessionInfo,
    messages: &[devpilot_store::MessageInfo],
    include_meta: bool,
    include_tools: bool,
    include_think: bool,
) -> Result<String, String> {
    let filtered: Vec<serde_json::Value> = messages
        .iter()
        .filter(|m| {
            // Skip tool calls if not requested
            if !include_tools && m.tool_calls.is_some() {
                return false;
            }
            // Skip thinking blocks if not requested (heuristic: role == "thinking")
            if !include_think && m.role == "thinking" {
                return false;
            }
            true
        })
        .map(|m| {
            let mut obj = serde_json::json!({
                "role": m.role,
                "content": m.content,
            });
            if include_meta {
                obj["id"] = serde_json::json!(m.id);
                obj["model"] = serde_json::json!(m.model);
                obj["createdAt"] = serde_json::json!(m.created_at);
            }
            if include_tools {
                if let Some(ref tc) = m.tool_calls {
                    obj["toolCalls"] = serde_json::json!(tc);
                }
                if let Some(tci) = &m.tool_call_id {
                    obj["toolCallId"] = serde_json::json!(tci);
                }
            }
            obj
        })
        .collect();

    let mut export = serde_json::json!({
        "messages": filtered,
    });

    if include_meta {
        export["session"] = serde_json::json!({
            "id": session.id,
            "title": session.title,
            "model": session.model,
            "provider": session.provider,
            "createdAt": session.created_at,
        });
    }

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

fn export_markdown(
    session: &SessionInfo,
    messages: &[devpilot_store::MessageInfo],
    include_meta: bool,
    include_tools: bool,
    include_think: bool,
) -> Result<String, String> {
    let mut md = String::new();

    if include_meta {
        md.push_str(&format!("# {}\n\n", session.title));
        md.push_str(&format!(
            "- **Model:** {}\n- **Provider:** {}\n- **Created:** {}\n\n",
            session.model, session.provider, session.created_at
        ));
        md.push_str("---\n\n");
    }

    for msg in messages {
        if !include_tools && msg.tool_calls.is_some() {
            continue;
        }
        if !include_think && msg.role == "thinking" {
            continue;
        }

        let label = match msg.role.as_str() {
            "user" => "👤 **User**",
            "assistant" => "🤖 **Assistant**",
            "system" => "⚙️ **System**",
            "tool" => "🔧 **Tool**",
            other => &format!("**{}**", other),
        };
        md.push_str(&format!("### {}\n\n{}\n\n", label, msg.content));
    }

    Ok(md)
}

fn export_text(
    session: &SessionInfo,
    messages: &[devpilot_store::MessageInfo],
    include_meta: bool,
    include_tools: bool,
    include_think: bool,
) -> Result<String, String> {
    let mut txt = String::new();

    if include_meta {
        txt.push_str(&format!("Session: {}\n", session.title));
        txt.push_str(&format!("Model: {}\n", session.model));
        txt.push_str(&format!("Provider: {}\n", session.provider));
        txt.push_str(&format!("Created: {}\n", session.created_at));
        txt.push_str("\n---\n\n");
    }

    for msg in messages {
        if !include_tools && msg.tool_calls.is_some() {
            continue;
        }
        if !include_think && msg.role == "thinking" {
            continue;
        }
        txt.push_str(&format!(
            "[{}]: {}\n\n",
            msg.role.to_uppercase(),
            msg.content
        ));
    }

    Ok(txt)
}
