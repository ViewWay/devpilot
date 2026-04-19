//! # devpilot-search
//!
//! File search engine with fuzzy filename matching and regex content search.
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_search::{SearchEngine, SearchQuery, SearchMode};
//!
//! let engine = SearchEngine::new();
//!
//! // Fuzzy filename search
//! let results = engine.search(SearchQuery {
//!     pattern: "main".into(),
//!     path: "./src".into(),
//!     mode: SearchMode::Files,
//!     max_results: 50,
//!     file_glob: None,
//! }).await.unwrap();
//!
//! // Content search (regex)
//! let results = engine.search(SearchQuery {
//!     pattern: "fn main".into(),
//!     path: "./src".into(),
//!     mode: SearchMode::Content,
//!     max_results: 50,
//!     file_glob: Some("*.rs".into()),
//! }).await.unwrap();
//! ```

mod content;
mod engine;
mod error;
mod fuzzy;
mod query;

pub use engine::SearchEngine;
pub use error::{SearchError, SearchResult};
pub use query::{SearchMatch, SearchMode, SearchQuery};
