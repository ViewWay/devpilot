//! Tauri commands for sandboxed command execution.

use crate::AppState;
use devpilot_sandbox::{SandboxPolicy, SandboxedCommand};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Request to execute a sandboxed command.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxExecRequest {
    /// Command to execute (e.g., "ls -la").
    pub command: String,
    /// Working directory.
    pub working_dir: Option<String>,
    /// Policy preset: "default", "permissive", "strict".
    pub policy: Option<String>,
}

/// Result of a sandboxed command execution.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxExecResult {
    /// Stdout content.
    pub stdout: String,
    /// Stderr content.
    pub stderr: String,
    /// Exit code.
    pub exit_code: Option<i32>,
    /// Whether the command was denied by policy.
    pub denied: bool,
    /// Denial reason (if denied).
    pub denial_reason: Option<String>,
    /// Execution time in milliseconds.
    pub duration_ms: u64,
}

/// Execute a command in the sandbox.
#[tauri::command(rename_all = "camelCase")]
pub async fn sandbox_execute(
    _state: State<'_, AppState>,
    req: SandboxExecRequest,
) -> Result<SandboxExecResult, String> {
    let policy = match req.policy.as_deref() {
        Some("permissive") => SandboxPolicy::permissive(),
        Some("strict") => SandboxPolicy::strict(),
        _ => SandboxPolicy::default(),
    };

    let mut cmd = SandboxedCommand::new(&req.command).policy(&policy);

    if let Some(dir) = &req.working_dir {
        cmd = cmd.working_dir(dir);
    }

    let result = cmd.run().await;

    match result {
        Ok(output) => Ok(SandboxExecResult {
            stdout: output.stdout,
            stderr: output.stderr,
            exit_code: output.exit_code,
            denied: false,
            denial_reason: None,
            duration_ms: output.duration.as_millis() as u64,
        }),
        Err(devpilot_sandbox::SandboxError::PolicyDenied(reason)) => Ok(SandboxExecResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            denied: true,
            denial_reason: Some(reason),
            duration_ms: 0,
        }),
        Err(devpilot_sandbox::SandboxError::Timeout(secs)) => Ok(SandboxExecResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            denied: false,
            denial_reason: Some(format!("Timed out after {secs}s")),
            duration_ms: secs * 1000,
        }),
        Err(devpilot_sandbox::SandboxError::WorkdirDenied(reason)) => Ok(SandboxExecResult {
            stdout: String::new(),
            stderr: String::new(),
            exit_code: None,
            denied: true,
            denial_reason: Some(reason),
            duration_ms: 0,
        }),
        Err(e) => Err(e.to_string()),
    }
}

/// Get the default sandbox policy (for frontend display).
#[tauri::command]
pub fn sandbox_default_policy() -> serde_json::Value {
    let policy = SandboxPolicy::default();
    serde_json::json!({
        "networkPolicy": format!("{:?}", policy.network),
        "timeout": policy.limits.timeout.as_secs(),
    })
}
