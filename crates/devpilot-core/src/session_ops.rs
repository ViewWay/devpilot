//! Session enhancement operations — Export, Fork, and Rewind.
//!
//! This module provides session manipulation operations:
//! - **Export** a conversation to Markdown, JSON, or HTML.
//! - **Fork** a conversation from a specific message, creating a new session.
//! - **Rewind** a conversation by truncating messages after a given index.

use devpilot_protocol::{ContentBlock, Message, MessageRole};
use serde::{Deserialize, Serialize};

use crate::session::Session;

// ── Export ─────────────────────────────────────────────

/// Output format for session export.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExportFormat {
    Markdown,
    Json,
    Html,
}

/// Options controlling what gets included in the exported output.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportOptions {
    pub format: ExportFormat,
    /// Include session metadata (title, id, timestamps, model).
    pub include_metadata: bool,
    /// Include tool-use and tool-result blocks.
    pub include_tool_calls: bool,
    /// Include thinking/reasoning blocks.
    pub include_thinking: bool,
}

impl Default for ExportOptions {
    fn default() -> Self {
        Self {
            format: ExportFormat::Markdown,
            include_metadata: true,
            include_tool_calls: true,
            include_thinking: false,
        }
    }
}

/// Export a session conversation to the specified format.
///
/// The caller passes the `Session` (for metadata) and a `&[Message]` slice
/// (typically `&session.messages`). This separation makes it easy to export
/// a subset of messages (e.g. after a fork).
pub fn export_session(session: &Session, messages: &[Message], options: &ExportOptions) -> String {
    match options.format {
        ExportFormat::Markdown => export_markdown(session, messages, options),
        ExportFormat::Json => export_json(session, messages, options),
        ExportFormat::Html => export_html(session, messages, options),
    }
}

// ── Markdown export ───────────────────────────────────

fn export_markdown(session: &Session, messages: &[Message], options: &ExportOptions) -> String {
    let mut out = String::new();

    if options.include_metadata {
        out.push_str(&format!("# {}\n\n", session.title));
        out.push_str(&format!("- **Session ID:** {}\n", session.id));
        out.push_str(&format!("- **Model:** {}\n", session.config.model));
        out.push_str(&format!(
            "- **Created:** {}\n",
            session.created_at.to_rfc3339()
        ));
        out.push_str(&format!(
            "- **Updated:** {}\n",
            session.updated_at.to_rfc3339()
        ));
        out.push('\n');
        out.push_str("---\n\n");
    }

    for msg in messages {
        let role_label = match msg.role {
            MessageRole::User => "**User**",
            MessageRole::Assistant => "**Assistant**",
            MessageRole::System => "**System**",
            MessageRole::Tool => "**Tool**",
        };

        out.push_str(&format!("### {role_label}\n\n"));

        for block in &msg.content {
            match block {
                ContentBlock::Text { text } => {
                    out.push_str(text);
                    out.push('\n');
                }
                ContentBlock::Thinking { thinking, .. } if options.include_thinking => {
                    out.push_str("<details>\n<summary>Thinking</summary>\n\n");
                    out.push_str(thinking);
                    out.push_str("\n</details>\n\n");
                }
                ContentBlock::ToolUse { name, input, .. } if options.include_tool_calls => {
                    out.push_str(&format!("🔧 **Tool Call:** `{name}`\n"));
                    out.push_str("```json\n");
                    out.push_str(
                        &serde_json::to_string_pretty(input).unwrap_or_else(|e| e.to_string()),
                    );
                    out.push_str("\n```\n");
                }
                ContentBlock::ToolResult {
                    content: result,
                    is_error,
                    ..
                } if options.include_tool_calls => {
                    let label = if *is_error {
                        "❌ Tool Error"
                    } else {
                        "📤 Tool Result"
                    };
                    out.push_str(&format!("**{label}:**\n"));
                    out.push_str("```\n");
                    out.push_str(result);
                    out.push_str("\n```\n");
                }
                ContentBlock::Image { source } => match source {
                    devpilot_protocol::ImageSource::Url { url } => {
                        out.push_str(&format!("![image]({url})\n"));
                    }
                    devpilot_protocol::ImageSource::Base64 { .. } => {
                        out.push_str("[inline image]\n");
                    }
                },
                _ => {} // skip blocks that are filtered out by options
            }
        }
        out.push('\n');
    }

    out
}

// ── JSON export ───────────────────────────────────────

fn export_json(session: &Session, messages: &[Message], options: &ExportOptions) -> String {
    let filtered: Vec<serde_json::Value> = messages
        .iter()
        .map(|msg| filter_message_json(msg, options))
        .collect();

    let mut root = serde_json::Map::new();

    if options.include_metadata {
        root.insert(
            "session".into(),
            serde_json::json!({
                "id": session.id,
                "title": session.title,
                "model": session.config.model,
                "created_at": session.created_at.to_rfc3339(),
                "updated_at": session.updated_at.to_rfc3339(),
                "turn_count": session.turn_count,
                "total_usage": {
                    "input_tokens": session.total_usage.input_tokens,
                    "output_tokens": session.total_usage.output_tokens,
                },
            }),
        );
    }

    root.insert("messages".into(), serde_json::Value::Array(filtered));

    serde_json::to_string_pretty(&serde_json::Value::Object(root))
        .unwrap_or_else(|e| format!("{{\"error\": \"{}\"}}", e))
}

fn filter_message_json(msg: &Message, options: &ExportOptions) -> serde_json::Value {
    let filtered_blocks: Vec<serde_json::Value> = msg
        .content
        .iter()
        .filter(|block| match block {
            ContentBlock::Thinking { .. } => options.include_thinking,
            ContentBlock::ToolUse { .. } | ContentBlock::ToolResult { .. } => {
                options.include_tool_calls
            }
            _ => true,
        })
        .map(|block| serde_json::to_value(block).unwrap_or(serde_json::Value::Null))
        .collect();

    serde_json::json!({
        "role": msg.role.to_string(),
        "content": filtered_blocks,
    })
}

// ── HTML export ───────────────────────────────────────

fn export_html(session: &Session, messages: &[Message], options: &ExportOptions) -> String {
    let mut body = String::new();

    if options.include_metadata {
        body.push_str("<div class=\"metadata\">\n");
        body.push_str(&format!("<h1>{}</h1>\n", html_escape(&session.title)));
        body.push_str(&format!(
            "<p>Session ID: {} | Model: {} | Created: {}</p>\n",
            html_escape(&session.id),
            html_escape(&session.config.model),
            html_escape(&session.created_at.to_rfc3339()),
        ));
        body.push_str("</div>\n<hr/>\n");
    }

    for msg in messages {
        let role_class = match msg.role {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
            MessageRole::Tool => "tool",
        };

        body.push_str(&format!(
            "<div class=\"message {role_class}\">\n<div class=\"role\">{role_class}</div>\n<div class=\"content\">\n"
        ));

        for block in &msg.content {
            match block {
                ContentBlock::Text { text } => {
                    body.push_str(&format!(
                        "<div class=\"text-block\">{}</div>\n",
                        html_escape(text),
                    ));
                }
                ContentBlock::Thinking { thinking, .. } if options.include_thinking => {
                    body.push_str(&format!(
                        "<details><summary>Thinking</summary><pre>{}</pre></details>\n",
                        html_escape(thinking),
                    ));
                }
                ContentBlock::ToolUse { name, input, .. } if options.include_tool_calls => {
                    body.push_str(&format!(
                        "<div class=\"tool-use\"><b>Tool Call:</b> <code>{}</code><pre>{}</pre></div>\n",
                        html_escape(name),
                        html_escape(
                            &serde_json::to_string_pretty(input)
                                .unwrap_or_default()
                        ),
                    ));
                }
                ContentBlock::ToolResult {
                    content: result,
                    is_error,
                    ..
                } if options.include_tool_calls => {
                    let cls = if *is_error {
                        "tool-error"
                    } else {
                        "tool-result"
                    };
                    body.push_str(&format!(
                        "<div class=\"{cls}\"><b>Result:</b><pre>{}</pre></div>\n",
                        html_escape(result),
                    ));
                }
                ContentBlock::Image { source } => match source {
                    devpilot_protocol::ImageSource::Url { url } => {
                        body.push_str(&format!(
                            "<img src=\"{}\" alt=\"image\" />\n",
                            html_escape(url),
                        ));
                    }
                    devpilot_protocol::ImageSource::Base64 { media_type, data } => {
                        body.push_str(&format!(
                            "<img src=\"data:{};base64,{}\" alt=\"image\" />\n",
                            html_escape(media_type),
                            html_escape(data),
                        ));
                    }
                },
                _ => {} // filtered out
            }
        }

        body.push_str("</div>\n</div>\n");
    }

    format!(
        "<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"/>\n\
         <title>{title}</title>\n\
         <style>\n\
         body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 2em auto; padding: 0 1em; background: #fafafa; }}\n\
         .message {{ margin: 1em 0; padding: 0.75em 1em; border-radius: 8px; }}\n\
         .user {{ background: #e3f2fd; }}\n\
         .assistant {{ background: #f5f5f5; }}\n\
         .system {{ background: #fff3e0; }}\n\
         .tool {{ background: #e8f5e9; }}\n\
         .role {{ font-weight: bold; text-transform: capitalize; margin-bottom: 0.5em; }}\n\
         pre {{ background: #263238; color: #eeffff; padding: 0.75em; border-radius: 4px; overflow-x: auto; }}\n\
         code {{ background: #e0e0e0; padding: 0.15em 0.4em; border-radius: 3px; }}\n\
         .tool-use, .tool-result, .tool-error {{ margin: 0.5em 0; }}\n\
         .tool-error {{ color: #c62828; }}\n\
         hr {{ border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }}\n\
         </style></head>\n\
         <body>\n{body}</body></html>",
        title = html_escape(&session.title),
    )
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

// ── Fork ──────────────────────────────────────────────

/// Options for forking a conversation at a specific message index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForkOptions {
    /// The session to fork from.
    pub source_session_id: String,
    /// Messages before this index are copied into the new session.
    pub fork_from_message_index: usize,
    /// Optional title for the new forked session. Defaults to the source title + " (fork)".
    pub new_session_title: Option<String>,
}

/// Result of a fork operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForkResult {
    /// The newly created forked session.
    pub session: Session,
    /// The number of messages copied into the forked session.
    pub copied_message_count: usize,
}

/// Fork a conversation from a specific message index.
///
/// Creates a new `Session` with a fresh ID, copying messages `[0..fork_from_message_index)`
/// from the source session. The forked session inherits the source's configuration but gets
/// its own independent state.
///
/// Returns a [`ForkResult`] with the new session and count of copied messages.
pub fn fork_session(source: &Session, options: &ForkOptions) -> ForkResult {
    let limit = options.fork_from_message_index.min(source.messages.len());
    let copied_messages: Vec<Message> = source.messages[..limit].to_vec();

    let mut new_config = source.config.clone();
    // Clear the explicit ID so a fresh one is generated.
    new_config.id = None;

    let mut new_session = Session::new(new_config);

    for msg in copied_messages {
        new_session.add_message(msg);
    }

    new_session.title = options
        .new_session_title
        .clone()
        .unwrap_or_else(|| format!("{} (fork)", source.title));

    new_session.auto_title();

    // Restore the explicit title if one was given.
    if let Some(ref title) = options.new_session_title {
        new_session.title = title.clone();
    }

    ForkResult {
        session: new_session,
        copied_message_count: limit,
    }
}

// ── Rewind ────────────────────────────────────────────

/// Options for rewinding a conversation to a specific message index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewindOptions {
    /// The session to rewind.
    pub session_id: String,
    /// Keep only messages in `[0..rewind_to_message_index)`. All messages at
    /// this index and beyond are removed.
    pub rewind_to_message_index: usize,
}

/// Result of a rewind operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RewindResult {
    /// The number of messages that were removed.
    pub removed_count: usize,
    /// The messages that were removed (for potential undo).
    pub removed_messages: Vec<Message>,
}

/// Rewind a conversation, keeping only messages before the specified index.
///
/// Messages at `options.rewind_to_message_index` and beyond are removed from
/// the session. Returns a [`RewindResult`] with the count and content of the
/// removed messages.
pub fn rewind_session(session: &mut Session, options: &RewindOptions) -> RewindResult {
    let rewind_index = options.rewind_to_message_index;

    if rewind_index >= session.messages.len() {
        // Nothing to remove — index is at or past the end.
        return RewindResult {
            removed_count: 0,
            removed_messages: Vec::new(),
        };
    }

    // Split off the tail.
    let remaining = session.messages.split_off(rewind_index);
    let removed_count = remaining.len();

    RewindResult {
        removed_count,
        removed_messages: remaining,
    }
}

// ── Tests ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::{SessionConfig, SessionState};
    use devpilot_protocol::{ProviderType, ReasoningEffort, SessionMode};

    fn test_config() -> SessionConfig {
        SessionConfig {
            id: None,
            model: "test-model".into(),
            provider_type: ProviderType::Anthropic,
            mode: SessionMode::Code,
            reasoning_effort: ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
            env_vars: vec![],
            context_window_tokens: Some(128_000),
        }
    }

    fn build_session() -> Session {
        let mut s = Session::new(test_config());
        s.add_system_message("You are helpful.");
        s.add_user_message("Hello!");
        s.add_assistant_message("Hi there! How can I help?");
        s.add_user_message("Tell me about Rust.");
        s.add_assistant_message("Rust is a systems programming language...");
        s.auto_title();
        s
    }

    // ── Export tests ───────────────────────────

    #[test]
    fn export_markdown_basic() {
        let session = build_session();
        let opts = ExportOptions {
            format: ExportFormat::Markdown,
            include_metadata: true,
            include_tool_calls: false,
            include_thinking: false,
        };
        let md = export_session(&session, &session.messages, &opts);
        assert!(md.contains("# "));
        assert!(md.contains("**User**"));
        assert!(md.contains("**Assistant**"));
        assert!(md.contains("Hello!"));
        assert!(md.contains("Hi there!"));
    }

    #[test]
    fn export_markdown_no_metadata() {
        let session = build_session();
        let opts = ExportOptions {
            format: ExportFormat::Markdown,
            include_metadata: false,
            include_tool_calls: false,
            include_thinking: false,
        };
        let md = export_session(&session, &session.messages, &opts);
        assert!(!md.contains("Session ID:"));
        assert!(md.contains("Hello!"));
    }

    #[test]
    fn export_json_basic() {
        let session = build_session();
        let opts = ExportOptions {
            format: ExportFormat::Json,
            include_metadata: true,
            include_tool_calls: true,
            include_thinking: true,
        };
        let json_str = export_session(&session, &session.messages, &opts);
        let val: serde_json::Value = serde_json::from_str(&json_str).expect("valid JSON");
        assert!(val.get("session").is_some());
        assert!(val.get("messages").is_some());
        let msgs = val["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), session.messages.len());
    }

    #[test]
    fn export_html_basic() {
        let session = build_session();
        let opts = ExportOptions {
            format: ExportFormat::Html,
            include_metadata: true,
            include_tool_calls: false,
            include_thinking: false,
        };
        let html = export_session(&session, &session.messages, &opts);
        assert!(html.contains("<!DOCTYPE html>"));
        assert!(html.contains("<div class=\"message"));
        assert!(html.contains("Hello!"));
    }

    #[test]
    fn export_filters_thinking_blocks() {
        use devpilot_protocol::ContentBlock;
        let mut session = build_session();
        // Inject a thinking block into an assistant message
        if let Some(msg) = session
            .messages
            .iter_mut()
            .find(|m| m.role == MessageRole::Assistant)
        {
            msg.content.push(ContentBlock::Thinking {
                thinking: "inner monologue".into(),
                signature: None,
            });
        }

        let opts_without = ExportOptions {
            format: ExportFormat::Markdown,
            include_metadata: false,
            include_tool_calls: false,
            include_thinking: false,
        };
        let md = export_session(&session, &session.messages, &opts_without);
        assert!(!md.contains("inner monologue"));

        let opts_with = ExportOptions {
            include_thinking: true,
            ..opts_without
        };
        let md = export_session(&session, &session.messages, &opts_with);
        assert!(md.contains("inner monologue"));
    }

    #[test]
    fn export_filters_tool_calls() {
        use devpilot_protocol::ContentBlock;
        let mut session = build_session();
        if let Some(msg) = session
            .messages
            .iter_mut()
            .find(|m| m.role == MessageRole::Assistant)
        {
            msg.content.push(ContentBlock::ToolUse {
                id: "tu_1".into(),
                name: "read_file".into(),
                input: serde_json::json!({"path": "/tmp/a.txt"}),
            });
        }

        let opts_without = ExportOptions {
            format: ExportFormat::Markdown,
            include_metadata: false,
            include_tool_calls: false,
            include_thinking: false,
        };
        let md = export_session(&session, &session.messages, &opts_without);
        assert!(!md.contains("Tool Call"));

        let opts_with = ExportOptions {
            include_tool_calls: true,
            ..opts_without
        };
        let md = export_session(&session, &session.messages, &opts_with);
        assert!(md.contains("Tool Call"));
    }

    // ── Fork tests ────────────────────────────

    #[test]
    fn fork_copies_prefix() {
        let session = build_session();
        assert_eq!(session.messages.len(), 5);

        let opts = ForkOptions {
            source_session_id: session.id.clone(),
            fork_from_message_index: 3, // keep first 3 messages
            new_session_title: Some("Forked Chat".into()),
        };
        let result = fork_session(&session, &opts);

        assert_eq!(result.copied_message_count, 3);
        assert_eq!(result.session.messages.len(), 3);
        assert_eq!(result.session.title, "Forked Chat");
        assert_ne!(result.session.id, session.id);
    }

    #[test]
    fn fork_clamps_index_to_length() {
        let session = build_session();
        let opts = ForkOptions {
            source_session_id: session.id.clone(),
            fork_from_message_index: 100, // way past the end
            new_session_title: None,
        };
        let result = fork_session(&session, &opts);
        assert_eq!(result.copied_message_count, session.messages.len());
        assert_eq!(result.session.messages.len(), session.messages.len());
    }

    #[test]
    fn fork_default_title() {
        let session = build_session();
        let opts = ForkOptions {
            source_session_id: session.id.clone(),
            fork_from_message_index: 2,
            new_session_title: None,
        };
        let result = fork_session(&session, &opts);
        assert!(result.session.title.contains("(fork)"));
    }

    #[test]
    fn fork_inherits_config() {
        let session = build_session();
        let opts = ForkOptions {
            source_session_id: session.id.clone(),
            fork_from_message_index: 1,
            new_session_title: None,
        };
        let result = fork_session(&session, &opts);
        assert_eq!(result.session.config.model, "test-model");
        assert_eq!(result.session.config.provider_type, ProviderType::Anthropic);
    }

    // ── Rewind tests ──────────────────────────

    #[test]
    fn rewind_removes_tail() {
        let mut session = build_session();
        assert_eq!(session.messages.len(), 5);

        let opts = RewindOptions {
            session_id: session.id.clone(),
            rewind_to_message_index: 3,
        };
        let result = rewind_session(&mut session, &opts);

        assert_eq!(result.removed_count, 2);
        assert_eq!(result.removed_messages.len(), 2);
        assert_eq!(session.messages.len(), 3);
    }

    #[test]
    fn rewind_at_end_removes_nothing() {
        let mut session = build_session();
        let count = session.messages.len();
        let opts = RewindOptions {
            session_id: session.id.clone(),
            rewind_to_message_index: count,
        };
        let result = rewind_session(&mut session, &opts);
        assert_eq!(result.removed_count, 0);
        assert_eq!(session.messages.len(), count);
    }

    #[test]
    fn rewind_past_end_removes_nothing() {
        let mut session = build_session();
        let opts = RewindOptions {
            session_id: session.id.clone(),
            rewind_to_message_index: 999,
        };
        let result = rewind_session(&mut session, &opts);
        assert_eq!(result.removed_count, 0);
    }

    #[test]
    fn rewind_to_zero_removes_all() {
        let mut session = build_session();
        let opts = RewindOptions {
            session_id: session.id.clone(),
            rewind_to_message_index: 0,
        };
        let result = rewind_session(&mut session, &opts);
        assert_eq!(result.removed_count, 5);
        assert!(session.messages.is_empty());
    }

    #[test]
    fn removed_messages_preserve_content() {
        let mut session = build_session();
        let opts = RewindOptions {
            session_id: session.id.clone(),
            rewind_to_message_index: 3,
        };
        let result = rewind_session(&mut session, &opts);
        // The removed messages should be the last two
        assert_eq!(
            result.removed_messages[0].text_content(),
            "Tell me about Rust."
        );
        assert!(
            result.removed_messages[1]
                .text_content()
                .contains("systems programming language")
        );
    }
}
