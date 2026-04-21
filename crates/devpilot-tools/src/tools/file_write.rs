//! File write tool — create or overwrite files.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;

/// File write tool.
///
/// Creates a file with the given content, creating parent directories as needed.
pub struct FileWriteTool;

impl FileWriteTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for FileWriteTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Input parameters for file_write.
#[derive(Debug, Deserialize)]
struct FileWriteInput {
    /// File path to write.
    path: String,
    /// File content.
    content: String,
    /// Whether to create parent directories (default true).
    #[serde(default = "default_true")]
    create_dirs: bool,
}

fn default_true() -> bool {
    true
}

#[async_trait]
impl Tool for FileWriteTool {
    fn name(&self) -> &str {
        "file_write"
    }

    fn description(&self) -> &str {
        "Write content to a file. Creates the file and any parent directories if they don't exist. \
         Overwrites existing files. Use with caution — this is a write operation."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to write (absolute or relative to working dir)"
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file"
                },
                "create_dirs": {
                    "type": "boolean",
                    "description": "Create parent directories if they don't exist (default true)"
                }
            },
            "required": ["path", "content"]
        })
    }

    fn requires_approval(&self) -> bool {
        true // Write operation
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: FileWriteInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        // Resolve path
        let path = if Path::new(&params.path).is_absolute() {
            params.path.clone()
        } else {
            format!("{}/{}", ctx.working_dir.trim_end_matches('/'), params.path)
        };

        let file_path = Path::new(&path);

        // Create parent directories if needed
        if params.create_dirs
            && let Some(parent) = file_path.parent()
            && !parent.exists()
        {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| ToolError::ExecutionFailed {
                    tool: self.name().to_string(),
                    message: format!("Failed to create directories: {e}"),
                })?;
        }

        // Write the file
        let bytes = params.content.len();
        tokio::fs::write(&path, &params.content)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("Failed to write file: {e}"),
            })?;

        let mut out = ToolOutput::ok(format!("Wrote {bytes} bytes to {path}"));
        out = out.with_metadata(serde_json::json!({
            "path": path,
            "bytes_written": bytes,
        }));

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_write_new_file() {
        let tool = FileWriteTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(
                serde_json::json!({
                    "path": "/tmp/devpilot_test_write.txt",
                    "content": "hello world"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("11 bytes"));

        // Verify content
        let content = tokio::fs::read_to_string("/tmp/devpilot_test_write.txt")
            .await
            .unwrap();
        assert_eq!(content, "hello world");

        let _ = tokio::fs::remove_file("/tmp/devpilot_test_write.txt").await;
    }

    #[tokio::test]
    async fn test_write_with_nested_dirs() {
        let tool = FileWriteTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        let result = tool
            .execute(
                serde_json::json!({
                    "path": "/tmp/devpilot_test_nested/a/b/c.txt",
                    "content": "deep"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);

        let content = tokio::fs::read_to_string("/tmp/devpilot_test_nested/a/b/c.txt")
            .await
            .unwrap();
        assert_eq!(content, "deep");

        let _ = tokio::fs::remove_dir_all("/tmp/devpilot_test_nested").await;
    }

    #[tokio::test]
    async fn test_overwrite_existing() {
        let tool = FileWriteTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        };

        // Write initial content
        tokio::fs::write("/tmp/devpilot_test_overwrite.txt", "old content")
            .await
            .unwrap();

        // Overwrite
        let result = tool
            .execute(
                serde_json::json!({
                    "path": "/tmp/devpilot_test_overwrite.txt",
                    "content": "new content"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);

        let content = tokio::fs::read_to_string("/tmp/devpilot_test_overwrite.txt")
            .await
            .unwrap();
        assert_eq!(content, "new content");

        let _ = tokio::fs::remove_file("/tmp/devpilot_test_overwrite.txt").await;
    }
}
