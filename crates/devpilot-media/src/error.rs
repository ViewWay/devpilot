//! Error types for media.

use thiserror::Error;

/// Media errors.
#[derive(Debug, Error)]
pub enum MediaError {
    /// HTTP request failed.
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// Invalid configuration.
    #[error("invalid config: {0}")]
    InvalidConfig(String),

    /// Generation failed.
    #[error("generation failed: {0}")]
    GenerationFailed(String),

    /// Base64 decode error.
    #[error("base64 decode error: {0}")]
    Base64(#[from] base64::DecodeError),

    /// Serialization error.
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

/// Convenience alias.
pub type MediaResult<T> = Result<T, MediaError>;
