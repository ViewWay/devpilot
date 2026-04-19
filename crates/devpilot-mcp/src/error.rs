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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_display_transport() {
        let err = McpError::Transport("connection refused".to_string());
        assert_eq!(format!("{err}"), "Transport error: connection refused");
    }

    #[test]
    fn test_error_display_protocol() {
        let err = McpError::Protocol("invalid handshake".to_string());
        assert_eq!(format!("{err}"), "Protocol error: invalid handshake");
    }

    #[test]
    fn test_error_display_server_not_found() {
        let err = McpError::ServerNotFound("my-server".to_string());
        assert_eq!(format!("{err}"), "Server not found: my-server");
    }

    #[test]
    fn test_error_display_tool_not_found() {
        let err = McpError::ToolNotFound {
            server: "fs".to_string(),
            tool: "read".to_string(),
        };
        assert_eq!(format!("{err}"), "Tool not found on server: fs/read");
    }

    #[test]
    fn test_error_display_already_connected() {
        let err = McpError::AlreadyConnected("srv".to_string());
        assert_eq!(format!("{err}"), "Server already connected: srv");
    }

    #[test]
    fn test_error_display_disconnected() {
        let err = McpError::Disconnected("srv".to_string());
        assert_eq!(format!("{err}"), "Server disconnected: srv");
    }

    #[test]
    fn test_error_display_init_failed() {
        let err = McpError::InitFailed("timeout".to_string());
        assert_eq!(format!("{err}"), "Initialization failed: timeout");
    }

    #[test]
    fn test_error_display_json_rpc() {
        let err = McpError::JsonRpc {
            code: -32600,
            message: "Invalid Request".to_string(),
        };
        assert_eq!(
            format!("{err}"),
            "JSON-RPC error (code -32600): Invalid Request"
        );
    }

    #[test]
    fn test_error_display_timeout() {
        let err = McpError::Timeout(5000);
        assert_eq!(format!("{err}"), "Request timeout after 5000ms");
    }
}
