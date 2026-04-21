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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_not_found_display() {
        let err = CoreError::SessionNotFound("sess-123".into());
        assert_eq!(err.to_string(), "session not found: sess-123");
    }

    #[test]
    fn invalid_state_display() {
        let err = CoreError::InvalidState {
            expected: "idle".into(),
            actual: "running".into(),
        };
        assert_eq!(
            err.to_string(),
            "invalid session state: expected idle, got running"
        );
    }

    #[test]
    fn tool_denied_display() {
        let err = CoreError::ToolDenied("shell_exec: rm -rf /".into());
        assert_eq!(err.to_string(), "tool call denied: shell_exec: rm -rf /");
    }

    #[test]
    fn max_turns_exceeded_display() {
        let err = CoreError::MaxTurnsExceeded(50);
        assert_eq!(err.to_string(), "maximum agent turns exceeded (50)");
    }

    #[test]
    fn internal_error_display() {
        let err = CoreError::Internal("something went wrong".into());
        assert_eq!(err.to_string(), "something went wrong");
    }

    #[test]
    fn json_error_from() {
        let json_err = serde_json::from_str::<serde_json::Value>("not json");
        assert!(json_err.is_err());
        let core_err: CoreError = json_err.unwrap_err().into();
        assert!(matches!(core_err, CoreError::Json(_)));
        assert!(core_err.to_string().starts_with("JSON error:"));
    }

    #[test]
    fn error_debug_format() {
        let err = CoreError::SessionNotFound("test".into());
        let debug_str = format!("{err:?}");
        assert!(debug_str.contains("SessionNotFound"));
    }
}
