//! Web fetch tool — fetch and extract content from web URLs.
//!
//! Uses `reqwest` to fetch web pages and extracts text content.
//! Supports HTML-to-text conversion, JSON passthrough, and size limits.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;

/// Maximum response size (5 MB).
const MAX_RESPONSE_SIZE: usize = 5 * 1024 * 1024;

/// Tool for fetching and extracting web content.
///
/// Given a URL, fetches the page and returns the text content.
/// HTML is automatically converted to readable text. JSON responses
/// are returned as-is.
pub struct WebFetchTool {
    client: reqwest::Client,
}

impl WebFetchTool {
    /// Create a new web fetch tool with default HTTP client.
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("DevPilot/0.4.0 (AI Coding Agent)")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

impl Default for WebFetchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for WebFetchTool {
    fn name(&self) -> &str {
        "web_fetch"
    }

    fn description(&self) -> &str {
        "Fetch and extract text content from a web URL. \
         Returns the page content as text. Supports HTML pages (converted to text), \
         JSON APIs (returned as-is), and plain text files. \
         Use this to read documentation, API responses, or any web-accessible content."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "The URL to fetch (must start with http:// or https://)"
                },
                "max_length": {
                    "type": "integer",
                    "description": "Maximum characters to return (default: 10000, max: 50000)",
                    "default": 10000
                }
            },
            "required": ["url"]
        })
    }

    fn requires_approval(&self) -> bool {
        // Read-only operation — no approval needed
        false
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let url = input["url"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput {
                tool: "web_fetch".into(),
                message: "missing or invalid 'url' field".into(),
            })?;

        // Validate URL scheme
        if !url.starts_with("http://") && !url.starts_with("https://") {
            return Err(ToolError::InvalidInput {
                tool: "web_fetch".into(),
                message: "URL must start with http:// or https://".into(),
            });
        }

        let max_length = input["max_length"]
            .as_u64()
            .unwrap_or(10_000)
            .min(50_000) as usize;

        tracing::info!(session_id = %ctx.session_id, url = %url, "Fetching web content");

        let response = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: "web_fetch".into(),
                message: format!("HTTP request failed: {e}"),
            })?;

        let status = response.status();
        if !status.is_success() {
            return Ok(ToolOutput {
                content: format!("HTTP {} — request failed", status),
                is_error: true,
                metadata: Some(serde_json::json!({
                    "status_code": status.as_u16(),
                    "url": url,
                })),
            });
        }

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        let body = response
            .text()
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: "web_fetch".into(),
                message: format!("Failed to read response body: {e}"),
            })?;

        // Check size
        if body.len() > MAX_RESPONSE_SIZE {
            return Ok(ToolOutput {
                content: format!(
                    "Response too large ({} bytes, max {} bytes)",
                    body.len(),
                    MAX_RESPONSE_SIZE
                ),
                is_error: true,
                metadata: Some(serde_json::json!({
                    "url": url,
                    "content_type": content_type,
                    "size": body.len(),
                })),
            });
        }

        let body_len = body.len();

        // Extract text based on content type
        let text = if content_type.contains("text/html") {
            extract_text_from_html(&body)
        } else {
            // JSON, plain text, etc. — return as-is
            body
        };

        // Truncate if needed
        let truncated = if text.len() > max_length {
            format!(
                "{}\n\n[... truncated at {} characters, total {} ...]",
                &text[..max_length],
                max_length,
                text.len()
            )
        } else {
            text
        };

        Ok(ToolOutput {
            content: format!(
                "Content from {} (type: {}):\n\n{}",
                url,
                content_type.split(';').next().unwrap_or("unknown").trim(),
                truncated
            ),
            is_error: false,
            metadata: Some(serde_json::json!({
                "url": url,
                "content_type": content_type,
                "size": body_len,
            })),
        })
    }
}

/// Simple HTML-to-text extraction.
///
/// Strips HTML tags, decodes entities, and normalizes whitespace.
/// For production use, consider using a proper HTML parser like `scraper`.
fn extract_text_from_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut in_script = false;
    let mut tag_name = String::new();
    let mut collecting_tag = false;

    for ch in html.chars() {
        match ch {
            '<' => {
                in_tag = true;
                collecting_tag = true;
                tag_name.clear();
                // Add newline for block-level elements
                if !result.is_empty() && !result.ends_with('\n') {
                    result.push('\n');
                }
            }
            '>' => {
                in_tag = false;
                collecting_tag = false;
                let tn = tag_name.to_lowercase();
                // Check if we're entering or leaving a script/style block
                if tn == "script" || tn == "style" {
                    in_script = true;
                } else if tn == "/script" || tn == "/style" {
                    in_script = false;
                }
                // Add newlines for block elements
                if matches!(
                    tn.as_str(),
                    "p"
                        | "div"
                        | "br"
                        | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
                        | "li"
                        | "tr"
                        | "/p"
                        | "/div"
                        | "/h1" | "/h2" | "/h3" | "/h4" | "/h5" | "/h6"
                        | "/li"
                        | "/tr"
                ) {
                    result.push('\n');
                }
            }
            _ => {
                if in_tag {
                    if collecting_tag {
                        tag_name.push(ch);
                        if ch == ' ' || ch == '\t' || ch == '\n' {
                            collecting_tag = false;
                        }
                    }
                } else if !in_script {
                    result.push(ch);
                }
            }
        }
    }

    // Decode common HTML entities
    let text = result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");

    // Normalize whitespace: collapse multiple blank lines
    let lines: Vec<&str> = text.lines().collect();
    // Remove excessive blank lines (more than 2 consecutive)
    let mut cleaned = String::with_capacity(text.len());
    let mut blank_count = 0;
    for line in &lines {
        if line.trim().is_empty() {
            blank_count += 1;
            if blank_count <= 2 {
                cleaned.push('\n');
            }
        } else {
            blank_count = 0;
            cleaned.push_str(line.trim_end());
            cleaned.push('\n');
        }
    }

    cleaned.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_text_basic() {
        let html = "<html><body><h1>Hello</h1><p>World</p></body></html>";
        let text = extract_text_from_html(html);
        assert!(text.contains("Hello"));
        assert!(text.contains("World"));
    }

    #[test]
    fn test_extract_text_strips_script() {
        let html = "<html><body><script>alert('xss')</script><p>Content</p></body></html>";
        let text = extract_text_from_html(html);
        assert!(!text.contains("alert"));
        assert!(text.contains("Content"));
    }

    #[test]
    fn test_extract_text_entities() {
        let html = "<p>a &amp; b &lt; c</p>";
        let text = extract_text_from_html(html);
        assert!(text.contains("a & b < c"));
    }

    #[tokio::test]
    async fn test_schema_valid() {
        let tool = WebFetchTool::new();
        let schema = tool.input_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["url"].is_object());
    }

    #[test]
    fn test_does_not_require_approval() {
        let tool = WebFetchTool::new();
        assert!(!tool.requires_approval());
    }

    #[tokio::test]
    async fn test_invalid_url_scheme() {
        let tool = WebFetchTool::new();
        let ctx = ToolContext {
            working_dir: ".".to_string(),
            session_id: "test".to_string(),
        };
        let input = serde_json::json!({ "url": "ftp://example.com" });
        let result = tool.execute(input, &ctx).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_missing_url() {
        let tool = WebFetchTool::new();
        let ctx = ToolContext {
            working_dir: ".".to_string(),
            session_id: "test".to_string(),
        };
        let input = serde_json::json!({});
        let result = tool.execute(input, &ctx).await;
        assert!(result.is_err());
    }
}
