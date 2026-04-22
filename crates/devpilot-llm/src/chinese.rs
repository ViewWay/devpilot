//! Chinese LLM provider presets.
//!
//! Provides default configurations and model catalogs for Chinese LLM providers:
//! - **GLM** (智谱清言) — zhipuai.cn
//! - **Qwen** (通义千问) — dashscope.aliyuncs.com
//! - **DeepSeek** (深度求索) — api.deepseek.com
//! - **Kimi** (Moonshot AI / 月之暗面) — api.moonshot.cn
//! - **MiniMax** — api.minimax.chat
//! - **VolcEngine** (豆包 / 字节跳动) — ark.cn-beijing.volces.com
//!
//! All providers use the OpenAI-compatible chat completions format,
//! so they reuse `OpenAiProvider` with provider-specific base URLs and headers.

use devpilot_protocol::{ModelInfo, ProviderConfig, ProviderType};

/// Default base URL for 智谱 GLM API.
/// GLM uses /v4/ for its OpenAI-compatible endpoint.
pub const GLM_BASE_URL: &str = "https://open.bigmodel.cn/api/paas/v4";

/// Default base URL for 通义千问 Qwen API.
/// Qwen DashScope uses /v1/ for its OpenAI-compatible endpoint.
pub const QWEN_BASE_URL: &str = "https://dashscope.aliyuncs.com/compatible-mode/v1";

/// Default base URL for DeepSeek API.
/// DeepSeek uses standard /v1/.
pub const DEEPSEEK_BASE_URL: &str = "https://api.deepseek.com/v1";

/// Default base URL for Kimi (Moonshot AI) API.
/// Kimi uses standard /v1/.
pub const KIMI_BASE_URL: &str = "https://api.moonshot.cn/v1";

/// Default base URL for MiniMax API.
/// MiniMax uses standard /v1/.
pub const MINIMAX_BASE_URL: &str = "https://api.minimax.chat/v1";

/// Default base URL for VolcEngine (豆包) API.
/// VolcEngine uses standard /v1/.
pub const VOLCENGINE_BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/v1";

// ── GLM Model Catalog ─────────────────────────────────

/// Well-known GLM models (智谱清言).
pub fn glm_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "glm-4-plus".into(),
            name: "GLM-4 Plus".into(),
            provider: ProviderType::GLM,
            max_input_tokens: 128_000,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            input_price_per_million: Some(50.0),
            output_price_per_million: Some(50.0),
        },
        ModelInfo {
            id: "glm-4-flash".into(),
            name: "GLM-4 Flash (免费)".into(),
            provider: ProviderType::GLM,
            max_input_tokens: 128_000,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            input_price_per_million: Some(0.0),
            output_price_per_million: Some(0.0),
        },
        ModelInfo {
            id: "glm-4-air".into(),
            name: "GLM-4 Air".into(),
            provider: ProviderType::GLM,
            max_input_tokens: 128_000,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(1.0),
            output_price_per_million: Some(1.0),
        },
        ModelInfo {
            id: "glm-4-long".into(),
            name: "GLM-4 Long".into(),
            provider: ProviderType::GLM,
            max_input_tokens: 1_000_000,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(1.0),
            output_price_per_million: Some(1.0),
        },
        ModelInfo {
            id: "glm-4v".into(),
            name: "GLM-4V (视觉)".into(),
            provider: ProviderType::GLM,
            max_input_tokens: 2_048,
            max_output_tokens: 1_024,
            supports_streaming: true,
            supports_tools: false,
            supports_vision: true,
            input_price_per_million: Some(50.0),
            output_price_per_million: Some(50.0),
        },
    ]
}

// ── Qwen Model Catalog ────────────────────────────────

/// Well-known Qwen models (通义千问).
pub fn qwen_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "qwen-max".into(),
            name: "Qwen Max".into(),
            provider: ProviderType::Qwen,
            max_input_tokens: 32_768,
            max_output_tokens: 8_192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(20.0),
            output_price_per_million: Some(60.0),
        },
        ModelInfo {
            id: "qwen-plus".into(),
            name: "Qwen Plus".into(),
            provider: ProviderType::Qwen,
            max_input_tokens: 131_072,
            max_output_tokens: 8_192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(0.8),
            output_price_per_million: Some(2.0),
        },
        ModelInfo {
            id: "qwen-turbo".into(),
            name: "Qwen Turbo".into(),
            provider: ProviderType::Qwen,
            max_input_tokens: 1_000_000,
            max_output_tokens: 8_192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(0.3),
            output_price_per_million: Some(0.6),
        },
        ModelInfo {
            id: "qwen-long".into(),
            name: "Qwen Long".into(),
            provider: ProviderType::Qwen,
            max_input_tokens: 10_000_000,
            max_output_tokens: 6_000,
            supports_streaming: true,
            supports_tools: false,
            supports_vision: false,
            input_price_per_million: Some(0.5),
            output_price_per_million: Some(2.0),
        },
        ModelInfo {
            id: "qwen-vl-max".into(),
            name: "Qwen VL Max (视觉)".into(),
            provider: ProviderType::Qwen,
            max_input_tokens: 32_768,
            max_output_tokens: 2_048,
            supports_streaming: true,
            supports_tools: false,
            supports_vision: true,
            input_price_per_million: Some(20.0),
            output_price_per_million: Some(60.0),
        },
        ModelInfo {
            id: "qwq-32b".into(),
            name: "QwQ-32B (推理)".into(),
            provider: ProviderType::Qwen,
            max_input_tokens: 131_072,
            max_output_tokens: 16_384,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(1.6),
            output_price_per_million: Some(4.0),
        },
    ]
}

// ── DeepSeek Model Catalog ────────────────────────────

/// Well-known DeepSeek models.
pub fn deepseek_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "deepseek-chat".into(),
            name: "DeepSeek V3".into(),
            provider: ProviderType::DeepSeek,
            max_input_tokens: 64_000,
            max_output_tokens: 8_192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(0.27),
            output_price_per_million: Some(1.10),
        },
        ModelInfo {
            id: "deepseek-reasoner".into(),
            name: "DeepSeek R1 (推理)".into(),
            provider: ProviderType::DeepSeek,
            max_input_tokens: 64_000,
            max_output_tokens: 8_192,
            supports_streaming: true,
            supports_tools: false,
            supports_vision: false,
            input_price_per_million: Some(0.55),
            output_price_per_million: Some(2.19),
        },
        ModelInfo {
            id: "deepseek-coder".into(),
            name: "DeepSeek Coder".into(),
            provider: ProviderType::DeepSeek,
            max_input_tokens: 64_000,
            max_output_tokens: 16_384,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(0.14),
            output_price_per_million: Some(0.28),
        },
    ]
}

// ── Preset Configurations ─────────────────────────────

/// Create a default GLM provider config with the given API key.
///
/// Uses the standard 智谱 API endpoint and pre-populated model catalog.
pub fn glm_config(api_key: String) -> ProviderConfig {
    ProviderConfig {
        id: "glm".into(),
        name: "智谱 GLM".into(),
        provider_type: ProviderType::GLM,
        base_url: GLM_BASE_URL.into(),
        api_key: Some(api_key),
        models: glm_models(),
        enabled: true,
    }
}

/// Create a default Qwen provider config with the given API key.
///
/// Uses the 阿里云 DashScope OpenAI-compatible endpoint.
pub fn qwen_config(api_key: String) -> ProviderConfig {
    ProviderConfig {
        id: "qwen".into(),
        name: "通义千问 Qwen".into(),
        provider_type: ProviderType::Qwen,
        base_url: QWEN_BASE_URL.into(),
        api_key: Some(api_key),
        models: qwen_models(),
        enabled: true,
    }
}

/// Create a default DeepSeek provider config with the given API key.
pub fn deepseek_config(api_key: String) -> ProviderConfig {
    ProviderConfig {
        id: "deepseek".into(),
        name: "DeepSeek".into(),
        provider_type: ProviderType::DeepSeek,
        base_url: DEEPSEEK_BASE_URL.into(),
        api_key: Some(api_key),
        models: deepseek_models(),
        enabled: true,
    }
}

// ── Kimi Model Catalog ────────────────────────────────

/// Well-known Kimi (Moonshot AI) models.
pub fn kimi_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "moonshot-v1-8k".into(),
            name: "Moonshot V1 8K".into(),
            provider: ProviderType::Kimi,
            max_input_tokens: 8_192,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            input_price_per_million: Some(12.0),
            output_price_per_million: Some(12.0),
        },
        ModelInfo {
            id: "moonshot-v1-32k".into(),
            name: "Moonshot V1 32K".into(),
            provider: ProviderType::Kimi,
            max_input_tokens: 32_768,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            input_price_per_million: Some(24.0),
            output_price_per_million: Some(24.0),
        },
        ModelInfo {
            id: "moonshot-v1-128k".into(),
            name: "Moonshot V1 128K".into(),
            provider: ProviderType::Kimi,
            max_input_tokens: 131_072,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: true,
            input_price_per_million: Some(60.0),
            output_price_per_million: Some(60.0),
        },
    ]
}

// ── MiniMax Model Catalog ─────────────────────────────

/// Well-known MiniMax models.
pub fn minimax_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "MiniMax-Text-01".into(),
            name: "MiniMax-Text-01".into(),
            provider: ProviderType::MiniMax,
            max_input_tokens: 1_000_000,
            max_output_tokens: 16_384,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(1.0),
            output_price_per_million: Some(2.0),
        },
        ModelInfo {
            id: "abab6.5s-chat".into(),
            name: "ABAB 6.5s Chat".into(),
            provider: ProviderType::MiniMax,
            max_input_tokens: 131_072,
            max_output_tokens: 8_192,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(2.0),
            output_price_per_million: Some(2.0),
        },
    ]
}

// ── VolcEngine Model Catalog ──────────────────────────

/// Well-known VolcEngine (豆包) models.
pub fn volcengine_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "doubao-1.5-pro".into(),
            name: "豆包 1.5 Pro".into(),
            provider: ProviderType::VolcEngine,
            max_input_tokens: 131_072,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(4.0),
            output_price_per_million: Some(8.0),
        },
        ModelInfo {
            id: "doubao-1.5-lite".into(),
            name: "豆包 1.5 Lite".into(),
            provider: ProviderType::VolcEngine,
            max_input_tokens: 131_072,
            max_output_tokens: 4_096,
            supports_streaming: true,
            supports_tools: true,
            supports_vision: false,
            input_price_per_million: Some(0.8),
            output_price_per_million: Some(2.0),
        },
    ]
}

// ── Kimi / MiniMax / VolcEngine Config Factories ──────

/// Create a default Kimi (Moonshot AI) provider config with the given API key.
pub fn kimi_config(api_key: String) -> ProviderConfig {
    ProviderConfig {
        id: "kimi".into(),
        name: "Kimi (Moonshot)".into(),
        provider_type: ProviderType::Kimi,
        base_url: KIMI_BASE_URL.into(),
        api_key: Some(api_key),
        models: kimi_models(),
        enabled: true,
    }
}

/// Create a default MiniMax provider config with the given API key.
pub fn minimax_config(api_key: String) -> ProviderConfig {
    ProviderConfig {
        id: "minimax".into(),
        name: "MiniMax".into(),
        provider_type: ProviderType::MiniMax,
        base_url: MINIMAX_BASE_URL.into(),
        api_key: Some(api_key),
        models: minimax_models(),
        enabled: true,
    }
}

/// Create a default VolcEngine (豆包) provider config with the given API key.
pub fn volcengine_config(api_key: String) -> ProviderConfig {
    ProviderConfig {
        id: "volcengine".into(),
        name: "VolcEngine (豆包)".into(),
        provider_type: ProviderType::VolcEngine,
        base_url: VOLCENGINE_BASE_URL.into(),
        api_key: Some(api_key),
        models: volcengine_models(),
        enabled: true,
    }
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glm_config_has_correct_base_url() {
        let config = glm_config("test-key".into());
        assert_eq!(config.base_url, GLM_BASE_URL);
        assert_eq!(config.provider_type, ProviderType::GLM);
        assert_eq!(config.api_key.as_deref(), Some("test-key"));
        assert!(!config.models.is_empty());
    }

    #[test]
    fn qwen_config_has_correct_base_url() {
        let config = qwen_config("test-key".into());
        assert_eq!(config.base_url, QWEN_BASE_URL);
        assert_eq!(config.provider_type, ProviderType::Qwen);
        assert!(config.models.len() >= 5);
    }

    #[test]
    fn deepseek_config_has_correct_base_url() {
        let config = deepseek_config("test-key".into());
        assert_eq!(config.base_url, DEEPSEEK_BASE_URL);
        assert_eq!(config.provider_type, ProviderType::DeepSeek);
        assert!(config.models.len() >= 2);
    }

    #[test]
    fn glm_models_all_have_glm_provider() {
        for model in glm_models() {
            assert_eq!(
                model.provider,
                ProviderType::GLM,
                "Model {} has wrong provider",
                model.id
            );
        }
    }

    #[test]
    fn qwen_models_all_have_qwen_provider() {
        for model in qwen_models() {
            assert_eq!(
                model.provider,
                ProviderType::Qwen,
                "Model {} has wrong provider",
                model.id
            );
        }
    }

    #[test]
    fn deepseek_models_all_have_deepseek_provider() {
        for model in deepseek_models() {
            assert_eq!(
                model.provider,
                ProviderType::DeepSeek,
                "Model {} has wrong provider",
                model.id
            );
        }
    }

    #[test]
    fn all_models_have_valid_token_limits() {
        let glm = glm_models();
        let qwen = qwen_models();
        let deepseek = deepseek_models();
        let all_models: Vec<&ModelInfo> = glm
            .iter()
            .chain(qwen.iter())
            .chain(deepseek.iter())
            .collect();

        for model in all_models {
            assert!(
                model.max_input_tokens > 0,
                "Model {} has zero max_input_tokens",
                model.id
            );
            assert!(
                model.max_output_tokens > 0,
                "Model {} has zero max_output_tokens",
                model.id
            );
        }
    }

    #[test]
    fn glm_has_free_model() {
        let models = glm_models();
        let free = models.iter().find(|m| m.id == "glm-4-flash");
        assert!(free.is_some(), "GLM should have a free flash model");
        assert_eq!(free.unwrap().input_price_per_million, Some(0.0));
    }

    #[test]
    fn deepseek_has_reasoner() {
        let models = deepseek_models();
        let reasoner = models.iter().find(|m| m.id == "deepseek-reasoner");
        assert!(reasoner.is_some(), "DeepSeek should have a reasoner model");
    }

    #[test]
    fn qwen_has_qwq() {
        let models = qwen_models();
        let qwq = models.iter().find(|m| m.id == "qwq-32b");
        assert!(qwq.is_some(), "Qwen should have QwQ reasoning model");
    }

    #[test]
    fn preset_configs_are_enabled_by_default() {
        let configs = [
            glm_config("key".into()),
            qwen_config("key".into()),
            deepseek_config("key".into()),
            kimi_config("key".into()),
            minimax_config("key".into()),
            volcengine_config("key".into()),
        ];
        for config in &configs {
            assert!(config.enabled, "Config {} should be enabled", config.name);
        }
    }

    // ── Kimi Tests ─────────────────────────────────────

    #[test]
    fn kimi_config_has_correct_base_url() {
        let config = kimi_config("test-key".into());
        assert_eq!(config.base_url, KIMI_BASE_URL);
        assert_eq!(config.provider_type, ProviderType::Kimi);
        assert_eq!(config.api_key.as_deref(), Some("test-key"));
        assert!(!config.models.is_empty());
    }

    #[test]
    fn kimi_models_all_have_kimi_provider() {
        for model in kimi_models() {
            assert_eq!(
                model.provider,
                ProviderType::Kimi,
                "Model {} has wrong provider",
                model.id
            );
        }
    }

    #[test]
    fn kimi_models_all_support_vision() {
        for model in kimi_models() {
            assert!(
                model.supports_vision,
                "Model {} should support vision",
                model.id
            );
        }
    }

    // ── MiniMax Tests ──────────────────────────────────

    #[test]
    fn minimax_config_has_correct_base_url() {
        let config = minimax_config("test-key".into());
        assert_eq!(config.base_url, MINIMAX_BASE_URL);
        assert_eq!(config.provider_type, ProviderType::MiniMax);
        assert_eq!(config.api_key.as_deref(), Some("test-key"));
        assert!(!config.models.is_empty());
    }

    #[test]
    fn minimax_models_all_have_minimax_provider() {
        for model in minimax_models() {
            assert_eq!(
                model.provider,
                ProviderType::MiniMax,
                "Model {} has wrong provider",
                model.id
            );
        }
    }

    // ── VolcEngine Tests ───────────────────────────────

    #[test]
    fn volcengine_config_has_correct_base_url() {
        let config = volcengine_config("test-key".into());
        assert_eq!(config.base_url, VOLCENGINE_BASE_URL);
        assert_eq!(config.provider_type, ProviderType::VolcEngine);
        assert_eq!(config.api_key.as_deref(), Some("test-key"));
        assert!(!config.models.is_empty());
    }

    #[test]
    fn volcengine_models_all_have_volcengine_provider() {
        for model in volcengine_models() {
            assert_eq!(
                model.provider,
                ProviderType::VolcEngine,
                "Model {} has wrong provider",
                model.id
            );
        }
    }

    #[test]
    fn volcengine_has_doubao_models() {
        let models = volcengine_models();
        let pro = models.iter().find(|m| m.id == "doubao-1.5-pro");
        let lite = models.iter().find(|m| m.id == "doubao-1.5-lite");
        assert!(pro.is_some(), "VolcEngine should have doubao-1.5-pro");
        assert!(lite.is_some(), "VolcEngine should have doubao-1.5-lite");
    }

    #[test]
    fn all_new_models_have_valid_token_limits() {
        let kimi = kimi_models();
        let minimax = minimax_models();
        let volcengine = volcengine_models();
        let all_models: Vec<&ModelInfo> = kimi
            .iter()
            .chain(minimax.iter())
            .chain(volcengine.iter())
            .collect();

        for model in all_models {
            assert!(
                model.max_input_tokens > 0,
                "Model {} has zero max_input_tokens",
                model.id
            );
            assert!(
                model.max_output_tokens > 0,
                "Model {} has zero max_output_tokens",
                model.id
            );
        }
    }
}
