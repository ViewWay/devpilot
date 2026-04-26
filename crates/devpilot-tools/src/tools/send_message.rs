//! Send message tool — send a notification message via configured bridge channels.

use crate::{Tool, ToolContext, ToolError, ToolOutput, ToolResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::sync::{Mutex, OnceLock};

/// A message queued for bridge system pickup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutboundMessage {
    /// The message body.
    pub message: String,
    /// Optional title for the notification.
    pub title: Option<String>,
    /// Optional target channel name.
    pub channel: Option<String>,
    /// Message severity level.
    pub level: String,
    /// Session ID that sent the message.
    pub session_id: String,
}

// Global message queue for bridge system pickup.
static MESSAGE_QUEUE: OnceLock<Mutex<Vec<OutboundMessage>>> = OnceLock::new();

fn message_queue() -> &'static Mutex<Vec<OutboundMessage>> {
    MESSAGE_QUEUE.get_or_init(|| Mutex::new(Vec::new()))
}

/// Drain all pending outbound messages (used by the bridge system).
#[allow(dead_code)]
pub fn drain_pending_messages() -> Vec<OutboundMessage> {
    message_queue()
        .lock()
        .map(|mut q| q.drain(..).collect())
        .unwrap_or_default()
}

/// Peek at the current message queue without draining.
#[allow(dead_code)]
pub fn peek_pending_messages() -> Vec<OutboundMessage> {
    message_queue()
        .lock()
        .map(|q| q.clone())
        .unwrap_or_default()
}

/// Send message tool.
///
/// Enqueues a notification message for the bridge system to deliver
/// through configured channels (e.g. Telegram, Discord, Slack, etc.).
pub struct SendMessageTool;

impl SendMessageTool {
    pub fn new() -> Self {
        Self
    }
}

impl Default for SendMessageTool {
    fn default() -> Self {
        Self::new()
    }
}

/// Valid message levels.
const VALID_LEVELS: &[&str] = &["info", "warning", "error"];

/// Input parameters for send_message.
#[derive(Debug, Deserialize)]
struct SendMessageInput {
    /// The message body to send.
    message: String,
    /// Optional notification title.
    #[serde(default)]
    title: Option<String>,
    /// Optional target channel.
    #[serde(default)]
    channel: Option<String>,
    /// Severity level: "info", "warning", or "error" (default "info").
    #[serde(default = "default_level")]
    level: String,
}

fn default_level() -> String {
    "info".to_string()
}

#[async_trait]
impl Tool for SendMessageTool {
    fn name(&self) -> &str {
        "send_message"
    }

    fn description(&self) -> &str {
        "Send a notification message via configured bridge channels."
    }

    fn input_schema(&self) -> serde_json::Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The message body to send"
                },
                "title": {
                    "type": "string",
                    "description": "Optional notification title"
                },
                "channel": {
                    "type": "string",
                    "description": "Optional target channel name"
                },
                "level": {
                    "type": "string",
                    "enum": ["info", "warning", "error"],
                    "description": "Severity level (default: info)"
                }
            },
            "required": ["message"]
        })
    }

    fn requires_approval(&self) -> bool {
        false
    }

    async fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult<ToolOutput> {
        let params: SendMessageInput =
            serde_json::from_value(input).map_err(|e| ToolError::InvalidInput {
                tool: self.name().to_string(),
                message: e.to_string(),
            })?;

        // Validate level
        if !VALID_LEVELS.contains(&params.level.as_str()) {
            return Ok(ToolOutput::err(format!(
                "Invalid level '{}'. Must be one of: info, warning, error",
                params.level
            )));
        }

        let outbound = OutboundMessage {
            message: params.message.clone(),
            title: params.title.clone(),
            channel: params.channel.clone(),
            level: params.level.clone(),
            session_id: ctx.session_id.clone(),
        };

        // Enqueue for bridge system pickup
        {
            if let Ok(mut q) = message_queue().lock() {
                q.push(outbound);
            }
        }

        let level_display = params.level.to_uppercase();
        let confirmation = match &params.title {
            Some(t) => format!(
                "[{}] Message sent: {} — {}",
                level_display, t, params.message
            ),
            None => format!("[{}] Message sent: {}", level_display, params.message),
        };

        Ok(
            ToolOutput::ok(confirmation).with_metadata(serde_json::json!({
                "queued": true,
                "level": params.level,
                "session_id": ctx.session_id,
            })),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ctx() -> ToolContext {
        ToolContext {
            working_dir: "/tmp".into(),
            session_id: "test-session".into(),
            env_vars: vec![],
        }
    }

    #[tokio::test]
    async fn test_send_message_basic() {
        let tool = SendMessageTool::new();
        let result = tool
            .execute(serde_json::json!({"message": "Hello, world!"}), &ctx())
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("[INFO]"));
        assert!(result.content.contains("Hello, world!"));
    }

    #[tokio::test]
    async fn test_send_message_with_title_and_level() {
        let tool = SendMessageTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "message": "Disk space low",
                    "title": "Warning",
                    "level": "warning"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);
        assert!(result.content.contains("[WARNING]"));
        assert!(result.content.contains("Warning"));
        assert!(result.content.contains("Disk space low"));
    }

    #[tokio::test]
    async fn test_send_message_invalid_level() {
        let tool = SendMessageTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "message": "test",
                    "level": "critical"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(result.is_error);
        assert!(result.content.contains("Invalid level"));
    }

    #[tokio::test]
    async fn test_message_queue_drain() {
        // Clear any previous messages
        let _ = drain_pending_messages();

        let tool = SendMessageTool::new();
        let _ = tool
            .execute(
                serde_json::json!({"message": "msg1", "level": "info"}),
                &ctx(),
            )
            .await
            .unwrap();
        let _ = tool
            .execute(
                serde_json::json!({"message": "msg2", "level": "error"}),
                &ctx(),
            )
            .await
            .unwrap();

        let messages = drain_pending_messages();
        // In parallel test runs, other tests may have enqueued messages too.
        // Find our two messages at the tail.
        assert!(messages.len() >= 2);
        let ours = &messages[messages.len() - 2..];
        assert_eq!(ours[0].message, "msg1");
        assert_eq!(ours[0].level, "info");
        assert_eq!(ours[1].message, "msg2");
        assert_eq!(ours[1].level, "error");
        assert_eq!(ours[0].session_id, "test-session");

        // Draining again should be empty
        assert!(drain_pending_messages().is_empty());
    }

    #[tokio::test]
    async fn test_send_message_with_channel() {
        let _ = drain_pending_messages();

        let tool = SendMessageTool::new();
        let result = tool
            .execute(
                serde_json::json!({
                    "message": "Deploy complete",
                    "channel": "slack",
                    "level": "info"
                }),
                &ctx(),
            )
            .await
            .unwrap();

        assert!(!result.is_error);

        let messages = drain_pending_messages();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].channel.as_deref(), Some("slack"));
    }
}
