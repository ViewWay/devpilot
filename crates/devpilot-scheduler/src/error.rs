//! Error types for scheduler.

use thiserror::Error;

/// Scheduler errors.
#[derive(Debug, Error)]
pub enum SchedulerError {
    /// Invalid cron expression.
    #[error("invalid cron expression: {0}")]
    InvalidCron(String),

    /// Task not found.
    #[error("task not found: {0}")]
    TaskNotFound(String),

    /// Task already exists.
    #[error("task already exists: {0}")]
    TaskExists(String),

    /// Scheduler is not running.
    #[error("scheduler is not running")]
    NotRunning,

    /// Scheduler is already running.
    #[error("scheduler is already running")]
    AlreadyRunning,

    /// An internal error occurred.
    #[error("{0}")]
    Internal(String),
}

/// Convenience alias.
pub type SchedulerResult<T> = Result<T, SchedulerError>;
