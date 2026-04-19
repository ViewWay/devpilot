//! # devpilot-scheduler
//!
//! Cron task scheduler for DevPilot.
//!
//! Schedule recurring tasks with cron expressions, manage their lifecycle,
//! and receive results via channels.
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_scheduler::{Scheduler, TaskDef, TaskAction};
//!
//! let mut scheduler = Scheduler::new();
//!
//! let task = TaskDef::new("*/5 * * * * *".parse().unwrap())
//!     .with_name("health-check")
//!     .with_action(TaskAction::ShellCommand("curl http://localhost/health".into()));
//!
//! scheduler.add_task(task).unwrap();
//! scheduler.start().await;
//! ```

mod error;
mod scheduler;
mod task;

pub use error::{SchedulerError, SchedulerResult};
pub use scheduler::Scheduler;
pub use task::{TaskAction, TaskDef, TaskId, TaskStatus};
