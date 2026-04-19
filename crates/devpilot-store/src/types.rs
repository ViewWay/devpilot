//! Shared types for Tauri IPC serialization.
//!
//! These types are shared between the Tauri commands layer and the store.

use serde::{Deserialize, Serialize};

/// Ping response.
#[derive(Serialize, Deserialize)]
pub struct PingResponse {
    pub message: String,
    pub version: String,
    pub timestamp: String,
}

/// Session info.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub model: String,
    pub provider: String,
    pub working_dir: Option<String>,
    pub mode: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Message info.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MessageInfo {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub token_input: i64,
    pub token_output: i64,
    pub cost_usd: f64,
    pub created_at: String,
}

/// Settings key-value pair.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

/// Usage record.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct UsageRecord {
    pub id: String,
    pub session_id: String,
    pub model: String,
    pub provider: String,
    pub token_input: i64,
    pub token_output: i64,
    pub cost_usd: f64,
    pub created_at: String,
}

/// Provider info stored in database.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key_encrypted: Option<String>,
    pub models: Option<String>, // JSON array of model info
    pub enabled: bool,
}

/// MCP server config stored in database.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct McpServerInfo {
    pub id: String,
    pub name: String,
    pub transport: String, // "stdio" or "sse"
    pub command: Option<String>,
    pub args: Option<String>,
    pub url: Option<String>,
    pub env: Option<String>, // JSON object
    pub enabled: bool,
    pub created_at: String,
}

/// Checkpoint info for conversation compaction.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CheckpointInfo {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    pub summary: String,
    pub token_count: i64,
    pub created_at: String,
}
