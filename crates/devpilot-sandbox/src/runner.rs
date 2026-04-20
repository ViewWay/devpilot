//! Sandboxed command runner.
//!
//! The main entry point is [`SandboxedCommand`], which takes a shell command
//! string, applies a [`SandboxPolicy`], and runs it via `tokio::process::Command`.

use crate::error::{SandboxError, SandboxResult};
use crate::policy::SandboxPolicy;
use std::path::Path;
use tokio::process::Command;

/// Output from a sandboxed command execution.
#[derive(Debug, Clone)]
pub struct SandboxOutput {
    /// The command that was executed.
    pub command: String,
    /// Captured stdout.
    pub stdout: String,
    /// Captured stderr.
    pub stderr: String,
    /// Exit code (None if the process was killed).
    pub exit_code: Option<i32>,
    /// Wall-clock duration of the execution.
    pub duration: std::time::Duration,
    /// Whether the command was killed due to timeout.
    pub timed_out: bool,
    /// Whether the output was truncated due to size limits.
    pub output_truncated: bool,
}

impl SandboxOutput {
    /// Returns `true` if the command exited with code 0.
    pub fn success(&self) -> bool {
        self.exit_code == Some(0)
    }

    /// Returns combined stdout + stderr.
    pub fn combined_output(&self) -> String {
        let mut out = self.stdout.clone();
        if !self.stderr.is_empty() {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str("[stderr]\n");
            out.push_str(&self.stderr);
        }
        out
    }
}

/// Builder for running a sandboxed command.
///
/// ```ignore
/// let output = SandboxedCommand::new("echo hello")
///     .policy(&my_policy)
///     .working_dir("/tmp")
///     .env("MY_VAR", "value")
///     .run()
///     .await?;
/// ```
pub struct SandboxedCommand {
    command: String,
    policy: SandboxPolicy,
    working_dir: Option<String>,
    extra_env: Vec<(String, String)>,
}

impl SandboxedCommand {
    /// Create a new sandboxed command with the default policy.
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            policy: SandboxPolicy::default(),
            working_dir: None,
            extra_env: vec![],
        }
    }

    /// Set the sandbox policy (cloned).
    pub fn policy(mut self, policy: &SandboxPolicy) -> Self {
        self.policy = policy.clone();
        self
    }

    /// Set the working directory.
    pub fn working_dir(mut self, dir: impl Into<String>) -> Self {
        self.working_dir = Some(dir.into());
        self
    }

    /// Add an extra environment variable.
    pub fn env(mut self, key: impl Into<String>, val: impl Into<String>) -> Self {
        self.extra_env.push((key.into(), val.into()));
        self
    }

    /// Execute the command with the sandbox policy applied.
    pub async fn run(self) -> SandboxResult<SandboxOutput> {
        // 1. Check command allowlist
        if !self.policy.is_command_allowed(&self.command) {
            return Err(SandboxError::PolicyDenied(format!(
                "command not in allowlist: {}",
                self.command
                    .split_whitespace()
                    .next()
                    .unwrap_or(&self.command)
            )));
        }

        // 2. Check working directory
        let default_workdir = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
        let workdir = self.working_dir.as_deref().unwrap_or(&default_workdir);

        if !Path::new(workdir).exists() {
            return Err(SandboxError::WorkdirDenied(format!(
                "directory does not exist: {workdir}"
            )));
        }

        if !self.policy.is_workdir_allowed(workdir) {
            return Err(SandboxError::WorkdirDenied(format!(
                "directory not allowed by policy: {workdir}"
            )));
        }

        // 3. Build the command
        let (shell, shell_arg) = if cfg!(target_os = "windows") {
            ("cmd", "/C")
        } else {
            ("sh", "-c")
        };

        let mut cmd = Command::new(shell);
        cmd.arg(shell_arg)
            .arg(&self.command)
            .current_dir(workdir)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        // Set environment from policy
        cmd.env_clear();
        for (k, v) in self.policy.build_env() {
            cmd.env(&k, &v);
        }
        // Extra env overrides
        for (k, v) in &self.extra_env {
            cmd.env(k, v);
        }

        // Platform-specific sandboxing (future: prlimit, namespaces)
        #[cfg(unix)]
        {
            self.apply_unix_limits(&mut cmd)?;
        }

        // 4. Execute with timeout
        let max_output = self.policy.limits.max_output_size.as_ref().map(|s| s.bytes);
        let timeout = self.policy.limits.timeout;

        let start = std::time::Instant::now();
        let result = tokio::time::timeout(timeout, cmd.output()).await;
        let duration = start.elapsed();

        match result {
            Ok(Ok(output)) => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);

                // Apply output size limits
                let (stdout_truncated, stdout) = truncate_output(&stdout, max_output);
                let (stderr_truncated, stderr) = truncate_output(&stderr, max_output);

                Ok(SandboxOutput {
                    command: self.command,
                    stdout,
                    stderr,
                    exit_code: output.status.code(),
                    duration,
                    timed_out: false,
                    output_truncated: stdout_truncated || stderr_truncated,
                })
            }
            Ok(Err(e)) => Err(SandboxError::ProcessFailed(e.to_string())),
            Err(_) => Err(SandboxError::Timeout(timeout.as_secs())),
        }
    }

    /// Apply Unix-specific resource limits (best-effort).
    ///
    /// Uses `rlimit` via `setrlimit` in the child process's `pre_exec` hook
    /// to constrain: max file size, max CPU time, max address space, and
    /// max file descriptors. Also disables core dumps.
    #[cfg(unix)]
    fn apply_unix_limits(&self, cmd: &mut Command) -> SandboxResult<()> {
        let max_file_size: u64 = self
            .policy
            .limits
            .max_output_size
            .as_ref()
            .map(|s| s.bytes as u64)
            .unwrap_or(10 * 1024 * 1024); // 10 MB default
        let max_cpu_secs: u64 = self.policy.limits.timeout.as_secs().saturating_add(5);
        let max_memory_bytes: Option<u64> = self.policy.limits.max_memory_bytes.map(|m| m as u64);
        let max_fds: Option<u64> = self.policy.limits.max_fds;

        unsafe {
            cmd.pre_exec(move || {
                // Limit max file size (bytes)
                #[cfg(any(target_os = "linux", target_os = "macos"))]
                {
                    let lim = libc::rlimit {
                        rlim_cur: max_file_size,
                        rlim_max: max_file_size,
                    };
                    libc::setrlimit(libc::RLIMIT_FSIZE, &lim);
                }

                // Limit CPU time (seconds) — kill if exceeds timeout + buffer
                {
                    let lim = libc::rlimit {
                        rlim_cur: max_cpu_secs,
                        rlim_max: max_cpu_secs,
                    };
                    libc::setrlimit(libc::RLIMIT_CPU, &lim);
                }

                // Limit address space (bytes) — prevent runaway memory usage
                #[cfg(any(target_os = "linux", target_os = "macos"))]
                {
                    if let Some(mem) = max_memory_bytes {
                        let lim = libc::rlimit {
                            rlim_cur: mem,
                            rlim_max: mem,
                        };
                        libc::setrlimit(libc::RLIMIT_AS, &lim);
                    }
                }

                // Limit number of open file descriptors
                {
                    if let Some(fds) = max_fds {
                        let lim = libc::rlimit {
                            rlim_cur: fds,
                            rlim_max: fds,
                        };
                        libc::setrlimit(libc::RLIMIT_NOFILE, &lim);
                    }
                }

                // Disable core dumps
                {
                    let lim = libc::rlimit {
                        rlim_cur: 0,
                        rlim_max: 0,
                    };
                    libc::setrlimit(libc::RLIMIT_CORE, &lim);
                }

                Ok(())
            });
        }

        Ok(())
    }
}

/// Truncate output to the given byte limit if set.
fn truncate_output(output: &str, max_bytes: Option<usize>) -> (bool, String) {
    let Some(max) = max_bytes else {
        return (false, output.to_string());
    };
    if output.len() <= max {
        return (false, output.to_string());
    }
    // Truncate at a char boundary
    let mut end = max;
    while !output.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    (true, format!("{}...[truncated]", &output[..end]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::policy::SizeLimit;
    use std::time::Duration;

    #[tokio::test]
    async fn echo_command() {
        let policy = SandboxPolicy::default();
        let result = SandboxedCommand::new("echo hello world")
            .policy(&policy)
            .working_dir("/tmp")
            .run()
            .await
            .unwrap();

        assert!(result.success());
        assert!(result.stdout.contains("hello world"));
        assert!(!result.timed_out);
    }

    #[tokio::test]
    async fn denied_command() {
        let policy = SandboxPolicy::strict();
        let result = SandboxedCommand::new("rm -rf /tmp/test")
            .policy(&policy)
            .working_dir("/tmp/sandbox")
            .run()
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not in allowlist"));
    }

    #[tokio::test]
    async fn denied_workdir() {
        let policy = SandboxPolicy::strict();
        let result = SandboxedCommand::new("ls")
            .policy(&policy)
            .working_dir("/etc")
            .run()
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn timeout_works() {
        let mut policy = SandboxPolicy::permissive();
        policy.limits.timeout = Duration::from_millis(100);

        let result = SandboxedCommand::new("sleep 10")
            .policy(&policy)
            .working_dir("/tmp")
            .run()
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("timed out"));
    }

    #[tokio::test]
    async fn output_truncation() {
        let mut policy = SandboxPolicy::permissive();
        policy.limits.max_output_size = Some(SizeLimit::bytes(20));

        let result = SandboxedCommand::new("echo 0123456789012345678901234567890123456789")
            .policy(&policy)
            .working_dir("/tmp")
            .run()
            .await
            .unwrap();

        assert!(result.output_truncated);
    }

    #[tokio::test]
    async fn combined_output() {
        let policy = SandboxPolicy::default();
        let result = SandboxedCommand::new("echo out && echo err >&2")
            .policy(&policy)
            .working_dir("/tmp")
            .run()
            .await
            .unwrap();

        let combined = result.combined_output();
        assert!(combined.contains("out"));
        assert!(combined.contains("err"));
    }

    #[tokio::test]
    async fn custom_env() {
        let policy = SandboxPolicy::default();
        let result = SandboxedCommand::new("echo $MY_SANDBOX_VAR")
            .policy(&policy)
            .working_dir("/tmp")
            .env("MY_SANDBOX_VAR", "hello_from_test")
            .run()
            .await
            .unwrap();

        assert!(result.stdout.contains("hello_from_test"));
    }

    #[test]
    fn truncate_output_no_limit() {
        let (truncated, out) = truncate_output("hello world", None);
        assert!(!truncated);
        assert_eq!(out, "hello world");
    }

    #[test]
    fn truncate_output_within_limit() {
        let (truncated, out) = truncate_output("hello", Some(100));
        assert!(!truncated);
        assert_eq!(out, "hello");
    }

    #[test]
    fn truncate_output_exceeds_limit() {
        let (truncated, out) = truncate_output("hello world!", Some(5));
        assert!(truncated);
        assert!(out.starts_with("hello"));
        assert!(out.contains("truncated"));
    }
}
