//! Shell execution tool — run commands in a subprocess.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;
use tokio::process::Command;

/// Shell command execution tool.
///
/// Runs a command in a subprocess with an optional timeout.
/// The working directory defaults to the session's `working_dir`.
pub struct ShellExecTool {
    /// Default timeout in seconds (0 = no timeout).
    default_timeout: u64,
}

impl ShellExecTool {
    pub fn new() -> Self {
        Self {
            default_timeout: 120,
        }
    }
}

impl Default for ShellExecTool {
    fn default() -> Self {
        Self::new()
    }
}

impl ShellExecTool {
    /// Create with a custom default timeout.
    pub fn with_timeout(timeout_secs: u64) -> Self {
        Self {
            default_timeout: timeout_secs,
        }
    }
}

/// Input parameters for shell_exec.
#[derive(Debug, Deserialize)]
struct ShellInput {
    /// The command to execute.
    command: String,
    /// Optional working directory override.
    #[serde(default)]
    working_dir: Option<String>,
    /// Timeout in seconds (0 = no timeout, defaults to 120s).
    #[serde(default)]
    timeout: Option<u64>,
}

#[async_trait]
impl Tool for ShellExecTool {
    fn name(&self) -> &str {
        "shell_exec"
    }

    fn description(&self) -> &str {
        "Execute a shell command and return its output. \
         The command runs in the session's working directory. \
         Use 'timeout' to set a per-command timeout in seconds (default 120s, 0 = no timeout)."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                },
                "working_dir": {
                    "type": "string",
                    "description": "Override the working directory for this command"
                },
                "timeout": {
                    "type": "integer",
                    "description": "Timeout in seconds (0 = no timeout, default 120s)"
                }
            },
            "required": ["command"]
        })
    }

    fn requires_approval(&self) -> bool {
        true
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: ShellInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        let workdir = params.working_dir.as_deref().unwrap_or(&ctx.working_dir);

        if !Path::new(workdir).exists() {
            return Ok(ToolOutput::err(format!(
                "Working directory does not exist: {workdir}"
            )));
        }

        let timeout_secs = params.timeout.unwrap_or(self.default_timeout);

        // Check for dangerous command patterns
        let dangerous_warning = check_dangerous_command(&params.command);

        // Use the system shell
        let (shell, shell_arg) = if cfg!(target_os = "windows") {
            ("cmd", "/C")
        } else {
            ("sh", "-c")
        };

        let mut cmd = Command::new(shell);
        cmd.arg(shell_arg)
            .arg(&params.command)
            .current_dir(workdir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        // Set environment
        cmd.env_clear();
        cmd.env("PATH", std::env::var("PATH").unwrap_or_default());
        cmd.env("HOME", std::env::var("HOME").unwrap_or_default());
        cmd.env("LANG", "en_US.UTF-8");
        cmd.env("TERM", "dumb");
        // Inject per-session environment variables
        for (key, value) in &ctx.env_vars {
            cmd.env(key, value);
        }

        let result = if timeout_secs > 0 {
            tokio::time::timeout(std::time::Duration::from_secs(timeout_secs), cmd.output())
                .await
                .map_err(|_| {
                    // Timeout elapsed
                    ToolError::ExecutionFailed {
                        tool: self.name().to_string(),
                        message: format!(
                            "Command timed out after {timeout_secs}s: {}",
                            params.command
                        ),
                    }
                })?
        } else {
            cmd.output().await
        };

        match result {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                let exit_code = output.status.code().unwrap_or(-1);

                let mut content = String::new();
                if !stdout.is_empty() {
                    content.push_str(&stdout);
                }
                if !stderr.is_empty() {
                    if !content.is_empty() {
                        content.push('\n');
                    }
                    content.push_str("[stderr]\n");
                    content.push_str(&stderr);
                }
                if exit_code != 0 {
                    content.push_str(&format!("\n[exit code: {exit_code}]"));
                }

                let mut out = if exit_code == 0 {
                    ToolOutput::ok(content)
                } else {
                    ToolOutput::err(content)
                };

                let mut meta = serde_json::json!({
                    "exit_code": exit_code,
                    "command": params.command,
                    "working_dir": workdir,
                });

                // Attach dangerous command warning if detected
                if let Some(warning) = dangerous_warning {
                    meta["dangerous"] = serde_json::json!(true);
                    meta["warning"] = serde_json::json!(warning);
                }

                out = out.with_metadata(meta);

                Ok(out)
            }
            Err(e) => Err(ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("Failed to execute command: {e}"),
            }),
        }
    }
}

/// Check if a command string matches known dangerous patterns.
///
/// Returns a warning message if a dangerous pattern is detected, or `None` if the command
/// appears safe. Detection uses simple substring/regex matching — it may produce false
/// positives and is intended as an informational warning, not a block.
fn check_dangerous_command(command: &str) -> Option<String> {
    let cmd_lower = command.to_lowercase();

    // Dangerous pattern rules: (pattern, description)
    let dangerous_patterns: &[(&str, &str)] = &[
        // Recursive force delete of root or broad paths
        ("rm -rf /", "Recursive force delete of root directory"),
        ("rm -rf /*", "Recursive force delete of root directory (glob)"),
        ("rm -rf ~", "Recursive force delete of home directory"),
        // Disk formatting
        ("mkfs.", "Disk filesystem format command"),
        ("mkfs ", "Disk filesystem format command"),
        // Raw disk write
        ("dd if=", "Raw disk copy (dd) — can overwrite disks"),
        // Fork bomb
        (":(){ :|:& };:", "Fork bomb detected"),
        // Unsafe permissions on root
        ("chmod 777 /", "Setting world-writable permissions on root"),
        ("chmod -r 777 /", "Setting recursive world-writable permissions on root"),
        // Changing ownership of root
        ("chown -R ", "Recursive ownership change — potentially dangerous"),
    ];

    for (pattern, description) in dangerous_patterns {
        if cmd_lower.contains(pattern) {
            return Some(description.to_string());
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema() {
        let tool = ShellExecTool::new();
        let schema = tool.input_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["command"].is_object());
    }

    #[tokio::test]
    async fn test_echo_command() {
        let tool = ShellExecTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(serde_json::json!({"command": "echo hello world"}), &ctx)
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("hello world"));
    }

    #[tokio::test]
    async fn test_nonexistent_directory() {
        let tool = ShellExecTool::new();
        let ctx = ToolContext {
            working_dir: "/nonexistent/dir/xyz".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(serde_json::json!({"command": "echo hi"}), &ctx)
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("does not exist"));
    }

    #[tokio::test]
    async fn test_failed_command() {
        let tool = ShellExecTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(serde_json::json!({"command": "false"}), &ctx)
            .await
            .unwrap();

        assert!(result.is_error);
    }

    #[tokio::test]
    async fn test_timeout() {
        let tool = ShellExecTool::with_timeout(1);
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(
                serde_json::json!({"command": "sleep 10", "timeout": 1}),
                &ctx,
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_metadata() {
        let tool = ShellExecTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(serde_json::json!({"command": "echo meta"}), &ctx)
            .await
            .unwrap();

        let meta = result.metadata.unwrap();
        assert_eq!(meta["exit_code"], 0);
        assert_eq!(meta["command"], "echo meta");
    }
}
