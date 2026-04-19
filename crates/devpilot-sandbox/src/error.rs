//! Error types for the sandbox module.

use thiserror::Error;

/// Errors that can occur during sandboxed execution.
#[derive(Debug, Error)]
pub enum SandboxError {
    /// The command was denied by the sandbox policy.
    #[error("command denied by policy: {0}")]
    PolicyDenied(String),

    /// The command timed out.
    #[error("command timed out after {0}s")]
    Timeout(u64),

    /// The working directory is not allowed by policy.
    #[error("working directory not allowed: {0}")]
    WorkdirDenied(String),

    /// Output exceeded the configured size limit.
    #[error("output exceeded size limit ({limit} bytes)")]
    OutputTooLarge {
        /// The configured limit.
        limit: usize,
    },

    /// Failed to spawn or interact with the process.
    #[error("process error: {0}")]
    ProcessFailed(String),

    /// The command was not found on the system PATH.
    #[error("command not found: {0}")]
    CommandNotFound(String),
}

/// Convenience alias.
pub type SandboxResult<T> = Result<T, SandboxError>;
