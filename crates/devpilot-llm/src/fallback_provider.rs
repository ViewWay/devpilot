//! FallbackProvider — a `ModelProvider` wrapper that transparently fails over.
//!
//! Wraps a primary provider with zero or more fallback providers.
//! On retryable errors (network, timeout, rate-limit), the next fallback
//! is tried automatically.  Non-retryable errors (auth, bad-request) are
//! returned immediately.
//!
//! This is designed for **streaming** use: `chat_stream` will try each
//! provider in turn until one returns a successful stream.  The agent
//! loop in `devpilot-core` sees a single `ModelProvider` — no changes
//! needed there.

use std::sync::Arc;

use async_trait::async_trait;
use devpilot_protocol::{ChatRequest, ChatResponse, ProviderConfig};
use tracing::{info, warn};

use crate::error::LlmError;
use crate::provider::{ModelProvider, StreamResult};

// ---------------------------------------------------------------------------
// FallbackProvider
// ---------------------------------------------------------------------------

/// A [`ModelProvider`] that tries providers in order, falling back on retryable errors.
pub struct FallbackProvider {
    /// Ordered list: primary first, then fallbacks.
    providers: Vec<Arc<dyn ModelProvider>>,
    /// Config of the primary provider (returned by `config()`).
    primary_config: ProviderConfig,
}

impl FallbackProvider {
    /// Create a new fallback chain.
    ///
    /// `providers` must contain at least one entry (the primary).
    /// Entries after the first are treated as fallbacks in priority order.
    pub fn new(providers: Vec<Arc<dyn ModelProvider>>) -> Result<Self, LlmError> {
        if providers.is_empty() {
            return Err(LlmError::ProviderNotConfigured(
                "FallbackProvider requires at least one provider".into(),
            ));
        }
        let primary_config = providers[0].config().clone();
        Ok(Self {
            providers,
            primary_config,
        })
    }

    /// Convenience: build from a primary config + fallback configs using a registry.
    pub fn from_configs(
        registry: &crate::registry::ProviderRegistry,
        primary_config: &ProviderConfig,
        fallback_configs: &[ProviderConfig],
    ) -> Result<Self, LlmError> {
        let mut providers = Vec::with_capacity(1 + fallback_configs.len());

        // Primary
        providers.push(registry.create(primary_config.clone())?);

        // Fallbacks
        for cfg in fallback_configs {
            if !cfg.enabled {
                info!("Skipping disabled fallback provider '{}'", cfg.name);
                continue;
            }
            match registry.create(cfg.clone()) {
                Ok(p) => providers.push(p),
                Err(e) => {
                    warn!("Could not create fallback provider '{}': {}", cfg.name, e);
                }
            }
        }

        Self::new(providers)
    }

    /// How many providers are in the chain (including primary).
    pub fn chain_len(&self) -> usize {
        self.providers.len()
    }
}

#[async_trait]
impl ModelProvider for FallbackProvider {
    fn config(&self) -> &ProviderConfig {
        &self.primary_config
    }

    fn name(&self) -> &str {
        self.providers[0].name()
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let mut last_err = None;

        for (idx, provider) in self.providers.iter().enumerate() {
            match provider.chat(request.clone()).await {
                Ok(resp) => {
                    if idx > 0 {
                        info!(
                            "FallbackProvider: '{}' succeeded at position {} (chat)",
                            provider.name(),
                            idx
                        );
                    }
                    return Ok(resp);
                }
                Err(err) if !err.is_retryable() => {
                    // Non-retryable → short-circuit only for primary.
                    // For fallbacks, we still try the next one.
                    if idx == 0 {
                        warn!(
                            "Primary provider '{}' non-retryable error: {}",
                            provider.name(),
                            err
                        );
                        last_err = Some(err);
                        break;
                    }
                    warn!(
                        "Fallback provider '{}' non-retryable error: {}",
                        provider.name(),
                        err
                    );
                    last_err = Some(err);
                }
                Err(err) => {
                    warn!(
                        "Provider '{}' retryable error (position {}): {}",
                        provider.name(),
                        idx,
                        err
                    );
                    last_err = Some(err);
                }
            }
        }

        Err(last_err.unwrap_or_else(|| LlmError::ApiError {
            status: 503,
            message: "All providers exhausted (chat)".into(),
        }))
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
        session_id: String,
    ) -> Result<StreamResult, LlmError> {
        let mut last_err = None;

        for (idx, provider) in self.providers.iter().enumerate() {
            match provider
                .chat_stream(request.clone(), session_id.clone())
                .await
            {
                Ok(stream) => {
                    if idx > 0 {
                        info!(
                            "FallbackProvider: '{}' succeeded at position {} (stream, session: {})",
                            provider.name(),
                            idx,
                            session_id
                        );
                    }
                    return Ok(stream);
                }
                Err(err) if !err.is_retryable() && idx == 0 => {
                    // Primary non-retryable → stop immediately
                    warn!(
                        "Primary provider '{}' non-retryable stream error: {}",
                        provider.name(),
                        err
                    );
                    return Err(err);
                }
                Err(err) => {
                    warn!(
                        "Provider '{}' stream error (position {}, session {}): {}",
                        provider.name(),
                        idx,
                        session_id,
                        err
                    );
                    last_err = Some(err);
                }
            }
        }

        Err(last_err.unwrap_or_else(|| LlmError::ApiError {
            status: 503,
            message: format!(
                "All providers exhausted for streaming (session: {})",
                session_id
            ),
        }))
    }

    async fn probe(&self) -> Result<(), LlmError> {
        // Probe the primary only — fallbacks are checked lazily.
        self.providers[0].probe().await
    }

    async fn list_models(&self) -> Result<Vec<String>, LlmError> {
        self.providers[0].list_models().await
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::registry::ProviderRegistry;
    use devpilot_protocol::{ModelInfo, ProviderType};

    fn test_config(id: &str, provider_type: ProviderType) -> ProviderConfig {
        ProviderConfig {
            id: id.to_string(),
            name: format!("{id} Provider"),
            provider_type,
            base_url: "http://localhost:11434".to_string(),
            api_key: Some("test-key".to_string()),
            models: vec![ModelInfo {
                id: "test-model".to_string(),
                name: "Test Model".to_string(),
                provider: provider_type,
                max_input_tokens: 4096,
                max_output_tokens: 2048,
                supports_streaming: true,
                supports_tools: true,
                supports_vision: false,
                input_price_per_million: None,
                output_price_per_million: None,
            }],
            enabled: true,
            fallback_provider_ids: vec![],
        }
    }

    #[test]
    fn fallback_provider_requires_at_least_one() {
        let result = FallbackProvider::new(vec![]);
        assert!(result.is_err());
    }

    #[test]
    fn fallback_provider_from_configs_primary_only() {
        let registry = ProviderRegistry::with_defaults();
        let primary = test_config("primary", ProviderType::OpenAI);
        let fb = FallbackProvider::from_configs(&registry, &primary, &[]);
        assert!(fb.is_ok());
        assert_eq!(fb.unwrap().chain_len(), 1);
    }

    #[test]
    fn fallback_provider_from_configs_with_fallbacks() {
        let registry = ProviderRegistry::with_defaults();
        let primary = test_config("primary", ProviderType::OpenAI);
        let fb1 = test_config("fb1", ProviderType::Anthropic);
        let fb2 = test_config("fb2", ProviderType::Ollama);
        let fb = FallbackProvider::from_configs(&registry, &primary, &[fb1, fb2]);
        assert!(fb.is_ok());
        assert_eq!(fb.unwrap().chain_len(), 3);
    }

    #[test]
    fn fallback_provider_skips_disabled() {
        let registry = ProviderRegistry::with_defaults();
        let primary = test_config("primary", ProviderType::OpenAI);
        let mut fb1 = test_config("fb1", ProviderType::Anthropic);
        fb1.enabled = false;
        let fb2 = test_config("fb2", ProviderType::Ollama);
        let fb = FallbackProvider::from_configs(&registry, &primary, &[fb1, fb2]);
        assert!(fb.is_ok());
        assert_eq!(fb.unwrap().chain_len(), 2); // primary + fb2 (fb1 skipped)
    }
}
