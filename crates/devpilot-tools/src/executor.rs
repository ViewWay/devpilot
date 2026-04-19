//! Tool executor — coordinates tool execution with approval flow.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolRegistry, ToolResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, oneshot};

/// Approval status for a tool call.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalStatus {
    /// Tool execution was approved by the user.
    Approved,
    /// Tool execution was rejected by the user.
    Rejected,
    /// Tool does not require approval (auto-approved).
    AutoApproved,
}

/// A pending approval request.
struct PendingApproval {
    /// Sender to communicate the approval decision.
    tx: oneshot::Sender<bool>,
}

/// Coordinates tool execution including the approval flow.
///
/// When a tool requires approval:
/// 1. The executor emits an approval request event
/// 2. The frontend shows the approval dialog
/// 3. The user approves or rejects
/// 4. The executor proceeds or cancels accordingly
pub struct ToolExecutor {
    registry: Arc<ToolRegistry>,
    pending: RwLock<HashMap<String, PendingApproval>>,
    /// Callback to emit approval requests to the frontend.
    /// In production this will be replaced with Tauri event emission.
    #[allow(clippy::type_complexity)]
    approval_callback: Option<Box<dyn Fn(ApprovalRequest) + Send + Sync>>,
}

/// An approval request sent to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovalRequest {
    /// Unique ID for this approval request.
    pub id: String,
    /// The tool call ID.
    pub tool_call_id: String,
    /// The tool name being executed.
    pub tool_name: String,
    /// The command or action being performed (for display).
    pub command: String,
    /// Human-readable description of what the tool will do.
    pub description: String,
    /// Risk level of this operation.
    pub risk_level: RiskLevel,
    /// Working directory context.
    pub working_dir: Option<String>,
}

/// Risk classification for tool operations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// Read-only operations (ls, cat, grep, git status).
    Low,
    /// Write operations (file edits, git commits).
    Medium,
    /// Destructive operations (rm -rf, git push --force).
    High,
}

/// Result of a tool execution including approval status.
#[derive(Debug)]
pub struct ExecutionResult {
    /// Whether the tool was approved.
    pub approval: ApprovalStatus,
    /// The tool output (if executed).
    pub output: Option<ToolOutput>,
    /// Execution duration in milliseconds.
    pub duration_ms: u64,
}

impl ToolExecutor {
    /// Create a new executor backed by the given tool registry.
    pub fn new(registry: Arc<ToolRegistry>) -> Self {
        Self {
            registry,
            pending: RwLock::new(HashMap::new()),
            approval_callback: None,
        }
    }

    /// Set the approval request callback.
    pub fn set_approval_callback<F>(&mut self, cb: F)
    where
        F: Fn(ApprovalRequest) + Send + Sync + 'static,
    {
        self.approval_callback = Some(Box::new(cb));
    }

    /// Execute a tool by name, handling approval if required.
    ///
    /// If the tool requires approval, this will:
    /// 1. Create an approval request
    /// 2. Invoke the callback (if set)
    /// 3. Wait for the user's decision
    /// 4. Proceed or cancel
    pub async fn execute(
        &self,
        tool_name: &str,
        input: serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolResult<ExecutionResult> {
        let tool = self
            .registry
            .get(tool_name)
            .await
            .ok_or_else(|| ToolError::NotFound(tool_name.to_string()))?;

        // Check if approval is needed
        if tool.requires_approval() {
            // For now, auto-approve in headless mode (no callback set)
            // In production, this will emit a Tauri event and wait
            if self.approval_callback.is_some() {
                let request = self.build_approval_request(tool.as_ref(), &input, ctx);

                // Store pending approval
                let (tx, rx) = oneshot::channel();
                {
                    let mut pending = self.pending.write().await;
                    pending.insert(request.id.clone(), PendingApproval { tx });
                }

                // Emit the approval request
                if let Some(ref cb) = self.approval_callback {
                    cb(request);
                }

                // Wait for the decision
                let approved = rx
                    .await
                    .map_err(|_| ToolError::Other("Approval channel dropped".into()))?;

                if !approved {
                    // Clean up pending
                    {
                        let mut pending = self.pending.write().await;
                        pending.remove(tool_name);
                    }
                    return Ok(ExecutionResult {
                        approval: ApprovalStatus::Rejected,
                        output: None,
                        duration_ms: 0,
                    });
                }
            }
        }

        // Execute the tool
        let start = std::time::Instant::now();
        let output = tool.execute(input, ctx).await?;
        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(ExecutionResult {
            approval: if tool.requires_approval() {
                ApprovalStatus::Approved
            } else {
                ApprovalStatus::AutoApproved
            },
            output: Some(output),
            duration_ms,
        })
    }

    /// Resolve a pending approval request.
    pub async fn resolve_approval(&self, call_id: &str, approved: bool) -> ToolResult<()> {
        let mut pending = self.pending.write().await;
        let entry = pending
            .remove(call_id)
            .ok_or_else(|| ToolError::Other(format!("No pending approval for call {call_id}")))?;
        let _ = entry.tx.send(approved);
        Ok(())
    }

    /// Build an approval request from tool info.
    fn build_approval_request(
        &self,
        tool: &dyn Tool,
        input: &serde_json::Value,
        ctx: &ToolContext,
    ) -> ApprovalRequest {
        let risk_level = Self::classify_risk(tool.name(), input);
        let command = Self::format_command(tool.name(), input);

        ApprovalRequest {
            id: uuid::Uuid::new_v4().to_string(),
            tool_call_id: uuid::Uuid::new_v4().to_string(),
            tool_name: tool.name().to_string(),
            command,
            description: tool.description().to_string(),
            risk_level,
            working_dir: Some(ctx.working_dir.clone()),
        }
    }

    /// Classify the risk level of a tool call.
    pub fn classify_risk(tool_name: &str, input: &serde_json::Value) -> RiskLevel {
        match tool_name {
            "file_read" => RiskLevel::Low,
            "shell_exec" => {
                // Check if the command is destructive
                if let Some(cmd) = input["command"].as_str() {
                    let destructive_patterns = [
                        "rm -rf",
                        "rm -r",
                        "rmdir",
                        "git push --force",
                        "git push -f",
                        "npm publish",
                        "cargo publish",
                        "drop table",
                        "delete from",
                        "truncate",
                        "mkfs",
                        "dd if=",
                        "> /dev/",
                        "format",
                    ];
                    let cmd_lower = cmd.to_lowercase();
                    for pat in &destructive_patterns {
                        if cmd_lower.contains(pat) {
                            return RiskLevel::High;
                        }
                    }
                    // Write-ish commands
                    let write_patterns = [
                        "git commit",
                        "git add",
                        "git push",
                        "cargo build",
                        "npm install",
                        "pip install",
                        "mkdir",
                        "touch",
                        "cp ",
                        "mv ",
                    ];
                    for pat in &write_patterns {
                        if cmd_lower.contains(pat) {
                            return RiskLevel::Medium;
                        }
                    }
                }
                RiskLevel::Medium
            }
            "file_write" | "apply_patch" => RiskLevel::Medium,
            _ => RiskLevel::Medium,
        }
    }

    /// Format a human-readable command string from tool input.
    fn format_command(tool_name: &str, input: &serde_json::Value) -> String {
        match tool_name {
            "shell_exec" => input["command"]
                .as_str()
                .unwrap_or("<shell command>")
                .to_string(),
            "file_read" => {
                let path = input["path"].as_str().unwrap_or("<path>");
                format!("read {path}")
            }
            "file_write" => {
                let path = input["path"].as_str().unwrap_or("<path>");
                format!("write {path}")
            }
            "apply_patch" => {
                let path = input["path"].as_str().unwrap_or("<path>");
                format!("patch {path}")
            }
            _ => format!("{tool_name}({input})"),
        }
    }

    /// Get the number of pending approvals.
    pub async fn pending_count(&self) -> usize {
        self.pending.read().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_risk_read() {
        let risk =
            ToolExecutor::classify_risk("file_read", &serde_json::json!({"path": "/tmp/test.txt"}));
        assert_eq!(risk, RiskLevel::Low);
    }

    #[test]
    fn test_classify_risk_destructive() {
        let risk = ToolExecutor::classify_risk(
            "shell_exec",
            &serde_json::json!({"command": "rm -rf /tmp/test"}),
        );
        assert_eq!(risk, RiskLevel::High);
    }

    #[test]
    fn test_classify_risk_write() {
        let risk = ToolExecutor::classify_risk(
            "shell_exec",
            &serde_json::json!({"command": "git commit -m 'test'"}),
        );
        assert_eq!(risk, RiskLevel::Medium);
    }

    #[test]
    fn test_classify_risk_file_write() {
        let risk = ToolExecutor::classify_risk(
            "file_write",
            &serde_json::json!({"path": "/tmp/test.txt", "content": "hello"}),
        );
        assert_eq!(risk, RiskLevel::Medium);
    }

    #[test]
    fn test_format_command() {
        assert_eq!(
            ToolExecutor::format_command("shell_exec", &serde_json::json!({"command": "ls -la"})),
            "ls -la"
        );
        assert_eq!(
            ToolExecutor::format_command("file_read", &serde_json::json!({"path": "/foo"})),
            "read /foo"
        );
    }

    #[tokio::test]
    async fn test_execute_auto_approved_tool() {
        use crate::ToolRegistry;

        let reg = Arc::new(ToolRegistry::new());
        let executor = ToolExecutor::new(Arc::clone(&reg));

        // No tools registered — should get NotFound
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        };
        let result = executor
            .execute("nonexistent", serde_json::json!({}), &ctx)
            .await;
        assert!(result.is_err());
    }
}
