//! DevPilot LLM — multi-provider LLM client abstraction.
//!
//! This crate provides a unified interface for communicating with various
//! LLM providers (Anthropic, OpenAI-compatible, Ollama, Google Gemini, etc.)
//! through a common `Provider` trait.

pub mod anthropic;
pub mod chinese;
pub mod diagnostics;
pub mod error;
pub mod failover;
pub mod google;
pub mod ollama;
pub mod openai;
pub mod provider;
pub mod registry;
pub mod retry;
pub mod types;

pub use anthropic::{AnthropicProvider, create_anthropic_provider};
pub use chinese::{
    deepseek_config, glm_config, kimi_config, minimax_config, qwen_config, volcengine_config,
};
pub use diagnostics::{DiagnosticCheck, DiagnosticReport, Severity, run_diagnostics};
pub use error::LlmError;
pub use failover::{
    FailoverResult, chat_with_failover, has_fallbacks, resolve_fallback_configs,
    validate_fallback_ids,
};
pub use google::{GeminiProvider, create_gemini_provider};
pub use ollama::OllamaProvider;
pub use openai::{OpenAiProvider, create_openai_provider};
pub use provider::ModelProvider;
pub use registry::{ProviderRegistry, create_provider};
pub use retry::{RetryConfig, retry_chat, retry_operation};
pub use types::{
    CostEstimate, ModelPricing, TokenCountConfig, estimate_chat_tokens, estimate_tokens,
};
