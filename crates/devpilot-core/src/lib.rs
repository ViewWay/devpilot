//! DevPilot Core — session management, agent engine, and event bus.
//!
//! This crate is the "brain" of DevPilot. It orchestrates:
//! - Session lifecycle (create, pause, resume, rewind)
//! - Agent loop (LLM ↔ tool calling cycle)
//! - Event bus (broadcasting events to Tauri frontend)
//! - Context compression (auto-compact old messages)

pub mod agent;
pub mod approval;
pub mod compact;
pub mod error;
pub mod event_bus;
pub mod permission;
pub mod session;
pub mod session_ops;

pub use agent::{Agent, AgentConfig};
pub use approval::ApprovalGate;
pub use compact::CompactStrategy;
pub use error::CoreError;
pub use event_bus::{CoreEvent, EventBus, EventBusReceiver};
pub use permission::{
    ApprovalDecision, PermissionGuard, PermissionMode, PermissionPolicy, blocked_output,
    policy_from_mode,
};
pub use session::{Session, SessionConfig, SessionState};
pub use session_ops::{
    ExportFormat, ExportOptions, ForkOptions, ForkResult, RewindOptions, RewindResult,
    export_session, fork_session, rewind_session,
};
