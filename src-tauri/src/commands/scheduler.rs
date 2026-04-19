//! Tauri commands for task scheduling.

use crate::AppState;
use devpilot_scheduler::{Scheduler, TaskAction, TaskDef};
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
    /// Cron expression (e.g., "0 * * * * *").
    pub cron_expr: String,
    /// Action to perform.
    pub action: TaskActionDef,
    /// Max executions (None = unlimited).
    pub max_executions: Option<usize>,
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
    pub cron_expr: String,
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
    let mut task = TaskDef::from_cron(&req.cron_expr).map_err(|e| format!("Invalid cron: {e}"))?;
    task = task.with_name(&req.name).with_action(req.action.into());
    if let Some(max) = req.max_executions {
        task = task.with_max_executions(max);
    }
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
        .map(|t| TaskInfo {
            id: t.id,
            name: t.name,
            cron_expr: t.cron_expr,
            status: format!("{:?}", t.status),
            execution_count: t.execution_count,
            max_executions: t.max_executions,
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
