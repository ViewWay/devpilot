//! Notebook edit tool — edit Jupyter notebook (.ipynb) files.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use std::path::Path;

/// Notebook edit tool.
///
/// Supports reading, adding, replacing, deleting cells in Jupyter notebooks,
/// and clearing all cells.
pub struct NotebookEditTool;

impl NotebookEditTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for NotebookEditTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Create an empty notebook JSON structure.
fn empty_notebook() -> serde_json::Value {
    serde_json::json!({
        "cells": [],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3"
            },
            "language_info": {
                "name": "python",
                "version": "3.10.0"
            }
        },
        "nbformat": 4,
        "nbformat_minor": 5
    })
}

/// Create a new cell with the given type and source.
fn make_cell(cell_type: &str, source: &str) -> serde_json::Value {
    let source_lines: Vec<String> = source
        .lines()
        .enumerate()
        .map(|(i, line)| {
            if i < source.lines().count() - 1 {
                format!("{line}\n")
            } else {
                line.to_string()
            }
        })
        .collect();

    let mut cell = serde_json::json!({
        "cell_type": cell_type,
        "metadata": {},
        "source": source_lines
    });

    if cell_type == "code" {
        cell["execution_count"] = serde_json::Value::Null;
        cell["outputs"] = serde_json::json!([]);
    }

    cell
}

/// Extract source text from a cell, handling both string and array forms.
fn cell_source_text(cell: &serde_json::Value) -> String {
    match cell.get("source") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(arr)) => arr
            .iter()
            .map(|v| v.as_str().unwrap_or(""))
            .collect::<String>(),
        _ => String::new(),
    }
}

#[async_trait]
impl Tool for NotebookEditTool {
    fn name(&self) -> &str {
        "notebook_edit"
    }

    fn description(&self) -> &str {
        "Edit Jupyter notebook (.ipynb) files. Add, replace, or delete cells. Read cell contents."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the .ipynb file (absolute or relative to working dir)"
                },
                "action": {
                    "type": "string",
                    "enum": ["read", "add_cell", "replace_cell", "delete_cell", "clear_all"],
                    "description": "Action to perform on the notebook"
                },
                "cell_index": {
                    "type": "integer",
                    "description": "Cell index for replace/delete (0-based)"
                },
                "cell_type": {
                    "type": "string",
                    "enum": ["code", "markdown"],
                    "description": "Cell type: 'code' or 'markdown' (default 'code')"
                },
                "source": {
                    "type": "string",
                    "description": "Cell content for add_cell or replace_cell"
                }
            },
            "required": ["path", "action"]
        })
    }

    fn requires_approval(&self) -> bool {
        true
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        // Extract parameters
        let path_val =
            input
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or_else(|| ToolError::InvalidInput {
                    tool: self.name().to_string(),
                    message: "missing required field 'path'".into(),
                })?;

        let action = input
            .get("action")
            .and_then(|v| v.as_str())
            .ok_or_else(|| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: "missing required field 'action'".into(),
            })?;

        let cell_type = input
            .get("cell_type")
            .and_then(|v| v.as_str())
            .unwrap_or("code");

        let source = input.get("source").and_then(|v| v.as_str()).unwrap_or("");

        // Validate cell_type
        if !matches!(cell_type, "code" | "markdown") {
            return Err(ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: format!("invalid cell_type '{cell_type}', must be 'code' or 'markdown'"),
            });
        }

        // Resolve path
        let path = if Path::new(path_val).is_absolute() {
            path_val.to_string()
        } else {
            format!("{}/{}", ctx.working_dir.trim_end_matches('/'), path_val)
        };

        match action {
            "read" => self.read_notebook(&path).await,
            "add_cell" => self.add_cell(&path, cell_type, source).await,
            "replace_cell" => {
                let idx = input
                    .get("cell_index")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| ToolError::InvalidInput {
                        tool: self.name().to_string(),
                        message: "missing required field 'cell_index' for replace_cell".into(),
                    })? as usize;
                self.replace_cell(&path, idx, cell_type, source).await
            }
            "delete_cell" => {
                let idx = input
                    .get("cell_index")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| ToolError::InvalidInput {
                        tool: self.name().to_string(),
                        message: "missing required field 'cell_index' for delete_cell".into(),
                    })? as usize;
                self.delete_cell(&path, idx).await
            }
            "clear_all" => self.clear_all(&path).await,
            _ => Err(ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: format!(
                    "unknown action '{action}', must be read/add_cell/replace_cell/delete_cell/clear_all"
                ),
            }),
        }
    }
}

impl NotebookEditTool {
    /// Read all cells from a notebook.
    async fn read_notebook(&self, path: &str) -> ToolResult<ToolOutput> {
        let content =
            tokio::fs::read_to_string(path)
                .await
                .map_err(|e| ToolError::ExecutionFailed {
                    tool: self.name().to_string(),
                    message: format!("failed to read notebook '{path}': {e}"),
                })?;

        let nb: serde_json::Value =
            serde_json::from_str(&content).map_err(|e| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("invalid notebook JSON in '{path}': {e}"),
            })?;

        let cells = nb.get("cells").and_then(|c| c.as_array()).ok_or_else(|| {
            ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("notebook '{path}' has no 'cells' array"),
            }
        })?;

        let mut output = String::new();
        output.push_str(&format!("Notebook: {path}\n"));
        output.push_str(&format!("{} cells\n\n", cells.len()));

        for (i, cell) in cells.iter().enumerate() {
            let ct = cell
                .get("cell_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let source = cell_source_text(cell);
            output.push_str(&format!("--- Cell {} [{ct}] ---\n{source}\n\n", i));
        }

        Ok(ToolOutput::ok(output))
    }

    /// Add a cell to the end of the notebook.
    async fn add_cell(&self, path: &str, cell_type: &str, source: &str) -> ToolResult<ToolOutput> {
        let mut nb = self.load_or_create(path).await?;
        let cells = nb
            .get_mut("cells")
            .and_then(|c| c.as_array_mut())
            .ok_or_else(|| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: "notebook has no 'cells' array".into(),
            })?;

        let new_cell = make_cell(cell_type, source);
        let idx = cells.len();
        cells.push(new_cell);

        self.save(path, &nb).await?;

        Ok(ToolOutput::ok(format!(
            "Added cell {idx} ({cell_type}) to {path}"
        )))
    }

    /// Replace a cell at the given index.
    async fn replace_cell(
        &self,
        path: &str,
        idx: usize,
        cell_type: &str,
        source: &str,
    ) -> ToolResult<ToolOutput> {
        let mut nb = self.load_or_create(path).await?;
        let cells = nb
            .get_mut("cells")
            .and_then(|c| c.as_array_mut())
            .ok_or_else(|| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: "notebook has no 'cells' array".into(),
            })?;

        if idx >= cells.len() {
            return Err(ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!(
                    "cell_index {idx} out of range (notebook has {} cells)",
                    cells.len()
                ),
            });
        }

        let new_cell = make_cell(cell_type, source);
        cells[idx] = new_cell;

        self.save(path, &nb).await?;

        Ok(ToolOutput::ok(format!(
            "Replaced cell {idx} ({cell_type}) in {path}"
        )))
    }

    /// Delete a cell at the given index.
    async fn delete_cell(&self, path: &str, idx: usize) -> ToolResult<ToolOutput> {
        let mut nb = self.load_or_create(path).await?;
        let cells = nb
            .get_mut("cells")
            .and_then(|c| c.as_array_mut())
            .ok_or_else(|| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: "notebook has no 'cells' array".into(),
            })?;

        if idx >= cells.len() {
            return Err(ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!(
                    "cell_index {idx} out of range (notebook has {} cells)",
                    cells.len()
                ),
            });
        }

        cells.remove(idx);
        let remaining = cells.len();
        let _ = cells;
        self.save(path, &nb).await?;

        Ok(ToolOutput::ok(format!(
            "Deleted cell {idx} from {path} ({remaining} cells remaining)"
        )))
    }

    /// Clear all cells from the notebook.
    async fn clear_all(&self, path: &str) -> ToolResult<ToolOutput> {
        let mut nb = self.load_or_create(path).await?;
        let cells = nb
            .get_mut("cells")
            .and_then(|c| c.as_array_mut())
            .ok_or_else(|| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: "notebook has no 'cells' array".into(),
            })?;

        let count = cells.len();
        cells.clear();
        self.save(path, &nb).await?;

        Ok(ToolOutput::ok(format!("Cleared {count} cells from {path}")))
    }

    /// Load a notebook from disk, or create an empty one if it doesn't exist.
    async fn load_or_create(&self, path: &str) -> ToolResult<serde_json::Value> {
        if Path::new(path).exists() {
            let content =
                tokio::fs::read_to_string(path)
                    .await
                    .map_err(|e| ToolError::ExecutionFailed {
                        tool: self.name().to_string(),
                        message: format!("failed to read notebook '{path}': {e}"),
                    })?;
            serde_json::from_str(&content).map_err(|e| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("invalid notebook JSON in '{path}': {e}"),
            })
        } else {
            // Create parent directories if needed
            if let Some(parent) = Path::new(path).parent()
                && !parent.exists()
            {
                tokio::fs::create_dir_all(parent).await.map_err(|e| {
                    ToolError::ExecutionFailed {
                        tool: self.name().to_string(),
                        message: format!("failed to create directories: {e}"),
                    }
                })?;
            }
            Ok(empty_notebook())
        }
    }

    /// Save a notebook to disk.
    async fn save(&self, path: &str, nb: &serde_json::Value) -> ToolResult<()> {
        let content = serde_json::to_string_pretty(nb).map_err(|e| ToolError::ExecutionFailed {
            tool: self.name().to_string(),
            message: format!("failed to serialize notebook: {e}"),
        })?;

        tokio::fs::write(path, content)
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: self.name().to_string(),
                message: format!("failed to write notebook '{path}': {e}"),
            })?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_ctx(tmp: &std::path::Path) -> ToolContext {
        ToolContext {
            working_dir: tmp.to_string_lossy().to_string(),
            session_id: "test".into(),
            env_vars: vec![],
        }
    }

    fn notebook_path(tmp: &std::path::Path) -> PathBuf {
        tmp.join("test.ipynb")
    }

    /// Create a minimal notebook on disk for tests that need an existing file.
    async fn create_test_notebook(path: &Path) {
        let nb = serde_json::json!({
            "cells": [
                {
                    "cell_type": "code",
                    "source": ["print('hello')\n"],
                    "metadata": {},
                    "execution_count": null,
                    "outputs": []
                },
                {
                    "cell_type": "markdown",
                    "source": ["# Title\n"],
                    "metadata": {}
                }
            ],
            "metadata": {},
            "nbformat": 4,
            "nbformat_minor": 5
        });
        tokio::fs::write(path, serde_json::to_string_pretty(&nb).unwrap())
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_read_notebook() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        create_test_notebook(&path).await;

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());
        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "read"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("2 cells"));
        assert!(result.content.contains("Cell 0 [code]"));
        assert!(result.content.contains("print('hello')"));
        assert!(result.content.contains("Cell 1 [markdown]"));
        assert!(result.content.contains("# Title"));
    }

    #[tokio::test]
    async fn test_add_cell_new_notebook() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        // Add to non-existent file should create it
        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "add_cell",
                    "cell_type": "code",
                    "source": "x = 42"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Added cell 0"));
        assert!(path.exists());

        // Verify the content
        let nb: serde_json::Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.unwrap()).unwrap();
        let cells = nb["cells"].as_array().unwrap();
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0]["cell_type"], "code");
        assert_eq!(nb["nbformat"], 4);
    }

    #[tokio::test]
    async fn test_add_multiple_cells() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        // Add code cell
        tool.execute(
            serde_json::json!({
                "path": path.to_str().unwrap(),
                "action": "add_cell",
                "cell_type": "code",
                "source": "import os"
            }),
            &ctx,
        )
        .await
        .unwrap();

        // Add markdown cell
        tool.execute(
            serde_json::json!({
                "path": path.to_str().unwrap(),
                "action": "add_cell",
                "cell_type": "markdown",
                "source": "# Heading"
            }),
            &ctx,
        )
        .await
        .unwrap();

        let nb: serde_json::Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.unwrap()).unwrap();
        let cells = nb["cells"].as_array().unwrap();
        assert_eq!(cells.len(), 2);
        assert_eq!(cells[0]["cell_type"], "code");
        assert_eq!(cells[1]["cell_type"], "markdown");
    }

    #[tokio::test]
    async fn test_replace_cell() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        create_test_notebook(&path).await;

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "replace_cell",
                    "cell_index": 0,
                    "cell_type": "markdown",
                    "source": "# New Title"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Replaced cell 0"));

        let nb: serde_json::Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.unwrap()).unwrap();
        let cells = nb["cells"].as_array().unwrap();
        assert_eq!(cells[0]["cell_type"], "markdown");
        let src = cell_source_text(&cells[0]);
        assert_eq!(src, "# New Title");
    }

    #[tokio::test]
    async fn test_replace_cell_out_of_range() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        create_test_notebook(&path).await;

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "replace_cell",
                    "cell_index": 99,
                    "source": "nope"
                }),
                &ctx,
            )
            .await;

        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("out of range"));
    }

    #[tokio::test]
    async fn test_delete_cell() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        create_test_notebook(&path).await;

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "delete_cell",
                    "cell_index": 0
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Deleted cell 0"));
        assert!(result.content.contains("1 cells remaining"));

        let nb: serde_json::Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.unwrap()).unwrap();
        let cells = nb["cells"].as_array().unwrap();
        assert_eq!(cells.len(), 1);
        assert_eq!(cells[0]["cell_type"], "markdown");
    }

    #[tokio::test]
    async fn test_delete_cell_out_of_range() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        create_test_notebook(&path).await;

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "delete_cell",
                    "cell_index": 5
                }),
                &ctx,
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_clear_all() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());
        create_test_notebook(&path).await;

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "clear_all"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("Cleared 2 cells"));

        let nb: serde_json::Value =
            serde_json::from_str(&tokio::fs::read_to_string(&path).await.unwrap()).unwrap();
        let cells = nb["cells"].as_array().unwrap();
        assert!(cells.is_empty());
    }

    #[tokio::test]
    async fn test_read_nonexistent_file() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": "/tmp/no_such_notebook_xyz.ipynb",
                    "action": "read"
                }),
                &ctx,
            )
            .await;

        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_relative_path_resolution() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        // Use relative path
        let result = tool
            .execute(
                serde_json::json!({
                    "path": "relative_test.ipynb",
                    "action": "add_cell",
                    "cell_type": "code",
                    "source": "print('relative')"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);

        let full_path = tmp.path().join("relative_test.ipynb");
        assert!(full_path.exists());

        let nb: serde_json::Value =
            serde_json::from_str(&tokio::fs::read_to_string(&full_path).await.unwrap()).unwrap();
        assert_eq!(nb["cells"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn test_invalid_action() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": "test.ipynb",
                    "action": "explode"
                }),
                &ctx,
            )
            .await;

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("unknown action"));
    }

    #[tokio::test]
    async fn test_invalid_cell_type() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let result = tool
            .execute(
                serde_json::json!({
                    "path": "test.ipynb",
                    "action": "add_cell",
                    "cell_type": "raw"
                }),
                &ctx,
            )
            .await;

        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("invalid cell_type")
        );
    }

    #[tokio::test]
    async fn test_multiline_source() {
        let tmp = tempfile::tempdir().unwrap();
        let path = notebook_path(tmp.path());

        let tool = NotebookEditTool::new();
        let ctx = test_ctx(tmp.path());

        let source = "line one\nline two\nline three";
        tool.execute(
            serde_json::json!({
                "path": path.to_str().unwrap(),
                "action": "add_cell",
                "cell_type": "code",
                "source": source
            }),
            &ctx,
        )
        .await
        .unwrap();

        // Read back and verify
        let result = tool
            .execute(
                serde_json::json!({
                    "path": path.to_str().unwrap(),
                    "action": "read"
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(result.content.contains("line one"));
        assert!(result.content.contains("line two"));
        assert!(result.content.contains("line three"));
    }

    #[tokio::test]
    async fn test_requires_approval() {
        let tool = NotebookEditTool::new();
        assert!(tool.requires_approval());
    }
}
