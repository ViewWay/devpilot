//! Ollama local model provider.
//!
//! Supports Ollama's native \`/api/chat\` endpoint for local model inference.
//! Ollama runs locally and does not require an API key.

use async_trait::async_trait;
use devpilot_protocol::{
    ChatRequest, ChatResponse, ContentBlock, FinishReason, Message, MessageRole, ProviderConfig,
    StreamEvent, Usage,
};
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use std::sync::Arc;
use tracing::debug;

use crate::error::LlmError;
use crate::provider::{ModelProvider, StreamResult};

// ── Ollama API types ──────────────────────────────────

#[derive(serde::Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    options: Option<OllamaOptions>,
    stream: bool,
}

#[derive(serde::Serialize, Default)]
struct OllamaOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct OllamaMessage {
    role: String,
    content: String,
}

#[derive(serde::Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
    model: String,
    #[allow(dead_code)]
    done: bool,
    #[serde(default)]
    #[allow(dead_code)]
    total_duration: Option<u64>,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
}

#[derive(serde::Deserialize)]
struct OllamaStreamChunk {
    message: OllamaMessage,
    #[allow(dead_code)]
    model: String,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    #[allow(dead_code)]
    total_duration: Option<u64>,
    #[serde(default)]
    eval_count: Option<u32>,
    #[serde(default)]
    prompt_eval_count: Option<u32>,
}

#[derive(serde::Deserialize)]
struct OllamaModelsResponse {
    models: Vec<OllamaModel>,
}

#[derive(serde::Deserialize)]
struct OllamaModel {
    name: String,
}

#[derive(serde::Deserialize)]
struct OllamaError {
    error: String,
}

// ── Mutable stream state ──────────────────────────────

#[derive(Default)]
struct StreamState {
    input_tokens: u32,
    output_tokens: u32,
}

// ── Provider implementation ───────────────────────────

/// Ollama local model provider.
///
/// Connects to a locally running Ollama instance via its REST API.
/// Default base URL: \`http://localhost:11434\`
pub struct OllamaProvider {
    config: ProviderConfig,
    client: Client,
}

impl OllamaProvider {
    /// Create a new Ollama provider from the given configuration.
    pub fn new(config: ProviderConfig) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("failed to build reqwest client");
        Self { config, client }
    }

    /// Return the base URL, defaulting to \`http://localhost:11434\`.
    fn base_url(&self) -> &str {
        &self.config.base_url
    }

    /// URL for \`/api/chat\`.
    fn chat_url(&self) -> String {
        format!("{}/api/chat", self.base_url())
    }

    /// URL for \`/api/tags\` (model list).
    fn models_url(&self) -> String {
        format!("{}/api/tags", self.base_url())
    }

    /// Convert a \`ChatRequest\` into Ollama's request format.
    fn build_request(&self, req: &ChatRequest, stream: bool) -> OllamaChatRequest {
        let mut ollama_messages = Vec::with_capacity(req.messages.len());

        // If there's a system prompt, prepend it as a system message
        if let Some(ref sys) = req.system {
            ollama_messages.push(OllamaMessage {
                role: "system".to_string(),
                content: sys.clone(),
            });
        }

        for msg in &req.messages {
            let role = match msg.role {
                MessageRole::System => "system",
                MessageRole::User => "user",
                MessageRole::Assistant => "assistant",
                MessageRole::Tool => "user", // Ollama doesn't have a separate tool role
            };

            let content = msg
                .content
                .iter()
                .map(|block| match block {
                    ContentBlock::Text { text } => text.clone(),
                    ContentBlock::ToolResult { content, .. } => content.clone(),
                    _ => String::new(),
                })
                .collect::<Vec<_>>()
                .join("\n");

            ollama_messages.push(OllamaMessage {
                role: role.to_string(),
                content,
            });
        }

        let options = {
            let mut opts = OllamaOptions::default();
            if let Some(temp) = req.temperature {
                opts.temperature = Some(temp);
            }
            if let Some(max_tokens) = req.max_tokens {
                opts.num_predict = Some(max_tokens);
            }
            if let Some(top_p) = req.top_p {
                opts.top_p = Some(top_p);
            }
            if let Some(ref stop) = req.stop {
                opts.stop = Some(stop.clone());
            }
            if opts.temperature.is_some()
                || opts.num_predict.is_some()
                || opts.top_p.is_some()
                || opts.stop.is_some()
            {
                Some(opts)
            } else {
                None
            }
        };

        OllamaChatRequest {
            model: req.model.clone(),
            messages: ollama_messages,
            options,
            stream,
        }
    }
}

#[async_trait]
impl ModelProvider for OllamaProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let ollama_req = self.build_request(&request, false);
        let body = serde_json::to_string(&ollama_req)
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        let resp = self
            .client
            .post(self.chat_url())
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        let status = resp.status();
        let text = resp
            .text()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        if !status.is_success() {
            if let Ok(err) = serde_json::from_str::<OllamaError>(&text) {
                return Err(LlmError::ApiError {
                    status: status.as_u16(),
                    message: err.error,
                });
            }
            return Err(LlmError::ApiError {
                status: status.as_u16(),
                message: text,
            });
        }

        let chat_resp: OllamaChatResponse = serde_json::from_str(&text)
            .map_err(|e| LlmError::NetworkError(format!("Failed to parse Ollama response: {e}")))?;

        Ok(ChatResponse {
            id: format!("ollama-{}", uuid::Uuid::new_v4()),
            message: Message {
                role: MessageRole::Assistant,
                content: vec![ContentBlock::Text {
                    text: chat_resp.message.content,
                }],
                name: None,
                tool_call_id: None,
            },
            usage: Usage {
                input_tokens: chat_resp.prompt_eval_count.unwrap_or(0),
                output_tokens: chat_resp.eval_count.unwrap_or(0),
                cache_read_tokens: None,
                cache_write_tokens: None,
            },
            finish_reason: FinishReason::Stop,
            model: chat_resp.model,
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
        session_id: String,
    ) -> Result<StreamResult, LlmError> {
        let ollama_req = self.build_request(&request, true);
        let body = serde_json::to_string(&ollama_req)
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        let resp = self
            .client
            .post(self.chat_url())
            .header("Content-Type", "application/json")
            .body(body)
            .send()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp
                .text()
                .await
                .map_err(|e| LlmError::NetworkError(e.to_string()))?;
            if let Ok(err) = serde_json::from_str::<OllamaError>(&text) {
                return Err(LlmError::ApiError {
                    status: status.as_u16(),
                    message: err.error,
                });
            }
            return Err(LlmError::ApiError {
                status: status.as_u16(),
                message: text,
            });
        }

        let state = Arc::new(std::sync::Mutex::new(StreamState::default()));

        let stream = resp.bytes_stream().eventsource();

        let event_stream = stream.filter_map(move |result| {
            let sid = session_id.clone();
            let st = state.clone();
            async move {
                match result {
                    Ok(event) => {
                        let chunk: OllamaStreamChunk = match serde_json::from_str(&event.data) {
                            Ok(c) => c,
                            Err(e) => {
                                debug!("Skipping stream event: {e}");
                                return None;
                            }
                        };

                        if chunk.done {
                            let s = st.lock().unwrap();
                            Some(Ok(StreamEvent::Done {
                                session_id: sid,
                                usage: Usage {
                                    input_tokens: chunk.prompt_eval_count.unwrap_or(s.input_tokens),
                                    output_tokens: chunk.eval_count.unwrap_or(s.output_tokens),
                                    cache_read_tokens: None,
                                    cache_write_tokens: None,
                                },
                                finish_reason: FinishReason::Stop,
                            }))
                        } else {
                            {
                                let mut s = st.lock().unwrap();
                                if let Some(eval) = chunk.eval_count {
                                    s.output_tokens = eval;
                                }
                                if let Some(prompt_eval) = chunk.prompt_eval_count {
                                    s.input_tokens = prompt_eval;
                                }
                            }

                            Some(Ok(StreamEvent::Chunk {
                                session_id: sid,
                                delta: if chunk.message.content.is_empty() {
                                    None
                                } else {
                                    Some(chunk.message.content)
                                },
                                role: None,
                                tool_use: None,
                                thinking: None,
                            }))
                        }
                    }
                    Err(e) => Some(Err(LlmError::StreamError(e.to_string()))),
                }
            }
        });

        Ok(Box::pin(event_stream))
    }

    async fn probe(&self) -> Result<(), LlmError> {
        let resp = self
            .client
            .get(self.models_url())
            .send()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        if !resp.status().is_success() {
            let text = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(LlmError::ApiError {
                status: 503,
                message: format!("Ollama not reachable at {}: {text}", self.base_url()),
            });
        }

        Ok(())
    }

    async fn list_models(&self) -> Result<Vec<String>, LlmError> {
        let resp = self
            .client
            .get(self.models_url())
            .send()
            .await
            .map_err(|e| LlmError::NetworkError(e.to_string()))?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp
                .text()
                .await
                .unwrap_or_else(|_| "unknown error".to_string());
            return Err(LlmError::ApiError {
                status: status.as_u16(),
                message: text,
            });
        }

        let body: OllamaModelsResponse = resp
            .json()
            .await
            .map_err(|e| LlmError::NetworkError(format!("Failed to parse Ollama models: {e}")))?;

        Ok(body.models.into_iter().map(|m| m.name).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::{ModelInfo, ProviderType};

    fn test_config() -> ProviderConfig {
        ProviderConfig {
            id: "ollama-test".to_string(),
            name: "Ollama Local".to_string(),
            provider_type: ProviderType::Ollama,
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
            models: vec![ModelInfo {
                id: "llama3".to_string(),
                name: "Llama 3".to_string(),
                provider: ProviderType::Ollama,
                max_input_tokens: 8192,
                max_output_tokens: 4096,
                supports_streaming: true,
                supports_tools: true,
                supports_vision: false,
                input_price_per_million: None,
                output_price_per_million: None,
            }],
            enabled: true,
        }
    }

    fn simple_message(role: MessageRole, text: &str) -> Message {
        Message {
            role,
            content: vec![ContentBlock::Text {
                text: text.to_string(),
            }],
            name: None,
            tool_call_id: None,
        }
    }

    #[test]
    fn build_non_streaming_request() {
        let provider = OllamaProvider::new(test_config());
        let req = ChatRequest {
            model: "llama3".to_string(),
            messages: vec![simple_message(MessageRole::User, "Hello!")],
            system: None,
            temperature: Some(0.7),
            max_tokens: Some(100),
            top_p: None,
            stop: None,
            tools: None,
            stream: false,
            reasoning_effort: None,
        };

        let ollama_req = provider.build_request(&req, false);
        assert_eq!(ollama_req.model, "llama3");
        assert!(!ollama_req.stream);
        assert_eq!(ollama_req.messages.len(), 1);
        assert_eq!(ollama_req.messages[0].role, "user");
        assert_eq!(ollama_req.messages[0].content, "Hello!");
        assert!(ollama_req.options.is_some());
        let opts = ollama_req.options.unwrap();
        assert_eq!(opts.temperature, Some(0.7));
        assert_eq!(opts.num_predict, Some(100));
    }

    #[test]
    fn build_streaming_request() {
        let provider = OllamaProvider::new(test_config());
        let req = ChatRequest {
            model: "llama3".to_string(),
            messages: vec![simple_message(MessageRole::User, "Test")],
            system: None,
            temperature: None,
            max_tokens: None,
            top_p: None,
            stop: None,
            tools: None,
            stream: true,
            reasoning_effort: None,
        };

        let ollama_req = provider.build_request(&req, true);
        assert!(ollama_req.stream);
        assert!(ollama_req.options.is_none());
    }

    #[test]
    fn default_base_url() {
        let provider = OllamaProvider::new(test_config());
        assert_eq!(provider.base_url(), "http://localhost:11434");
        assert_eq!(provider.chat_url(), "http://localhost:11434/api/chat");
        assert_eq!(provider.models_url(), "http://localhost:11434/api/tags");
    }

    #[test]
    fn system_message_mapping() {
        let provider = OllamaProvider::new(test_config());
        let req = ChatRequest {
            model: "llama3".to_string(),
            messages: vec![simple_message(MessageRole::User, "Hi")],
            system: Some("You are helpful.".to_string()),
            temperature: None,
            max_tokens: None,
            top_p: None,
            stop: None,
            tools: None,
            stream: false,
            reasoning_effort: None,
        };

        let ollama_req = provider.build_request(&req, false);
        // System prompt is prepended as a system message
        assert_eq!(ollama_req.messages.len(), 2);
        assert_eq!(ollama_req.messages[0].role, "system");
        assert_eq!(ollama_req.messages[1].role, "user");
    }
}
