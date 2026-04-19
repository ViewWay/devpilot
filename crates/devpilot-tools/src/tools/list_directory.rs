//! List directory tool — list directory contents with metadata.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::Path;

/// List directory tool.
///
/// Lists files and subdirectories in a given path, with optional
/// recursive listing and file metadata (size, modified time, type).
pub struct ListDirectoryTool {
    /// Maximum depth for recursive listing.
    max_depth: usize,
}

impl ListDirectoryTool {
    pub fn new() -> Self {
        Self { max_depth: 10 }
    }
}

impl Default for ListDirectoryTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Input parameters for list_directory.
#[derive(Debug, Deserialize)]
struct ListDirectoryInput {
    /// Directory path to list.
    path: String,
    /// Whether to list recursively (default false).
    #[serde(default)]
    recursive: bool,
    /// Maximum depth for recursive listing (default 3, max 10).
    #[serde(default = "default_depth")]
    max_depth: Option<usize>,
    /// Whether to show hidden files (default false).
    #[serde(default)]
    show_hidden: bool,
}

fn default_depth() -> Option<usize> {
    Some(3)
}

#[async_trait]
impl Tool for ListDirectoryTool {
    fn name(&self) -> &str {
        "list_directory"
    }

    fn description(&self) -> &str {
        "List files and directories in a path. \
         Returns entries with type (file/dir), size, and name. \
         Use 'recursive' to traverse subdirectories. \
         Set 'show_hidden' to include hidden files (dotfiles)."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute or relative directory path to list"
                },
                "recursive": {
                    "type": "boolean",
                    "description": "Whether to list subdirectories recursively (default: false)"
                },
                "max_depth": {
                    "type": "integer",
                    "description": "Maximum depth for recursive listing (default: 3, max: 10)"
                },
                "show_hidden": {
                    "type": "boolean",
                    "description": "Whether to show hidden files/dirs starting with '.' (default: false)"
                }
            },
            "required": ["path"]
        })
    }

    fn requires_approval(&self) -> bool {
        false // Read-only operation
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: ListDirectoryInput =
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

        let dir_path = Path::new(&path);

        if !dir_path.exists() {
            return Ok(ToolOutput::err(format!("Directory not found: {path}")));
        }

        if !dir_path.is_dir() {
            return Ok(ToolOutput::err(format!("Not a directory: {path}")));
        }

        let depth = params.max_depth.unwrap_or(3).min(self.max_depth);

        let mut output = String::new();
        let mut total_files: usize = 0;
        let mut total_dirs: usize = 0;

        list_dir_recursive(
            dir_path,
            &mut output,
            0,
            depth,
            params.recursive,
            params.show_hidden,
            &mut total_files,
            &mut total_dirs,
        )
        .await
        .map_err(|e| ToolError::ExecutionFailed {
            tool: self.name().to_string(),
            message: format!("Failed to list directory: {e}"),
        })?;

        // Add summary header
        let header =
            format!("Directory listing: {path}\n{total_dirs} directories, {total_files} files\n\n");
        output = header + &output;

        let mut out = ToolOutput::ok(output);
        out = out.with_metadata(serde_json::json!({
            "path": path,
            "total_files": total_files,
            "total_dirs": total_dirs,
            "recursive": params.recursive,
        }));

        Ok(out)
    }
}

/// Recursively list directory contents.
#[allow(clippy::too_many_arguments)]
async fn list_dir_recursive(
    dir: &Path,
    output: &mut String,
    current_depth: usize,
    max_depth: usize,
    recursive: bool,
    show_hidden: bool,
    total_files: &mut usize,
    total_dirs: &mut usize,
) -> std::io::Result<()> {
    if current_depth > max_depth {
        return Ok(());
    }

    let mut read_dir = tokio::fs::read_dir(dir).await?;
    let mut entries: Vec<(tokio::fs::DirEntry, bool)> = Vec::new();
    while let Some(entry) = read_dir.next_entry().await? {
        let is_dir = entry
            .file_type()
            .await
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        entries.push((entry, is_dir));
    }

    // Sort: directories first, then files, alphabetically
    entries.sort_by(|(a, a_dir), (b, b_dir)| match (a_dir, b_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a
            .file_name()
            .to_string_lossy()
            .cmp(&b.file_name().to_string_lossy()),
    });

    let indent = "  ".repeat(current_depth);
    let prefix = if current_depth == 0 {
        String::new()
    } else {
        format!("{indent}├── ")
    };

    for (entry, is_dir) in &entries {
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless requested
        if !show_hidden && name.starts_with('.') {
            continue;
        }

        let metadata = entry.metadata().await?;
        let size_str = if *is_dir {
            String::new()
        } else {
            format!(" ({})", format_size(metadata.len()))
        };

        let type_icon = if *is_dir { "📁" } else { "📄" };
        output.push_str(&format!("{prefix}{type_icon} {name}{size_str}\n"));

        if *is_dir {
            *total_dirs += 1;
            if recursive && current_depth < max_depth {
                Box::pin(list_dir_recursive(
                    &entry.path(),
                    output,
                    current_depth + 1,
                    max_depth,
                    recursive,
                    show_hidden,
                    total_files,
                    total_dirs,
                ))
                .await?;
            }
        } else {
            *total_files += 1;
        }
    }

    Ok(())
}

/// Format file size in human-readable form.
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;
    const GB: u64 = 1024 * MB;

    if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_path() -> String {
        let id = COUNTER.fetch_add(1, Ordering::Relaxed);
        format!("/tmp/devpilot_listdir_test_{id}")
    }

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        }
    }

    #[tokio::test]
    async fn test_list_existing_directory() {
        let base = unique_path();
        tokio::fs::create_dir_all(&base).await.unwrap();
        tokio::fs::write(format!("{base}/hello.txt"), "hi")
            .await
            .unwrap();
        tokio::fs::create_dir_all(format!("{base}/subdir"))
            .await
            .unwrap();

        let tool = ListDirectoryTool::new();
        let result = tool
            .execute(serde_json::json!({"path": &base}), &ctx())
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("subdir"));
        assert!(result.content.contains("hello.txt"));

        let _ = tokio::fs::remove_dir_all(&base).await;
    }

    #[tokio::test]
    async fn test_list_recursive() {
        let base = unique_path();
        tokio::fs::create_dir_all(format!("{base}/a/b"))
            .await
            .unwrap();
        tokio::fs::write(format!("{base}/a/b/deep.txt"), "deep")
            .await
            .unwrap();
        tokio::fs::write(format!("{base}/top.txt"), "top")
            .await
            .unwrap();

        let tool = ListDirectoryTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "path": &base,
                    "recursive": true,
                    "max_depth": 3
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("deep.txt"));
        assert!(result.content.contains("top.txt"));

        let _ = tokio::fs::remove_dir_all(&base).await;
    }

    #[tokio::test]
    async fn test_list_nonexistent() {
        let tool = ListDirectoryTool::new();
        let result = tool
            .execute(
                serde_json::json!({"path": "/tmp/nonexistent_dir_xyz_abc"}),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("not found"));
    }

    #[tokio::test]
    async fn test_list_file_instead_of_dir() {
        let base = unique_path();
        tokio::fs::write(&base, "not a dir").await.unwrap();

        let tool = ListDirectoryTool::new();
        let result = tool
            .execute(serde_json::json!({"path": &base}), &ctx())
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("Not a directory"));

        let _ = tokio::fs::remove_file(&base).await;
    }

    #[tokio::test]
    async fn test_hide_hidden_files() {
        let base = unique_path();
        tokio::fs::create_dir_all(&base).await.unwrap();
        tokio::fs::write(format!("{base}/.hidden"), "secret")
            .await
            .unwrap();
        tokio::fs::write(format!("{base}/visible.txt"), "hello")
            .await
            .unwrap();

        let tool = ListDirectoryTool::new();

        // Without show_hidden
        let result = tool
            .execute(
                serde_json::json!({"path": &base, "show_hidden": false}),
                &ctx(),
            )
            .await
            .unwrap();
        assert!(!result.is_error);
        assert!(!result.content.contains(".hidden"));
        assert!(result.content.contains("visible.txt"));

        // With show_hidden
        let result = tool
            .execute(
                serde_json::json!({"path": &base, "show_hidden": true}),
                &ctx(),
            )
            .await
            .unwrap();
        assert!(!result.is_error);
        assert!(result.content.contains(".hidden"));
        assert!(result.content.contains("visible.txt"));

        let _ = tokio::fs::remove_dir_all(&base).await;
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(500), "500 B");
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(1024 * 1024), "1.0 MB");
        assert_eq!(format_size(1024 * 1024 * 1024), "1.0 GB");
    }
}
