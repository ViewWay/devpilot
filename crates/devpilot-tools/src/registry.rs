//! Tool registry — manages available tools, with enable/disable support.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult, tool_to_definition};
use devpilot_protocol::ToolDefinition;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Registry of available tools.
type ToolEntry = (Arc<dyn Tool>, bool);

pub struct ToolRegistry {
    tools: Arc<RwLock<HashMap<String, ToolEntry>>>,
}

impl Clone for ToolRegistry {
    fn clone(&self) -> Self {
        Self {
            tools: Arc::clone(&self.tools),
        }
    }
}

impl ToolRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            tools: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Create a registry pre-loaded with the default built-in tools.
    /// Create a registry pre-loaded with default tools.
    pub async fn with_defaults() -> Self {
        let reg = Self::new();
        reg.register(Arc::new(crate::ShellExecTool::new())).await;
        reg.register(Arc::new(crate::FileReadTool::new())).await;
        reg.register(Arc::new(crate::FileWriteTool::new())).await;
        reg.register(Arc::new(crate::ApplyPatchTool::new())).await;
        reg.register(Arc::new(crate::FileSearchTool::new())).await;
        reg.register(Arc::new(crate::WebFetchTool::new())).await;
        reg
    }

    /// Register a new tool.
    pub async fn register(&self, tool: Arc<dyn Tool>) {
        let mut tools = self.tools.write().await;
        tools.insert(tool.name().to_string(), (tool, true));
    }

    /// Unregister a tool by name.
    pub async fn unregister(&self, name: &str) {
        let mut tools = self.tools.write().await;
        tools.remove(name);
    }

    /// Enable or disable a tool.
    pub async fn set_enabled(&self, name: &str, enabled: bool) -> ToolResult<()> {
        let mut tools = self.tools.write().await;
        let entry = tools
            .get_mut(name)
            .ok_or_else(|| ToolError::NotFound(name.to_string()))?;
        entry.1 = enabled;
        Ok(())
    }

    /// Check if a tool is enabled.
    pub async fn is_enabled(&self, name: &str) -> bool {
        let tools = self.tools.read().await;
        tools.get(name).is_some_and(|(_, enabled)| *enabled)
    }

    /// Get a tool by name (if enabled).
    pub async fn get(&self, name: &str) -> Option<Arc<dyn Tool>> {
        let tools = self.tools.read().await;
        tools.get(name).and_then(|(tool, enabled)| {
            if *enabled {
                Some(Arc::clone(tool))
            } else {
                None
            }
        })
    }

    /// List all registered tool definitions (for sending to the LLM).
    pub async fn definitions(&self) -> Vec<ToolDefinition> {
        let tools = self.tools.read().await;
        tools
            .values()
            .filter(|(_, enabled)| *enabled)
            .map(|(tool, _)| tool_to_definition(tool.as_ref()))
            .collect()
    }

    /// List all tool names (enabled only).
    pub async fn tool_names(&self) -> Vec<String> {
        let tools = self.tools.read().await;
        tools
            .iter()
            .filter(|(_, (_, enabled))| *enabled)
            .map(|(name, _)| name.clone())
            .collect()
    }

    /// Execute a tool by name.
    pub async fn execute(
        &self,
        name: &str,
        input: serde_json::Value,
        ctx: &ToolContext,
    ) -> ToolResult<ToolOutput> {
        let tool = self
            .get(name)
            .await
            .ok_or_else(|| ToolError::NotFound(name.to_string()))?;
        tool.execute(input, ctx).await
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use async_trait::async_trait;

    struct EchoTool;

    #[async_trait]
    impl Tool for EchoTool {
        fn name(&self) -> &str {
            "echo"
        }
        fn description(&self) -> &str {
            "Echoes the input back"
        }
        fn input_schema(&self) -> serde_json::Value {
            serde_json::json!({
                "type": "object",
                "properties": {
                    "message": { "type": "string", "description": "The message to echo" }
                },
                "required": ["message"]
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
            let msg = input["message"].as_str().unwrap_or("no message");
            Ok(ToolOutput::ok(msg))
        }
    }

    #[tokio::test]
    async fn test_register_and_execute() {
        let reg = ToolRegistry::new();
        reg.register(Arc::new(EchoTool)).await;

        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        };

        let output = reg
            .execute("echo", serde_json::json!({"message": "hello"}), &ctx)
            .await
            .unwrap();
        assert_eq!(output.content, "hello");
        assert!(!output.is_error);
    }

    #[tokio::test]
    async fn test_not_found() {
        let reg = ToolRegistry::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        };
        let result = reg
            .execute("nonexistent", serde_json::json!({}), &ctx)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_enable_disable() {
        let reg = ToolRegistry::new();
        reg.register(Arc::new(EchoTool)).await;

        assert!(reg.is_enabled("echo").await);

        reg.set_enabled("echo", false).await.unwrap();
        assert!(!reg.is_enabled("echo").await);

        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        };
        let result = reg
            .execute("echo", serde_json::json!({"message": "hello"}), &ctx)
            .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_definitions() {
        let reg = ToolRegistry::new();
        reg.register(Arc::new(EchoTool)).await;

        let defs = reg.definitions().await;
        assert_eq!(defs.len(), 1);
        assert_eq!(defs[0].name, "echo");
    }

    #[tokio::test]
    async fn test_with_defaults() {
        let reg = ToolRegistry::with_defaults().await;
        let names = reg.tool_names().await;
        assert!(names.contains(&"shell_exec".to_string()));
        assert!(names.contains(&"file_read".to_string()));
        assert!(names.contains(&"file_write".to_string()));
        assert!(names.contains(&"apply_patch".to_string()));
    }
}
