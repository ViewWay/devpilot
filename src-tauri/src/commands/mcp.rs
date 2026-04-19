//! MCP server management IPC commands.

use crate::AppState;
use devpilot_mcp::{McpManager, McpServerConfig, TransportType};
use devpilot_store::McpServerRecord;
use tauri::State;

// ── CRUD (backed by SQLite) ───────────────────────────

#[tauri::command]
pub async fn list_mcp_servers(state: State<'_, AppState>) -> Result<Vec<McpServerRecord>, String> {
    let db = state.db.lock().unwrap();
    db.list_mcp_servers().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_mcp_server(
    state: State<'_, AppState>,
    server: McpServerRecord,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.upsert_mcp_server(&server).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_mcp_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.delete_mcp_server(&id).map_err(|e| e.to_string())
}

// ── Runtime connection management ─────────────────────

/// Lazily initialize McpManager on first connect.
async fn ensure_mcp_manager(state: &State<'_, AppState>) -> McpManager {
    let mut guard = state.mcp_manager.lock().await;
    if guard.is_none() {
        guard.replace(McpManager::new((*state.tool_registry).clone()));
    }
    guard.clone().unwrap()
}

#[tauri::command]
pub async fn mcp_connect_server(
    state: State<'_, AppState>,
    server: McpServerRecord,
) -> Result<(), String> {
    let config = record_to_config(&server);
    let manager = ensure_mcp_manager(&state).await;
    manager
        .connect_server(&config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mcp_disconnect_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let manager = state.mcp_manager.lock().await;
    match manager.as_ref() {
        Some(m) => m.disconnect_server(&id).await.map_err(|e| e.to_string()),
        None => Err("MCP manager not initialized".into()),
    }
}

#[tauri::command]
pub async fn mcp_list_connected(
    state: State<'_, AppState>,
) -> Result<Vec<(String, String)>, String> {
    let manager = state.mcp_manager.lock().await;
    match manager.as_ref() {
        Some(m) => Ok(m.connected_servers().await),
        None => Ok(vec![]),
    }
}

// ── Helpers ───────────────────────────────────────────

/// Convert a DB record to a runtime config.
fn record_to_config(record: &McpServerRecord) -> McpServerConfig {
    let transport = match record.transport.as_str() {
        "sse" => TransportType::Sse {
            url: record.url.clone().unwrap_or_default(),
        },
        _ => TransportType::Stdio {
            command: record.command.clone().unwrap_or_default(),
            args: record
                .args
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default(),
            env: record
                .env
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default(),
        },
    };

    McpServerConfig {
        id: record.id.clone(),
        name: record.name.clone(),
        transport,
        enabled: record.enabled,
    }
}
