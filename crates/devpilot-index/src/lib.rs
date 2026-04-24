//! # devpilot-index
//!
//! Code symbol index with tree-sitter parsing and fuzzy search.
//!
//! Extracts symbols (functions, structs, enums, traits, impls, consts, etc.)
//! from source files and provides fast fuzzy search over them.
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_index::{SymbolIndex, IndexConfig};
//!
//! let index = SymbolIndex::new(IndexConfig::default());
//! index.index_directory("./src").await.unwrap();
//! let results = index.search("handler").await;
//! ```

mod error;
mod indexer;
mod language;
mod search;
mod symbol;

pub use error::IndexError;
pub use indexer::{IndexConfig, IndexStats, SymbolIndex};
pub use language::LanguageId;
pub use search::SearchResult;
pub use symbol::{CodeSymbol, SymbolKind};
