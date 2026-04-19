//! Error types for the tools crate.

use thiserror::Error;

/// Errors that can occur during tool execution.
#[derive(Debug, Error)]
pub enum ToolError {
    /// The requested tool was not found in the registry.
    #[error("Tool not found: {0}")]
    NotFound(String),

    /// The tool input failed validation against its schema.
    #[error("Invalid input for tool '{tool}': {message}")]
    InvalidInput { tool: String, message: String },

    /// Tool execution failed.
    #[error("Tool '{tool}' execution failed: {message}")]
    ExecutionFailed { tool: String, message: String },

    /// The tool requires approval but was not approved.
    #[error("Tool '{0}' requires user approval")]
    ApprovalRequired(String),

    /// The tool was rejected by the user.
    #[error("Tool '{0}' was rejected by the user")]
    ApprovalRejected(String),

    /// I/O error during file operations.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// UTF-8 decoding error.
    #[error("UTF-8 error: {0}")]
    Utf8(#[from] std::string::FromUtf8Error),

    /// A generic error wrapped in a message.
    #[error("{0}")]
    Other(String),
}

/// Convenient Result alias.
pub type ToolResult<T> = Result<T, ToolError>;
