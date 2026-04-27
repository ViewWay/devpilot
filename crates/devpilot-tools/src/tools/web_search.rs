//! Web search tool — search the web using DuckDuckGo HTML parsing.
//!
//! Fetches results from DuckDuckGo's HTML endpoint and parses
//! titles, URLs, and snippets using simple string matching.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;

/// Tool for searching the web via DuckDuckGo.
///
/// Returns formatted search results with titles, URLs, and snippets.
pub struct WebSearchTool {
    client: reqwest::Client,
}

impl WebSearchTool {
    /// Create a new web search tool with default HTTP client.
    pub fn new() -> Self {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (compatible; DevPilot/2026.4.28)")
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

impl Default for WebSearchTool {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl Tool for WebSearchTool {
    fn name(&self) -> &str {
        "web_search"
    }

    fn description(&self) -> &str {
        "Search the web for information. Returns search results with titles, URLs, and snippets."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string"
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (default: 10)",
                    "default": 10
                },
                "engine": {
                    "type": "string",
                    "description": "Search engine to use (default: 'auto')",
                    "default": "auto"
                }
            },
            "required": ["query"]
        })
    }

    fn requires_approval(&self) -> bool {
        // Read-only search operation — no approval needed
        false
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let query = input["query"]
            .as_str()
            .ok_or_else(|| ToolError::InvalidInput {
                tool: "web_search".into(),
                message: "missing or invalid 'query' field".into(),
            })?;

        let max_results = input["max_results"].as_u64().unwrap_or(10).min(50) as usize;
        // engine parameter is accepted for future extensibility but currently unused
        let _engine = input["engine"].as_str().unwrap_or("auto");

        tracing::info!(session_id = %ctx.session_id, query = %query, "Performing web search");

        let url = format!("https://html.duckduckgo.com/html/?q={}", urlencoding(query));

        let response = self
            .client
            .get(&url)
            .header("Accept", "text/html")
            .send()
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: "web_search".into(),
                message: format!("HTTP request failed: {e}"),
            })?;

        let status = response.status();
        if !status.is_success() {
            return Ok(ToolOutput {
                content: format!("HTTP {} — search request failed", status),
                is_error: true,
                metadata: Some(serde_json::json!({
                    "status_code": status.as_u16(),
                    "query": query,
                })),
            });
        }

        let html = response
            .text()
            .await
            .map_err(|e| ToolError::ExecutionFailed {
                tool: "web_search".into(),
                message: format!("Failed to read response body: {e}"),
            })?;

        let results = parse_ddg_results(&html, max_results);

        if results.is_empty() {
            return Ok(ToolOutput {
                content: format!("No results found for: {}", query),
                is_error: false,
                metadata: Some(serde_json::json!({
                    "query": query,
                    "result_count": 0,
                })),
            });
        }

        let formatted = format_results(&results, query);

        Ok(ToolOutput {
            content: formatted,
            is_error: false,
            metadata: Some(serde_json::json!({
                "query": query,
                "result_count": results.len(),
            })),
        })
    }
}

/// A single search result.
#[derive(Debug, Clone)]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

/// Parse DuckDuckGo HTML results using simple string matching.
///
/// Looks for `<a class="result__a"` for titles/URLs and
/// `<a class="result__snippet"` for snippets.
fn parse_ddg_results(html: &str, max_results: usize) -> Vec<SearchResult> {
    let mut results = Vec::new();
    let mut pos = 0;

    while results.len() < max_results {
        // Find the next result block
        let result_start = match html[pos..].find("<a class=\"result__a\"") {
            Some(i) => pos + i,
            None => break,
        };

        // Extract the href from this <a> tag
        let url = extract_attribute(&html[result_start..], "href")
            .map(|u| decode_ddg_redirect(&u))
            .unwrap_or_default();

        // Extract the title (text between <a ...> and </a>)
        let title = extract_tag_content(&html[result_start..])
            .map(|t| clean_html(&t))
            .unwrap_or_else(|| "(no title)".to_string());

        // Look for the snippet near this result
        let snippet = if let Some(snip_start) =
            html[result_start..].find("<a class=\"result__snippet\"")
        {
            let abs_start = result_start + snip_start;
            extract_tag_content(&html[abs_start..])
                .map(|s| clean_html(&s))
                .unwrap_or_default()
        } else if let Some(snip_start) = html[result_start..].find("<td class=\"result__snippet\"")
        {
            let abs_start = result_start + snip_start;
            extract_tag_content(&html[abs_start..])
                .map(|s| clean_html(&s))
                .unwrap_or_default()
        } else {
            String::new()
        };

        results.push(SearchResult {
            title,
            url,
            snippet,
        });

        pos = result_start + 20;
    }

    results
}

/// Extract the value of an HTML attribute from a tag.
fn extract_attribute(html: &str, attr: &str) -> Option<String> {
    let pattern = format!("{}=\"", attr);
    let start = html.find(&pattern)?;
    let val_start = start + pattern.len();
    let val_end = html[val_start..].find('"')?;
    Some(html[val_start..val_start + val_end].to_string())
}

/// Extract the text content between opening and closing tags.
fn extract_tag_content(html: &str) -> Option<String> {
    let close_angle = html.find('>')?;
    let content_start = close_angle + 1;
    let content_end = html[content_start..].find("</a>")?;
    Some(html[content_start..content_start + content_end].to_string())
}

/// Decode DuckDuckGo redirect URLs.
///
/// DDG uses URLs like `//duckduckgo.com/l/?uddg=<encoded_url>&...`
fn decode_ddg_redirect(url: &str) -> String {
    if let Some(start) = url.find("uddg=") {
        let encoded = &url[start + 5..];
        let end = encoded.find('&').unwrap_or(encoded.len());
        let encoded_portion = &encoded[..end];
        // Decode percent-encoding manually for common cases
        percent_decode(encoded_portion)
    } else {
        url.to_string()
    }
}

/// Simple percent-decoding.
fn percent_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars();
    while let Some(ch) = chars.next() {
        if ch == '%' {
            let hex: String = chars.by_ref().take(2).collect();
            if let Ok(byte) = u8::from_str_radix(&hex, 16) {
                if byte < 128 {
                    result.push(byte as char);
                } else {
                    result.push('%');
                    result.push_str(&hex);
                }
            } else {
                result.push('%');
                result.push_str(&hex);
            }
        } else if ch == '+' {
            result.push(' ');
        } else {
            result.push(ch);
        }
    }
    result
}

/// Remove nested HTML tags from a string.
fn clean_html(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => result.push(ch),
            _ => {}
        }
    }
    // Decode common HTML entities
    result
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
        .trim()
        .to_string()
}

/// URL-encode a query string (simple version).
fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' || ch == '~' {
                ch.to_string()
            } else if ch == ' ' {
                "+".to_string()
            } else {
                format!("%{:02X}", ch as u8)
            }
        })
        .collect()
}

/// Format search results for display.
fn format_results(results: &[SearchResult], query: &str) -> String {
    let mut out = format!("Search results for: {}\n{}\n\n", query, "=".repeat(40));
    for (i, r) in results.iter().enumerate() {
        out.push_str(&format!("{}. {}\n", i + 1, r.title));
        out.push_str(&format!("   URL: {}\n", r.url));
        if !r.snippet.is_empty() {
            out.push_str(&format!("   {}\n", r.snippet));
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_urlencoding() {
        assert_eq!(urlencoding("hello world"), "hello+world");
        assert_eq!(urlencoding("test&foo=bar"), "test%26foo%3Dbar");
        assert_eq!(urlencoding("a-b_c.d~e"), "a-b_c.d~e");
    }

    #[test]
    fn test_clean_html() {
        assert_eq!(clean_html("<b>bold</b>"), "bold");
        assert_eq!(clean_html("a &amp; b &lt; c"), "a & b < c");
        assert_eq!(clean_html("plain text"), "plain text");
    }

    #[test]
    fn test_percent_decode() {
        assert_eq!(percent_decode("hello%20world"), "hello world");
        assert_eq!(percent_decode("a%26b"), "a&b");
        assert_eq!(percent_decode("no+encoding"), "no encoding");
    }

    #[test]
    fn test_decode_ddg_redirect() {
        let url = "//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=abc";
        assert_eq!(decode_ddg_redirect(url), "https://example.com");

        let plain = "https://example.com/page";
        assert_eq!(decode_ddg_redirect(plain), "https://example.com/page");
    }

    #[test]
    fn test_extract_attribute() {
        let html = r#"<a class="result__a" href="https://example.com">"#;
        assert_eq!(
            extract_attribute(html, "href"),
            Some("https://example.com".to_string())
        );
        assert_eq!(
            extract_attribute(html, "class"),
            Some("result__a".to_string())
        );
    }

    #[test]
    fn test_extract_tag_content() {
        let html = "<a class=\"result__a\">Hello World</a> rest";
        assert_eq!(extract_tag_content(html), Some("Hello World".to_string()));
    }

    #[test]
    fn test_parse_ddg_results() {
        let html = r#"
        <div class="result">
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.rust-lang.org">The Rust Programming Language</a>
            <a class="result__snippet">Rust is a systems programming language.</a>
        </div>
        <div class="result">
            <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdoc.rust-lang.org">Rust Documentation</a>
            <a class="result__snippet">Learn Rust with examples.</a>
        </div>
        "#;

        let results = parse_ddg_results(html, 10);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].title, "The Rust Programming Language");
        assert_eq!(results[0].url, "https://www.rust-lang.org");
        assert_eq!(
            results[0].snippet,
            "Rust is a systems programming language."
        );
        assert_eq!(results[1].title, "Rust Documentation");
    }

    #[test]
    fn test_parse_ddg_max_results() {
        let html = r#"
        <a class="result__a" href="https://a.com">Result 1</a>
        <a class="result__snippet">Snippet 1</a>
        <a class="result__a" href="https://b.com">Result 2</a>
        <a class="result__snippet">Snippet 2</a>
        <a class="result__a" href="https://c.com">Result 3</a>
        <a class="result__snippet">Snippet 3</a>
        "#;

        let results = parse_ddg_results(html, 2);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_parse_ddg_empty() {
        let html = "<html><body>No results here</body></html>";
        let results = parse_ddg_results(html, 10);
        assert!(results.is_empty());
    }

    #[test]
    fn test_format_results() {
        let results = vec![SearchResult {
            title: "Test".to_string(),
            url: "https://example.com".to_string(),
            snippet: "A test result.".to_string(),
        }];
        let formatted = format_results(&results, "test query");
        assert!(formatted.contains("Search results for: test query"));
        assert!(formatted.contains("1. Test"));
        assert!(formatted.contains("https://example.com"));
        assert!(formatted.contains("A test result."));
    }

    #[tokio::test]
    async fn test_schema_valid() {
        let tool = WebSearchTool::new();
        let schema = tool.input_schema();
        assert_eq!(schema["type"], "object");
        assert!(schema["properties"]["query"].is_object());
        assert!(schema["properties"]["max_results"].is_object());
        assert!(schema["properties"]["engine"].is_object());
        assert!(
            schema["required"]
                .as_array()
                .unwrap()
                .contains(&serde_json::json!("query"))
        );
    }

    #[test]
    fn test_does_not_require_approval() {
        let tool = WebSearchTool::new();
        assert!(!tool.requires_approval());
    }

    #[tokio::test]
    async fn test_missing_query() {
        let tool = WebSearchTool::new();
        let ctx = ToolContext {
            working_dir: ".".to_string(),
            session_id: "test".to_string(),
            env_vars: vec![],
        };
        let input = serde_json::json!({});
        let result = tool.execute(input, &ctx).await;
        assert!(result.is_err());
    }
}
