//! Core error types.

use thiserror::Error;

/// Errors that can occur in the core engine.
#[derive(Debug, Error)]
pub enum CoreError {
    /// Session not found.
    #[error("session not found: {0}")]
    SessionNotFound(String),

    /// Session is in an invalid state for the requested operation.
    #[error("invalid session state: expected {expected}, got {actual}")]
    InvalidState { expected: String, actual: String },

    /// LLM provider error.
    #[error("LLM error: {0}")]
    Llm(#[from] devpilot_llm::error::LlmError),

    /// Tool execution error.
    #[error("tool error: {0}")]
    Tool(#[from] devpilot_tools::ToolError),

    /// Tool was denied by the user.
    #[error("tool call denied: {0}")]
    ToolDenied(String),

    /// Maximum agent turns exceeded.
    #[error("maximum agent turns exceeded ({0})")]
    MaxTurnsExceeded(u32),

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// A generic internal error.
    #[error("{0}")]
    Internal(String),
}

/// Convenience alias.
pub type CoreResult<T> = Result<T, CoreError>;
