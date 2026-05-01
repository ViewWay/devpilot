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

// ── Command injection helpers ──────────────────────────────────

/// [M-02] Detect dangerous shell metacharacters that enable command injection.
///
/// Blocked patterns:
/// - `;` — command separator
/// - `&&` — AND conditional execution
/// - `||` — OR conditional execution
/// - `$(...)` — command substitution
/// - `` ` `` — backtick command substitution
///
/// Pipe `|` is allowed only when there is at most one pipe and the right-hand
/// side is a simple command (no further metacharacters).
fn contains_dangerous_metacharacters(command: &str) -> bool {
    // Block semicolons (command separator)
    if command.contains(';') {
        return true;
    }

    // Block && and || (conditional execution)
    if command.contains("&&") || command.contains("||") {
        return true;
    }

    // Block command substitution: $(...) and backticks
    if command.contains("$(") || command.contains('`') {
        return true;
    }

    // Block nested or multiple pipes — allow at most one simple pipe
    let pipe_count = command.matches('|').count();
    if pipe_count > 1 {
        return true;
    }
    if pipe_count == 1 {
        // Verify the pipe is just "cmd args | cmd args" with nothing dangerous
        // after the pipe. Split on | and check the RHS is a simple command.
        if let Some(rhs) = command.split('|').nth(1) {
            let rhs = rhs.trim();
            // RHS must start with an alphanumeric character or / (simple command)
            let first_char = rhs.chars().next();
            if first_char.is_none() {
                return true; // trailing pipe is suspicious
            }
            if let Some(c) = first_char {
                if !c.is_alphanumeric() && c != '/' && c != '.' && c != '-' {
                    return true;
                }
            }
        }
    }

    false
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
    ///
    /// [M-02] Also rejects commands containing dangerous shell metacharacters
    /// that could be used for command injection when an allowlist is active.
    pub fn is_command_allowed(&self, command: &str) -> bool {
        if let Some(ref allowlist) = self.command_allowlist {
            // [M-02] Check for shell metacharacters used in injection attacks.
            // We block: ; && || $() and backticks.
            // We allow | (pipe) only for simple single-pipe cases.
            if contains_dangerous_metacharacters(command) {
                return false;
            }

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
    ///
    /// [M-03] Uses canonicalized paths to prevent symlink-based bypass.
    pub fn is_workdir_allowed(&self, path: &str) -> bool {
        if self.fs_rules.is_empty() {
            return true;
        }

        // [M-03] Canonicalize the input path to resolve symlinks and `..`.
        // If the path doesn't exist, fall back to lexical normalisation.
        let input_path = std::path::Path::new(path);
        let canonical_input = match input_path.canonicalize() {
            Ok(p) => p,
            Err(_) => {
                // Path doesn't exist yet — normalise lexically
                let mut normalised = std::path::PathBuf::new();
                for comp in input_path.components() {
                    match comp {
                        std::path::Component::CurDir => {}
                        std::path::Component::ParentDir => {
                            normalised.pop();
                        }
                        _ => normalised.push(comp),
                    }
                }
                normalised
            }
        };

        for rule in &self.fs_rules {
            let prefix = match rule {
                FsRule::Read(p) | FsRule::Write(p) => p,
                FsRule::Deny(p) => p,
            };
            // [M-03] Try canonicalized prefix first, then fall back to raw
            // prefix. This handles both real paths (where /tmp → /private/tmp)
            // and non-existent or virtual paths.
            let canonical_prefix = match prefix.canonicalize() {
                Ok(p) => p,
                Err(_) => prefix.clone(),
            };
            if canonical_input.starts_with(&canonical_prefix)
                || canonical_input.starts_with(prefix)
            {
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

    // ── [M-02] Command injection tests ──

    #[test]
    fn strict_rejects_semicolon_injection() {
        let policy = SandboxPolicy::strict();
        assert!(!policy.is_command_allowed("ls ; rm -rf /"));
    }

    #[test]
    fn strict_rejects_and_injection() {
        let policy = SandboxPolicy::strict();
        assert!(!policy.is_command_allowed("ls && rm -rf /"));
    }

    #[test]
    fn strict_rejects_or_injection() {
        let policy = SandboxPolicy::strict();
        assert!(!policy.is_command_allowed("ls || rm -rf /"));
    }

    #[test]
    fn strict_rejects_command_substitution() {
        let policy = SandboxPolicy::strict();
        assert!(!policy.is_command_allowed("echo $(whoami)"));
        assert!(!policy.is_command_allowed("echo `whoami`"));
    }

    #[test]
    fn strict_allows_simple_pipe() {
        let policy = SandboxPolicy::strict();
        assert!(policy.is_command_allowed("ls | grep foo"));
        assert!(policy.is_command_allowed("cat file | sort"));
    }

    #[test]
    fn strict_rejects_multiple_pipes() {
        let policy = SandboxPolicy::strict();
        assert!(!policy.is_command_allowed("ls | grep foo | xargs rm"));
    }

    #[test]
    fn permissive_ignores_metachar_checks() {
        let policy = SandboxPolicy::permissive();
        // Permissive has no allowlist, so metachar checks are skipped
        assert!(policy.is_command_allowed("ls ; rm -rf /"));
    }
}
