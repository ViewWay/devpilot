//! Todo write tool — manage a task list during a coding session.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use tokio::sync::RwLock;

/// A single todo item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    /// Unique identifier for this todo item.
    pub id: String,
    /// Task description.
    pub content: String,
    /// Status: one of 'pending', 'in_progress', 'completed', 'cancelled'.
    pub status: String,
}

/// Global in-memory todo list shared across all invocations.
static TODOS: OnceLock<RwLock<Vec<TodoItem>>> = OnceLock::new();

fn todos() -> &'static RwLock<Vec<TodoItem>> {
    TODOS.get_or_init(|| RwLock::new(Vec::new()))
}

/// Input parameters for `todo_write`.
#[derive(Debug, Deserialize)]
struct TodoWriteInput {
    /// Array of todo items.
    items: Vec<TodoItemInput>,
    /// Action: 'replace' (default) or 'merge'.
    #[serde(default = "default_action")]
    action: String,
}

#[derive(Debug, Deserialize)]
struct TodoItemInput {
    id: String,
    content: String,
    status: String,
}

fn default_action() -> String {
    "replace".to_string()
}

/// Tool that manages a simple task list during a coding session.
pub struct TodoWriteTool;

impl TodoWriteTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for TodoWriteTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for TodoWriteTool {
    fn name(&self) -> &str {
        "todo_write"
    }

    fn description(&self) -> &str {
        "Manage a task list. Create, update, and track todo items during the session."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "Array of todo items",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "Unique identifier for the todo item"
                            },
                            "content": {
                                "type": "string",
                                "description": "Task description"
                            },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "completed", "cancelled"],
                                "description": "Status of the todo item"
                            }
                        },
                        "required": ["id", "content", "status"]
                    }
                },
                "action": {
                    "type": "string",
                    "enum": ["replace", "merge"],
                    "description": "Action to perform: 'replace' (default) replaces the entire list, 'merge' updates existing items by id and adds new ones"
                }
            },
            "required": ["items"]
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
        let params: TodoWriteInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        // Validate statuses
        let valid_statuses = ["pending", "in_progress", "completed", "cancelled"];
        for item in &params.items {
            if !valid_statuses.contains(&item.status.as_str()) {
                return Ok(ToolOutput::err(format!(
                    "Invalid status '{}' for item '{}'. Must be one of: {}",
                    item.status,
                    item.id,
                    valid_statuses.join(", ")
                )));
            }
        }

        // Validate action
        if params.action != "replace" && params.action != "merge" {
            return Ok(ToolOutput::err(format!(
                "Invalid action '{}'. Must be 'replace' or 'merge'.",
                params.action
            )));
        }

        let incoming: Vec<TodoItem> = params
            .items
            .into_iter()
            .map(|i| TodoItem {
                id: i.id,
                content: i.content,
                status: i.status,
            })
            .collect();

        match params.action.as_str() {
            "replace" => {
                let mut guard = todos().write().await;
                *guard = incoming;
            }
            "merge" => {
                let mut guard = todos().write().await;
                for item in incoming {
                    if let Some(existing) = guard.iter_mut().find(|t| t.id == item.id) {
                        existing.content = item.content;
                        existing.status = item.status;
                    } else {
                        guard.push(item);
                    }
                }
            }
            _ => unreachable!(), // already validated above
        }

        // Build formatted output
        let guard = todos().read().await;
        let output = format_todos(&guard);

        Ok(ToolOutput::ok(output))
    }
}

/// Format the todo list as a human-readable string.
fn format_todos(items: &[TodoItem]) -> String {
    if items.is_empty() {
        return "No todo items.".to_string();
    }

    let mut out = String::new();
    out.push_str(&format!("Todo list ({} items):\n", items.len()));

    let status_icon = |s: &str| -> &str {
        match s {
            "pending" => "[ ]",
            "in_progress" => "[~]",
            "completed" => "[x]",
            "cancelled" => "[-]",
            _ => "[?]",
        }
    };

    for item in items {
        let icon = status_icon(&item.status);
        out.push_str(&format!("  {icon} {} - {}\n", item.id, item.content));
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Serialize all async tests that touch the global TODOS state.
    static TEST_LOCK: Mutex<()> = Mutex::new(());

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        }
    }

    /// Helper to reset the global state before each test.
    /// We write an empty list to clear any leftover state.
    async fn reset_todos() {
        let mut guard = todos().write().await;
        guard.clear();
    }

    #[tokio::test]
    async fn test_replace_action() {
        let _lock = TEST_LOCK.lock().unwrap();
        reset_todos().await;

        let tool = TodoWriteTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "items": [
                        {"id": "1", "content": "Task A", "status": "pending"},
                        {"id": "2", "content": "Task B", "status": "completed"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Todo list (2 items)"));
        assert!(result.content.contains("[ ] 1 - Task A"));
        assert!(result.content.contains("[x] 2 - Task B"));
    }

    #[tokio::test]
    async fn test_merge_action_adds_new() {
        let _lock = TEST_LOCK.lock().unwrap();
        reset_todos().await;

        let tool = TodoWriteTool::new();

        // Seed with one item
        tool.execute(
            serde_json::json!({
                "items": [
                    {"id": "1", "content": "Task A", "status": "pending"}
                ]
            }),
            &ctx(),
        )
        .await
        .unwrap();

        // Merge in a new item
        let result = tool
            .execute(
                serde_json::json!({
                    "action": "merge",
                    "items": [
                        {"id": "2", "content": "Task B", "status": "in_progress"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Todo list (2 items)"));
        assert!(result.content.contains("[ ] 1 - Task A"));
        assert!(result.content.contains("[~] 2 - Task B"));
    }

    #[tokio::test]
    async fn test_merge_action_updates_existing() {
        let _lock = TEST_LOCK.lock().unwrap();
        reset_todos().await;

        let tool = TodoWriteTool::new();

        // Seed
        tool.execute(
            serde_json::json!({
                "items": [
                    {"id": "1", "content": "Task A", "status": "pending"},
                    {"id": "2", "content": "Task B", "status": "pending"}
                ]
            }),
            &ctx(),
        )
        .await
        .unwrap();

        // Merge: update item 1, leave item 2 unchanged
        let result = tool
            .execute(
                serde_json::json!({
                    "action": "merge",
                    "items": [
                        {"id": "1", "content": "Task A (updated)", "status": "completed"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Todo list (2 items)"));
        assert!(result.content.contains("[x] 1 - Task A (updated)"));
        assert!(result.content.contains("[ ] 2 - Task B"));
    }

    #[tokio::test]
    async fn test_replace_clears_previous() {
        let _lock = TEST_LOCK.lock().unwrap();
        reset_todos().await;

        let tool = TodoWriteTool::new();

        // Seed
        tool.execute(
            serde_json::json!({
                "items": [
                    {"id": "1", "content": "Task A", "status": "pending"}
                ]
            }),
            &ctx(),
        )
        .await
        .unwrap();

        // Replace with new list
        let result = tool
            .execute(
                serde_json::json!({
                    "items": [
                        {"id": "10", "content": "New task", "status": "pending"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Todo list (1 items)"));
        assert!(result.content.contains("[ ] 10 - New task"));
        assert!(!result.content.contains("Task A"));
    }

    #[tokio::test]
    async fn test_empty_items() {
        let _lock = TEST_LOCK.lock().unwrap();
        reset_todos().await;

        let tool = TodoWriteTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "items": []
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("No todo items."));
    }

    #[tokio::test]
    async fn test_invalid_status() {
        let _lock = TEST_LOCK.lock().unwrap();
        let tool = TodoWriteTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "items": [
                        {"id": "1", "content": "Bad status", "status": "unknown"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("Invalid status"));
    }

    #[tokio::test]
    async fn test_invalid_action() {
        let _lock = TEST_LOCK.lock().unwrap();
        let tool = TodoWriteTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "action": "delete",
                    "items": [
                        {"id": "1", "content": "Task", "status": "pending"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("Invalid action"));
    }

    #[tokio::test]
    async fn test_cancelled_status() {
        let _lock = TEST_LOCK.lock().unwrap();
        reset_todos().await;

        let tool = TodoWriteTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "items": [
                        {"id": "1", "content": "Cancelled task", "status": "cancelled"}
                    ]
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("[-] 1 - Cancelled task"));
    }

    #[tokio::test]
    async fn test_missing_items_field() {
        let _lock = TEST_LOCK.lock().unwrap();
        let tool = TodoWriteTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "action": "replace"
                }),
                &ctx(),
            )
            .await;

        assert!(result.is_err());
    }

    #[test]
    fn test_format_todos_empty() {
        let output = format_todos(&[]);
        assert_eq!(output, "No todo items.");
    }

    #[test]
    fn test_format_todos_multiple() {
        let items = vec![
            TodoItem {
                id: "a".into(),
                content: "First".into(),
                status: "pending".into(),
            },
            TodoItem {
                id: "b".into(),
                content: "Second".into(),
                status: "in_progress".into(),
            },
            TodoItem {
                id: "c".into(),
                content: "Third".into(),
                status: "completed".into(),
            },
        ];
        let output = format_todos(&items);
        assert!(output.contains("Todo list (3 items)"));
        assert!(output.contains("[ ] a - First"));
        assert!(output.contains("[~] b - Second"));
        assert!(output.contains("[x] c - Third"));
    }
}
