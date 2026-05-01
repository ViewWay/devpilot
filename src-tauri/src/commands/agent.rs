//! Tauri commands for the agent task management and plan mode.
//!
//! These commands expose the devpilot-agent crate's task store and plan mode
//! state to the Tauri frontend via IPC.

use devpilot_agent::{AgentDefinition, AgentTask, TaskStatus, TaskStore, TaskTreeNode};

// ── Task Management Commands ──────────────────────────

/// Create a new tracked agent task.
///
/// Returns the newly created task's ID.
#[tauri::command]
pub async fn agent_task_create(
    title: String,
    description: Option<String>,
    parent_id: Option<String>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let task = AgentTask {
        id: id.clone(),
        title,
        description,
        status: TaskStatus::Pending,
        parent_id,
        result: None,
        agent_type: "general".to_string(),
        created_at: now,
        updated_at: now,
    };
    TaskStore::global().insert(task);
    Ok(id)
}

/// Update a task's status and optional result.
#[tauri::command]
pub async fn agent_task_update(
    id: String,
    status: String,
    result: Option<String>,
) -> Result<(), String> {
    let task_status = TaskStatus::from_str_opt(&status)
        .ok_or_else(|| format!("Invalid status: '{}'. Must be one of: pending, in_progress, completed, failed, cancelled", status))?;

    TaskStore::global()
        .update(&id, task_status, result)
        .ok_or_else(|| format!("Task not found: {}", id))?;

    Ok(())
}

/// List tasks with optional filtering by status and/or parent task ID.
#[tauri::command]
pub async fn agent_task_list(
    status: Option<String>,
    parent_id: Option<String>,
) -> Result<Vec<AgentTask>, String> {
    let tasks = TaskStore::global().list(status.as_deref(), parent_id.as_deref());
    Ok(tasks)
}

/// Get a single task's output/details by ID.
#[tauri::command]
pub async fn agent_task_output(id: String) -> Result<AgentTask, String> {
    TaskStore::global()
        .get(&id)
        .ok_or_else(|| format!("Task not found: {}", id))
}

/// Cancel (stop) a running task.
#[tauri::command]
pub async fn agent_task_stop(id: String) -> Result<(), String> {
    TaskStore::global()
        .cancel(&id)
        .ok_or_else(|| format!("Task not found: {}", id))?;
    Ok(())
}

// ── Plan Mode Commands ────────────────────────────────

/// Enter plan-only mode (agent plans without executing code changes).
#[tauri::command]
pub async fn agent_enter_plan_mode() -> Result<(), String> {
    devpilot_agent::enter_plan_mode();
    Ok(())
}

/// Exit plan mode, providing a plan for the agent to follow.
#[tauri::command]
pub async fn agent_exit_plan_mode(plan: String) -> Result<(), String> {
    if plan.is_empty() {
        return Err("Plan cannot be empty".to_string());
    }
    devpilot_agent::exit_plan_mode();
    Ok(())
}

/// Check whether the agent is currently in plan-only mode.
#[tauri::command]
pub async fn agent_is_plan_mode() -> Result<bool, String> {
    Ok(devpilot_agent::is_plan_mode())
}

/// Get a task tree starting from a root task ID.
#[tauri::command]
pub async fn agent_task_tree(id: String) -> Result<TaskTreeNode, String> {
    TaskStore::global()
        .get_task_tree(&id)
        .ok_or_else(|| format!("Task not found: {}", id))
}

// ── Agent Config Commands ────────────────────────────

/// Load custom agent definitions from `.devpilot/agents/` in the given workdir.
#[tauri::command]
pub async fn agent_list_definitions(workdir: String) -> Result<Vec<AgentDefinition>, String> {
    let path = std::path::Path::new(&workdir);
    Ok(devpilot_agent::load_agents_from_dir(path))
}
