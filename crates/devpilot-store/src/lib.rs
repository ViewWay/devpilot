//! devpilot-store: SQLite persistence layer for DevPilot.
//!
//! Provides:
//! - `Store` — persistent SQLite connection with migrations
//! - High-level CRUD operations for sessions, messages, settings, usage
//! - Shared types for Tauri IPC serialization

mod crypto;
mod error;
mod store;
mod types;

pub use crypto::{decrypt, encrypt};
pub use error::StoreError;
pub use store::Store;
pub use types::*;
