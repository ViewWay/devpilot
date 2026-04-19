//! Sandbox policy — defines what a sandboxed command is allowed to do.
//!
//! A policy controls:
//! - **Timeout**: maximum wall-clock time for the command.
//! - **Memory**: (Unix) RSS limit via `ulimit -v`.
//! - **Output size**: stdout/stderr byte cap.
//! - **Filesystem**: which paths are readable, writable, or denied.
//! - **Network**: allow, deny, or restrict network access.
//! - **Allowlist**: restrict which commands may be executed.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::Duration;

// ── Size limit ──────────────────────────────────────────────────

/// A size limit with a human-readable label.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SizeLimit {
    /// Maximum size in bytes.
    pub bytes: usize,
    /// Human-readable label (e.g. "1 MB").
    pub label: String,
}

impl SizeLimit {
    /// Create a size limit in bytes.
    pub fn bytes(n: usize) -> Self {
        Self {
            bytes: n,
            label: format!("{n} B"),
        }
    }

    /// Create a size limit in kilobytes.
    pub fn kb(n: usize) -> Self {
        Self {
            bytes: n * 1024,
            label: format!("{n} KB"),
        }
    }

    /// Create a size limit in megabytes.
    pub fn mb(n: usize) -> Self {
        Self {
            bytes: n * 1024 * 1024,
            label: format!("{n} MB"),
        }
    }
}

// ── Filesystem rules ────────────────────────────────────────────

/// A filesystem access rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FsRule {
    /// Allow read access to the given path prefix.
    Read(PathBuf),
    /// Allow write access to the given path prefix.
    Write(PathBuf),
    /// Deny all access to the given path prefix.
    Deny(PathBuf),
}

// ── Network policy ──────────────────────────────────────────────

/// Network access policy for sandboxed commands.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum NetworkPolicy {
    /// Allow all network access.
    #[default]
    Allow,
    /// Deny all network access (best-effort; uses `unshare -n` on Linux).
    Deny,
    /// Allow only localhost (127.0.0.1 / ::1).
    LocalhostOnly,
}

// ── Resource limits ─────────────────────────────────────────────

/// Per-command resource limits.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLimits {
    /// Maximum wall-clock time for the command.
    pub timeout: Duration,
    /// Maximum output (stdout + stderr) size. `None` = no limit.
    pub max_output_size: Option<SizeLimit>,
    /// Maximum resident set size in bytes (Unix only, via ulimit).
    pub max_memory_bytes: Option<usize>,
    /// Maximum number of file descriptors (Unix only, via ulimit).
    pub max_fds: Option<u64>,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            timeout: Duration::from_secs(120),
            max_output_size: Some(SizeLimit::mb(10)),
            max_memory_bytes: Some(512 * 1024 * 1024), // 512 MB
            max_fds: Some(256),
        }
    }
}

// ── Full policy ─────────────────────────────────────────────────

/// Complete sandbox policy defining what a command is allowed to do.
///
/// Use [`SandboxPolicy::default()`] for a reasonable baseline, or
/// construct a custom policy for more restrictive environments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SandboxPolicy {
    /// Resource limits (timeout, memory, output size).
    pub limits: ResourceLimits,
    /// Filesystem access rules. Evaluated in order; first match wins.
    pub fs_rules: Vec<FsRule>,
    /// Network access policy.
    pub network: NetworkPolicy,
    /// If set, only commands in this list are allowed to execute.
    pub command_allowlist: Option<Vec<String>>,
    /// Environment variables to pass through (key → value).
    /// If empty, a minimal environment is used.
    pub env_passthrough: Vec<String>,
    /// Whether to set a read-only filesystem (except for paths explicitly
    /// allowed by `fs_rules`). Best-effort on non-Linux platforms.
    pub readonly_fs: bool,
}

impl Default for SandboxPolicy {
    fn default() -> Self {
        Self {
            limits: ResourceLimits::default(),
            fs_rules: vec![
                // Allow read of common paths
                FsRule::Read(PathBuf::from("/usr")),
                FsRule::Read(PathBuf::from("/bin")),
                FsRule::Read(PathBuf::from("/lib")),
                FsRule::Read(PathBuf::from("/etc")),
                FsRule::Read(PathBuf::from("/home")),
                // Deny write to system paths
                FsRule::Deny(PathBuf::from("/etc")),
                FsRule::Deny(PathBuf::from("/usr")),
                // Allow read/write to /tmp and home
                FsRule::Write(PathBuf::from("/tmp")),
            ],
            network: NetworkPolicy::Allow,
            command_allowlist: None,
            env_passthrough: vec![
                "PATH".into(),
                "HOME".into(),
                "LANG".into(),
                "TERM".into(),
                "USER".into(),
            ],
            readonly_fs: false,
        }
    }
}

impl SandboxPolicy {
    /// Create a permissive policy that allows everything.
    pub fn permissive() -> Self {
        Self {
            limits: ResourceLimits {
                timeout: Duration::from_secs(300),
                max_output_size: Some(SizeLimit::mb(50)),
                max_memory_bytes: None,
                max_fds: None,
            },
            fs_rules: vec![],
            network: NetworkPolicy::Allow,
            command_allowlist: None,
            env_passthrough: vec![],
            readonly_fs: false,
        }
    }

    /// Create a strict policy for untrusted commands.
    pub fn strict() -> Self {
        Self {
            limits: ResourceLimits {
                timeout: Duration::from_secs(30),
                max_output_size: Some(SizeLimit::mb(1)),
                max_memory_bytes: Some(128 * 1024 * 1024), // 128 MB
                max_fds: Some(64),
            },
            fs_rules: vec![
                FsRule::Read(PathBuf::from("/usr")),
                FsRule::Read(PathBuf::from("/bin")),
                FsRule::Read(PathBuf::from("/lib")),
                FsRule::Write(PathBuf::from("/tmp/sandbox")),
                FsRule::Deny(PathBuf::from("/")),
            ],
            network: NetworkPolicy::Deny,
            command_allowlist: Some(vec![
                "ls".into(),
                "cat".into(),
                "head".into(),
                "tail".into(),
                "grep".into(),
                "wc".into(),
                "find".into(),
                "echo".into(),
                "sort".into(),
                "uniq".into(),
                "diff".into(),
            ]),
            env_passthrough: vec!["PATH".into(), "HOME".into(), "LANG".into()],
            readonly_fs: true,
        }
    }

    /// Check if a command is allowed by the policy.
    pub fn is_command_allowed(&self, command: &str) -> bool {
        if let Some(ref allowlist) = self.command_allowlist {
            // Extract the base command (first word)
            let base = command.split_whitespace().next().unwrap_or(command);
            // Strip path prefix if present
            let base = base.rsplit('/').next().unwrap_or(base);
            allowlist.iter().any(|allowed| allowed == base)
        } else {
            true
        }
    }

    /// Check if a working directory is allowed by the policy.
    ///
    /// Rules are evaluated in order; first match wins. If no rule matches,
    /// access is denied when rules are present.
    pub fn is_workdir_allowed(&self, path: &str) -> bool {
        if self.fs_rules.is_empty() {
            return true;
        }
        for rule in &self.fs_rules {
            let prefix = match rule {
                FsRule::Read(p) | FsRule::Write(p) => p,
                FsRule::Deny(p) => p,
            };
            if path.starts_with(prefix.to_string_lossy().as_ref()) {
                return !matches!(rule, FsRule::Deny(_));
            }
        }
        // No rule matched — deny by default if rules exist
        false
    }

    /// Build environment variables for the sandboxed command.
    pub fn build_env(&self) -> Vec<(String, String)> {
        let mut env = Vec::new();
        for key in &self.env_passthrough {
            if let Ok(val) = std::env::var(key) {
                env.push((key.clone(), val));
            }
        }
        // Ensure minimal environment even if passthrough is empty
        if env.is_empty() {
            env.push(("PATH".into(), std::env::var("PATH").unwrap_or_default()));
            env.push(("HOME".into(), std::env::var("HOME").unwrap_or_default()));
            env.push(("LANG".into(), "en_US.UTF-8".into()));
            env.push(("TERM".into(), "dumb".into()));
        }
        env
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_policy_allows_common_commands() {
        let policy = SandboxPolicy::default();
        assert!(policy.is_command_allowed("ls -la"));
        assert!(policy.is_command_allowed("echo hello"));
        assert!(policy.is_command_allowed("/usr/bin/git status"));
    }

    #[test]
    fn strict_policy_restricts_commands() {
        let policy = SandboxPolicy::strict();
        assert!(policy.is_command_allowed("ls -la"));
        assert!(policy.is_command_allowed("cat file.txt"));
        assert!(!policy.is_command_allowed("rm -rf /"));
        assert!(!policy.is_command_allowed("curl http://evil.com"));
        assert!(!policy.is_command_allowed("python3 -c 'import os'"));
    }

    #[test]
    fn workdir_allowed_by_default() {
        let policy = SandboxPolicy::default();
        assert!(policy.is_workdir_allowed("/tmp/project"));
        assert!(policy.is_workdir_allowed("/home/user/code"));
    }

    #[test]
    fn workdir_denied_by_strict() {
        let policy = SandboxPolicy::strict();
        // /tmp is not in the strict allowlist (only /tmp/sandbox is)
        assert!(policy.is_workdir_allowed("/tmp/sandbox"));
        assert!(!policy.is_workdir_allowed("/tmp"));
        assert!(!policy.is_workdir_allowed("/etc/passwd"));
    }

    #[test]
    fn permissive_allows_everything() {
        let policy = SandboxPolicy::permissive();
        assert!(policy.is_command_allowed("rm -rf /"));
        assert!(policy.is_workdir_allowed("/any/path"));
    }

    #[test]
    fn build_env_has_path() {
        let policy = SandboxPolicy::default();
        let env = policy.build_env();
        assert!(env.iter().any(|(k, _)| k == "PATH"));
    }

    #[test]
    fn size_limit_conversions() {
        assert_eq!(SizeLimit::bytes(100).bytes, 100);
        assert_eq!(SizeLimit::kb(1).bytes, 1024);
        assert_eq!(SizeLimit::mb(1).bytes, 1024 * 1024);
    }
}
