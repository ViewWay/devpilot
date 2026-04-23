//! Model pricing catalog — centralized pricing data for well-known models.
//!
//! Provides a lookup table of per-model pricing that can be used to estimate
//! costs without requiring the full `ProviderConfig` to be present.
//! Prices are sourced from official provider pricing pages as of 2025-04.

use crate::types::ModelPricing;
use std::collections::HashMap;

/// Lookup key: (provider_type, model_id).
type PricingKey = (String, String);

macro_rules! pricing {
    ($input:expr, $output:expr) => {
        ModelPricing {
            input_per_million: $input,
            output_per_million: $output,
            cache_read_per_million: 0.0,
            cache_write_per_million: 0.0,
        }
    };
    ($input:expr, $output:expr, $cache_read:expr, $cache_write:expr) => {
        ModelPricing {
            input_per_million: $input,
            output_per_million: $output,
            cache_read_per_million: $cache_read,
            cache_write_per_million: $cache_write,
        }
    };
}

/// Build the static pricing catalog.
///
/// Prices are USD per 1M tokens. When a model is not found, pricing
/// defaults to zero (the caller can then fall back to `ProviderConfig.models`).
fn build_catalog() -> HashMap<PricingKey, ModelPricing> {
    let mut m = HashMap::new();

    // ── Anthropic Claude ────────────────────────────────
    m.insert(
        ("anthropic".into(), "claude-sonnet-4-20250514".into()),
        pricing!(3.0, 15.0, 0.3, 3.75),
    );
    m.insert(
        ("anthropic".into(), "claude-opus-4-20250514".into()),
        pricing!(15.0, 75.0, 1.5, 18.75),
    );
    m.insert(
        ("anthropic".into(), "claude-haiku-4-20250514".into()),
        pricing!(0.80, 4.0, 0.08, 1.0),
    );
    // Claude 3.5 family (legacy)
    m.insert(
        ("anthropic".into(), "claude-3-5-sonnet-20241022".into()),
        pricing!(3.0, 15.0, 0.3, 3.75),
    );
    m.insert(
        ("anthropic".into(), "claude-3-5-haiku-20241022".into()),
        pricing!(0.80, 4.0, 0.08, 1.0),
    );

    // ── OpenAI ──────────────────────────────────────────
    m.insert(
        ("openai".into(), "gpt-4o".into()),
        pricing!(2.5, 10.0, 1.25, 0.0),
    );
    m.insert(
        ("openai".into(), "gpt-4o-mini".into()),
        pricing!(0.15, 0.60, 0.075, 0.0),
    );
    m.insert(
        ("openai".into(), "o3".into()),
        pricing!(10.0, 40.0, 2.50, 0.0),
    );
    m.insert(
        ("openai".into(), "o4-mini".into()),
        pricing!(1.50, 6.0, 0.375, 0.0),
    );
    // Legacy
    m.insert(
        ("openai".into(), "gpt-4-turbo".into()),
        pricing!(10.0, 30.0),
    );

    // ── Google Gemini ───────────────────────────────────
    m.insert(
        ("google".into(), "gemini-2.5-pro-preview-06-05".into()),
        pricing!(1.25, 10.0, 0.315, 0.0),
    );
    m.insert(
        ("google".into(), "gemini-2.0-flash".into()),
        pricing!(0.10, 0.40, 0.025, 0.0),
    );

    // ── DeepSeek ────────────────────────────────────────
    m.insert(
        ("deepseek".into(), "deepseek-chat".into()),
        pricing!(0.27, 1.10, 0.07, 0.0),
    );
    m.insert(
        ("deepseek".into(), "deepseek-reasoner".into()),
        pricing!(0.55, 2.19, 0.14, 0.0),
    );

    // ── GLM (智谱) ──────────────────────────────────────
    m.insert(
        ("glm".into(), "glm-4-plus".into()),
        pricing!(50.0, 50.0),
    );

    // ── Qwen (通义千问) ─────────────────────────────────
    m.insert(
        ("qwen".into(), "qwen-max".into()),
        pricing!(20.0, 60.0),
    );
    m.insert(
        ("qwen".into(), "qwen-plus".into()),
        pricing!(4.0, 12.0),
    );

    // ── Kimi (Moonshot) ─────────────────────────────────
    m.insert(
        ("kimi".into(), "moonshot-v1-8k".into()),
        pricing!(12.0, 12.0),
    );

    m
}

/// Look up pricing for a model by provider type and model ID.
///
/// First tries an exact match on the model ID. If that fails, falls back to
/// prefix matching (e.g., "claude-sonnet-4-20250514" matches a key starting
/// with "claude-sonnet-4").
///
/// Returns `None` if the model is not in the catalog.
pub fn lookup_pricing(provider_type: &str, model_id: &str) -> Option<ModelPricing> {
    let catalog = build_catalog();

    // Exact match first
    if let Some(pricing) = catalog.get(&(provider_type.to_string(), model_id.to_string())) {
        return Some(pricing.clone());
    }

    // Prefix fallback: try matching on model ID prefix
    // This handles cases like "claude-sonnet-4-20250514" → "claude-sonnet-4-..."
    let model_prefix = model_id
        .split_once('-')
        .map(|(p, _)| p)
        .unwrap_or(model_id);

    for ((provider, model), pricing) in &catalog {
        if provider == provider_type {
            let cat_prefix = model.split_once('-').map(|(p, _)| p).unwrap_or(model);
            if cat_prefix == model_prefix {
                return Some(pricing.clone());
            }
        }
    }

    None
}

/// Look up pricing, with fallback to the `ProviderConfig.models` list.
///
/// This tries:
/// 1. The centralized catalog
/// 2. The provider's own model list (from `ModelInfo`)
/// 3. Returns default (zero) pricing if neither has data
pub fn lookup_pricing_with_fallback(
    provider_type: &str,
    model_id: &str,
    config_models: &[devpilot_protocol::ModelInfo],
) -> ModelPricing {
    // Try catalog first
    if let Some(pricing) = lookup_pricing(provider_type, model_id) {
        return pricing;
    }

    // Fall back to config model list
    if let Some(model) = config_models.iter().find(|m| m.id == model_id) {
        return ModelPricing {
            input_per_million: model.input_price_per_million.unwrap_or(0.0),
            output_per_million: model.output_price_per_million.unwrap_or(0.0),
            cache_read_per_million: 0.0,
            cache_write_per_million: 0.0,
        };
    }

    ModelPricing::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_claude_sonnet_4() {
        let pricing = lookup_pricing("anthropic", "claude-sonnet-4-20250514").unwrap();
        assert_eq!(pricing.input_per_million, 3.0);
        assert_eq!(pricing.output_per_million, 15.0);
        assert_eq!(pricing.cache_read_per_million, 0.3);
    }

    #[test]
    fn lookup_gpt4o() {
        let pricing = lookup_pricing("openai", "gpt-4o").unwrap();
        assert_eq!(pricing.input_per_million, 2.5);
        assert_eq!(pricing.output_per_million, 10.0);
    }

    #[test]
    fn lookup_deepseek_chat() {
        let pricing = lookup_pricing("deepseek", "deepseek-chat").unwrap();
        assert_eq!(pricing.input_per_million, 0.27);
        assert_eq!(pricing.output_per_million, 1.10);
    }

    #[test]
    fn lookup_unknown_returns_none() {
        let pricing = lookup_pricing("unknown", "fake-model");
        assert!(pricing.is_none());
    }

    #[test]
    fn lookup_with_fallback_uses_catalog() {
        let pricing = lookup_pricing_with_fallback("openai", "gpt-4o", &[]);
        assert_eq!(pricing.input_per_million, 2.5);
    }

    #[test]
    fn lookup_with_fallback_uses_config_models() {
        use devpilot_protocol::{ModelInfo, ProviderType};
        let models = vec![ModelInfo {
            id: "custom-model".into(),
            name: "Custom".into(),
            provider: ProviderType::Custom,
            max_input_tokens: 4096,
            max_output_tokens: 2048,
            supports_streaming: true,
            supports_tools: false,
            supports_vision: false,
            input_price_per_million: Some(5.0),
            output_price_per_million: Some(10.0),
        }];
        let pricing = lookup_pricing_with_fallback("custom", "custom-model", &models);
        assert_eq!(pricing.input_per_million, 5.0);
        assert_eq!(pricing.output_per_million, 10.0);
    }

    #[test]
    fn lookup_with_fallback_unknown_returns_zero() {
        let pricing = lookup_pricing_with_fallback("unknown", "no-model", &[]);
        assert_eq!(pricing.input_per_million, 0.0);
        assert_eq!(pricing.output_per_million, 0.0);
    }

    #[test]
    fn prefix_fallback_works() {
        // "claude-opus-4-20250514" has prefix "claude" which matches catalog
        let pricing = lookup_pricing("anthropic", "claude-opus-4-20250514").unwrap();
        assert!(pricing.input_per_million > 0.0);
    }

    #[test]
    fn catalog_covers_all_major_providers() {
        // Verify we have entries for each major provider
        let providers = ["anthropic", "openai", "google", "deepseek", "glm", "qwen"];
        for provider in providers {
            let catalog = build_catalog();
            let has_entry = catalog.keys().any(|(p, _)| p == provider);
            assert!(has_entry, "Missing pricing entry for provider: {provider}");
        }
    }
}
