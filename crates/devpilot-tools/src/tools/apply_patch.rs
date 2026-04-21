//! Apply patch tool — find-and-replace edits on files.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;

/// Apply patch tool.
///
/// Performs fuzzy find-and-replace edits on files. Unlike file_write which
/// overwrites the entire file, this tool makes targeted replacements.
pub struct ApplyPatchTool;

impl ApplyPatchTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for ApplyPatchTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Input parameters for apply_patch.
#[derive(Debug, Deserialize)]
struct ApplyPatchInput {
    /// File path to edit.
    path: String,
    /// Text to find (must be unique in the file).
    old_string: String,
    /// Replacement text.
    new_string: String,
    /// Replace all occurrences instead of requiring uniqueness.
    #[serde(default)]
    replace_all: bool,
}

#[async_trait]
impl Tool for ApplyPatchTool {
    fn name(&self) -> &str {
        "apply_patch"
    }

    fn description(&self) -> &str {
        "Apply a find-and-replace edit to a file. \
         'old_string' must exactly match (including whitespace/indentation). \
         By default, old_string must be unique in the file. \
         Set 'replace_all: true' to replace all occurrences."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path to edit"
                },
                "old_string": {
                    "type": "string",
                    "description": "Text to find in the file (must match exactly)"
                },
                "new_string": {
                    "type": "string",
                    "description": "Replacement text"
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "Replace all occurrences instead of requiring unique match (default false)"
                }
            },
            "required": ["path", "old_string", "new_string"]
        })
    }

    fn requires_approval(&self) -> bool {
        true // Write operation
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: ApplyPatchInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        // Resolve path
        let path = if std::path::Path::new(&params.path).is_absolute() {
            params.path.clone()
        } else {
            format!("{}/{}", ctx.working_dir.trim_end_matches('/'), params.path)
        };

        let file_path = std::path::Path::new(&path);

        if !file_path.exists() {
            return Ok(ToolOutput::err(format!("File not found: {path}")));
        }

        if !file_path.is_file() {
            return Ok(ToolOutput::err(format!("Not a file: {path}")));
        }

        // Read current content
        let content =
            tokio::fs::read_to_string(&path)
                .await
                .map_err(|e| ToolError::ExecutionFailed {
                    tool: self.name().to_string(),
                    message: format!("Failed to read file: {e}"),
                })?;

        // Check that old_string exists
        let match_count = content.matches(&params.old_string).count();
        if match_count == 0 {
            return Ok(ToolOutput::err(format!(
                "old_string not found in {path}. \
                 Make sure the text matches exactly, including whitespace and indentation."
            )));
        }

        // Validate uniqueness unless replace_all
        if !params.replace_all && match_count > 1 {
            return Ok(ToolOutput::err(format!(
                "old_string found {match_count} times in {path}. \
                 Either use a more specific string or set replace_all: true."
            )));
        }

        // Apply replacement
        let new_content = if params.replace_all {
            content.replace(&params.old_string, &params.new_string)
        } else {
            content.replacen(&params.old_string, &params.new_string, 1)
        };

        // Write back
        tokio::fs::write(&path, &new_content)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("Failed to write file: {e}"),
            })?;

        let replacements = if params.replace_all { match_count } else { 1 };

        let mut out = ToolOutput::ok(format!("Applied {replacements} replacement(s) in {path}"));
        out = out.with_metadata(serde_json::json!({
            "path": path,
            "replacements": replacements,
        }));

        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static TEST_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_path() -> String {
        let id = TEST_COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("/tmp/devpilot_patch_test_{id}.txt")
    }

    async fn setup_test_file(content: &str) -> String {
        let path = unique_path();
        tokio::fs::write(&path, content).await.unwrap();
        path
    }

    async fn cleanup(path: &str) {
        let _ = tokio::fs::remove_file(path).await;
    }

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
            env_vars: vec![],
        }
    }

    #[tokio::test]
    async fn test_single_replacement() {
        let path = setup_test_file("fn main() {\n    println!(\"hello\");\n}\n").await;
        let tool = ApplyPatchTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "path": &path,
                    "old_string": "println!(\"hello\")",
                    "new_string": "println!(\"world\")"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error, "error: {}", result.content);
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert!(content.contains("world"));
        assert!(!content.contains("hello"));

        cleanup(&path).await;
    }

    #[tokio::test]
    async fn test_ambiguous_match() {
        let path = setup_test_file("foo bar foo bar").await;
        let tool = ApplyPatchTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "path": &path,
                    "old_string": "foo",
                    "new_string": "baz"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error, "should be error: {}", result.content);
        assert!(
            result.content.contains("2 times"),
            "content: {}",
            result.content
        );

        cleanup(&path).await;
    }

    #[tokio::test]
    async fn test_replace_all() {
        let path = setup_test_file("foo bar foo bar").await;
        let tool = ApplyPatchTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "path": &path,
                    "old_string": "foo",
                    "new_string": "baz",
                    "replace_all": true
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error, "error: {}", result.content);
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert_eq!(content, "baz bar baz bar");

        cleanup(&path).await;
    }

    #[tokio::test]
    async fn test_not_found() {
        let path = setup_test_file("hello world").await;
        let tool = ApplyPatchTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "path": &path,
                    "old_string": "nonexistent",
                    "new_string": "replacement"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("not found"));

        cleanup(&path).await;
    }

    #[tokio::test]
    async fn test_delete_text() {
        let path = setup_test_file("before target after").await;
        let tool = ApplyPatchTool::new();

        let result = tool
            .execute(
                serde_json::json!({
                    "path": &path,
                    "old_string": "target ",
                    "new_string": ""
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error, "error: {}", result.content);
        let content = tokio::fs::read_to_string(&path).await.unwrap();
        assert_eq!(content, "before after");

        cleanup(&path).await;
    }
}
