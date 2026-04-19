//! Glob tool — find files by pattern matching.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::Deserialize;
use std::path::{Path, PathBuf};

/// Glob tool.
///
/// Finds files and directories matching a glob pattern.
/// Supports standard glob patterns: `*`, `**`, `?`, `[...]`.
pub struct GlobTool {
    /// Maximum number of results to return.
    max_results: usize,
}

impl GlobTool {
    pub fn new() -> Self {
        Self { max_results: 1000 }
    }
}

impl Default for GlobTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Input parameters for glob.
#[derive(Debug, Deserialize)]
struct GlobInput {
    /// Glob pattern to match (e.g. "**/*.rs", "src/**/*.tsx").
    pattern: String,
    /// Base directory to search from (default: working directory).
    #[serde(default)]
    path: Option<String>,
    /// Whether to include file type info (default true).
    #[serde(default = "default_true")]
    include_types: bool,
    /// Maximum number of results (default 1000).
    #[serde(default = "default_max")]
    max_results: Option<usize>,
}

fn default_true() -> bool {
    true
}

fn default_max() -> Option<usize> {
    None
}

#[async_trait]
impl Tool for GlobTool {
    fn name(&self) -> &str {
        "glob"
    }

    fn description(&self) -> &str {
        "Find files and directories matching a glob pattern. \
         Supports *, **, ?, and [...] patterns. \
         Examples: '**/*.rs', 'src/**/*.tsx', '*.json'. \
         Returns matched paths with file sizes."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to match (e.g. '**/*.rs', 'src/**/*.tsx')"
                },
                "path": {
                    "type": "string",
                    "description": "Base directory to search from (default: working directory)"
                },
                "include_types": {
                    "type": "boolean",
                    "description": "Whether to include file type info (default: true)"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 1000)"
                }
            },
            "required": ["pattern"]
        })
    }

    fn requires_approval(&self) -> bool {
        false // Read-only operation
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: GlobInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        // Determine base path
        let base = match &params.path {
            Some(p) if Path::new(p).is_absolute() => PathBuf::from(p),
            Some(p) => PathBuf::from(format!("{}/{}", ctx.working_dir.trim_end_matches('/'), p)),
            None => PathBuf::from(&ctx.working_dir),
        };

        if !base.exists() {
            return Ok(ToolOutput::err(format!(
                "Directory not found: {}",
                base.display()
            )));
        }

        if !base.is_dir() {
            return Ok(ToolOutput::err(format!(
                "Not a directory: {}",
                base.display()
            )));
        }

        let max = params
            .max_results
            .unwrap_or(self.max_results)
            .min(self.max_results);

        // Build the full glob pattern
        let full_pattern = if params.pattern.starts_with('/') {
            params.pattern.clone()
        } else {
            format!(
                "{}/{}",
                base.display().to_string().trim_end_matches('/'),
                params.pattern
            )
        };

        // Use glob::glob for pattern matching
        let mut matches: Vec<PathBuf> = Vec::new();
        let glob_results = glob_entries(&full_pattern);

        for path in glob_results.into_iter().flatten() {
            matches.push(path);
            if matches.len() >= max {
                break;
            }
        }

        let total = matches.len();
        if total == 0 {
            return Ok(ToolOutput::ok(format!(
                "No files matching '{}' in {}",
                params.pattern,
                base.display()
            )));
        }

        let mut output = String::new();
        output.push_str(&format!(
            "Found {total} file(s) matching '{}':\n\n",
            params.pattern
        ));

        let base_str = base.display().to_string();
        for path in &matches {
            let relative = path
                .strip_prefix(&base_str)
                .unwrap_or(path)
                .display()
                .to_string();

            if params.include_types {
                let metadata = tokio::fs::metadata(path).await;
                match metadata {
                    Ok(meta) => {
                        if meta.is_dir() {
                            output.push_str(&format!("📁 {relative}/\n"));
                        } else {
                            output.push_str(&format!(
                                "📄 {relative} ({})\n",
                                format_size(meta.len())
                            ));
                        }
                    }
                    Err(_) => {
                        output.push_str(&format!("  {relative}\n"));
                    }
                }
            } else {
                output.push_str(&format!("{relative}\n"));
            }
        }

        if total >= max {
            output.push_str(&format!(
                "\n[Results limited to {max}. Use max_results to get more.]"
            ));
        }

        let mut out = ToolOutput::ok(output);
        out = out.with_metadata(serde_json::json!({
            "pattern": params.pattern,
            "base_path": base_str,
            "total_matches": total,
            "truncated": total >= max,
        }));

        Ok(out)
    }
}

/// Execute glob pattern matching.
fn glob_entries(pattern: &str) -> Vec<Result<PathBuf, glob::GlobError>> {
    match glob::glob(pattern) {
        Ok(paths) => paths.collect(),
        Err(e) => {
            tracing::warn!("Invalid glob pattern '{}': {}", pattern, e);
            Vec::new()
        }
    }
}

/// Format file size in human-readable form.
fn format_size(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = 1024 * KB;

    if bytes >= MB {
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
        format!("/tmp/devpilot_glob_test_{id}")
    }

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        }
    }

    #[tokio::test]
    async fn test_glob_rs_files() {
        let base = unique_path();
        tokio::fs::create_dir_all(format!("{base}/src"))
            .await
            .unwrap();
        tokio::fs::write(format!("{base}/src/main.rs"), "fn main() {}")
            .await
            .unwrap();
        tokio::fs::write(format!("{base}/src/lib.rs"), "pub fn lib() {}")
            .await
            .unwrap();
        tokio::fs::write(format!("{base}/README.md"), "# Test")
            .await
            .unwrap();

        let tool = GlobTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "pattern": "**/*.rs",
                    "path": &base
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("main.rs"));
        assert!(result.content.contains("lib.rs"));
        assert!(!result.content.contains("README.md"));

        let _ = tokio::fs::remove_dir_all(&base).await;
    }

    #[tokio::test]
    async fn test_glob_no_matches() {
        let base = unique_path();
        tokio::fs::create_dir_all(&base).await.unwrap();

        let tool = GlobTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "pattern": "*.nonexistent",
                    "path": &base
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("No files matching"));

        let _ = tokio::fs::remove_dir_all(&base).await;
    }

    #[tokio::test]
    async fn test_glob_nonexistent_base() {
        let tool = GlobTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "pattern": "*.rs",
                    "path": "/tmp/nonexistent_dir_xyz_glob"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("not found"));
    }

    #[tokio::test]
    async fn test_glob_relative_path() {
        let base = unique_path();
        let _base = format!(
            "/tmp/devpilot_glob_rel_{}",
            COUNTER.fetch_add(0, Ordering::Relaxed)
        );
        tokio::fs::create_dir_all(&base).await.unwrap();
        tokio::fs::write(format!("{base}/test.txt"), "hello")
            .await
            .unwrap();

        let tool = GlobTool::new();
        let ctx = ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test".into(),
        };

        // Use relative path from working_dir
        let base_name = Path::new(&base)
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let result = tool
            .execute(
                serde_json::json!({
                    "pattern": "*.txt",
                    "path": &base_name
                }),
                &ctx,
            )
            .await
            .unwrap();

        assert!(!result.is_error);

        let _ = tokio::fs::remove_dir_all(&base).await;
    }

    #[test]
    fn test_format_size() {
        assert_eq!(format_size(500), "500 B");
        assert_eq!(format_size(1024), "1.0 KB");
        assert_eq!(format_size(1024 * 1024), "1.0 MB");
    }
}
