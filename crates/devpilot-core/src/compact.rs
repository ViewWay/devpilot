//! Context compression — reduce token usage by summarizing old messages.
//!
//! When a conversation grows too long, we compress older messages into
//! a shorter summary to stay within the model's context window.

use devpilot_protocol::{ContentBlock, Message, MessageRole};

/// Strategy for compressing conversation history.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompactStrategy {
    /// Keep only the most recent N messages, drop everything else.
    Truncate { keep_last: usize },
    /// Replace old messages with a system summary message.
    Summarize { keep_last: usize },
}

impl Default for CompactStrategy {
    fn default() -> Self {
        Self::Summarize { keep_last: 20 }
    }
}

/// Result of a compression operation.
#[derive(Debug)]
pub struct CompactResult {
    /// Number of messages removed.
    pub messages_removed: usize,
    /// Whether a summary was added.
    pub summary_added: bool,
}

/// Compress the message history according to the given strategy.
///
/// This is a synchronous, rule-based compression. In the future,
/// we'll add LLM-based summarization for the `Summarize` strategy.
pub fn compact_messages(messages: &mut Vec<Message>, strategy: CompactStrategy) -> CompactResult {
    let (keep_last, add_summary) = match strategy {
        CompactStrategy::Truncate { keep_last } => (keep_last, false),
        CompactStrategy::Summarize { keep_last } => (keep_last, true),
    };

    if messages.len() <= keep_last {
        return CompactResult {
            messages_removed: 0,
            summary_added: false,
        };
    }

    let remove_count = messages.len() - keep_last;

    // Extract text from messages we're about to remove for potential summary.
    let removed_messages: Vec<&Message> = messages.iter().take(remove_count).collect();

    // Build a simple summary from removed messages.
    let summary_text = if add_summary {
        let mut summary_parts: Vec<String> = Vec::new();
        for msg in &removed_messages {
            let text = msg.text_content();
            if !text.is_empty() {
                let role_label = match msg.role {
                    MessageRole::User => "User",
                    MessageRole::Assistant => "Assistant",
                    MessageRole::System => "System",
                    MessageRole::Tool => "Tool",
                };
                // Truncate individual messages to keep summary manageable.
                let truncated = if text.len() > 200 {
                    format!("{}...", &text[..200])
                } else {
                    text.clone()
                };
                summary_parts.push(format!("[{role_label}]: {truncated}"));
            }
        }
        Some(summary_parts.join("\n"))
    } else {
        None
    };

    // Remove old messages.
    messages.drain(0..remove_count);

    // Prepend summary as a system message.
    if add_summary {
        let summary_msg = Message {
            role: MessageRole::System,
            content: vec![ContentBlock::Text {
                text: format!(
                    "[Conversation Summary — earlier messages compressed]\n{}",
                    summary_text.as_deref().unwrap_or("")
                ),
            }],
            name: None,
            tool_call_id: None,
        };
        messages.insert(0, summary_msg);
    }

    CompactResult {
        messages_removed: remove_count,
        summary_added: add_summary,
    }
}

/// Estimate the token count for a message history.
/// Simple heuristic: ~4 characters per token for English text.
pub fn estimate_message_tokens(messages: &[Message]) -> u32 {
    let mut total_chars: usize = 0;
    for msg in messages {
        for block in &msg.content {
            match block {
                ContentBlock::Text { text } => total_chars += text.len(),
                ContentBlock::Image { .. } => total_chars += 1000, // rough estimate for image tokens
                ContentBlock::ToolUse { name, input, .. } => {
                    total_chars += name.len() + input.to_string().len();
                }
                ContentBlock::ToolResult { content, .. } => total_chars += content.len(),
                ContentBlock::Thinking { thinking, .. } => total_chars += thinking.len(),
            }
        }
    }
    // ~4 chars per token is a reasonable approximation for English/code.
    (total_chars as u32) / 4
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_strategy_removes_old_messages() {
        let mut messages: Vec<Message> = (0..10)
            .map(|i| Message::text(MessageRole::User, format!("msg {i}")))
            .collect();

        let result = compact_messages(&mut messages, CompactStrategy::Truncate { keep_last: 4 });

        assert_eq!(result.messages_removed, 6);
        assert!(!result.summary_added);
        assert_eq!(messages.len(), 4);
        assert_eq!(messages[0].text_content(), "msg 6");
    }

    #[test]
    fn summarize_strategy_adds_summary() {
        let mut messages: Vec<Message> = (0..10)
            .map(|i| Message::text(MessageRole::User, format!("message number {i}")))
            .collect();

        let result = compact_messages(&mut messages, CompactStrategy::Summarize { keep_last: 4 });

        assert_eq!(result.messages_removed, 6);
        assert!(result.summary_added);
        assert_eq!(messages.len(), 5); // 4 kept + 1 summary
        assert_eq!(messages[0].role, MessageRole::System);
        assert!(messages[0].text_content().contains("[Conversation Summary"));
        assert_eq!(messages[1].text_content(), "message number 6");
    }

    #[test]
    fn no_compact_needed_when_few_messages() {
        let mut messages: Vec<Message> = (0..5)
            .map(|i| Message::text(MessageRole::User, format!("msg {i}")))
            .collect();

        let result = compact_messages(&mut messages, CompactStrategy::Summarize { keep_last: 20 });

        assert_eq!(result.messages_removed, 0);
        assert!(!result.summary_added);
        assert_eq!(messages.len(), 5);
    }

    #[test]
    fn estimate_tokens() {
        let messages = vec![
            Message::text(MessageRole::User, "Hello, how are you?"),
            Message::text(MessageRole::Assistant, "I'm doing well, thanks!"),
        ];
        let tokens = estimate_message_tokens(&messages);
        // ~40 chars / 4 = ~10 tokens
        assert!(tokens > 0);
        assert!(tokens < 50);
    }

    #[test]
    fn estimate_tokens_empty_messages() {
        let tokens = estimate_message_tokens(&[]);
        assert_eq!(tokens, 0);
    }

    #[test]
    fn estimate_tokens_with_tool_use() {
        let messages = vec![Message {
            role: MessageRole::Assistant,
            content: vec![
                ContentBlock::Text {
                    text: "Let me check.".into(),
                },
                ContentBlock::ToolUse {
                    id: "tu-1".into(),
                    name: "read_file".into(),
                    input: serde_json::json!({"path": "/tmp/test.txt"}),
                },
            ],
            name: None,
            tool_call_id: None,
        }];
        let tokens = estimate_message_tokens(&messages);
        assert!(tokens > 0);
    }

    #[test]
    fn estimate_tokens_with_tool_result() {
        let messages = vec![Message {
            role: MessageRole::Tool,
            content: vec![ContentBlock::ToolResult {
                tool_use_id: "tu-1".into(),
                content: "file contents here".into(),
                is_error: false,
            }],
            name: None,
            tool_call_id: None,
        }];
        let tokens = estimate_message_tokens(&messages);
        assert!(tokens > 0);
    }

    #[test]
    fn compact_with_exact_keep_count() {
        let mut messages: Vec<Message> = (0..5)
            .map(|i| Message::text(MessageRole::User, format!("msg {i}")))
            .collect();

        let result = compact_messages(&mut messages, CompactStrategy::Truncate { keep_last: 5 });
        assert_eq!(result.messages_removed, 0);
        assert!(!result.summary_added);
        assert_eq!(messages.len(), 5);
    }

    #[test]
    fn compact_truncate_keep_one() {
        let mut messages: Vec<Message> = (0..10)
            .map(|i| Message::text(MessageRole::User, format!("msg {i}")))
            .collect();

        let result = compact_messages(&mut messages, CompactStrategy::Truncate { keep_last: 1 });
        assert_eq!(result.messages_removed, 9);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].text_content(), "msg 9");
    }

    #[test]
    fn summarize_long_message_truncated_in_summary() {
        let long_text: String = "x".repeat(300);
        let mut messages: Vec<Message> = (0..5)
            .map(|_| Message::text(MessageRole::User, long_text.clone()))
            .collect();

        let result = compact_messages(&mut messages, CompactStrategy::Summarize { keep_last: 2 });
        assert_eq!(result.messages_removed, 3);
        assert!(result.summary_added);
        // Summary message should contain truncated text (200 chars + ...)
        let summary_text = messages[0].text_content();
        assert!(summary_text.contains("[Conversation Summary"));
    }

    #[test]
    fn summarize_mixed_roles() {
        let mut messages: Vec<Message> = vec![
            Message::text(MessageRole::System, "You are helpful."),
            Message::text(MessageRole::User, "Hello"),
            Message::text(MessageRole::Assistant, "Hi there!"),
            Message::text(MessageRole::User, "How are you?"),
            Message::text(MessageRole::Assistant, "Great!"),
        ];

        let result = compact_messages(&mut messages, CompactStrategy::Summarize { keep_last: 2 });
        assert_eq!(result.messages_removed, 3);
        assert!(result.summary_added);
        // Summary should contain role labels
        let summary = messages[0].text_content();
        assert!(summary.contains("[User]"));
        assert!(summary.contains("[Assistant]"));
        assert!(summary.contains("[System]"));
    }
}
