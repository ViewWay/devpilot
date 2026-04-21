//! LLM error types.

use thiserror::Error;

/// Errors that can occur during LLM operations.
#[derive(Debug, Error)]
pub enum LlmError {
    /// The provider returned a non-success HTTP status.
    #[error("API error {status}: {message}")]
    ApiError { status: u16, message: String },

    /// Authentication failed (invalid or missing API key).
    #[error("Authentication failed: {0}")]
    AuthError(String),

    /// Rate limited — retry after the given seconds.
    #[error("Rate limited (retry after {retry_after:?}s)")]
    RateLimitError { retry_after: Option<f64> },

    /// Network connectivity issue.
    #[error("Network error: {0}")]
    NetworkError(String),

    /// Error during stream reading.
    #[error("Stream error: {0}")]
    StreamError(String),

    /// The request was malformed or missing required fields.
    #[error("Invalid request: {0}")]
    InvalidRequest(String),

    /// The requested model does not exist on this provider.
    #[error("Model not found: {0}")]
    ModelNotFound(String),

    /// Input exceeds the model's context window.
    #[error("Context length exceeded: used {used}, limit {limit}")]
    ContextLengthExceeded { limit: u32, used: u32 },

    /// The provider is not configured (missing API key, etc.).
    #[error("Provider not configured: {0}")]
    ProviderNotConfigured(String),

    /// Request timed out.
    #[error("Timeout: {0}")]
    Timeout(String),

    /// Provider returned unexpected response format.
    #[error("Unexpected response: {0}")]
    UnexpectedResponse(String),

    /// Generic error from reqwest.
    #[error("HTTP client error: {0}")]
    HttpClientError(#[from] reqwest::Error),

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    JsonError(#[from] serde_json::Error),
}

impl LlmError {
    /// Whether this error is transient and the request can be retried.
    pub fn is_retryable(&self) -> bool {
        matches!(
            self,
            Self::RateLimitError { .. } | Self::NetworkError(_) | Self::Timeout(_)
        )
    }

    /// Extract a user-friendly message suitable for UI display.
    pub fn display_message(&self) -> String {
        match self {
            Self::ApiError { status, message } => {
                format!("API error (HTTP {status}): {message}")
            }
            Self::AuthError(msg) => format!("Authentication failed: {msg}"),
            Self::RateLimitError { retry_after } => {
                if let Some(secs) = retry_after {
                    format!("Rate limited. Retry after {:.1}s.", secs)
                } else {
                    "Rate limited. Please wait and try again.".into()
                }
            }
            Self::NetworkError(msg) => format!("Network error: {msg}"),
            Self::StreamError(msg) => format!("Stream error: {msg}"),
            Self::InvalidRequest(msg) => format!("Invalid request: {msg}"),
            Self::ModelNotFound(model) => format!("Model not found: {model}"),
            Self::ContextLengthExceeded { used, limit } => {
                format!("Context too long ({used} > {limit} tokens). Try /compact to summarize.")
            }
            Self::ProviderNotConfigured(name) => format!("Provider not configured: {name}"),
            Self::Timeout(msg) => format!("Request timed out: {msg}"),
            Self::UnexpectedResponse(msg) => format!("Unexpected response: {msg}"),
            Self::HttpClientError(e) => format!("HTTP error: {e}"),
            Self::JsonError(e) => format!("JSON error: {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn is_retryable_rate_limit() {
        let err = LlmError::RateLimitError {
            retry_after: Some(30.0),
        };
        assert!(err.is_retryable());
    }

    #[test]
    fn is_retryable_network() {
        let err = LlmError::NetworkError("connection reset".into());
        assert!(err.is_retryable());
    }

    #[test]
    fn is_retryable_timeout() {
        let err = LlmError::Timeout("30s elapsed".into());
        assert!(err.is_retryable());
    }

    #[test]
    fn not_retryable_api_error() {
        let err = LlmError::ApiError {
            status: 400,
            message: "bad request".into(),
        };
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_auth_error() {
        let err = LlmError::AuthError("invalid key".into());
        assert!(!err.is_retryable());
    }

    #[test]
    fn not_retryable_context_exceeded() {
        let err = LlmError::ContextLengthExceeded {
            limit: 128000,
            used: 200000,
        };
        assert!(!err.is_retryable());
    }

    #[test]
    fn display_message_api_error() {
        let err = LlmError::ApiError {
            status: 429,
            message: "Too many requests".into(),
        };
        assert!(err.display_message().contains("HTTP 429"));
    }

    #[test]
    fn display_message_rate_limit_with_retry() {
        let err = LlmError::RateLimitError {
            retry_after: Some(60.0),
        };
        let msg = err.display_message();
        assert!(msg.contains("60.0s"));
    }

    #[test]
    fn display_message_rate_limit_without_retry() {
        let err = LlmError::RateLimitError { retry_after: None };
        let msg = err.display_message();
        assert!(msg.contains("wait and try again"));
    }

    #[test]
    fn display_message_context_exceeded() {
        let err = LlmError::ContextLengthExceeded {
            limit: 128000,
            used: 200000,
        };
        let msg = err.display_message();
        assert!(msg.contains("200000"));
        assert!(msg.contains("128000"));
        assert!(msg.contains("/compact"));
    }

    #[test]
    fn display_message_model_not_found() {
        let err = LlmError::ModelNotFound("gpt-5".into());
        assert!(err.display_message().contains("gpt-5"));
    }

    #[test]
    fn display_message_provider_not_configured() {
        let err = LlmError::ProviderNotConfigured("openai".into());
        assert!(err.display_message().contains("openai"));
    }
}
