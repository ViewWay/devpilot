//! ModelProvider trait — the abstraction that every LLM backend implements.

use async_trait::async_trait;
use devpilot_protocol::{ChatRequest, ChatResponse, ProviderConfig, StreamEvent};
use futures::Stream;
use std::pin::Pin;

use crate::error::LlmError;

/// A boxed, pinned stream of stream events.
pub type StreamResult = Pin<Box<dyn Stream<Item = Result<StreamEvent, LlmError>> + Send>>;

/// Core trait that every LLM provider must implement.
///
/// Providers are responsible for:
/// 1. Converting the unified `ChatRequest` into provider-specific API format
/// 2. Sending the HTTP request
/// 3. Parsing the response (or SSE stream) back into unified types
#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// Returns the provider's configuration.
    fn config(&self) -> &ProviderConfig;

    /// Returns a human-readable name for this provider instance.
    fn name(&self) -> &str {
        &self.config().name
    }

    /// Send a chat completion request (non-streaming).
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError>;

    /// Send a chat completion request with streaming.
    ///
    /// Returns a stream of `StreamEvent` items. The caller is responsible
    /// for consuming the stream and handling backpressure.
    async fn chat_stream(
        &self,
        request: ChatRequest,
        session_id: String,
    ) -> Result<StreamResult, LlmError>;

    /// Test connectivity and authentication.
    /// Returns `Ok(())` if the provider is reachable and the API key is valid.
    async fn probe(&self) -> Result<(), LlmError>;

    /// List available models for this provider.
    /// If the provider supports dynamic model discovery, this fetches
    /// from the API. Otherwise it returns the static config list.
    async fn list_models(&self) -> Result<Vec<String>, LlmError>;
}
