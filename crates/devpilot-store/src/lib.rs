//! devpilot-store: SQLite persistence layer for DevPilot.
//!
//! Provides:
//! - `Store` — persistent SQLite connection with migrations
//! - High-level CRUD operations for sessions, messages, settings, usage
//! - `config` — Multi-layer TOML configuration system
//! - Shared types for Tauri IPC serialization

mod claude_import;
pub mod config;
mod crypto;
mod error;
mod store;
mod types;

pub use claude_import::*;
pub use crypto::{decrypt, encrypt};
pub use error::StoreError;
pub use store::Store;
pub use types::*;
