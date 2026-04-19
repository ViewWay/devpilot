//! Tauri commands for bridge (IM/notification) management.

use crate::AppState;
use devpilot_bridge::{BridgeConfig, MessagePayload, Platform};
use serde::Deserialize;
use tauri::State;

/// Create a bridge config.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBridgeRequest {
    /// Bridge display name.
    pub name: String,
    /// Target platform: "telegram", "discord", "feishu", "slack", "webhook".
    pub platform: String,
    /// Webhook URL or Bot API endpoint.
    pub url: String,
    /// Target channel/chat ID.
    pub channel: Option<String>,
    /// API token / secret.
    pub token: Option<String>,
}

/// Send a notification through a bridge.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendNotificationRequest {
    /// Bridge ID to use.
    pub bridge_id: String,
    /// Message content.
    pub content: String,
    /// Optional title.
    pub title: Option<String>,
}

/// Register a new bridge.
#[tauri::command(rename_all = "camelCase")]
pub async fn bridge_create(
    state: State<'_, AppState>,
    req: CreateBridgeRequest,
) -> Result<String, String> {
    let platform = match req.platform.to_lowercase().as_str() {
        "telegram" => Platform::Telegram,
        "discord" => Platform::Discord,
        "feishu" | "lark" => Platform::Feishu,
        "slack" => Platform::Slack,
        "webhook" => Platform::GenericWebhook,
        _ => return Err(format!("Unknown platform: {}", req.platform)),
    };

    let config = BridgeConfig {
        platform,
        webhook_url: req.url,
        channel: req.channel,
        token: req.token,
        enabled: true,
        name: Some(req.name),
    };

    let id = uuid::Uuid::new_v4().to_string();
    let mgr = state.bridge_manager.lock().await;
    mgr.add_bridge(id.clone(), config)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// List all bridges.
#[tauri::command]
pub async fn bridge_list(state: State<'_, AppState>) -> Result<Vec<serde_json::Value>, String> {
    let mgr = state.bridge_manager.lock().await;
    let bridges = mgr.list_bridges().await;
    Ok(bridges
        .iter()
        .map(|(id, config)| {
            serde_json::json!({
                "id": id,
                "name": config.name,
                "platform": format!("{:?}", config.platform),
                "enabled": config.enabled,
            })
        })
        .collect())
}

/// Remove a bridge.
#[tauri::command(rename_all = "camelCase")]
pub async fn bridge_remove(state: State<'_, AppState>, bridge_id: String) -> Result<(), String> {
    let mgr = state.bridge_manager.lock().await;
    mgr.remove_bridge(&bridge_id)
        .await
        .map_err(|e| format!("Failed to remove bridge: {e}"))
}

/// Send a notification via a bridge.
#[tauri::command(rename_all = "camelCase")]
pub async fn bridge_send(
    state: State<'_, AppState>,
    req: SendNotificationRequest,
) -> Result<(), String> {
    let mgr = state.bridge_manager.lock().await;
    let payload = MessagePayload::text(&req.content);
    let payload = match req.title {
        Some(title) => payload.with_title(title),
        None => payload,
    };
    mgr.send_to(&req.bridge_id, &payload)
        .await
        .map_err(|e| format!("Failed to send: {e}"))?;
    Ok(())
}

/// Enable a bridge.
#[tauri::command(rename_all = "camelCase")]
pub async fn bridge_enable(state: State<'_, AppState>, bridge_id: String) -> Result<(), String> {
    let mgr = state.bridge_manager.lock().await;
    mgr.enable_bridge(&bridge_id)
        .await
        .map_err(|e| e.to_string())
}

/// Disable a bridge.
#[tauri::command(rename_all = "camelCase")]
pub async fn bridge_disable(state: State<'_, AppState>, bridge_id: String) -> Result<(), String> {
    let mgr = state.bridge_manager.lock().await;
    mgr.disable_bridge(&bridge_id)
        .await
        .map_err(|e| e.to_string())
}
