//! File read tool — read file contents with line numbers and pagination.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;

/// File read tool.
///
/// Reads file contents with optional offset and limit for pagination.
/// Output includes line numbers in `LINE_NUM|CONTENT` format.
pub struct FileReadTool {
    /// Maximum file size to read (bytes).
    max_file_size: u64,
}

impl FileReadTool {
    pub fn new() -> Self {
        Self {
            max_file_size: 2 * 1024 * 1024, // 2 MB
        }
    }
}

impl Default for FileReadTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Input parameters for file_read.
#[derive(Debug, Deserialize)]
struct FileReadInput {
    /// File path to read.
    path: String,
    /// Starting line number (1-indexed, default 1).
    #[serde(default = "default_offset")]
    offset: usize,
    /// Maximum number of lines to read (default 500).
    #[serde(default = "default_limit")]
    limit: usize,
}

fn default_offset() -> usize {
    1
}

fn default_limit() -> usize {
    500
}

#[async_trait]
impl Tool for FileReadTool {
    fn name(&self) -> &str {
        "file_read"
    }

    fn description(&self) -> &str {
        "Read file contents with line numbers. \
         Use 'offset' (1-indexed) and 'limit' for pagination. \
         Default: offset=1, limit=500. Max file size: 2MB."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative file path to read"
                },
                "offset": {
                    "type": "integer",
                    "description": "Starting line number (1-indexed, default 1)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of lines to return (default 500)"
                }
            },
            "required": ["path"]
        })
    }

    fn requires_approval(&self) -> bool {
        false // Read-only operation
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: FileReadInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        // Resolve path relative to working directory if not absolute
        let path = if Path::new(&params.path).is_absolute() {
            params.path.clone()
        } else {
            format!("{}/{}", ctx.working_dir.trim_end_matches('/'), params.path)
        };

        let file_path = Path::new(&path);

        if !file_path.exists() {
            return Ok(ToolOutput::err(format!("File not found: {path}")));
        }

        if !file_path.is_file() {
            return Ok(ToolOutput::err(format!("Not a file: {path}")));
        }

        // Check file size
        let metadata = tokio::fs::metadata(&path).await.map_err(ToolError::Io)?;
        if metadata.len() > self.max_file_size {
            return Ok(ToolOutput::err(format!(
                "File too large: {} bytes (max {} bytes). Use offset/limit to read in chunks.",
                metadata.len(),
                self.max_file_size
            )));
        }

        // Read file
        let content =
            tokio::fs::read_to_string(&path)
                .await
                .map_err(|e| ToolError::ExecutionFailed {
                    tool: self.name().to_string(),
                    message: format!("Failed to read file: {e}"),
                })?;

        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();

        // Apply offset and limit (1-indexed offset)
        let start = if params.offset > 0 {
            params.offset - 1
        } else {
            0
        };
        let end = std::cmp::min(start + params.limit, total_lines);

        if start >= total_lines {
            return Ok(ToolOutput::ok(format!(
                "File has {total_lines} lines. Offset {offset} is beyond end of file.",
                offset = params.offset
            )));
        }

        let mut output = String::new();
        for (i, line) in lines[start..end].iter().enumerate() {
            output.push_str(&format!("{}|{}\n", start + i + 1, line));
        }

        if end < total_lines {
            output.push_str(&format!(
                "\n[showing lines {}-{} of {total_lines}]",
                start + 1,
                end
            ));
        }

        let mut out = ToolOutput::ok(output);
        out = out.with_metadata(serde_json::json!({
            "path": path,
            "total_lines": total_lines,
            "shown_lines": format!("{}-{}", start + 1, end),
            "file_size": metadata.len(),
        }));

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_path() -> String {
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("/tmp/devpilot_read_test_{id}.txt")
    }

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        }
    }

    #[tokio::test]
    async fn test_read_existing_file() {
        let path = unique_path();
        tokio::fs::write(&path, "line1\nline2\nline3\n")
            .await
            .unwrap();

        let tool = FileReadTool::new();
        let result = tool
            .execute(serde_json::json!({"path": &path}), &ctx())
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("1|line1"));
        assert!(result.content.contains("2|line2"));
        assert!(result.content.contains("3|line3"));

        let _ = tokio::fs::remove_file(&path).await;
    }

    #[tokio::test]
    async fn test_read_with_offset_limit() {
        let path = unique_path();
        tokio::fs::write(&path, "a\nb\nc\nd\ne\n").await.unwrap();

        let tool = FileReadTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "path": &path,
                    "offset": 2,
                    "limit": 2
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("2|b"));
        assert!(result.content.contains("3|c"));
        assert!(!result.content.contains("1|a"));
        assert!(!result.content.contains("4|d"));

        let _ = tokio::fs::remove_file(&path).await;
    }

    #[tokio::test]
    async fn test_read_nonexistent() {
        let tool = FileReadTool::new();
        let result = tool
            .execute(
                serde_json::json!({"path": "/tmp/nonexistent_xyz_abc.txt"}),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
    }
}
