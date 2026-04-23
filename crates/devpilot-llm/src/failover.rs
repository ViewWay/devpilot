//! Provider failover — automatic fallback when a primary provider fails.
//!
//! When a provider request fails with a transient error (network, timeout,
//! rate limit), this module tries the configured fallback providers in order
//! until one succeeds or all are exhausted.
//!
//! Fallback providers are configured via `ProviderConfig::fallback_provider_ids`.
//! The registry resolves IDs to concrete provider instances at runtime.

use tracing::{info, warn};

use crate::error::LlmError;
use crate::registry::ProviderRegistry;
use devpilot_protocol::{ChatRequest, ChatResponse, ProviderConfig};

/// Result of a failover attempt.
#[derive(Debug)]
pub struct FailoverResult {
    /// The response from the successful provider.
    pub response: ChatResponse,
    /// The provider config that actually handled the request.
    pub used_provider: ProviderConfig,
    /// How many providers were tried (including the primary).
    pub attempts: u32,
    /// Whether a fallback provider was used instead of the primary.
    pub fell_back: bool,
}

/// Attempt a chat request with automatic failover to backup providers.
///
/// The primary provider is tried first. If it fails with a retryable error,
/// each fallback provider (looked up by ID from the registry) is tried in order.
/// Non-retryable errors (auth, invalid request) are returned immediately.
///
/// # Arguments
///
/// * `registry` — Provider registry for resolving fallback provider IDs.
/// * `primary_config` — The primary provider configuration.
/// * `fallback_configs` — Configurations for fallback providers, ordered by priority.
/// * `request` — The chat request to send.
pub async fn chat_with_failover(
    registry: &ProviderRegistry,
    primary_config: &ProviderConfig,
    fallback_configs: &[ProviderConfig],
    request: ChatRequest,
) -> Result<FailoverResult, LlmError> {
    // Try the primary provider first
    let primary = registry.create(primary_config.clone())?;
    match primary.chat(request.clone()).await {
        Ok(response) => {
            return Ok(FailoverResult {
                response,
                used_provider: primary_config.clone(),
                attempts: 1,
                fell_back: false,
            });
        }
        Err(err) if !err.is_retryable() => {
            // Non-retryable errors should not trigger failover
            warn!(
                "Primary provider '{}' failed with non-retryable error: {}",
                primary_config.name, err
            );
            return Err(err);
        }
        Err(err) => {
            warn!(
                "Primary provider '{}' failed (retryable): {}. Trying fallbacks...",
                primary_config.name, err
            );
        }
    }

    // Try each fallback provider in order
    for (idx, fb_config) in fallback_configs.iter().enumerate() {
        if !fb_config.enabled {
            info!(
                "Skipping disabled fallback provider '{}' (index {idx})",
                fb_config.name
            );
            continue;
        }

        info!(
            "Trying fallback provider '{}' ({} of {}) for model '{}'",
            fb_config.name,
            idx + 1,
            fallback_configs.len(),
            request.model
        );

        match registry.create(fb_config.clone()) {
            Ok(provider) => match provider.chat(request.clone()).await {
                Ok(response) => {
                    info!(
                        "Fallback provider '{}' succeeded after {} attempts",
                        fb_config.name,
                        idx + 2 // primary + this fallback
                    );
                    return Ok(FailoverResult {
                        response,
                        used_provider: fb_config.clone(),
                        attempts: (idx + 2) as u32,
                        fell_back: true,
                    });
                }
                Err(err) if !err.is_retryable() => {
                    warn!(
                        "Fallback provider '{}' failed with non-retryable error: {}",
                        fb_config.name, err
                    );
                    // Continue to next fallback even on non-retryable errors
                    // for fallback providers — only the primary short-circuits.
                    continue;
                }
                Err(err) => {
                    warn!(
                        "Fallback provider '{}' failed (retryable): {}",
                        fb_config.name, err
                    );
                    continue;
                }
            },
            Err(err) => {
                warn!(
                    "Could not create fallback provider '{}': {}",
                    fb_config.name, err
                );
                continue;
            }
        }
    }

    // All providers exhausted
    Err(LlmError::ApiError {
        status: 503,
        message: format!(
            "All providers exhausted (primary + {} fallbacks) for model '{}'",
            fallback_configs.len(),
            request.model
        ),
    })
}

/// Resolve fallback provider IDs to concrete configs.
///
/// Looks up each ID in the provided configs slice and returns the matched
/// provider configs in the same order as the IDs.
pub fn resolve_fallback_configs<'a>(
    fallback_ids: &[String],
    all_configs: &'a [ProviderConfig],
) -> Vec<&'a ProviderConfig> {
    fallback_ids
        .iter()
        .filter_map(|id| all_configs.iter().find(|c| c.id == *id))
        .collect()
}

/// Check if a provider has fallback providers configured.
pub fn has_fallbacks(config: &ProviderConfig) -> bool {
    !config.fallback_provider_ids.is_empty()
}

/// Validate that all fallback provider IDs reference existing providers.
///
/// Returns a list of (id, error_message) tuples for any IDs that don't
/// match a provider in the given configs.
pub fn validate_fallback_ids(
    config: &ProviderConfig,
    all_configs: &[ProviderConfig],
) -> Vec<(String, String)> {
    let known_ids: Vec<&str> = all_configs.iter().map(|c| c.id.as_str()).collect();

    config
        .fallback_provider_ids
        .iter()
        .filter(|id| !known_ids.contains(&id.as_str()))
        .map(|id| {
            (
                id.clone(),
                format!("Fallback provider ID '{id}' not found in configured providers"),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::{ModelInfo, ProviderType};

    fn make_config(
        id: &str,
        provider_type: ProviderType,
        fallback_ids: Vec<&str>,
    ) -> ProviderConfig {
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
            fallback_provider_ids: fallback_ids.into_iter().map(String::from).collect(),
        }
    }

    fn make_configs() -> Vec<ProviderConfig> {
        vec![
            make_config(
                "primary",
                ProviderType::OpenAI,
                vec!["fallback-1", "fallback-2"],
            ),
            make_config("fallback-1", ProviderType::Ollama, vec![]),
            make_config("fallback-2", ProviderType::Anthropic, vec![]),
        ]
    }

    #[test]
    fn test_resolve_fallback_configs() {
        let configs = make_configs();
        let resolved = resolve_fallback_configs(&configs[0].fallback_provider_ids, &configs);
        assert_eq!(resolved.len(), 2);
        assert_eq!(resolved[0].id, "fallback-1");
        assert_eq!(resolved[1].id, "fallback-2");
    }

    #[test]
    fn test_resolve_fallback_configs_missing_id() {
        let configs = make_configs();
        let ids = vec!["fallback-1".to_string(), "nonexistent".to_string()];
        let resolved = resolve_fallback_configs(&ids, &configs);
        assert_eq!(resolved.len(), 1);
        assert_eq!(resolved[0].id, "fallback-1");
    }

    #[test]
    fn test_has_fallbacks() {
        let config_with = make_config("p", ProviderType::OpenAI, vec!["fb"]);
        let config_without = make_config("p", ProviderType::OpenAI, vec![]);
        assert!(has_fallbacks(&config_with));
        assert!(!has_fallbacks(&config_without));
    }

    #[test]
    fn test_validate_fallback_ids_all_valid() {
        let configs = make_configs();
        let errors = validate_fallback_ids(&configs[0], &configs);
        assert!(errors.is_empty());
    }

    #[test]
    fn test_validate_fallback_ids_with_invalid() {
        let configs = make_configs();
        let mut bad_config = configs[0].clone();
        bad_config
            .fallback_provider_ids
            .push("nonexistent".to_string());
        let errors = validate_fallback_ids(&bad_config, &configs);
        assert_eq!(errors.len(), 1);
        assert_eq!(errors[0].0, "nonexistent");
        assert!(errors[0].1.contains("not found"));
    }

    #[test]
    fn test_validate_fallback_ids_empty() {
        let configs = make_configs();
        let errors = validate_fallback_ids(&configs[1], &configs);
        assert!(errors.is_empty());
    }
}
