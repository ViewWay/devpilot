//! Multi-level permission system for DevPilot tool execution.
//!
//! Re-exports permission types from `devpilot-protocol` and provides
//! helpers that depend on `devpilot-tools` types (e.g. `ToolOutput`).

use devpilot_tools::ToolOutput;

// Re-export all permission types from protocol.
pub use devpilot_protocol::{
    ApprovalDecision, PermissionGuard, PermissionMode, PermissionPolicy, policy_from_mode,
};

/// Create a blocked [`ToolOutput`] with a human-readable message.
pub fn blocked_output(tool_name: &str, reason: &str) -> ToolOutput {
    ToolOutput::err(format!("Blocked: {tool_name} — {reason}"))
}
