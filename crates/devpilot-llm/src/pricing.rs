//! Model pricing catalog — centralized pricing data for well-known models.
//!
//! Provides a lookup table of per-model pricing that can be used to estimate
//! costs without requiring the full `ProviderConfig` to be present.
//! Prices are sourced from official provider pricing pages as of 2025-04.

use crate::types::ModelPricing;
use std::collections::HashMap;
use std::sync::LazyLock;

/// Lookup key: (provider_type, model_id).
type PricingKey = (String, String);

/// Global pricing catalog, built once on first access.
static CATALOG: LazyLock<HashMap<PricingKey, ModelPricing>> = LazyLock::new(build_catalog);

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
    // Claude 4 family (latest aliases)
    m.insert(
        ("anthropic".into(), "claude-sonnet-4".into()),
        pricing!(3.0, 15.0, 0.3, 3.75),
    );
    m.insert(
        ("anthropic".into(), "claude-opus-4".into()),
        pricing!(15.0, 75.0, 1.5, 18.75),
    );
    m.insert(
        ("anthropic".into(), "claude-haiku-4".into()),
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
        ("openai".into(), "o3-mini".into()),
        pricing!(1.50, 6.0, 0.375, 0.0),
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
        ("google".into(), "gemini-2.5-flash-preview-05-20".into()),
        pricing!(0.15, 0.60, 0.0375, 0.0),
    );
    m.insert(
        ("google".into(), "gemini-2.0-flash".into()),
        pricing!(0.10, 0.40, 0.025, 0.0),
    );
    m.insert(
        ("google".into(), "gemini-2.0-flash-lite".into()),
        pricing!(0.075, 0.30, 0.01875, 0.0),
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
    m.insert(("glm".into(), "glm-4-plus".into()), pricing!(50.0, 50.0));
    m.insert(("glm".into(), "glm-4".into()), pricing!(100.0, 100.0));
    m.insert(("glm".into(), "glm-4-flash".into()), pricing!(0.1, 0.1));
    m.insert(("glm".into(), "glm-4-air".into()), pricing!(1.0, 1.0));

    // ── Qwen (通义千问) ─────────────────────────────────
    m.insert(("qwen".into(), "qwen-max".into()), pricing!(20.0, 60.0));
    m.insert(("qwen".into(), "qwen-plus".into()), pricing!(4.0, 12.0));
    m.insert(("qwen".into(), "qwen-turbo".into()), pricing!(0.3, 0.6));
    m.insert(("qwen".into(), "qwen-long".into()), pricing!(0.5, 2.0));

    // ── Kimi (Moonshot) ─────────────────────────────────
    m.insert(
        ("kimi".into(), "moonshot-v1-8k".into()),
        pricing!(12.0, 12.0),
    );
    m.insert(
        ("kimi".into(), "moonshot-v1-32k".into()),
        pricing!(24.0, 24.0),
    );
    m.insert(
        ("kimi".into(), "moonshot-v1-128k".into()),
        pricing!(60.0, 60.0),
    );

    // ── MiniMax ─────────────────────────────────────────
    m.insert(
        ("minimax".into(), "MiniMax-Text-01".into()),
        pricing!(1.0, 8.0),
    );

    // ── VolcEngine (豆包) ──────────────────────────────
    m.insert(
        ("volcengine".into(), "doubao-pro-32k".into()),
        pricing!(0.5, 1.0),
    );
    m.insert(
        ("volcengine".into(), "doubao-pro-128k".into()),
        pricing!(5.0, 9.0),
    );

    // ── OpenRouter (passthrough pricing varies) ────────
    // OpenRouter uses provider-specific pricing, so we default to zero
    // and rely on the per-model config from the provider settings.

    m
}

/// Look up pricing for a model by provider type and model ID.
///
/// First tries an exact match on the model ID. If that fails, falls back to
/// prefix matching (e.g., "claude-sonnet-4-20250514" matches a key starting
/// with "claude-sonnet-4"). The prefix fallback returns the longest matching
/// prefix to ensure deterministic results.
///
/// Returns `None` if the model is not in the catalog.
pub fn lookup_pricing(provider_type: &str, model_id: &str) -> Option<ModelPricing> {
    // Exact match first
    if let Some(pricing) = CATALOG.get(&(provider_type.to_string(), model_id.to_string())) {
        return Some(pricing.clone());
    }

    // Prefix fallback: find the longest prefix match for deterministic results.
    // For example, "claude-sonnet-4-20250514" should match "claude-sonnet-4"
    // rather than just "claude" when both exist in the catalog.
    let mut best_match: Option<(&str, &ModelPricing)> = None;
    let mut best_match_len = 0;

    for ((provider, model), pricing) in CATALOG.iter() {
        if provider == provider_type && model_id.starts_with(model.as_str())
            && model.len() > best_match_len {
                best_match_len = model.len();
                best_match = Some((model, pricing));
            }
    }

    best_match.map(|(_, p)| p.clone())
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
        let providers = [
            "anthropic",
            "openai",
            "google",
            "deepseek",
            "glm",
            "qwen",
            "kimi",
            "minimax",
            "volcengine",
        ];
        for provider in providers {
            let catalog = build_catalog();
            let has_entry = catalog.keys().any(|(p, _)| p == provider);
            assert!(has_entry, "Missing pricing entry for provider: {provider}");
        }
    }

    #[test]
    fn lookup_claude_sonnet_4_alias() {
        let pricing = lookup_pricing("anthropic", "claude-sonnet-4").unwrap();
        assert_eq!(pricing.input_per_million, 3.0);
    }

    #[test]
    fn lookup_glm_flash() {
        let pricing = lookup_pricing("glm", "glm-4-flash").unwrap();
        assert_eq!(pricing.input_per_million, 0.1);
    }

    #[test]
    fn lookup_qwen_turbo() {
        let pricing = lookup_pricing("qwen", "qwen-turbo").unwrap();
        assert_eq!(pricing.input_per_million, 0.3);
    }

    #[test]
    fn lookup_minimax() {
        let pricing = lookup_pricing("minimax", "MiniMax-Text-01").unwrap();
        assert_eq!(pricing.input_per_million, 1.0);
    }

    #[test]
    fn lookup_volcengine() {
        let pricing = lookup_pricing("volcengine", "doubao-pro-32k").unwrap();
        assert_eq!(pricing.input_per_million, 0.5);
    }

    #[test]
    fn lookup_gemini_flash_lite() {
        let pricing = lookup_pricing("google", "gemini-2.0-flash-lite").unwrap();
        assert_eq!(pricing.input_per_million, 0.075);
    }

    #[test]
    fn lookup_kimi_128k() {
        let pricing = lookup_pricing("kimi", "moonshot-v1-128k").unwrap();
        assert_eq!(pricing.input_per_million, 60.0);
    }
}
