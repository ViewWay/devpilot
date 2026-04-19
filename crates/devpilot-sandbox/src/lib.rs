//! # devpilot-sandbox
//!
//! Sandboxed command execution with resource limits, filesystem restrictions,
//! and output capture. Provides a safe wrapper around `tokio::process::Command`
//! for executing untrusted or user-invoked shell commands.
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_sandbox::{SandboxPolicy, SandboxedCommand};
//!
//! let policy = SandboxPolicy::default();
//! let result = SandboxedCommand::new("echo hello")
//!     .policy(&policy)
//!     .working_dir("/tmp")
//!     .run()
//!     .await
//!     .unwrap();
//!
//! assert_eq!(result.exit_code, 0);
//! assert!(result.stdout.contains("hello"));
//! ```

mod error;
mod policy;
mod runner;

pub use error::{SandboxError, SandboxResult};
pub use policy::{FsRule, NetworkPolicy, ResourceLimits, SandboxPolicy, SizeLimit};
pub use runner::{SandboxOutput, SandboxedCommand};
