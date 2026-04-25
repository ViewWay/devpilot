//! # devpilot-scheduler
//!
//! Task scheduler for DevPilot.
//!
//! Schedule recurring tasks with cron expressions or fixed intervals,
//! manage their lifecycle, and receive results via channels.
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_scheduler::{Scheduler, TaskDef, TaskSchedule, TaskAction};
//!
//! let mut scheduler = Scheduler::new();
//!
//! // Cron-based task
//! let cron_task = TaskDef::new(TaskSchedule::cron("*/5 * * * * *").unwrap())
//!     .with_name("health-check")
//!     .with_action(TaskAction::ShellCommand("curl http://localhost/health".into()));
//!
//! // Interval-based task (every 30 seconds)
//! let interval_task = TaskDef::new(TaskSchedule::interval(30))
//!     .with_name("metrics")
//!     .with_action(TaskAction::ShellCommand("collect-metrics".into()));
//!
//! scheduler.add_task(cron_task).unwrap();
//! scheduler.add_task(interval_task).unwrap();
//! scheduler.start().await;
//! ```

mod error;
mod scheduler;
mod task;

pub use error::{SchedulerError, SchedulerResult};
pub use scheduler::Scheduler;
pub use task::{TaskAction, TaskDef, TaskId, TaskSchedule, TaskStatus};
