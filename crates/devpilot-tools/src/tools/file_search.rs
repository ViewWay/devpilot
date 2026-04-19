//! File search tool — search files by name (fuzzy) or content (regex).
//!
//! Wraps `devpilot_search::SearchEngine` as a `Tool` implementation
//! so the LLM agent can search the workspace.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use devpilot_search::{SearchEngine, SearchMode, SearchQuery};

/// Tool for searching files in the workspace.
///
/// Supports two modes:
/// - **files**: Fuzzy filename matching (like fzf/fd)
/// - **content**: Regex content search (like grep/ripgrep)
pub struct FileSearchTool;

impl FileSearchTool {
    /// Create a new file search tool.
    pub fn new() -> Self {
        Self
    }
}

impl Default for FileSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for FileSearchTool {
    fn name(&self) -> &str {
        "file_search"
    }

    fn description(&self) -> &str {
        "Search files by name (fuzzy matching) or by content (regex pattern). \
         Use mode 'files' to find files by name, or 'content' to search within file contents. \
         Returns matching file paths and, for content mode, the matching lines."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Search pattern: fuzzy pattern for 'files' mode, regex for 'content' mode"
                },
                "mode": {
                    "type": "string",
                    "enum": ["files", "content"],
                    "description": "Search mode: 'files' for filename matching, 'content' for content search (default: 'files')"
                },
                "path": {
                    "type": "string",
                    "description": "Root directory to search in (defaults to working directory)"
                },
                "file_glob": {
                    "type": "string",
                    "description": "Optional file glob filter (e.g. '*.rs', '*.ts')"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results (default: 50, max: 200)",
                    "default": 50
                }
            },
            "required": ["pattern"]
        })
    }

    fn requires_approval(&self) -> bool {
        // Read-only operation — no approval needed
        false
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let pattern = input["pattern"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput {
                tool: "file_search".into(),
                message: "missing or invalid 'pattern' field".into(),
            })?;

        let mode_str = input["mode"].as_str().unwrap_or("files");
        let mode = match mode_str {
            "content" => SearchMode::Content,
            _ => SearchMode::Files,
        };

        let search_path = input["path"]
            .as_str()
            .unwrap_or(&ctx.working_dir)
            .to_string();

        let file_glob = input["file_glob"].as_str().map(|s| s.to_string());

        let max_results = input["max_results"]
            .as_u64()
            .unwrap_or(50)
            .min(200) as usize;

        let query = SearchQuery {
            pattern: pattern.to_string(),
            path: search_path.clone(),
            mode,
            max_results,
            file_glob,
        };

        let engine = SearchEngine::new();
        let results = engine.search(query).await.map_err(|e| {
            ToolError::Other(format!("Search failed: {e}"))
        })?;

        if results.is_empty() {
            return Ok(ToolOutput::ok(format!(
                "No results found for '{}' in {}",
                pattern, search_path
            )));
        }

        // Format results for the LLM
        let mut output_parts: Vec<String> = Vec::new();
        output_parts.push(format!("Found {} results:\n", results.len()));

        for m in &results {
            match mode {
                SearchMode::Files => {
                    let score_str = m
                        .score
                        .map(|s| format!(" (score: {:.2})", s))
                        .unwrap_or_default();
                    output_parts.push(format!("  {}{}", m.path, score_str));
                }
                SearchMode::Content => {
                    let line_str = m
                        .line_number
                        .map(|n| format!(":{n}"))
                        .unwrap_or_default();
                    let text_str = m
                        .line_text
                        .as_ref()
                        .map(|t| format!(": {}", t.trim()))
                        .unwrap_or_default();
                    output_parts.push(format!("  {}{}{}", m.path, line_str, text_str));
                }
            }
        }

        Ok(ToolOutput::ok(output_parts.join("\n")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_ctx() -> ToolContext {
        ToolContext {
            working_dir: std::env::current_dir()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            session_id: "test".to_string(),
        }
    }

    #[tokio::test]
    async fn test_file_search_schema() {
        let tool = FileSearchTool::new();
        let schema = tool.input_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["pattern"].is_object());
    }

    #[tokio::test]
    async fn test_file_search_fuzzy() {
        let tool = FileSearchTool::new();
        let ctx = ToolContext {
            working_dir: std::env::current_dir()
                .unwrap()
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            session_id: "test".to_string(),
        };

        let input = serde_json::json!({
            "pattern": "lib",
            "mode": "files",
            "file_glob": "*.rs",
            "max_results": 5
        });

        let result = tool.execute(input, &ctx).await.unwrap();
        assert!(!result.is_error);
        assert!(result.content.contains("Found"));
    }

    #[tokio::test]
    async fn test_file_search_content() {
        let tool = FileSearchTool::new();
        let ctx = ToolContext {
            working_dir: std::env::current_dir()
                .unwrap()
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            session_id: "test".to_string(),
        };

        let input = serde_json::json!({
            "pattern": "pub fn",
            "mode": "content",
            "file_glob": "*.rs",
            "max_results": 5
        });

        let result = tool.execute(input, &ctx).await.unwrap();
        assert!(!result.is_error);
        assert!(result.content.contains("Found"));
    }

    #[tokio::test]
    async fn test_file_search_missing_pattern() {
        let tool = FileSearchTool::new();
        let ctx = test_ctx();

        let input = serde_json::json!({
            "mode": "files"
        });

        let result = tool.execute(input, &ctx).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_file_search_no_results() {
        let tool = FileSearchTool::new();
        let ctx = test_ctx();

        let input = serde_json::json!({
            "pattern": "zzzznonexistentfilexyz",
            "mode": "files"
        });

        let result = tool.execute(input, &ctx).await.unwrap();
        assert!(!result.is_error);
        assert!(result.content.contains("No results"));
    }

    #[test]
    fn test_does_not_require_approval() {
        let tool = FileSearchTool::new();
        assert!(!tool.requires_approval());
    }
}
