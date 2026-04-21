//! DevPilot Tools — tool registry, execution, and built-in tools.
//!
//! This crate provides:
//! - `Tool` trait: the interface all tools implement
//! - `ToolRegistry`: a registry of available tools, with enable/disable
//! - Built-in tools: `shell_exec`, `file_read`, `file_write`, `apply_patch`
//! - `ToolExecutor`: coordinates tool execution with approval flow

mod error;
mod executor;
mod registry;
mod skill_loader;
mod tools;

pub use error::{ToolError, ToolResult};
pub use executor::{ApprovalRequest, ApprovalStatus, RiskLevel, ToolExecutor};
pub use registry::ToolRegistry;
pub use skill_loader::SkillLoader;
pub use tools::{
    ApplyPatchTool, FileReadTool, FileSearchTool, FileWriteTool, GlobTool, ListDirectoryTool,
    ShellExecTool, WebFetchTool,
};

use async_trait::async_trait;
use devpilot_protocol::ToolDefinition;
use serde::{Deserialize, Serialize};
use std::fmt;

/// The `Tool` trait — every tool must implement this.
#[async_trait]
pub trait Tool: Send + Sync {
    /// Tool name (e.g. "shell_exec", "file_read").
    fn name(&self) -> &str;

    /// Human-readable description shown to the LLM.
    fn description(&self) -> &str;

    /// JSON Schema describing the tool's input parameters.
    fn input_schema(&self) -> serde_json::Value;

    /// Whether this tool requires user approval before execution.
    fn requires_approval(&self) -> bool {
        true
    }

    /// Execute the tool with the given input.
    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput>;
}

/// Context passed to every tool execution.
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// The working directory for this session.
    pub working_dir: String,
    /// The session ID.
    pub session_id: String,
    /// Per-session environment variables (KEY=VALUE pairs).
    /// These are injected into shell commands in addition to the
    /// base environment (PATH, HOME, LANG, TERM).
    pub env_vars: Vec<(String, String)>,
}

/// Output from a tool execution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolOutput {
    /// The text content to return to the LLM.
    pub content: String,
    /// Whether the execution resulted in an error.
    #[serde(default)]
    pub is_error: bool,
    /// Optional metadata (file paths, exit codes, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

impl ToolOutput {
    /// Create a successful output.
    pub fn ok(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            is_error: false,
            metadata: None,
        }
    }

    /// Create an error output.
    pub fn err(content: impl Into<String>) -> Self {
        Self {
            content: content.into(),
            is_error: true,
            metadata: None,
        }
    }

    /// Add metadata to the output.
    pub fn with_metadata(mut self, meta: serde_json::Value) -> Self {
        self.metadata = Some(meta);
        self
    }
}

impl fmt::Display for ToolOutput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.is_error {
            write!(f, "[ERROR] {}", self.content)
        } else {
            write!(f, "{}", self.content)
        }
    }
}

/// Convert a `Tool` trait object to a `ToolDefinition` for the LLM.
pub fn tool_to_definition(tool: &dyn Tool) -> ToolDefinition {
    ToolDefinition {
        name: tool.name().to_string(),
        description: tool.description().to_string(),
        input_schema: tool.input_schema(),
    }
}
