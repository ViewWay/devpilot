//! Shared types exported for Tauri IPC serialization.

use serde::{Deserialize, Serialize};

/// Response for the health-check / ping command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    pub message: String,
    pub version: String,
    pub timestamp: String,
}

/// Session metadata returned by the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub model: String,
    pub provider: String,
    pub working_dir: Option<String>,
    pub mode: String,
    pub reasoning_effort: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
    pub message_count: i64,
}

/// Message record returned by the store.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageInfo {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub model: Option<String>,
    pub token_input: i64,
    pub token_output: i64,
    pub token_cache_read: i64,
    pub token_cache_write: i64,
    pub cost_usd: f64,
    pub tool_calls: Option<String>,
    pub tool_call_id: Option<String>,
    pub created_at: String,
}

/// A key-value setting entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}

/// Usage record for token/cost tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageRecord {
    pub id: i64,
    pub date: String,
    pub provider: String,
    pub model: String,
    pub token_input: i64,
    pub token_output: i64,
    pub token_cache_read: i64,
    pub token_cache_write: i64,
    pub cost_usd: f64,
    pub request_count: i64,
}

/// A checkpoint for session rewind support.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointInfo {
    pub id: String,
    pub session_id: String,
    pub message_id: String,
    pub summary: String,
    pub token_count: i64,
    pub created_at: String,
}

/// Provider record for persistent provider configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderRecord {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    pub base_url: String,
    pub api_key_set: bool,
    pub models: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}

/// MCP server record for persistent MCP server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRecord {
    pub id: String,
    pub name: String,
    /// "stdio" or "sse"
    pub transport: String,
    /// Command to run (for stdio transport).
    pub command: Option<String>,
    /// Arguments as JSON array string (for stdio transport).
    pub args: Option<String>,
    /// URL endpoint (for sse transport).
    pub url: Option<String>,
    /// Environment variables as JSON object string (for stdio transport).
    pub env: Option<String>,
    pub enabled: bool,
    pub created_at: String,
}
