use thiserror::Error;

/// Errors that can occur in the store layer.
#[derive(Debug, Error)]
pub enum StoreError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Session not found: {0}")]
    SessionNotFound(String),

    #[error("Message not found: {0}")]
    MessageNotFound(String),

    #[error("Migration error: {0}")]
    Migration(String),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// Convenience alias.
#[allow(dead_code)]
pub type Result<T> = std::result::Result<T, StoreError>;
