//! MCP error types.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum McpError {
    #[error("Transport error: {0}")]
    Transport(String),

    #[error("Protocol error: {0}")]
    Protocol(String),

    #[error("Server not found: {0}")]
    ServerNotFound(String),

    #[error("Tool not found on server: {server}/{tool}")]
    ToolNotFound { server: String, tool: String },

    #[error("Server already connected: {0}")]
    AlreadyConnected(String),

    #[error("Server disconnected: {0}")]
    Disconnected(String),

    #[error("Initialization failed: {0}")]
    InitFailed(String),

    #[error("JSON-RPC error (code {code}): {message}")]
    JsonRpc { code: i64, message: String },

    #[error("Request timeout after {0}ms")]
    Timeout(u64),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
}

pub type McpResult<T> = Result<T, McpError>;
