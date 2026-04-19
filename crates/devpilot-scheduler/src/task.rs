//! Task definition and types.

use chrono::{DateTime, Utc};
use cron::Schedule;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use uuid::Uuid;

/// Unique task identifier.
pub type TaskId = String;

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
    /// Cron schedule expression (stored as string for serde).
    pub cron_expr: String,
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
    /// Parse the cron expression into a Schedule.
    fn schedule(&self) -> Result<Schedule, cron::error::Error> {
        Schedule::from_str(&self.cron_expr)
    }

    /// Create a new task with the given cron schedule.
    pub fn new(schedule: Schedule) -> Self {
        let cron_expr = format!("{schedule}");
        Self {
            id: Uuid::new_v4().to_string(),
            name: None,
            cron_expr,
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
        let schedule = Schedule::from_str(expr)?;
        Ok(Self::new(schedule))
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
        if let Ok(schedule) = self.schedule() {
            self.next_run = schedule.upcoming(Utc).next();
        }
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
    fn paused_task_cannot_execute() {
        let mut task = TaskDef::from_cron("0 * * * * *").unwrap();
        task.status = TaskStatus::Paused;
        assert!(!task.can_execute());
    }

    #[test]
    fn invalid_cron_expression() {
        assert!(TaskDef::from_cron("not a cron").is_err());
    }

    #[test]
    fn update_next_run() {
        let mut task = TaskDef::from_cron("0 * * * * *").unwrap();
        task.update_next_run();
        assert!(task.next_run.is_some());
    }
}
