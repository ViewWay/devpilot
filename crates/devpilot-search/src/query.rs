//! Search query types and result structures.

use serde::{Deserialize, Serialize};

/// Search mode.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum SearchMode {
    /// Search file names (fuzzy match).
    #[default]
    Files,
    /// Search file contents (regex match).
    Content,
}

/// A search query.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    /// The search pattern (fuzzy for Files, regex for Content).
    pub pattern: String,
    /// Root directory to search in.
    pub path: String,
    /// Search mode.
    pub mode: SearchMode,
    /// Maximum number of results.
    pub max_results: usize,
    /// Optional file glob filter (e.g. "*.rs"). Applied in both modes.
    pub file_glob: Option<String>,
}

/// A single search match.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchMatch {
    /// The file path relative to the search root.
    pub path: String,
    /// (Content mode only) Line number (1-indexed).
    pub line_number: Option<usize>,
    /// (Content mode only) The matching line text.
    pub line_text: Option<String>,
    /// (Files mode) Fuzzy match score (0.0–1.0, higher is better).
    pub score: Option<f64>,
}
