//! Error types for the index crate.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum IndexError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Walk error: {0}")]
    Walk(#[from] walkdir::Error),

    #[error("Language not supported: {0}")]
    UnsupportedLanguage(String),

    #[error("Parse error in {path}: {msg}")]
    ParseError { path: String, msg: String },

    #[error("Tree-sitter language error: {0}")]
    Language(#[from] tree_sitter::LanguageError),
}

pub type IndexResult<T> = Result<T, IndexError>;
