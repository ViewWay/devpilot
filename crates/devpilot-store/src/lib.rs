//! devpilot-store: SQLite persistence layer for DevPilot.
//!
//! Provides:
//! - `Database` — persistent SQLite connection with migrations
//! - `Store` — high-level CRUD operations for sessions, messages, settings, usage
//! - Shared types for Tauri IPC serialization

pub mod store;
pub mod types;

pub use store::Store;
pub use types::*;
