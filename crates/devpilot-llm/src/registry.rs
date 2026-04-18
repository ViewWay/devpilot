//! Provider registry and factory.
//!
//! Centralizes creation and lookup of LLM provider instances.
//! Providers are registered by their `ProviderType` and can be
//! instantiated from `ProviderConfig` values.

use devpilot_protocol::{ProviderConfig, ProviderType};
use std::collections::HashMap;
use std::sync::Arc;

use crate::anthropic::AnthropicProvider;
use crate::error::LlmError;
use crate::ollama::OllamaProvider;
use crate::openai::OpenAiProvider;
use crate::provider::ModelProvider;

/// Factory function type: creates a provider from config.
type FactoryFn = fn(ProviderConfig) -> Box<dyn ModelProvider>;

/// Builder for constructing providers with optional pre-configuration.
type BuilderFn = Box<dyn Fn(ProviderConfig) -> Box<dyn ModelProvider> + Send + Sync>;

/// Registry that holds provider factories and manages provider instances.
pub struct ProviderRegistry {
    /// Simple factories keyed by provider type.
    factories: HashMap<ProviderType, FactoryFn>,
    /// Advanced builders (for dependency injection, custom HTTP clients, etc.).
    builders: HashMap<ProviderType, BuilderFn>,
}

impl ProviderRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            factories: HashMap::new(),
            builders: HashMap::new(),
        }
    }

    /// Create a registry pre-loaded with all built-in providers.
    pub fn with_defaults() -> Self {
        let mut registry = Self::new();
        registry.register_defaults();
        registry
    }

    /// Register all built-in providers.
    fn register_defaults(&mut self) {
        self.register(ProviderType::OpenAI, |config| {
            Box::new(OpenAiProvider::new(config))
        });
        self.register(ProviderType::OpenRouter, |config| {
            Box::new(OpenAiProvider::new(config))
        });
        self.register(ProviderType::Anthropic, |config| {
            Box::new(AnthropicProvider::new(config))
        });
        self.register(ProviderType::Ollama, |config| {
            Box::new(OllamaProvider::new(config))
        });
        // Google uses OpenAI-compatible API (Gemini endpoint)
        self.register(ProviderType::Google, |config| {
            Box::new(OpenAiProvider::new(config))
        });
    }

    /// Register a factory function for a provider type.
    pub fn register(&mut self, provider_type: ProviderType, factory: FactoryFn) {
        self.factories.insert(provider_type, factory);
    }

    /// Register an advanced builder for a provider type.
    pub fn register_builder(&mut self, provider_type: ProviderType, builder: BuilderFn) {
        self.builders.insert(provider_type, builder);
    }

    /// Create a provider instance from a configuration.
    ///
    /// Checks builders first (for custom/advanced setup), then falls back
    /// to simple factories.
    pub fn create(&self, config: ProviderConfig) -> Result<Arc<dyn ModelProvider>, LlmError> {
        // Check for a builder first
        if let Some(builder) = self.builders.get(&config.provider_type) {
            return Ok(Arc::from(builder(config)));
        }

        // Fall back to simple factory
        let factory = self.factories.get(&config.provider_type).ok_or_else(|| {
            LlmError::ProviderNotConfigured(format!(
                "No provider registered for type: {}",
                config.provider_type
            ))
        })?;

        Ok(Arc::from(factory(config)))
    }

    /// Check if a provider type is registered.
    pub fn has_provider(&self, provider_type: &ProviderType) -> bool {
        self.factories.contains_key(provider_type) || self.builders.contains_key(provider_type)
    }

    /// List all registered provider types.
    pub fn registered_types(&self) -> Vec<ProviderType> {
        let mut types: Vec<ProviderType> = self
            .factories
            .keys()
            .chain(self.builders.keys())
            .copied()
            .collect();
        types.dedup();
        types
    }

    /// Create providers for all configs in a batch.
    pub fn create_all(
        &self,
        configs: Vec<ProviderConfig>,
    ) -> Vec<Result<Arc<dyn ModelProvider>, LlmError>> {
        configs.into_iter().map(|c| self.create(c)).collect()
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        Self::with_defaults()
    }
}

/// Convenience function: create a provider from config using the default registry.
pub fn create_provider(config: ProviderConfig) -> Result<Arc<dyn ModelProvider>, LlmError> {
    let registry = ProviderRegistry::with_defaults();
    registry.create(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::ModelInfo;

    fn test_config(provider_type: ProviderType) -> ProviderConfig {
        ProviderConfig {
            id: format!("{provider_type}-test"),
            name: format!("{provider_type} Test"),
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
        }
    }

    #[test]
    fn registry_has_all_built_in_providers() {
        let registry = ProviderRegistry::with_defaults();
        assert!(registry.has_provider(&ProviderType::OpenAI));
        assert!(registry.has_provider(&ProviderType::OpenRouter));
        assert!(registry.has_provider(&ProviderType::Anthropic));
        assert!(registry.has_provider(&ProviderType::Ollama));
        assert!(registry.has_provider(&ProviderType::Google));
    }

    #[test]
    fn create_openai_provider() {
        let registry = ProviderRegistry::with_defaults();
        let config = test_config(ProviderType::OpenAI);
        let provider = registry.create(config).unwrap();
        assert_eq!(provider.name(), "openai Test");
    }

    #[test]
    fn create_ollama_provider() {
        let registry = ProviderRegistry::with_defaults();
        let config = test_config(ProviderType::Ollama);
        let provider = registry.create(config).unwrap();
        assert_eq!(provider.name(), "ollama Test");
    }

    #[test]
    fn create_anthropic_provider() {
        let registry = ProviderRegistry::with_defaults();
        let config = test_config(ProviderType::Anthropic);
        let provider = registry.create(config).unwrap();
        assert_eq!(provider.name(), "anthropic Test");
    }

    #[test]
    fn unknown_provider_type_returns_error() {
        // Use an empty registry — no providers registered
        let registry = ProviderRegistry::new();
        let config = test_config(ProviderType::OpenAI);
        let result = registry.create(config);
        assert!(result.is_err());
    }

    #[test]
    fn convenience_create_provider_works() {
        let config = test_config(ProviderType::OpenAI);
        let provider = create_provider(config).unwrap();
        assert_eq!(provider.name(), "openai Test");
    }

    #[test]
    fn registered_types_lists_all() {
        let registry = ProviderRegistry::with_defaults();
        let types = registry.registered_types();
        assert!(types.contains(&ProviderType::OpenAI));
        assert!(types.contains(&ProviderType::Anthropic));
        assert!(types.contains(&ProviderType::Ollama));
        assert!(types.len() >= 5);
    }
}
