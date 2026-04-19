//! Bridge manager — manages multiple bridges and dispatches messages.

use crate::bridge_trait::PlatformSender;
use crate::error::{BridgeError, BridgeResult};
use crate::platforms;
use crate::types::{BridgeConfig, BridgeId, MessagePayload, SendResult};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// A configured bridge instance.
pub struct Bridge {
    pub id: BridgeId,
    pub config: BridgeConfig,
    sender: Box<dyn PlatformSender>,
}

impl Bridge {
    /// Create a new bridge from config.
    pub fn new(id: BridgeId, config: BridgeConfig) -> Self {
        let sender = platforms::get_sender(config.platform);
        Self { id, config, sender }
    }

    /// Send a message through this bridge.
    pub async fn send(&self, payload: &MessagePayload) -> SendResult {
        match self.sender.send(&self.config, payload).await {
            Ok(mut result) => {
                result.bridge_id = self.id.clone();
                result
            }
            Err(e) => SendResult {
                bridge_id: self.id.clone(),
                success: false,
                status_code: None,
                error: Some(e.to_string()),
            },
        }
    }
}

/// Manages multiple bridges.
pub struct BridgeManager {
    bridges: Arc<RwLock<HashMap<BridgeId, Bridge>>>,
}

impl Default for BridgeManager {
    fn default() -> Self {
        Self::new()
    }
}

impl BridgeManager {
    /// Create a new manager.
    pub fn new() -> Self {
        Self {
            bridges: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Add a bridge.
    pub async fn add_bridge(&self, id: BridgeId, config: BridgeConfig) -> BridgeResult<()> {
        config.validate().map_err(BridgeError::InvalidConfig)?;
        let bridge = Bridge::new(id.clone(), config);
        self.bridges.write().await.insert(id, bridge);
        Ok(())
    }

    /// Remove a bridge.
    pub async fn remove_bridge(&self, id: &str) -> BridgeResult<()> {
        self.bridges
            .write()
            .await
            .remove(id)
            .ok_or_else(|| BridgeError::NotFound(id.to_string()))?;
        Ok(())
    }

    /// Get a bridge by ID.
    pub async fn get_bridge(&self, id: &str) -> Option<BridgeConfig> {
        let bridges = self.bridges.read().await;
        bridges.get(id).map(|b| b.config.clone())
    }

    /// List all bridge configs.
    pub async fn list_bridges(&self) -> Vec<(BridgeId, BridgeConfig)> {
        let bridges = self.bridges.read().await;
        bridges
            .values()
            .map(|b| (b.id.clone(), b.config.clone()))
            .collect()
    }

    /// Enable a bridge.
    pub async fn enable_bridge(&self, id: &str) -> BridgeResult<()> {
        let mut bridges = self.bridges.write().await;
        let bridge = bridges
            .get_mut(id)
            .ok_or_else(|| BridgeError::NotFound(id.to_string()))?;
        bridge.config.enabled = true;
        Ok(())
    }

    /// Disable a bridge.
    pub async fn disable_bridge(&self, id: &str) -> BridgeResult<()> {
        let mut bridges = self.bridges.write().await;
        let bridge = bridges
            .get_mut(id)
            .ok_or_else(|| BridgeError::NotFound(id.to_string()))?;
        bridge.config.enabled = false;
        Ok(())
    }

    /// Send a message to a specific bridge.
    pub async fn send_to(&self, id: &str, payload: &MessagePayload) -> BridgeResult<SendResult> {
        let bridges = self.bridges.read().await;
        let bridge = bridges
            .get(id)
            .ok_or_else(|| BridgeError::NotFound(id.to_string()))?;

        if !bridge.config.enabled {
            return Ok(SendResult {
                bridge_id: id.to_string(),
                success: false,
                status_code: None,
                error: Some("bridge is disabled".into()),
            });
        }

        // Drop the read lock before sending (send is async)
        let bridge_id = bridge.id.clone();
        let sender = platforms::get_sender(bridge.config.platform);
        let config = bridge.config.clone();

        drop(bridges);

        let mut result = sender.send(&config, payload).await?;
        result.bridge_id = bridge_id;
        Ok(result)
    }

    /// Send a message to all enabled bridges.
    pub async fn send_all(&self, payload: &MessagePayload) -> Vec<SendResult> {
        let bridges = self.bridges.read().await;
        let enabled: Vec<_> = bridges.values().filter(|b| b.config.enabled).collect();

        let mut results = Vec::new();
        for bridge in enabled {
            let result = bridge.send(payload).await;
            results.push(result);
        }
        results
    }

    /// Get the number of bridges.
    pub async fn count(&self) -> usize {
        self.bridges.read().await.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Platform;

    #[tokio::test]
    async fn add_and_list_bridges() {
        let mgr = BridgeManager::new();
        let config = BridgeConfig {
            platform: Platform::Discord,
            webhook_url: "https://discord.com/api/webhooks/xxx".into(),
            ..Default::default()
        };

        mgr.add_bridge("discord-main".into(), config).await.unwrap();
        assert_eq!(mgr.count().await, 1);

        let bridges = mgr.list_bridges().await;
        assert_eq!(bridges.len(), 1);
        assert_eq!(bridges[0].0, "discord-main");
    }

    #[tokio::test]
    async fn remove_bridge() {
        let mgr = BridgeManager::new();
        let config = BridgeConfig {
            platform: Platform::Slack,
            webhook_url: "https://hooks.slack.com/services/xxx".into(),
            ..Default::default()
        };

        mgr.add_bridge("slack".into(), config).await.unwrap();
        mgr.remove_bridge("slack").await.unwrap();
        assert_eq!(mgr.count().await, 0);
    }

    #[tokio::test]
    async fn remove_nonexistent() {
        let mgr = BridgeManager::new();
        let result = mgr.remove_bridge("nope").await;
        assert!(matches!(result, Err(BridgeError::NotFound(_))));
    }

    #[tokio::test]
    async fn enable_disable_bridge() {
        let mgr = BridgeManager::new();
        let config = BridgeConfig {
            platform: Platform::Feishu,
            webhook_url: "https://open.feishu.cn/open-apis/bot/v2/hook/xxx".into(),
            ..Default::default()
        };

        mgr.add_bridge("feishu".into(), config).await.unwrap();

        mgr.disable_bridge("feishu").await.unwrap();
        let cfg = mgr.get_bridge("feishu").await.unwrap();
        assert!(!cfg.enabled);

        mgr.enable_bridge("feishu").await.unwrap();
        let cfg = mgr.get_bridge("feishu").await.unwrap();
        assert!(cfg.enabled);
    }

    #[tokio::test]
    async fn invalid_config_rejected() {
        let mgr = BridgeManager::new();
        let config = BridgeConfig {
            platform: Platform::Telegram,
            webhook_url: "".into(),
            ..Default::default()
        };
        let result = mgr.add_bridge("bad".into(), config).await;
        assert!(matches!(result, Err(BridgeError::InvalidConfig(_))));
    }

    #[tokio::test]
    async fn send_to_disabled_bridge() {
        let mgr = BridgeManager::new();
        let config = BridgeConfig {
            platform: Platform::GenericWebhook,
            webhook_url: "https://httpbin.org/post".into(),
            enabled: false,
            ..Default::default()
        };

        mgr.add_bridge("disabled".into(), config).await.unwrap();
        let result = mgr
            .send_to("disabled", &MessagePayload::text("test"))
            .await
            .unwrap();
        assert!(!result.success);
        assert!(result.error.unwrap().contains("disabled"));
    }
}
