//! Search result types.

use serde::{Deserialize, Serialize};

use crate::symbol::CodeSymbol;

/// A search result with relevance score.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// The matched symbol.
    pub symbol: CodeSymbol,

    /// Relevance score (higher = better match). Range [0.0, 1.0].
    pub score: f64,

    /// Why this matched (for UI display).
    pub match_reason: MatchReason,
}

/// Why a search result matched.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MatchReason {
    /// Exact name match.
    ExactName,
    /// Name starts with the query.
    Prefix,
    /// Name contains the query as a substring.
    Substring,
    /// Fuzzy match — characters appear in order but not contiguous.
    Fuzzy,
    /// Matched via full path.
    PathMatch,
}
