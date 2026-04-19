//! Error types for search.

use thiserror::Error;

/// Errors during search operations.
#[derive(Debug, Error)]
pub enum SearchError {
    /// The search path does not exist.
    #[error("path does not exist: {0}")]
    PathNotFound(String),

    /// The regex pattern is invalid.
    #[error("invalid regex pattern: {0}")]
    InvalidPattern(String),

    /// An I/O error occurred.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// The walkdir iterator failed.
    #[error("walk error: {0}")]
    Walk(#[from] walkdir::Error),
}

/// Convenience alias.
pub type SearchResult<T> = Result<T, SearchError>;
