//! Tauri commands for task scheduling.

use crate::AppState;
use devpilot_scheduler::{Scheduler, TaskAction, TaskDef, TaskSchedule};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::State;
use tokio::sync::Mutex as AsyncMutex;

/// Scheduler state stored in AppState.
pub struct SchedulerState {
    pub scheduler: Arc<AsyncMutex<Scheduler>>,
}

/// Create task request.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskRequest {
    /// Task name.
    pub name: String,
    /// Schedule definition: cron expression or interval in seconds.
    pub schedule: TaskScheduleDef,
    /// Action to perform.
    pub action: TaskActionDef,
    /// Max executions (None = unlimited).
    pub max_executions: Option<usize>,
}

/// Serializable schedule definition.
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TaskScheduleDef {
    /// Cron expression.
    Cron { expr: String },
    /// Fixed interval in seconds.
    Interval { seconds: u64 },
}

impl From<TaskScheduleDef> for TaskSchedule {
    fn from(def: TaskScheduleDef) -> Self {
        match def {
            TaskScheduleDef::Cron { expr } => TaskSchedule::Cron { expr },
            TaskScheduleDef::Interval { seconds } => TaskSchedule::Interval { seconds },
        }
    }
}

/// Serializable task action.
#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum TaskActionDef {
    ShellCommand {
        command: String,
    },
    HttpRequest {
        url: String,
        method: String,
        headers: Option<Vec<(String, String)>>,
        body: Option<String>,
    },
    Custom {
        id: String,
    },
}

impl From<TaskActionDef> for TaskAction {
    fn from(def: TaskActionDef) -> Self {
        match def {
            TaskActionDef::ShellCommand { command } => TaskAction::ShellCommand(command),
            TaskActionDef::HttpRequest {
                url,
                method,
                headers,
                body,
            } => TaskAction::HttpRequest {
                url,
                method,
                headers,
                body,
            },
            TaskActionDef::Custom { id } => TaskAction::Custom(id),
        }
    }
}

/// Task info returned to frontend.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInfo {
    pub id: String,
    pub name: Option<String>,
    /// For backward compat, the cron expression if present.
    pub cron_expr: Option<String>,
    /// Interval in seconds if this is an interval task.
    pub interval_seconds: Option<u64>,
    /// Human-readable schedule type.
    pub schedule_type: String,
    pub status: String,
    pub execution_count: usize,
    pub max_executions: Option<usize>,
}

/// Create a new scheduled task.
#[tauri::command(rename_all = "camelCase")]
pub async fn scheduler_create_task(
    state: State<'_, AppState>,
    req: CreateTaskRequest,
) -> Result<String, String> {
    let sched = state.scheduler_state.scheduler.lock().await;

    let task = match &req.schedule {
        TaskScheduleDef::Cron { expr } => {
            let mut task = TaskDef::from_cron(expr).map_err(|e| format!("Invalid cron: {e}"))?;
            task = task.with_name(&req.name).with_action(req.action.into());
            if let Some(max) = req.max_executions {
                task = task.with_max_executions(max);
            }
            task
        }
        TaskScheduleDef::Interval { seconds } => {
            let mut task = TaskDef::from_interval(*seconds);
            task = task.with_name(&req.name).with_action(req.action.into());
            if let Some(max) = req.max_executions {
                task = task.with_max_executions(max);
            }
            task
        }
    };

    let id = task.id.clone();
    sched
        .add_task(task)
        .await
        .map_err(|e| format!("Failed to create task: {e}"))?;
    Ok(id)
}

/// List all tasks.
#[tauri::command]
pub async fn scheduler_list_tasks(state: State<'_, AppState>) -> Result<Vec<TaskInfo>, String> {
    let sched = state.scheduler_state.scheduler.lock().await;
    let tasks = sched.list_tasks().await;
    Ok(tasks
        .into_iter()
        .map(|t| {
            let cron_expr = t.cron_expr().map(String::from);
            let interval_seconds = t.interval_secs();
            let is_interval = t.is_interval();
            let status = format!("{:?}", t.status);
            let execution_count = t.execution_count;
            let max_executions = t.max_executions;
            TaskInfo {
                id: t.id,
                name: t.name,
                cron_expr,
                interval_seconds,
                schedule_type: if is_interval {
                    "interval".to_string()
                } else {
                    "cron".to_string()
                },
                status,
                execution_count,
                max_executions,
            }
        })
        .collect())
}

/// Remove a task.
#[tauri::command(rename_all = "camelCase")]
pub async fn scheduler_remove_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    let sched = state.scheduler_state.scheduler.lock().await;
    sched
        .remove_task(&task_id)
        .await
        .map_err(|e| format!("Failed to remove task: {e}"))?;
    Ok(())
}

/// Pause a task.
#[tauri::command(rename_all = "camelCase")]
pub async fn scheduler_pause_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    let sched = state.scheduler_state.scheduler.lock().await;
    sched
        .pause_task(&task_id)
        .await
        .map_err(|e| format!("Failed to pause task: {e}"))
}

/// Resume a task.
#[tauri::command(rename_all = "camelCase")]
pub async fn scheduler_resume_task(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<(), String> {
    let sched = state.scheduler_state.scheduler.lock().await;
    sched
        .resume_task(&task_id)
        .await
        .map_err(|e| format!("Failed to resume task: {e}"))
}

// ── Scheduler Persistence (SQLite) ────────────────────

use devpilot_store::{ScheduledTaskRecord, TaskRunRecord};

/// Persist a scheduled task to database.
#[tauri::command(rename_all = "camelCase")]
pub fn scheduler_save_task(
    state: State<'_, AppState>,
    task: ScheduledTaskRecord,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.upsert_scheduled_task(&task).map_err(|e| e.to_string())
}

/// List all persisted scheduled tasks from database.
#[tauri::command]
pub fn scheduler_list_saved(
    state: State<'_, AppState>,
) -> Result<Vec<ScheduledTaskRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_scheduled_tasks().map_err(|e| e.to_string())
}

/// Delete a persisted scheduled task from database.
#[tauri::command(rename_all = "camelCase")]
pub fn scheduler_delete_saved(state: State<'_, AppState>, task_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_scheduled_task(&task_id)
        .map_err(|e| e.to_string())
}

/// Save a task run record to database.
#[tauri::command(rename_all = "camelCase")]
pub fn scheduler_save_run(state: State<'_, AppState>, run: TaskRunRecord) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_task_run(&run).map_err(|e| e.to_string())
}

/// List task run history for a specific task.
#[tauri::command]
pub fn scheduler_list_runs(
    state: State<'_, AppState>,
    task_id: String,
) -> Result<Vec<TaskRunRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_task_runs(&task_id).map_err(|e| e.to_string())
}
