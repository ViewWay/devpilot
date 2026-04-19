//! # devpilot-bridge
//!
//! IM bridge — send notifications to multiple platforms.
//!
//! Supported platforms:
//! - Telegram (Bot API)
//! - Feishu / Lark (Webhook)
//! - Discord (Webhook)
//! - Slack (Webhook)
//! - Generic Webhook
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_bridge::{BridgeManager, BridgeConfig, Platform};
//!
//! let manager = BridgeManager::new();
//!
//! let config = BridgeConfig {
//!     platform: Platform::Telegram,
//!     webhook_url: "https://api.telegram.org/bot<TOKEN>/sendMessage".into(),
//!     channel: Some("@devpilot_alerts".into()),
//!     ..Default::default()
//! };
//!
//! manager.add_bridge("alerts".into(), config).await;
//! manager.send_all("Build passed!").await;
//! ```

mod bridge;
mod bridge_trait;
mod error;
mod platforms;
mod types;

pub use bridge::Bridge;
pub use bridge::BridgeManager;
pub use bridge_trait::PlatformSender;
pub use error::{BridgeError, BridgeResult};
pub use types::{BridgeConfig, BridgeId, MessagePayload, Platform};
