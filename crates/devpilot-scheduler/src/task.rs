//! Task definition and types.

use chrono::{DateTime, TimeDelta, Utc};
use cron::Schedule;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use uuid::Uuid;

/// Unique task identifier.
pub type TaskId = String;

/// How a task is scheduled.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TaskSchedule {
    /// Cron expression (e.g., `"0 * * * * *"`).
    Cron {
        /// The cron expression string.
        expr: String,
    },
    /// Fixed interval in seconds.
    Interval {
        /// Number of seconds between executions.
        seconds: u64,
    },
}

impl TaskSchedule {
    /// Create a cron-based schedule from an expression string.
    pub fn cron(expr: &str) -> Result<Self, cron::error::Error> {
        // Validate by parsing
        let _ = Schedule::from_str(expr)?;
        Ok(TaskSchedule::Cron {
            expr: expr.to_string(),
        })
    }

    /// Create an interval-based schedule.
    pub fn interval(seconds: u64) -> Self {
        TaskSchedule::Interval { seconds }
    }
}

/// What action to take when a task fires.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskAction {
    /// Run a shell command.
    ShellCommand(String),
    /// Send an HTTP request.
    HttpRequest {
        url: String,
        method: String,
        headers: Option<Vec<(String, String)>>,
        body: Option<String>,
    },
    /// Custom action identified by name (resolved externally).
    Custom(String),
}

/// Current status of a task.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum TaskStatus {
    /// Task is active and will fire at next scheduled time.
    #[default]
    Active,
    /// Task is paused.
    Paused,
    /// Task has been removed.
    Removed,
}

/// A scheduled task definition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskDef {
    /// Unique ID (auto-generated if not set).
    pub id: TaskId,
    /// Human-readable name.
    pub name: Option<String>,
    /// Schedule definition (cron or interval).
    pub schedule: TaskSchedule,
    /// Action to execute.
    pub action: TaskAction,
    /// Current status.
    pub status: TaskStatus,
    /// Max number of executions (None = unlimited).
    pub max_executions: Option<usize>,
    /// Number of times this task has fired.
    pub execution_count: usize,
    /// When this task was created.
    pub created_at: DateTime<Utc>,
    /// Last execution time.
    pub last_run: Option<DateTime<Utc>>,
    /// Next scheduled execution time.
    pub next_run: Option<DateTime<Utc>>,
}

impl TaskDef {
    /// Parse a cron expression string into a `Schedule` (only valid for `Cron` variant).
    fn cron_schedule(&self) -> Result<Schedule, cron::error::Error> {
        match &self.schedule {
            TaskSchedule::Cron { expr } => Schedule::from_str(expr),
            TaskSchedule::Interval { .. } => Err(cron::error::ErrorKind::Expression(
                "interval-based tasks have no cron expression".to_string(),
            )
            .into()),
        }
    }

    /// Get the interval in seconds, if this is an interval-based task.
    fn interval_seconds(&self) -> Option<u64> {
        match &self.schedule {
            TaskSchedule::Interval { seconds } => Some(*seconds),
            TaskSchedule::Cron { .. } => None,
        }
    }

    /// Create a new task with the given schedule.
    pub fn new(schedule: TaskSchedule) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name: None,
            schedule,
            action: TaskAction::ShellCommand(String::new()),
            status: TaskStatus::Active,
            max_executions: None,
            execution_count: 0,
            created_at: Utc::now(),
            last_run: None,
            next_run: None,
        }
    }

    /// Create from a cron expression string.
    pub fn from_cron(expr: &str) -> Result<Self, cron::error::Error> {
        let schedule = TaskSchedule::cron(expr)?;
        Ok(Self::new(schedule))
    }

    /// Create from a fixed interval in seconds.
    pub fn from_interval(seconds: u64) -> Self {
        Self::new(TaskSchedule::interval(seconds))
    }

    /// Set the task name.
    pub fn with_name(mut self, name: &str) -> Self {
        self.name = Some(name.to_string());
        self
    }

    /// Set the action.
    pub fn with_action(mut self, action: TaskAction) -> Self {
        self.action = action;
        self
    }

    /// Set max executions.
    pub fn with_max_executions(mut self, n: usize) -> Self {
        self.max_executions = Some(n);
        self
    }

    /// Check if this task can execute again.
    pub fn can_execute(&self) -> bool {
        if self.status != TaskStatus::Active {
            return false;
        }
        match self.max_executions {
            Some(max) => self.execution_count < max,
            None => true,
        }
    }

    /// Record an execution.
    pub fn record_execution(&mut self) {
        self.execution_count += 1;
        self.last_run = Some(Utc::now());
    }

    /// Update the next run time.
    pub fn update_next_run(&mut self) {
        match &self.schedule {
            TaskSchedule::Cron { .. } => {
                if let Ok(schedule) = self.cron_schedule() {
                    self.next_run = schedule.upcoming(Utc).next();
                }
            }
            TaskSchedule::Interval { seconds } => {
                let secs = *seconds;
                let base = self.last_run.unwrap_or(self.created_at);
                let next = base + TimeDelta::seconds(secs as i64);
                // If the computed next_run is already in the past, set it to now + interval
                let now = Utc::now();
                self.next_run = if next <= now {
                    Some(now + TimeDelta::seconds(secs as i64))
                } else {
                    Some(next)
                };
            }
        }
    }

    /// Returns `true` if this task uses interval-based scheduling.
    pub fn is_interval(&self) -> bool {
        matches!(self.schedule, TaskSchedule::Interval { .. })
    }

    /// Returns `true` if this task uses cron-based scheduling.
    pub fn is_cron(&self) -> bool {
        matches!(self.schedule, TaskSchedule::Cron { .. })
    }

    /// Get the cron expression if this is a cron task.
    pub fn cron_expr(&self) -> Option<&str> {
        match &self.schedule {
            TaskSchedule::Cron { expr } => Some(expr),
            TaskSchedule::Interval { .. } => None,
        }
    }

    /// Get the interval seconds if this is an interval task.
    pub fn interval_secs(&self) -> Option<u64> {
        self.interval_seconds()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_task_from_cron() {
        let task = TaskDef::from_cron("0 * * * * *").unwrap();
        assert!(!task.id.is_empty());
        assert_eq!(task.status, TaskStatus::Active);
        assert!(task.can_execute());
        assert!(task.is_cron());
        assert!(!task.is_interval());
    }

    #[test]
    fn create_task_from_interval() {
        let task = TaskDef::from_interval(30);
        assert!(!task.id.is_empty());
        assert_eq!(task.status, TaskStatus::Active);
        assert!(task.can_execute());
        assert!(task.is_interval());
        assert!(!task.is_cron());
        assert_eq!(task.interval_secs(), Some(30));
        assert_eq!(task.cron_expr(), None);
    }

    #[test]
    fn interval_schedule_update_next_run() {
        let mut task = TaskDef::from_interval(60);
        // Before first run, next_run should be based on created_at + 60s
        task.update_next_run();
        assert!(task.next_run.is_some());
        let next = task.next_run.unwrap();
        let expected_min = Utc::now() + TimeDelta::seconds(60);
        assert!(next >= expected_min - TimeDelta::seconds(2));
    }

    #[test]
    fn interval_update_next_run_after_execution() {
        let mut task = TaskDef::from_interval(30);
        task.update_next_run(); // initial
        task.record_execution();
        let after_run = Utc::now();
        task.update_next_run();

        let next = task.next_run.unwrap();
        let expected = after_run + TimeDelta::seconds(30);
        // next should be within ~2s of expected
        assert!(next >= expected - TimeDelta::seconds(2));
        assert!(next <= expected + TimeDelta::seconds(2));
    }

    #[test]
    fn max_executions_limit() {
        let mut task = TaskDef::from_cron("0 * * * * *")
            .unwrap()
            .with_max_executions(2);
        assert!(task.can_execute());
        task.record_execution();
        assert!(task.can_execute());
        task.record_execution();
        assert!(!task.can_execute());
    }

    #[test]
    fn interval_max_executions_limit() {
        let mut task = TaskDef::from_interval(10).with_max_executions(1);
        assert!(task.can_execute());
        task.record_execution();
        assert!(!task.can_execute());
    }

    #[test]
    fn paused_task_cannot_execute() {
        let mut task = TaskDef::from_cron("0 * * * * *").unwrap();
        task.status = TaskStatus::Paused;
        assert!(!task.can_execute());
    }

    #[test]
    fn paused_interval_task_cannot_execute() {
        let mut task = TaskDef::from_interval(30);
        task.status = TaskStatus::Paused;
        assert!(!task.can_execute());
    }

    #[test]
    fn invalid_cron_expression() {
        assert!(TaskDef::from_cron("not a cron").is_err());
    }

    #[test]
    fn update_next_run_cron() {
        let mut task = TaskDef::from_cron("0 * * * * *").unwrap();
        task.update_next_run();
        assert!(task.next_run.is_some());
    }

    #[test]
    fn task_schedule_cron_validation() {
        assert!(TaskSchedule::cron("0 * * * * *").is_ok());
        assert!(TaskSchedule::cron("invalid").is_err());
    }

    #[test]
    fn task_schedule_interval_creation() {
        let sched = TaskSchedule::interval(300);
        assert!(matches!(sched, TaskSchedule::Interval { seconds: 300 }));
    }

    #[test]
    fn serde_roundtrip_cron() {
        let task = TaskDef::from_cron("0 * * * * *")
            .unwrap()
            .with_name("cron-task");
        let json = serde_json::to_string(&task).unwrap();
        let deserialized: TaskDef = serde_json::from_str(&json).unwrap();
        assert_eq!(task.id, deserialized.id);
        assert_eq!(task.name, deserialized.name);
        assert!(deserialized.is_cron());
    }

    #[test]
    fn serde_roundtrip_interval() {
        let task = TaskDef::from_interval(300).with_name("interval-task");
        let json = serde_json::to_string(&task).unwrap();
        let deserialized: TaskDef = serde_json::from_str(&json).unwrap();
        assert_eq!(task.id, deserialized.id);
        assert_eq!(task.name, deserialized.name);
        assert!(deserialized.is_interval());
        assert_eq!(deserialized.interval_secs(), Some(300));
    }
}
