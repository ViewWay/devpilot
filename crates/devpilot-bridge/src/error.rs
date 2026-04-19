//! Error types for bridge.

use thiserror::Error;

/// Bridge errors.
#[derive(Debug, Error)]
pub enum BridgeError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// Bridge not found.
    #[error("bridge not found: {0}")]
    NotFound(String),

    /// Invalid configuration.
    #[error("invalid config: {0}")]
    InvalidConfig(String),

    /// Send failed.
    #[error("send failed on {platform}: {reason}")]
    SendFailed { platform: String, reason: String },

    /// Serialization error.
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Convenience alias.
pub type BridgeResult<T> = Result<T, BridgeError>;
