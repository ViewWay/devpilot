//! Hook system — allows users to configure shell commands to run before/after
//! tool executions.
//!
//! Hooks are stored as JSON in the settings table (key = "hooks").
//!
//! Pre-hooks (PreToolExecute, PreFileWrite) can BLOCK execution by returning
//! a non-zero exit code. Post-hooks (PostToolExecute, PostShellExec) always
//! run and log errors without blocking.

use crate::ToolError;
use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tokio::process::Command as TokioCommand;
use tracing::{error, info, warn};

// ── Types ──────────────────────────────────────────────────────────────

/// The event that triggers a hook.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HookEvent {
    /// Before any tool runs. Can block execution.
    PreToolExecute,
    /// After any tool runs (success or failure). Fire-and-forget.
    PostToolExecute,
    /// Specifically before file_write / apply_patch. Can block execution.
    PreFileWrite,
    /// After shell_exec completes. Fire-and-forget.
    PostShellExec,
}

impl HookEvent {
    /// All hook event variants.
    pub fn all() -> &'static [HookEvent] {
        &[
            HookEvent::PreToolExecute,
            HookEvent::PostToolExecute,
            HookEvent::PreFileWrite,
            HookEvent::PostShellExec,
        ]
    }

    /// Human-readable label for the event.
    pub fn label(&self) -> &'static str {
        match self {
            HookEvent::PreToolExecute => "Pre Tool Execute",
            HookEvent::PostToolExecute => "Post Tool Execute",
            HookEvent::PreFileWrite => "Pre File Write",
            HookEvent::PostShellExec => "Post Shell Exec",
        }
    }

    /// Whether this is a pre-hook (blocking).
    pub fn is_pre(&self) -> bool {
        matches!(self, HookEvent::PreToolExecute | HookEvent::PreFileWrite)
    }
}

/// A single hook configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hook {
    /// Unique ID for this hook.
    pub id: String,
    /// User-friendly name.
    pub name: String,
    /// The event that triggers this hook.
    pub event: HookEvent,
    /// Shell command to run.
    pub command: String,
    /// Timeout in seconds for the command.
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Whether the hook is enabled.
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_timeout() -> u64 {
    30
}

fn default_enabled() -> bool {
    true
}

/// Result of running a hook command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HookResult {
    /// The hook ID that was run.
    pub hook_id: String,
    /// The hook name.
    pub hook_name: String,
    /// Whether the command succeeded (exit code 0).
    pub success: bool,
    /// Captured stdout.
    pub stdout: String,
    /// Captured stderr.
    pub stderr: String,
    /// The exit code (None if timed out or failed to start).
    pub exit_code: Option<i32>,
    /// Whether the hook timed out.
    pub timed_out: bool,
}

impl HookResult {
    /// Create a timeout result.
    pub fn timed_out(hook: &Hook) -> Self {
        Self {
            hook_id: hook.id.clone(),
            hook_name: hook.name.clone(),
            success: false,
            stdout: String::new(),
            stderr: format!(
                "Hook '{}' timed out after {}s",
                hook.name, hook.timeout_secs
            ),
            exit_code: None,
            timed_out: true,
        }
    }

    /// Create a result for a hook that failed to start.
    pub fn failed_to_start(hook: &Hook, reason: String) -> Self {
        Self {
            hook_id: hook.id.clone(),
            hook_name: hook.name.clone(),
            success: false,
            stdout: String::new(),
            stderr: format!("Hook '{}' failed to start: {reason}", hook.name),
            exit_code: None,
            timed_out: false,
        }
    }
}

// ── HookRunner ─────────────────────────────────────────────────────────

/// Context passed to the hook runner with information about the current
/// tool execution.
#[derive(Debug, Clone)]
pub struct HookContext {
    /// The tool being executed.
    pub tool_name: String,
    /// The session ID.
    pub session_id: String,
    /// The working directory.
    pub working_dir: String,
}

/// Execute a single hook command with timeout and environment injection.
pub async fn run_hook(hook: &Hook, ctx: &HookContext) -> HookResult {
    info!(
        "Running hook '{}' [{}]: {}",
        hook.name, hook.id, hook.command
    );

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = TokioCommand::new("cmd");
        c.args(["/C", &hook.command]);
        c
    } else {
        let mut c = TokioCommand::new("sh");
        c.args(["-c", &hook.command]);
        c
    };

    // Inject environment variables
    cmd.env("DEVPILOT_TOOL_NAME", &ctx.tool_name);
    cmd.env("DEVPILOT_SESSION_ID", &ctx.session_id);
    cmd.env("DEVPILOT_WORKING_DIR", &ctx.working_dir);

    // Set working directory
    cmd.current_dir(&ctx.working_dir);

    // Capture stdout/stderr
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.stdin(Stdio::null());

    let output = match tokio::time::timeout(
        std::time::Duration::from_secs(hook.timeout_secs),
        cmd.output(),
    )
    .await
    {
        Ok(Ok(output)) => output,
        Ok(Err(e)) => {
            error!("Hook '{}' failed to start: {e}", hook.name);
            return HookResult::failed_to_start(hook, e.to_string());
        }
        Err(_) => {
            warn!(
                "Hook '{}' timed out after {}s",
                hook.name, hook.timeout_secs
            );
            return HookResult::timed_out(hook);
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let success = output.status.success();
    let exit_code = output.status.code();

    info!(
        "Hook '{}' completed: success={}, exit_code={:?}",
        hook.name, success, exit_code
    );

    HookResult {
        hook_id: hook.id.clone(),
        hook_name: hook.name.clone(),
        success,
        stdout,
        stderr,
        exit_code,
        timed_out: false,
    }
}

// ── HookManager ────────────────────────────────────────────────────────

/// Manages hooks: loading from settings, running pre/post hooks.
#[derive(Debug, Clone)]
pub struct HookManager {
    hooks: Vec<Hook>,
}

impl HookManager {
    /// Create a new empty HookManager.
    pub fn new() -> Self {
        Self { hooks: vec![] }
    }

    /// Load hooks from a JSON string (as stored in settings).
    pub fn load_from_json(json: &str) -> Result<Self, ToolError> {
        let hooks: Vec<Hook> = serde_json::from_str(json)
            .map_err(|e| ToolError::Other(format!("Failed to parse hooks JSON: {e}")))?;
        Ok(Self { hooks })
    }

    /// Serialize hooks to JSON.
    pub fn to_json(&self) -> Result<String, ToolError> {
        serde_json::to_string(&self.hooks)
            .map_err(|e| ToolError::Other(format!("Failed to serialize hooks: {e}")))
    }

    /// Get all hooks.
    pub fn hooks(&self) -> &[Hook] {
        &self.hooks
    }

    /// Add a hook.
    pub fn add_hook(&mut self, hook: Hook) {
        self.hooks.push(hook);
    }

    /// Remove a hook by ID.
    pub fn remove_hook(&mut self, id: &str) -> bool {
        let before = self.hooks.len();
        self.hooks.retain(|h| h.id != id);
        self.hooks.len() < before
    }

    /// Toggle a hook's enabled state.
    pub fn toggle_hook(&mut self, id: &str) -> bool {
        if let Some(hook) = self.hooks.iter_mut().find(|h| h.id == id) {
            hook.enabled = !hook.enabled;
            true
        } else {
            false
        }
    }

    /// Get hooks matching a specific event.
    fn hooks_for_event(&self, event: HookEvent) -> Vec<&Hook> {
        self.hooks
            .iter()
            .filter(|h| h.enabled && h.event == event)
            .collect()
    }

    /// Run pre-hooks for a given tool. Returns Ok(()) if all pass, or
    /// Err with the blocking hook result if any returns non-zero.
    ///
    /// This also handles PreFileWrite when the tool is file_write or
    /// apply_patch.
    pub async fn run_pre_hooks(
        &self,
        tool_name: &str,
        ctx: &HookContext,
    ) -> Result<Vec<HookResult>, HookResult> {
        let mut results = Vec::new();

        // Run PreToolExecute hooks
        for hook in self.hooks_for_event(HookEvent::PreToolExecute) {
            let result = run_hook(hook, ctx).await;
            if !result.success {
                return Err(result);
            }
            results.push(result);
        }

        // Run PreFileWrite hooks for file write tools
        if tool_name == "file_write" || tool_name == "apply_patch" {
            for hook in self.hooks_for_event(HookEvent::PreFileWrite) {
                let result = run_hook(hook, ctx).await;
                if !result.success {
                    return Err(result);
                }
                results.push(result);
            }
        }

        Ok(results)
    }

    /// Run post-hooks for a given tool. These are fire-and-forget — errors
    /// are logged but don't block execution.
    ///
    /// Returns the results for informational purposes.
    pub async fn run_post_hooks(&self, tool_name: &str, ctx: &HookContext) -> Vec<HookResult> {
        let mut results = Vec::new();

        // Run PostToolExecute hooks
        for hook in self.hooks_for_event(HookEvent::PostToolExecute) {
            let result = run_hook(hook, ctx).await;
            if !result.success {
                warn!(
                    "Post-hook '{}' failed: {}",
                    hook.name,
                    result.stderr.chars().take(200).collect::<String>()
                );
            }
            results.push(result);
        }

        // Run PostShellExec hooks after shell_exec
        if tool_name == "shell_exec" {
            for hook in self.hooks_for_event(HookEvent::PostShellExec) {
                let result = run_hook(hook, ctx).await;
                if !result.success {
                    warn!(
                        "Post-shell hook '{}' failed: {}",
                        hook.name,
                        result.stderr.chars().take(200).collect::<String>()
                    );
                }
                results.push(result);
            }
        }

        results
    }
}

impl Default for HookManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_hook(id: &str, name: &str, event: HookEvent, command: &str) -> Hook {
        Hook {
            id: id.to_string(),
            name: name.to_string(),
            event,
            command: command.to_string(),
            timeout_secs: 10,
            enabled: true,
        }
    }

    fn make_ctx() -> HookContext {
        HookContext {
            tool_name: "shell_exec".to_string(),
            session_id: "test-session".to_string(),
            working_dir: "/tmp".to_string(),
        }
    }

    #[test]
    fn test_load_empty_hooks() {
        let mgr = HookManager::load_from_json("[]").unwrap();
        assert!(mgr.hooks().is_empty());
    }

    #[test]
    fn test_add_remove_toggle() {
        let mut mgr = HookManager::new();
        let hook = make_hook("h1", "Test", HookEvent::PreToolExecute, "echo hi");
        mgr.add_hook(hook);
        assert_eq!(mgr.hooks().len(), 1);

        mgr.toggle_hook("h1");
        assert!(!mgr.hooks()[0].enabled);

        mgr.toggle_hook("h1");
        assert!(mgr.hooks()[0].enabled);

        assert!(mgr.remove_hook("h1"));
        assert!(mgr.hooks().is_empty());
    }

    #[test]
    fn test_hooks_for_event() {
        let mut mgr = HookManager::new();
        mgr.add_hook(make_hook(
            "h1",
            "Pre",
            HookEvent::PreToolExecute,
            "echo pre",
        ));
        mgr.add_hook(make_hook(
            "h2",
            "Post",
            HookEvent::PostToolExecute,
            "echo post",
        ));
        mgr.add_hook(make_hook(
            "h3",
            "PreDisabled",
            HookEvent::PreToolExecute,
            "echo off",
        ));

        // Disable h3
        mgr.toggle_hook("h3");

        let pre = mgr.hooks_for_event(HookEvent::PreToolExecute);
        assert_eq!(pre.len(), 1);
        assert_eq!(pre[0].id, "h1");
    }

    #[test]
    fn test_serialize_roundtrip() {
        let mut mgr = HookManager::new();
        mgr.add_hook(make_hook(
            "h1",
            "Test Hook",
            HookEvent::PostShellExec,
            "echo done",
        ));
        let json = mgr.to_json().unwrap();

        let mgr2 = HookManager::load_from_json(&json).unwrap();
        assert_eq!(mgr2.hooks().len(), 1);
        assert_eq!(mgr2.hooks()[0].name, "Test Hook");
        assert_eq!(mgr2.hooks()[0].event, HookEvent::PostShellExec);
    }

    #[tokio::test]
    async fn test_run_hook_success() {
        let hook = make_hook("h1", "Echo", HookEvent::PreToolExecute, "echo hello");
        let ctx = make_ctx();
        let result = run_hook(&hook, &ctx).await;
        assert!(result.success);
        assert!(result.stdout.trim().contains("hello"));
        assert_eq!(result.exit_code, Some(0));
    }

    #[tokio::test]
    async fn test_run_hook_failure() {
        let hook = make_hook("h1", "Fail", HookEvent::PreToolExecute, "exit 1");
        let ctx = make_ctx();
        let result = run_hook(&hook, &ctx).await;
        assert!(!result.success);
        assert_eq!(result.exit_code, Some(1));
    }

    #[tokio::test]
    async fn test_run_hook_timeout() {
        let mut hook = make_hook("h1", "Sleep", HookEvent::PreToolExecute, "sleep 10");
        hook.timeout_secs = 1;
        let ctx = make_ctx();
        let result = run_hook(&hook, &ctx).await;
        assert!(!result.success);
        assert!(result.timed_out);
    }

    #[tokio::test]
    async fn test_run_hook_env_injection() {
        let hook = make_hook(
            "h1",
            "Env",
            HookEvent::PreToolExecute,
            "echo $DEVPILOT_TOOL_NAME $DEVPILOT_SESSION_ID",
        );
        let ctx = HookContext {
            tool_name: "my_tool".to_string(),
            session_id: "sess-123".to_string(),
            working_dir: "/tmp".to_string(),
        };
        let result = run_hook(&hook, &ctx).await;
        assert!(result.success);
        let out = result.stdout.trim();
        assert!(
            out.contains("my_tool"),
            "stdout should contain tool name: {out}"
        );
        assert!(
            out.contains("sess-123"),
            "stdout should contain session id: {out}"
        );
    }

    #[tokio::test]
    async fn test_pre_hooks_block_on_failure() {
        let mut mgr = HookManager::new();
        mgr.add_hook(make_hook(
            "h1",
            "Blocker",
            HookEvent::PreToolExecute,
            "exit 1",
        ));

        let ctx = make_ctx();
        let result = mgr.run_pre_hooks("shell_exec", &ctx).await;
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(!err.success);
        assert_eq!(err.hook_id, "h1");
    }

    #[tokio::test]
    async fn test_pre_file_write_hooks() {
        let mut mgr = HookManager::new();
        mgr.add_hook(make_hook(
            "h1",
            "FileGuard",
            HookEvent::PreFileWrite,
            "echo ok",
        ));

        let ctx = HookContext {
            tool_name: "file_write".to_string(),
            session_id: "test".to_string(),
            working_dir: "/tmp".to_string(),
        };

        // PreFileWrite should trigger for file_write
        let result = mgr.run_pre_hooks("file_write", &ctx).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 1);

        // PreFileWrite should NOT trigger for shell_exec
        let result = mgr.run_pre_hooks("shell_exec", &ctx).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_post_hooks_fire_and_forget() {
        let mut mgr = HookManager::new();
        mgr.add_hook(make_hook(
            "h1",
            "AlwaysFail",
            HookEvent::PostToolExecute,
            "exit 1",
        ));

        let ctx = make_ctx();
        let results = mgr.run_post_hooks("shell_exec", &ctx).await;
        assert_eq!(results.len(), 1);
        assert!(!results[0].success); // failed, but didn't block
    }

    #[tokio::test]
    async fn test_post_shell_exec_hooks() {
        let mut mgr = HookManager::new();
        mgr.add_hook(make_hook(
            "h1",
            "ShellPost",
            HookEvent::PostShellExec,
            "echo shell-done",
        ));

        let ctx = make_ctx();

        // PostShellExec should trigger for shell_exec
        let results = mgr.run_post_hooks("shell_exec", &ctx).await;
        assert_eq!(results.len(), 1);

        // PostShellExec should NOT trigger for file_read
        let results = mgr.run_post_hooks("file_read", &ctx).await;
        assert!(results.is_empty());
    }
}
