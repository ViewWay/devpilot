//! DevPilot Agent — sub-agent spawning, task management, and plan mode tools.
//!
//! This crate provides:
//! - `AgentTool`: spawn sub-agents for delegated tasks
//! - Task CRUD tools: `task_create`, `task_update`, `task_list`, `task_output`, `task_stop`
//! - Plan mode tools: `enter_plan_mode`, `exit_plan_mode`
//! - `TaskStore`: in-memory global singleton for tracking tasks

use async_trait::async_trait;
use devpilot_tools::{Tool, ToolContext, ToolOutput, ToolResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Status of an agent task.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
    Cancelled,
}

impl TaskStatus {
    /// Parse from a string, returning None if invalid.
    pub fn from_str_opt(s: &str) -> Option<Self> {
        match s {
            "pending" => Some(Self::Pending),
            "in_progress" => Some(Self::InProgress),
            "completed" => Some(Self::Completed),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            _ => None,
        }
    }
}

impl std::fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pending => write!(f, "pending"),
            Self::InProgress => write!(f, "in_progress"),
            Self::Completed => write!(f, "completed"),
            Self::Failed => write!(f, "failed"),
            Self::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// A tracked agent task.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentTask {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub parent_id: Option<String>,
    pub result: Option<String>,
    /// Type of agent assigned to this task (general, code_reviewer, test_writer, architect).
    #[serde(default = "default_agent_type")]
    pub agent_type: String,
    pub created_at: i64,
    pub updated_at: i64,
}

fn default_agent_type() -> String {
    "general".to_string()
}

// ---------------------------------------------------------------------------
// TaskStore — global in-memory store
// ---------------------------------------------------------------------------

/// In-memory task store, behind a global `OnceLock + RwLock`.
pub struct TaskStore {
    tasks: RwLock<HashMap<String, AgentTask>>,
}

impl TaskStore {
    /// Create a new empty store.
    fn new() -> Self {
        Self {
            tasks: RwLock::new(HashMap::new()),
        }
    }

    /// Get the global singleton.
    pub fn global() -> &'static Self {
        static INSTANCE: OnceLock<TaskStore> = OnceLock::new();
        INSTANCE.get_or_init(Self::new)
    }

    /// Insert a task, returning a clone of it.
    pub fn insert(&self, task: AgentTask) -> AgentTask {
        let clone = task.clone();
        self.tasks.write().unwrap().insert(clone.id.clone(), task);
        clone
    }

    /// Get a task by ID.
    pub fn get(&self, id: &str) -> Option<AgentTask> {
        self.tasks.read().unwrap().get(id).cloned()
    }

    /// Update a task's status and optional result. Returns the updated task or None.
    pub fn update(
        &self,
        id: &str,
        status: TaskStatus,
        result: Option<String>,
    ) -> Option<AgentTask> {
        let mut map = self.tasks.write().unwrap();
        let task = map.get_mut(id)?;
        task.status = status;
        if result.is_some() {
            task.result = result;
        }
        task.updated_at = chrono::Utc::now().timestamp();
        Some(task.clone())
    }

    /// Cancel a task (set status to Cancelled).
    pub fn cancel(&self, id: &str) -> Option<AgentTask> {
        let mut map = self.tasks.write().unwrap();
        let task = map.get_mut(id)?;
        task.status = TaskStatus::Cancelled;
        task.updated_at = chrono::Utc::now().timestamp();
        Some(task.clone())
    }

    /// List tasks with optional filters.
    pub fn list(&self, status: Option<&str>, parent_id: Option<&str>) -> Vec<AgentTask> {
        let map = self.tasks.read().unwrap();
        let status_filter = status.and_then(TaskStatus::from_str_opt);
        map.values()
            .filter(|t| {
                if let Some(ref s) = status_filter
                    && t.status != *s
                {
                    return false;
                }
                if let Some(pid) = parent_id
                    && t.parent_id.as_deref() != Some(pid)
                {
                    return false;
                }
                true
            })
            .cloned()
            .collect()
    }

    /// Get direct children of a task.
    pub fn get_children(&self, parent_id: &str) -> Vec<AgentTask> {
        self.list(None, Some(parent_id))
    }

    /// Get a task with its full subtree (children, grandchildren, etc.).
    pub fn get_task_tree(&self, root_id: &str) -> Option<TaskTreeNode> {
        let task = self.get(root_id)?;
        let children: Vec<TaskTreeNode> = self
            .get_children(root_id)
            .iter()
            .filter_map(|c| self.get_task_tree(&c.id))
            .collect();
        Some(TaskTreeNode { task, children })
    }
}

/// A task with its children, forming a tree structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskTreeNode {
    pub task: AgentTask,
    pub children: Vec<TaskTreeNode>,
}

impl TaskTreeNode {
    /// Count total tasks in the tree (including root).
    pub fn total_count(&self) -> usize {
        1 + self.children.iter().map(|c| c.total_count()).sum::<usize>()
    }

    /// Count completed tasks in the tree.
    pub fn completed_count(&self) -> usize {
        let self_done = if self.task.status == TaskStatus::Completed {
            1
        } else {
            0
        };
        self_done
            + self
                .children
                .iter()
                .map(|c| c.completed_count())
                .sum::<usize>()
    }

    /// Compute progress as a fraction (0.0 – 1.0).
    pub fn progress(&self) -> f32 {
        let total = self.total_count();
        if total == 0 {
            return 0.0;
        }
        self.completed_count() as f32 / total as f32
    }
}

// ---------------------------------------------------------------------------
// Plan mode state
// ---------------------------------------------------------------------------

static PLAN_MODE: OnceLock<RwLock<bool>> = OnceLock::new();

fn plan_mode_state() -> &'static RwLock<bool> {
    PLAN_MODE.get_or_init(|| RwLock::new(false))
}

/// Check whether plan mode is active.
pub fn is_plan_mode() -> bool {
    *plan_mode_state().read().unwrap()
}

/// Activate plan-only mode (agent plans without executing code changes).
pub fn enter_plan_mode() {
    let mut guard = plan_mode_state().write().unwrap();
    *guard = true;
}

/// Deactivate plan-only mode, returning to execution mode.
pub fn exit_plan_mode() {
    let mut guard = plan_mode_state().write().unwrap();
    *guard = false;
}

// ---------------------------------------------------------------------------
// AgentTool — spawn sub-agents
// ---------------------------------------------------------------------------

/// Tool that spawns sub-agents for delegated tasks.
pub struct AgentTool;

#[async_trait]
impl Tool for AgentTool {
    fn name(&self) -> &str {
        "agent"
    }

    fn description(&self) -> &str {
        "Spawn a sub-agent to handle a delegated task. Returns a task ID for tracking progress."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The task description to delegate to the sub-agent"
                },
                "context": {
                    "type": "string",
                    "description": "Optional context information for the sub-agent"
                },
                "workdir": {
                    "type": "string",
                    "description": "Optional working directory for the sub-agent"
                },
                "agent_type": {
                    "type": "string",
                    "enum": ["general", "code_reviewer", "test_writer", "architect"],
                    "description": "Type of sub-agent to spawn (default: general)"
                }
            },
            "required": ["task"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let task_desc = input["task"].as_str().unwrap_or("").to_string();
        if task_desc.is_empty() {
            return Ok(ToolOutput::err("Missing required field: task"));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let agent_type = input["agent_type"]
            .as_str()
            .unwrap_or("general")
            .to_string();
        let agent_task = AgentTask {
            id: id.clone(),
            title: task_desc.clone(),
            description: input["context"].as_str().map(|s| s.to_string()),
            status: TaskStatus::Pending,
            parent_id: None,
            result: None,
            agent_type,
            created_at: now,
            updated_at: now,
        };
        TaskStore::global().insert(agent_task);

        Ok(ToolOutput::ok(format!(
            "Sub-agent task created with ID: {}",
            id
        )))
    }
}

// ---------------------------------------------------------------------------
// TaskCreateTool
// ---------------------------------------------------------------------------

/// Create a tracked task.
pub struct TaskCreateTool;

#[async_trait]
impl Tool for TaskCreateTool {
    fn name(&self) -> &str {
        "task_create"
    }

    fn description(&self) -> &str {
        "Create a new tracked task. Returns the created task details."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Title of the task"
                },
                "description": {
                    "type": "string",
                    "description": "Optional detailed description"
                },
                "parent_id": {
                    "type": "string",
                    "description": "Optional parent task ID for sub-task relationships"
                }
            },
            "required": ["title"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let title = input["title"].as_str().unwrap_or("").to_string();
        if title.is_empty() {
            return Ok(ToolOutput::err("Missing required field: title"));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let agent_type = input["agent_type"]
            .as_str()
            .unwrap_or("general")
            .to_string();
        let task = AgentTask {
            id: id.clone(),
            title,
            description: input["description"].as_str().map(|s| s.to_string()),
            status: TaskStatus::Pending,
            parent_id: input["parent_id"].as_str().map(|s| s.to_string()),
            result: None,
            agent_type,
            created_at: now,
            updated_at: now,
        };
        TaskStore::global().insert(task.clone());

        Ok(ToolOutput::ok(serde_json::to_string_pretty(&task).unwrap()))
    }
}

// ---------------------------------------------------------------------------
// TaskUpdateTool
// ---------------------------------------------------------------------------

/// Update a task's status (and optionally its result).
pub struct TaskUpdateTool;

#[async_trait]
impl Tool for TaskUpdateTool {
    fn name(&self) -> &str {
        "task_update"
    }

    fn description(&self) -> &str {
        "Update a task's status and optional result."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The task ID to update"
                },
                "status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed", "failed", "cancelled"],
                    "description": "New status for the task"
                },
                "result": {
                    "type": "string",
                    "description": "Optional result or output of the task"
                }
            },
            "required": ["id", "status"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let id = input["id"].as_str().unwrap_or("").to_string();
        if id.is_empty() {
            return Ok(ToolOutput::err("Missing required field: id"));
        }

        let status_str = input["status"].as_str().unwrap_or("");
        let status = match TaskStatus::from_str_opt(status_str) {
            Some(s) => s,
            None => return Ok(ToolOutput::err(format!("Invalid status: {}", status_str))),
        };

        let result = input["result"].as_str().map(|s| s.to_string());

        match TaskStore::global().update(&id, status, result) {
            Some(task) => Ok(ToolOutput::ok(serde_json::to_string_pretty(&task).unwrap())),
            None => Ok(ToolOutput::err(format!("Task not found: {}", id))),
        }
    }
}

// ---------------------------------------------------------------------------
// TaskListTool
// ---------------------------------------------------------------------------

/// List tasks with optional filtering.
pub struct TaskListTool;

#[async_trait]
impl Tool for TaskListTool {
    fn name(&self) -> &str {
        "task_list"
    }

    fn description(&self) -> &str {
        "List all tracked tasks with optional filtering by status or parent task."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by status (pending, in_progress, completed, failed, cancelled)"
                },
                "parent_id": {
                    "type": "string",
                    "description": "Filter by parent task ID"
                }
            }
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let status = input["status"].as_str();
        let parent_id = input["parent_id"].as_str();
        let tasks = TaskStore::global().list(status, parent_id);

        if tasks.is_empty() {
            return Ok(ToolOutput::ok("No tasks found."));
        }

        Ok(ToolOutput::ok(
            serde_json::to_string_pretty(&tasks).unwrap(),
        ))
    }
}

// ---------------------------------------------------------------------------
// TaskOutputTool
// ---------------------------------------------------------------------------

/// Get a task's output/result.
pub struct TaskOutputTool;

#[async_trait]
impl Tool for TaskOutputTool {
    fn name(&self) -> &str {
        "task_output"
    }

    fn description(&self) -> &str {
        "Get the output or result of a specific task."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The task ID to retrieve output for"
                }
            },
            "required": ["id"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let id = input["id"].as_str().unwrap_or("").to_string();
        if id.is_empty() {
            return Ok(ToolOutput::err("Missing required field: id"));
        }

        match TaskStore::global().get(&id) {
            Some(task) => Ok(ToolOutput::ok(serde_json::to_string_pretty(&task).unwrap())),
            None => Ok(ToolOutput::err(format!("Task not found: {}", id))),
        }
    }
}

// ---------------------------------------------------------------------------
// TaskStopTool
// ---------------------------------------------------------------------------

/// Cancel a running task.
pub struct TaskStopTool;

#[async_trait]
impl Tool for TaskStopTool {
    fn name(&self) -> &str {
        "task_stop"
    }

    fn description(&self) -> &str {
        "Cancel a running task by setting its status to cancelled."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The task ID to cancel"
                }
            },
            "required": ["id"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let id = input["id"].as_str().unwrap_or("").to_string();
        if id.is_empty() {
            return Ok(ToolOutput::err("Missing required field: id"));
        }

        match TaskStore::global().cancel(&id) {
            Some(task) => Ok(ToolOutput::ok(format!("Task {} cancelled.", task.id))),
            None => Ok(ToolOutput::err(format!("Task not found: {}", id))),
        }
    }
}

// ---------------------------------------------------------------------------
// EnterPlanModeTool
// ---------------------------------------------------------------------------

/// Switch agent to plan-only mode (no code execution).
pub struct EnterPlanModeTool;

#[async_trait]
impl Tool for EnterPlanModeTool {
    fn name(&self) -> &str {
        "enter_plan_mode"
    }

    fn description(&self) -> &str {
        "Switch the agent to plan-only mode where it analyzes and plans but does not execute code changes."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {}
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        _input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let mut guard = plan_mode_state().write().unwrap();
        *guard = true;
        Ok(ToolOutput::ok(
            "Entered plan mode. The agent will now plan without executing code changes.",
        ))
    }
}

// ---------------------------------------------------------------------------
// ExitPlanModeTool
// ---------------------------------------------------------------------------

/// Switch back to execution mode with a plan to follow.
pub struct ExitPlanModeTool;

#[async_trait]
impl Tool for ExitPlanModeTool {
    fn name(&self) -> &str {
        "exit_plan_mode"
    }

    fn description(&self) -> &str {
        "Exit plan mode and return to execution mode, optionally providing a plan to follow."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "plan": {
                    "type": "string",
                    "description": "The plan to follow in execution mode"
                }
            },
            "required": ["plan"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let plan = input["plan"].as_str().unwrap_or("").to_string();
        if plan.is_empty() {
            return Ok(ToolOutput::err("Missing required field: plan"));
        }

        let mut guard = plan_mode_state().write().unwrap();
        *guard = false;
        Ok(ToolOutput::ok(format!("Exited plan mode. Plan:\n{}", plan)))
    }
}
