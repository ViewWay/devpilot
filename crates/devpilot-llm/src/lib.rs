//! DevPilot LLM — multi-provider LLM client abstraction.
//!
//! This crate provides a unified interface for communicating with various
//! LLM providers (Anthropic, OpenAI-compatible, Ollama, etc.) through a
//! common `Provider` trait.

pub mod anthropic;
pub mod error;
pub mod openai;
pub mod provider;
pub mod types;

pub use anthropic::{AnthropicProvider, create_anthropic_provider};
pub use error::LlmError;
pub use openai::{OpenAiProvider, create_openai_provider};
pub use provider::ModelProvider;
