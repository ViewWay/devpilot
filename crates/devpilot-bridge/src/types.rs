//! Bridge types — config, payload, platform enum.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Unique bridge identifier.
pub type BridgeId = String;

/// Supported platforms.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum Platform {
    #[default]
    Telegram,
    Feishu,
    Discord,
    Slack,
    GenericWebhook,
}

impl Platform {
    /// Human-readable name.
    pub fn name(&self) -> &'static str {
        match self {
            Platform::Telegram => "Telegram",
            Platform::Feishu => "Feishu",
            Platform::Discord => "Discord",
            Platform::Slack => "Slack",
            Platform::GenericWebhook => "Webhook",
        }
    }
}

/// A bridge configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BridgeConfig {
    /// Which platform.
    pub platform: Platform,
    /// Webhook URL or API endpoint.
    pub webhook_url: String,
    /// Target channel/chat ID (platform-specific).
    pub channel: Option<String>,
    /// Bot token (for Telegram).
    pub token: Option<String>,
    /// Whether this bridge is enabled.
    pub enabled: bool,
    /// Optional display name.
    pub name: Option<String>,
}

impl Default for BridgeConfig {
    fn default() -> Self {
        Self {
            platform: Platform::default(),
            webhook_url: String::new(),
            channel: None,
            token: None,
            enabled: true,
            name: None,
        }
    }
}

impl BridgeConfig {
    /// Validate the config.
    pub fn validate(&self) -> Result<(), String> {
        if self.webhook_url.is_empty() {
            return Err("webhook_url cannot be empty".into());
        }
        if self.platform == Platform::Telegram
            && self.token.is_none()
            && !self.webhook_url.contains("/bot")
        {
            return Err("Telegram requires a bot token".into());
        }
        Ok(())
    }
}

/// A message to send.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagePayload {
    /// Text content.
    pub text: String,
    /// Optional title/subject.
    pub title: Option<String>,
    /// Severity level.
    pub level: MessageLevel,
    /// Timestamp.
    pub timestamp: DateTime<Utc>,
    /// Extra key-value metadata.
    pub metadata: Vec<(String, String)>,
}

/// Message severity.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum MessageLevel {
    #[default]
    Info,
    Warning,
    Error,
    Success,
}

impl MessagePayload {
    /// Create a simple text message.
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            title: None,
            level: MessageLevel::Info,
            timestamp: Utc::now(),
            metadata: vec![],
        }
    }

    /// Add a title.
    pub fn with_title(mut self, title: impl Into<String>) -> Self {
        self.title = Some(title.into());
        self
    }

    /// Set severity.
    pub fn with_level(mut self, level: MessageLevel) -> Self {
        self.level = level;
        self
    }

    /// Add metadata.
    pub fn with_meta(mut self, key: impl Into<String>, val: impl Into<String>) -> Self {
        self.metadata.push((key.into(), val.into()));
        self
    }
}

/// Result of a send operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendResult {
    /// Which bridge was used.
    pub bridge_id: BridgeId,
    /// Whether the send succeeded.
    pub success: bool,
    /// HTTP status code (if available).
    pub status_code: Option<u16>,
    /// Error message (if failed).
    pub error: Option<String>,
}
