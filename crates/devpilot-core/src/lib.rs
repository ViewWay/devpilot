//! DevPilot Core — session management, agent engine, and event bus.
//!
//! This crate is the "brain" of DevPilot. It orchestrates:
//! - Session lifecycle (create, pause, resume, rewind)
//! - Agent loop (LLM ↔ tool calling cycle)
//! - Event bus (broadcasting events to Tauri frontend)
//! - Context compression (auto-compact old messages)

pub mod agent;
pub mod compact;
pub mod error;
pub mod event_bus;
pub mod session;

pub use agent::{Agent, AgentConfig};
pub use compact::CompactStrategy;
pub use error::CoreError;
pub use event_bus::{CoreEvent, EventBus, EventBusReceiver};
pub use session::{Session, SessionConfig, SessionState};
