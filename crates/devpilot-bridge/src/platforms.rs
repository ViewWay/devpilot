//! Platform-specific senders.

use crate::error::BridgeError;
use crate::types::{BridgeConfig, MessageLevel, MessagePayload, Platform, SendResult};
use async_trait::async_trait;
use serde_json::json;

/// Trait for platform senders.
#[async_trait]
pub trait PlatformSender: Send + Sync {
    /// Send a message payload.
    async fn send(
        &self,
        config: &BridgeConfig,
        payload: &MessagePayload,
    ) -> Result<SendResult, BridgeError>;
}

/// Telegram Bot API sender.
pub struct TelegramSender;

#[async_trait]
impl PlatformSender for TelegramSender {
    async fn send(
        &self,
        config: &BridgeConfig,
        payload: &MessagePayload,
    ) -> Result<SendResult, BridgeError> {
        let chat_id = config.channel.as_deref().unwrap_or("");
        if chat_id.is_empty() {
            return Err(BridgeError::InvalidConfig(
                "Telegram requires a channel (chat_id)".into(),
            ));
        }

        let text = format_payload_text(payload);
        let body = json!({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        });

        let url = if config.webhook_url.contains("/sendMessage") {
            config.webhook_url.clone()
        } else {
            format!("{}/sendMessage", config.webhook_url.trim_end_matches('/'))
        };

        let resp = reqwest::Client::new().post(&url).json(&body).send().await?;

        let status = resp.status().as_u16();
        let success = resp.status().is_success();

        Ok(SendResult {
            bridge_id: String::new(), // filled by caller
            success,
            status_code: Some(status),
            error: if success {
                None
            } else {
                Some(format!("HTTP {status}"))
            },
        })
    }
}

/// Feishu/Lark webhook sender.
pub struct FeishuSender;

#[async_trait]
impl PlatformSender for FeishuSender {
    async fn send(
        &self,
        config: &BridgeConfig,
        payload: &MessagePayload,
    ) -> Result<SendResult, BridgeError> {
        let text = format_payload_text(payload);
        let body = json!({
            "msg_type": "text",
            "content": {
                "text": text,
            }
        });

        let resp = reqwest::Client::new()
            .post(&config.webhook_url)
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        let success = resp.status().is_success();

        Ok(SendResult {
            bridge_id: String::new(),
            success,
            status_code: Some(status),
            error: if success {
                None
            } else {
                Some(format!("HTTP {status}"))
            },
        })
    }
}

/// Discord webhook sender.
pub struct DiscordSender;

#[async_trait]
impl PlatformSender for DiscordSender {
    async fn send(
        &self,
        config: &BridgeConfig,
        payload: &MessagePayload,
    ) -> Result<SendResult, BridgeError> {
        let text = format_payload_text(payload);
        let mut body = json!({
            "content": text,
        });

        if let Some(ref title) = payload.title {
            body["embeds"] = json!([{
                "title": title,
                "description": &payload.text,
                "color": level_to_discord_color(payload.level),
            }]);
            body["content"] = json!(null);
        }

        let resp = reqwest::Client::new()
            .post(&config.webhook_url)
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        let success = resp.status().is_success();

        Ok(SendResult {
            bridge_id: String::new(),
            success,
            status_code: Some(status),
            error: if success {
                None
            } else {
                Some(format!("HTTP {status}"))
            },
        })
    }
}

/// Slack webhook sender.
pub struct SlackSender;

#[async_trait]
impl PlatformSender for SlackSender {
    async fn send(
        &self,
        config: &BridgeConfig,
        payload: &MessagePayload,
    ) -> Result<SendResult, BridgeError> {
        let text = format_payload_text(payload);
        let body = json!({
            "text": text,
        });

        let resp = reqwest::Client::new()
            .post(&config.webhook_url)
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        let success = resp.status().is_success();

        Ok(SendResult {
            bridge_id: String::new(),
            success,
            status_code: Some(status),
            error: if success {
                None
            } else {
                Some(format!("HTTP {status}"))
            },
        })
    }
}

/// Generic webhook sender (POST JSON).
pub struct GenericWebhookSender;

#[async_trait]
impl PlatformSender for GenericWebhookSender {
    async fn send(
        &self,
        config: &BridgeConfig,
        payload: &MessagePayload,
    ) -> Result<SendResult, BridgeError> {
        let body = json!({
            "text": payload.text,
            "title": payload.title,
            "level": format!("{:?}", payload.level),
            "timestamp": payload.timestamp.to_rfc3339(),
        });

        let resp = reqwest::Client::new()
            .post(&config.webhook_url)
            .json(&body)
            .send()
            .await?;

        let status = resp.status().as_u16();
        let success = resp.status().is_success();

        Ok(SendResult {
            bridge_id: String::new(),
            success,
            status_code: Some(status),
            error: if success {
                None
            } else {
                Some(format!("HTTP {status}"))
            },
        })
    }
}

/// Get the appropriate sender for a platform.
pub fn get_sender(platform: Platform) -> Box<dyn PlatformSender> {
    match platform {
        Platform::Telegram => Box::new(TelegramSender),
        Platform::Feishu => Box::new(FeishuSender),
        Platform::Discord => Box::new(DiscordSender),
        Platform::Slack => Box::new(SlackSender),
        Platform::GenericWebhook => Box::new(GenericWebhookSender),
    }
}

/// Format a payload into display text.
fn format_payload_text(payload: &MessagePayload) -> String {
    let level_icon = match payload.level {
        MessageLevel::Info => "ℹ️",
        MessageLevel::Warning => "⚠️",
        MessageLevel::Error => "❌",
        MessageLevel::Success => "✅",
    };

    let mut parts = vec![format!("{level_icon} ")];

    if let Some(ref title) = payload.title {
        parts.push(format!("**{title}**\n"));
    }

    parts.push(payload.text.clone());

    if !payload.metadata.is_empty() {
        parts.push("\n".to_string());
        for (k, v) in &payload.metadata {
            parts.push(format!("\n{k}: {v}"));
        }
    }

    parts.join("")
}

/// Map message level to Discord embed color.
fn level_to_discord_color(level: MessageLevel) -> i32 {
    match level {
        MessageLevel::Info => 0x3498db,    // blue
        MessageLevel::Warning => 0xf39c12, // orange
        MessageLevel::Error => 0xe74c3c,   // red
        MessageLevel::Success => 0x2ecc71, // green
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_payload_with_title() {
        let p = MessagePayload::text("hello world").with_title("Test");
        let text = format_payload_text(&p);
        assert!(text.contains("Test"));
        assert!(text.contains("hello world"));
    }

    #[test]
    fn format_payload_with_metadata() {
        let p = MessagePayload::text("msg")
            .with_meta("key1", "val1")
            .with_meta("key2", "val2");
        let text = format_payload_text(&p);
        assert!(text.contains("key1: val1"));
        assert!(text.contains("key2: val2"));
    }

    #[test]
    fn discord_colors() {
        assert_eq!(level_to_discord_color(MessageLevel::Info), 0x3498db);
        assert_eq!(level_to_discord_color(MessageLevel::Error), 0xe74c3c);
    }

    #[test]
    fn platform_name() {
        assert_eq!(Platform::Telegram.name(), "Telegram");
        assert_eq!(Platform::Feishu.name(), "Feishu");
    }

    #[test]
    fn validate_config_empty_url() {
        let config = BridgeConfig::default();
        assert!(config.validate().is_err());
    }

    #[test]
    fn validate_config_ok() {
        let config = BridgeConfig {
            platform: Platform::Slack,
            webhook_url: "https://hooks.slack.com/services/xxx".into(),
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }
}
