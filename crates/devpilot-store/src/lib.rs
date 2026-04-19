//! devpilot-store: SQLite persistence layer for DevPilot.
//!
//! Provides:
//! - `Store` — persistent SQLite connection with migrations
//! - High-level CRUD operations for sessions, messages, settings, usage
//! - Shared types for Tauri IPC serialization

mod error;
mod store;
mod types;

pub use error::StoreError;
pub use store::Store;
pub use types::*;
