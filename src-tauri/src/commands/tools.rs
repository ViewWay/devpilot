//! Tauri commands for tool execution.
//!
//! Provides invoke handlers for executing built-in tools,
//! listing available tools, and managing the approval flow.

use crate::AppState;
use devpilot_protocol::ToolDefinition;
use devpilot_tools::{ApprovalStatus, ToolContext};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tracing::info;

// ── Types for IPC ────────────────────────────────────

/// Result of a tool execution.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolExecutionResult {
    /// The approval status.
    pub approval: ApprovalStatus,
    /// The tool output content (if executed).
    pub output: Option<String>,
    /// Whether the output is an error.
    pub is_error: bool,
    /// Optional metadata JSON.
    pub metadata: Option<serde_json::Value>,
    /// Execution duration in milliseconds.
    pub duration_ms: u64,
}

/// Request to resolve a pending approval.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolveApprovalRequest {
    /// The approval request ID.
    pub request_id: String,
    /// Whether the tool execution was approved.
    pub approved: bool,
}

// ── Commands ─────────────────────────────────────────

/// List all available tool definitions.
#[tauri::command]
pub async fn list_tools(state: State<'_, AppState>) -> Result<Vec<ToolDefinition>, String> {
    Ok(state.tool_registry.definitions().await)
}

/// Execute a tool by name.
///
/// If the tool requires approval and an approval callback is set,
/// this emits a `tool-approval-request` event and waits for the
/// frontend to resolve it via `resolve_tool_approval`.
#[tauri::command(rename_all = "camelCase")]
pub async fn execute_tool(
    app: AppHandle,
    state: State<'_, AppState>,
    tool_name: String,
    input: serde_json::Value,
    session_id: String,
    working_dir: String,
) -> Result<ToolExecutionResult, String> {
    let executor = state.tool_executor.lock().await;

    let ctx = ToolContext {
        working_dir,
        session_id,
    };

    info!(
        "Executing tool: {} for session: {}",
        tool_name, ctx.session_id
    );

    let result = executor
        .execute(&tool_name, input, &ctx)
        .await
        .map_err(|e| format!("Tool execution failed: {e}"))?;

    // Emit a tool-executed event for the frontend to track
    if result.output.is_some() {
        let _ = app.emit(
            "tool-executed",
            serde_json::json!({
                "toolName": tool_name,
                "isError": result.output.as_ref().is_some_and(|o| o.is_error),
                "durationMs": result.duration_ms,
            }),
        );
    }

    Ok(ToolExecutionResult {
        approval: result.approval,
        output: result.output.as_ref().map(|o| o.content.clone()),
        is_error: result.output.as_ref().is_some_and(|o| o.is_error),
        metadata: result.output.as_ref().and_then(|o| o.metadata.clone()),
        duration_ms: result.duration_ms,
    })
}

/// Resolve a pending tool approval request.
///
/// Called by the frontend after the user approves or rejects a tool call.
/// This resolves the approval gate that the agent is waiting on.
#[tauri::command(rename_all = "camelCase")]
pub async fn resolve_tool_approval(
    state: State<'_, AppState>,
    request: ResolveApprovalRequest,
) -> Result<(), String> {
    state
        .approval_gate
        .resolve(&request.request_id, request.approved)
        .await
        .map_err(|e| format!("Failed to resolve approval: {e}"))
}

/// Get the list of pending tool approvals.
#[tauri::command]
pub async fn pending_approvals(state: State<'_, AppState>) -> Result<usize, String> {
    let executor = state.tool_executor.lock().await;
    Ok(executor.pending_count().await)
}
