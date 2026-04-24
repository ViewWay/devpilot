//! Anthropic native API provider.
//!
//! Implements the `ModelProvider` trait for Anthropic's Messages API.
//! Supports Claude models (claude-sonnet-4, claude-opus-4, etc.) with
//! streaming, tool use, and image input.

use async_trait::async_trait;
use devpilot_protocol::{
    ChatRequest, ChatResponse, ContentBlock, FinishReason, ImageSource, Message, MessageRole,
    ProviderConfig, ReasoningEffort, StreamEvent, ThinkingDelta, ToolDefinition, ToolUseDelta,
    Usage,
};
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use std::sync::Arc;
use tracing::debug;

use crate::error::LlmError;
use crate::provider::{ModelProvider, StreamResult};

// ── Anthropic request/response types ───────────────────

#[derive(serde::Serialize)]
struct AntRequest {
    model: String,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    system: Option<serde_json::Value>,
    messages: Vec<AntMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequences: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<AntTool>>,
    stream: bool,
    /// Extended thinking configuration for models that support it.
    /// See: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking: Option<serde_json::Value>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct AntMessage {
    role: String,
    content: serde_json::Value,
}

#[derive(serde::Serialize)]
struct AntTool {
    name: String,
    description: String,
    input_schema: serde_json::Value,
}

// ── Non-streaming response types ──────────────────────

#[derive(serde::Deserialize)]
struct AntResponse {
    id: String,
    model: String,
    content: Vec<AntContentBlock>,
    stop_reason: Option<String>,
    usage: AntUsage,
}

#[derive(serde::Deserialize)]
struct AntContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    text: Option<String>,
    #[serde(default)]
    thinking: Option<String>,
    #[serde(default)]
    signature: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    input: Option<serde_json::Value>,
}

#[derive(serde::Deserialize)]
struct AntUsage {
    input_tokens: u32,
    output_tokens: u32,
    #[serde(default)]
    cache_creation_input_tokens: Option<u32>,
    #[serde(default)]
    cache_read_input_tokens: Option<u32>,
}

// ── Streaming event types ─────────────────────────────

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
enum AntStreamEvent {
    #[serde(rename = "message_start")]
    MessageStart { message: AntMessageStartBody },
    #[serde(rename = "content_block_start")]
    ContentBlockStart {
        #[allow(dead_code)]
        index: u32,
        content_block: AntStreamContentBlock,
    },
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta {
        #[allow(dead_code)]
        index: u32,
        delta: AntStreamDelta,
    },
    #[serde(rename = "content_block_stop")]
    ContentBlockStop {
        #[allow(dead_code)]
        index: u32,
    },
    #[serde(rename = "message_delta")]
    MessageDelta {
        delta: AntMessageDeltaBody,
        usage: AntStreamUsage,
    },
    #[serde(rename = "message_stop")]
    MessageStop,
    #[serde(rename = "ping")]
    Ping,
}

#[derive(serde::Deserialize)]
struct AntMessageStartBody {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    model: String,
    usage: AntUsage,
}

#[derive(serde::Deserialize)]
struct AntStreamContentBlock {
    #[serde(rename = "type")]
    block_type: String,
    #[serde(default)]
    #[allow(dead_code)]
    text: Option<String>,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    name: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(tag = "type")]
#[allow(clippy::enum_variant_names)]
enum AntStreamDelta {
    #[serde(rename = "text_delta")]
    TextDelta { text: String },
    #[serde(rename = "input_json_delta")]
    InputJsonDelta { partial_json: String },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta { thinking: String },
}

#[derive(serde::Deserialize)]
struct AntMessageDeltaBody {
    stop_reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct AntStreamUsage {
    output_tokens: u32,
}

// ── Error types ───────────────────────────────────────

#[derive(serde::Deserialize)]
struct AntError {
    error: AntErrorBody,
}

#[derive(serde::Deserialize)]
struct AntErrorBody {
    #[allow(dead_code)]
    #[serde(rename = "type")]
    error_type: Option<String>,
    message: String,
}

// ── Provider implementation ───────────────────────────

/// Mutable state for tracking streaming events across SSE chunks.
#[derive(Default)]
struct StreamState {
    input_tokens: u32,
    cache_read: u32,
    cache_creation: u32,
    tool_id: Option<String>,
    tool_name: Option<String>,
}

/// Anthropic Messages API provider.
///
/// Supports all Claude models via the native Anthropic API:
/// - Claude Sonnet 4, Claude Opus 4, Claude Haiku, etc.
pub struct AnthropicProvider {
    config: ProviderConfig,
    client: Client,
}

impl std::fmt::Debug for AnthropicProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AnthropicProvider")
            .field("name", &self.config.name)
            .finish()
    }
}

impl AnthropicProvider {
    /// Create a new Anthropic provider.
    pub fn new(config: ProviderConfig) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .expect("Failed to create HTTP client");

        Self { config, client }
    }

    fn base_url(&self) -> &str {
        &self.config.base_url
    }

    fn api_key(&self) -> Result<&str, LlmError> {
        self.config
            .api_key
            .as_deref()
            .ok_or_else(|| LlmError::ProviderNotConfigured(self.config.name.clone()))
    }

    /// Build the messages URL.
    fn messages_url(&self) -> String {
        let base = self.base_url().trim_end_matches('/');
        format!("{base}/v1/messages")
    }

    /// Convert protocol messages to Anthropic format.
    /// Anthropic separates system from messages and uses a different content format.
    fn convert_messages(messages: &[Message]) -> Vec<AntMessage> {
        messages
            .iter()
            .filter(|m| m.role != MessageRole::System)
            .map(|msg| {
                let content = Self::convert_content(&msg.content, &msg.role);
                AntMessage {
                    role: msg.role.to_string(),
                    content,
                }
            })
            .collect()
    }

    /// Convert content blocks to Anthropic's content format.
    fn convert_content(blocks: &[ContentBlock], role: &MessageRole) -> serde_json::Value {
        // For tool result messages, Anthropic expects a specific format
        #[allow(clippy::collapsible_if)]
        if *role == MessageRole::Tool {
            if let Some(ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            }) = blocks.first()
            {
                return serde_json::json!([{
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": content,
                    "is_error": is_error,
                }]);
            }
        }

        let parts: Vec<serde_json::Value> = blocks
            .iter()
            .map(|block| match block {
                ContentBlock::Text { text } => serde_json::json!({
                    "type": "text",
                    "text": text,
                }),
                ContentBlock::Thinking { thinking, .. } => serde_json::json!({
                    "type": "thinking",
                    "thinking": thinking,
                }),
                ContentBlock::Image { source } => match source {
                    ImageSource::Url { url } => serde_json::json!({
                        "type": "image",
                        "source": {
                            "type": "url",
                            "url": url,
                        },
                    }),
                    ImageSource::Base64 { media_type, data } => serde_json::json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        },
                    }),
                },
                ContentBlock::ToolUse { id, name, input } => serde_json::json!({
                    "type": "tool_use",
                    "id": id,
                    "name": name,
                    "input": input,
                }),
                ContentBlock::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                } => serde_json::json!({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": content,
                    "is_error": is_error,
                }),
            })
            .collect();

        serde_json::Value::Array(parts)
    }

    /// Convert protocol tools to Anthropic format.
    fn convert_tools(tools: &[ToolDefinition]) -> Vec<AntTool> {
        tools
            .iter()
            .map(|t| AntTool {
                name: t.name.clone(),
                description: t.description.clone(),
                input_schema: t.input_schema.clone(),
            })
            .collect()
    }

    /// Parse finish reason from Anthropic's format.
    fn parse_stop_reason(reason: Option<&str>) -> FinishReason {
        match reason {
            Some("end_turn") => FinishReason::Stop,
            Some("max_tokens") => FinishReason::Length,
            Some("stop_sequence") => FinishReason::Stop,
            Some("tool_use") => FinishReason::ToolUse,
            _ => FinishReason::Stop,
        }
    }

    /// Convert Anthropic response content blocks to protocol ContentBlocks.
    fn convert_response_content(blocks: Vec<AntContentBlock>) -> Vec<ContentBlock> {
        blocks
            .into_iter()
            .filter_map(|block| match block.block_type.as_str() {
                "text" => block.text.map(|text| ContentBlock::Text { text }),
                "thinking" => block.thinking.map(|thinking| ContentBlock::Thinking {
                    thinking,
                    signature: block.signature,
                }),
                "tool_use" => Some(ContentBlock::ToolUse {
                    id: block.id.unwrap_or_default(),
                    name: block.name.unwrap_or_default(),
                    input: block.input.unwrap_or(serde_json::json!({})),
                }),
                _ => None,
            })
            .collect()
    }

    /// Build the extended thinking configuration from `ReasoningEffort`.
    ///
    /// Maps effort levels to Anthropic's `thinking.budget_tokens`:
    /// - `Low` → 4,096 tokens
    /// - `Medium` → 10,240 tokens
    /// - `High` → 32,768 tokens
    ///
    /// When extended thinking is enabled, `temperature` must be omitted (or 1.0).
    fn thinking_config(effort: Option<ReasoningEffort>) -> Option<serde_json::Value> {
        effort.map(|e| {
            let budget = match e {
                ReasoningEffort::Low => 4_096,
                ReasoningEffort::Medium => 10_240,
                ReasoningEffort::High => 32_768,
            };
            serde_json::json!({
                "type": "enabled",
                "budget_tokens": budget,
            })
        })
    }
}

#[async_trait]
impl ModelProvider for AnthropicProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let url = self.messages_url();
        let tools = request.tools.as_ref().map(|t| Self::convert_tools(t));

        // Anthropic requires max_tokens, default to 8192 if not set
        let max_tokens = request.max_tokens.unwrap_or(8192);

        // Anthropic uses top-level system field
        let system = request.system.map(|s| {
            serde_json::json!({
                "type": "text",
                "text": s,
            })
        });

        let ant_req = AntRequest {
            model: request.model.clone(),
            max_tokens,
            system,
            messages: Self::convert_messages(&request.messages),
            temperature: request.temperature,
            top_p: request.top_p,
            stop_sequences: request.stop,
            tools,
            stream: false,
            thinking: Self::thinking_config(request.reasoning_effort),
        };

        debug!(model = %request.model, "Sending non-streaming Anthropic request to {}", url);

        let resp = self
            .client
            .post(&url)
            .header("x-api-key", self.api_key()?)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&ant_req)
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            if let Ok(err) = serde_json::from_str::<AntError>(&body) {
                let msg = err.error.message;
                if status.as_u16() == 401 {
                    return Err(LlmError::AuthError(msg));
                }
                if status.as_u16() == 429 {
                    return Err(LlmError::RateLimitError { retry_after: None });
                }
                if status.as_u16() == 400 && msg.contains("context") {
                    // Rough detection of context length errors
                    return Err(LlmError::ContextLengthExceeded { limit: 0, used: 0 });
                }
                return Err(LlmError::ApiError {
                    status: status.as_u16(),
                    message: msg,
                });
            }
            return Err(LlmError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        let ant_resp: AntResponse = serde_json::from_str(&body).map_err(|e| {
            LlmError::UnexpectedResponse(format!("Failed to parse Anthropic response: {e}"))
        })?;

        let usage = Usage {
            input_tokens: ant_resp.usage.input_tokens,
            output_tokens: ant_resp.usage.output_tokens,
            cache_read_tokens: ant_resp.usage.cache_read_input_tokens,
            cache_write_tokens: ant_resp.usage.cache_creation_input_tokens,
        };

        Ok(ChatResponse {
            id: ant_resp.id,
            message: Message {
                role: MessageRole::Assistant,
                content: Self::convert_response_content(ant_resp.content),
                name: None,
                tool_call_id: None,
            },
            model: ant_resp.model,
            usage,
            finish_reason: Self::parse_stop_reason(ant_resp.stop_reason.as_deref()),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
        session_id: String,
    ) -> Result<StreamResult, LlmError> {
        let url = self.messages_url();
        let tools = request.tools.as_ref().map(|t| Self::convert_tools(t));

        let max_tokens = request.max_tokens.unwrap_or(8192);

        let system = request.system.clone().map(|s| {
            serde_json::json!({
                "type": "text",
                "text": s,
            })
        });

        let ant_req = AntRequest {
            model: request.model.clone(),
            max_tokens,
            system,
            messages: Self::convert_messages(&request.messages),
            temperature: request.temperature,
            top_p: request.top_p,
            stop_sequences: request.stop.clone(),
            tools,
            stream: true,
            thinking: Self::thinking_config(request.reasoning_effort),
        };

        debug!(model = %request.model, %session_id, "Sending streaming Anthropic request to {}", url);

        let resp = self
            .client
            .post(&url)
            .header("x-api-key", self.api_key()?)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&ant_req)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await?;
            if let Ok(err) = serde_json::from_str::<AntError>(&body) {
                return Err(LlmError::ApiError {
                    status: status.as_u16(),
                    message: err.error.message,
                });
            }
            return Err(LlmError::ApiError {
                status: status.as_u16(),
                message: body,
            });
        }

        // Mutable state tracked across stream events, wrapped for closure capture
        let state = Arc::new(std::sync::Mutex::new(StreamState::default()));

        let stream = resp.bytes_stream().eventsource();

        let event_stream = stream.filter_map(move |result| {
            let sid = session_id.clone();
            let st = state.clone();
            async move {
                match result {
                    Ok(event) => {
                        let ant_event: AntStreamEvent = match serde_json::from_str(&event.data) {
                            Ok(e) => e,
                            Err(e) => {
                                debug!("Skipping stream event: {e}");
                                return None;
                            }
                        };

                        match ant_event {
                            AntStreamEvent::MessageStart { message } => {
                                let mut s = st.lock().unwrap();
                                s.input_tokens = message.usage.input_tokens;
                                s.cache_read = message.usage.cache_read_input_tokens.unwrap_or(0);
                                s.cache_creation =
                                    message.usage.cache_creation_input_tokens.unwrap_or(0);
                                drop(s);
                                None
                            }
                            AntStreamEvent::ContentBlockStart { content_block, .. } => {
                                if content_block.block_type == "tool_use" {
                                    let mut s = st.lock().unwrap();
                                    s.tool_id = content_block.id.clone();
                                    s.tool_name = content_block.name.clone();
                                    drop(s);
                                }
                                Some(Ok(StreamEvent::Chunk {
                                    session_id: sid,
                                    delta: None,
                                    role: Some(MessageRole::Assistant),
                                    tool_use: if content_block.block_type == "tool_use" {
                                        Some(ToolUseDelta {
                                            id: content_block.id,
                                            name: content_block.name,
                                            input_json: None,
                                        })
                                    } else {
                                        None
                                    },
                                    thinking: None,
                                }))
                            }
                            AntStreamEvent::ContentBlockDelta { delta, .. } => {
                                let tool_id = st.lock().unwrap().tool_id.clone();
                                match delta {
                                    AntStreamDelta::TextDelta { text } => {
                                        Some(Ok(StreamEvent::Chunk {
                                            session_id: sid,
                                            delta: Some(text),
                                            role: None,
                                            tool_use: None,
                                            thinking: None,
                                        }))
                                    }
                                    AntStreamDelta::InputJsonDelta { partial_json } => {
                                        Some(Ok(StreamEvent::Chunk {
                                            session_id: sid,
                                            delta: None,
                                            role: None,
                                            tool_use: Some(ToolUseDelta {
                                                id: tool_id,
                                                name: None,
                                                input_json: Some(partial_json),
                                            }),
                                            thinking: None,
                                        }))
                                    }
                                    AntStreamDelta::ThinkingDelta { thinking } => {
                                        Some(Ok(StreamEvent::Chunk {
                                            session_id: sid,
                                            delta: None,
                                            role: None,
                                            tool_use: None,
                                            thinking: Some(ThinkingDelta {
                                                thinking: Some(thinking),
                                                signature: None,
                                            }),
                                        }))
                                    }
                                }
                            }
                            AntStreamEvent::ContentBlockStop { .. } => None,
                            AntStreamEvent::MessageDelta { delta, usage } => {
                                let s = st.lock().unwrap();
                                let finish_reason =
                                    Self::parse_stop_reason(delta.stop_reason.as_deref());
                                Some(Ok(StreamEvent::Done {
                                    session_id: sid,
                                    usage: Usage {
                                        input_tokens: s.input_tokens,
                                        output_tokens: usage.output_tokens,
                                        cache_read_tokens: if s.cache_read > 0 {
                                            Some(s.cache_read)
                                        } else {
                                            None
                                        },
                                        cache_write_tokens: if s.cache_creation > 0 {
                                            Some(s.cache_creation)
                                        } else {
                                            None
                                        },
                                    },
                                    finish_reason,
                                }))
                            }
                            AntStreamEvent::MessageStop => None,
                            AntStreamEvent::Ping => None,
                        }
                    }
                    Err(e) => Some(Err(LlmError::StreamError(e.to_string()))),
                }
            }
        });

        Ok(Box::pin(event_stream))
    }

    async fn probe(&self) -> Result<(), LlmError> {
        // Anthropic doesn't have a lightweight health endpoint.
        // Send a minimal request to verify the API key works.
        let url = self.messages_url();
        let probe_req = serde_json::json!({
            "model": self.config.models.first().map(|m| m.id.as_str()).unwrap_or("claude-sonnet-4-20250514"),
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}],
        });

        let resp = self
            .client
            .post(&url)
            .header("x-api-key", self.api_key()?)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&probe_req)
            .send()
            .await?;

        let status = resp.status();
        if status.is_success() {
            debug!(provider = %self.config.name, "Probe successful");
            Ok(())
        } else if status.as_u16() == 401 {
            Err(LlmError::AuthError("Invalid API key".to_string()))
        } else if status.as_u16() == 429 {
            Err(LlmError::RateLimitError {
                retry_after: resp
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse().ok()),
            })
        } else {
            let body = resp.text().await.unwrap_or_default();
            Err(LlmError::ApiError {
                status: status.as_u16(),
                message: body,
            })
        }
    }

    async fn list_models(&self) -> Result<Vec<String>, LlmError> {
        // Anthropic doesn't have a models listing endpoint.
        Ok(self.config.models.iter().map(|m| m.id.clone()).collect())
    }
}

// ── Factory ───────────────────────────────────────────

/// Create an Anthropic provider from config.
pub fn create_anthropic_provider(config: ProviderConfig) -> Result<AnthropicProvider, LlmError> {
    if config.api_key.is_none() {
        return Err(LlmError::ProviderNotConfigured(format!(
            "No API key for {}",
            config.name
        )));
    }
    Ok(AnthropicProvider::new(config))
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::ProviderType;

    fn test_config() -> ProviderConfig {
        ProviderConfig {
            id: "test-anthropic".into(),
            name: "Test Anthropic".into(),
            provider_type: ProviderType::Anthropic,
            base_url: "https://api.anthropic.com".into(),
            api_key: Some("sk-ant-test-key".into()),
            models: vec![],
            enabled: true,
            fallback_provider_ids: vec![],
        }
    }

    #[test]
    fn provider_creation() {
        let config = test_config();
        let provider = create_anthropic_provider(config).unwrap();
        assert_eq!(provider.name(), "Test Anthropic");
    }

    #[test]
    fn provider_creation_no_key() {
        let config = ProviderConfig {
            api_key: None,
            ..test_config()
        };
        let result = create_anthropic_provider(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No API key"));
    }

    #[test]
    fn messages_url_construction() {
        let provider = AnthropicProvider::new(test_config());
        assert_eq!(
            provider.messages_url(),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[test]
    fn messages_url_trailing_slash() {
        let mut config = test_config();
        config.base_url = "https://api.anthropic.com/".into();
        let provider = AnthropicProvider::new(config);
        assert_eq!(
            provider.messages_url(),
            "https://api.anthropic.com/v1/messages"
        );
    }

    #[test]
    fn convert_simple_message() {
        let msgs = vec![
            Message::text(MessageRole::User, "Hello"),
            Message::text(MessageRole::Assistant, "Hi there"),
        ];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        assert_eq!(ant_msgs.len(), 2);
        assert_eq!(ant_msgs[0].role, "user");
        assert_eq!(ant_msgs[1].role, "assistant");
    }

    #[test]
    fn system_message_filtered_out() {
        let msgs = vec![
            Message::text(MessageRole::System, "System prompt"),
            Message::text(MessageRole::User, "Hello"),
        ];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        // System messages are filtered (system is sent as top-level field)
        assert_eq!(ant_msgs.len(), 1);
        assert_eq!(ant_msgs[0].role, "user");
    }

    #[test]
    fn convert_tools() {
        let tools = vec![ToolDefinition {
            name: "read_file".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                },
                "required": ["path"]
            }),
        }];
        let ant_tools = AnthropicProvider::convert_tools(&tools);
        assert_eq!(ant_tools.len(), 1);
        assert_eq!(ant_tools[0].name, "read_file");
        assert!(ant_tools[0].input_schema["properties"]["path"].is_object());
    }

    #[test]
    fn parse_stop_reasons() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("end_turn")),
            FinishReason::Stop
        );
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("max_tokens")),
            FinishReason::Length
        );
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("tool_use")),
            FinishReason::ToolUse
        );
        assert_eq!(
            AnthropicProvider::parse_stop_reason(None),
            FinishReason::Stop
        );
    }

    #[test]
    fn convert_response_content() {
        let blocks = vec![
            AntContentBlock {
                block_type: "text".into(),
                text: Some("Hello!".into()),
                id: None,
                name: None,
                input: None,
                thinking: None,
                signature: None,
            },
            AntContentBlock {
                block_type: "tool_use".into(),
                text: None,
                id: Some("toolu_123".into()),
                name: Some("read_file".into()),
                input: Some(serde_json::json!({"path": "/tmp/a.txt"})),
                thinking: None,
                signature: None,
            },
        ];
        let content = AnthropicProvider::convert_response_content(blocks);
        assert_eq!(content.len(), 2);
        assert!(matches!(&content[0], ContentBlock::Text { text } if text == "Hello!"));
        assert!(
            matches!(&content[1], ContentBlock::ToolUse { id, name, .. } if id == "toolu_123" && name == "read_file")
        );
    }

    #[test]
    fn convert_multimodal_message() {
        let msgs = vec![Message {
            role: MessageRole::User,
            content: vec![
                ContentBlock::Text {
                    text: "What is this?".into(),
                },
                ContentBlock::Image {
                    source: ImageSource::Url {
                        url: "https://example.com/img.png".into(),
                    },
                },
            ],
            name: None,
            tool_call_id: None,
        }];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        assert_eq!(ant_msgs.len(), 1);
        let content = ant_msgs[0].content.as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[1]["type"], "image");
    }

    #[test]
    fn thinking_config_none_when_no_effort() {
        assert!(AnthropicProvider::thinking_config(None).is_none());
    }

    #[test]
    fn thinking_config_budget_tokens() {
        let low = AnthropicProvider::thinking_config(Some(ReasoningEffort::Low)).unwrap();
        assert_eq!(low["type"], "enabled");
        assert_eq!(low["budget_tokens"], 4_096);

        let medium = AnthropicProvider::thinking_config(Some(ReasoningEffort::Medium)).unwrap();
        assert_eq!(medium["budget_tokens"], 10_240);

        let high = AnthropicProvider::thinking_config(Some(ReasoningEffort::High)).unwrap();
        assert_eq!(high["budget_tokens"], 32_768);
    }

    #[test]
    fn convert_response_thinking_block() {
        let blocks = vec![AntContentBlock {
            block_type: "thinking".into(),
            text: None,
            id: None,
            name: None,
            input: None,
            thinking: Some("Let me analyze this...".into()),
            signature: Some("sig_abc123".into()),
        }];
        let content = AnthropicProvider::convert_response_content(blocks);
        assert_eq!(content.len(), 1);
        assert!(
            matches!(&content[0], ContentBlock::Thinking { thinking, signature }
                if thinking == "Let me analyze this..." && signature.as_deref() == Some("sig_abc123"))
        );
    }

    #[test]
    fn convert_response_ignores_unknown_block_type() {
        let blocks = vec![AntContentBlock {
            block_type: "unknown_type".into(),
            text: None,
            id: None,
            name: None,
            input: None,
            thinking: None,
            signature: None,
        }];
        let content = AnthropicProvider::convert_response_content(blocks);
        assert!(content.is_empty());
    }

    #[test]
    fn convert_tool_result_message() {
        let msgs = vec![Message {
            role: MessageRole::Tool,
            content: vec![ContentBlock::ToolResult {
                tool_use_id: "toolu_abc".into(),
                content: "file contents here".into(),
                is_error: false,
            }],
            name: None,
            tool_call_id: None,
        }];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        assert_eq!(ant_msgs.len(), 1);
        assert_eq!(ant_msgs[0].role, "tool");
        let content = ant_msgs[0].content.as_array().unwrap();
        assert_eq!(content[0]["type"], "tool_result");
        assert_eq!(content[0]["tool_use_id"], "toolu_abc");
    }

    #[test]
    fn convert_tool_use_in_assistant_message() {
        let msgs = vec![Message {
            role: MessageRole::Assistant,
            content: vec![ContentBlock::ToolUse {
                id: "toolu_xyz".into(),
                name: "read_file".into(),
                input: serde_json::json!({"path": "/tmp/test.txt"}),
            }],
            name: None,
            tool_call_id: None,
        }];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        assert_eq!(ant_msgs.len(), 1);
        let content = ant_msgs[0].content.as_array().unwrap();
        assert_eq!(content[0]["type"], "tool_use");
        assert_eq!(content[0]["name"], "read_file");
        assert_eq!(content[0]["id"], "toolu_xyz");
    }

    #[test]
    fn convert_thinking_in_message() {
        let msgs = vec![Message {
            role: MessageRole::Assistant,
            content: vec![
                ContentBlock::Thinking {
                    thinking: "hmm...".into(),
                    signature: Some("sig_1".into()),
                },
                ContentBlock::Text {
                    text: "Here is the answer".into(),
                },
            ],
            name: None,
            tool_call_id: None,
        }];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        assert_eq!(ant_msgs.len(), 1);
        let content = ant_msgs[0].content.as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["type"], "thinking");
        assert_eq!(content[1]["type"], "text");
    }

    #[test]
    fn convert_base64_image() {
        let msgs = vec![Message {
            role: MessageRole::User,
            content: vec![ContentBlock::Image {
                source: ImageSource::Base64 {
                    media_type: "image/png".into(),
                    data: "iVBORw0KGgo=".into(),
                },
            }],
            name: None,
            tool_call_id: None,
        }];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        let content = ant_msgs[0].content.as_array().unwrap();
        assert_eq!(content[0]["type"], "image");
        assert_eq!(content[0]["source"]["type"], "base64");
        assert_eq!(content[0]["source"]["media_type"], "image/png");
    }

    #[test]
    fn stop_sequence_maps_to_stop() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("stop_sequence")),
            FinishReason::Stop
        );
    }

    // ── Stream event deserialization tests ─────────────

    #[test]
    fn deserialize_message_start_event() {
        let json = r#"{
            "type": "message_start",
            "message": {
                "id": "msg_001",
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": "claude-sonnet-4-20250514",
                "usage": {
                    "input_tokens": 25,
                    "output_tokens": 0,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0
                }
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::MessageStart { message } => {
                assert_eq!(message.id, "msg_001");
                assert_eq!(message.usage.input_tokens, 25);
            }
            _ => panic!("Expected MessageStart"),
        }
    }

    #[test]
    fn deserialize_text_delta_event() {
        let json = r#"{
            "type": "content_block_delta",
            "index": 0,
            "delta": {
                "type": "text_delta",
                "text": "Hello"
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::ContentBlockDelta { index, delta } => {
                assert_eq!(index, 0);
                match delta {
                    AntStreamDelta::TextDelta { text } => assert_eq!(text, "Hello"),
                    _ => panic!("Expected TextDelta"),
                }
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_thinking_delta_event() {
        let json = r#"{
            "type": "content_block_delta",
            "index": 0,
            "delta": {
                "type": "thinking_delta",
                "thinking": "Let me think..."
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::ContentBlockDelta { delta, .. } => match delta {
                AntStreamDelta::ThinkingDelta { thinking } => {
                    assert_eq!(thinking, "Let me think...");
                }
                _ => panic!("Expected ThinkingDelta"),
            },
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_tool_input_json_delta() {
        let json = r#"{
            "type": "content_block_delta",
            "index": 1,
            "delta": {
                "type": "input_json_delta",
                "partial_json": "{\"path\": \"/tmp/"
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::ContentBlockDelta { index, delta } => {
                assert_eq!(index, 1);
                match delta {
                    AntStreamDelta::InputJsonDelta { partial_json } => {
                        assert_eq!(partial_json, "{\"path\": \"/tmp/");
                    }
                    _ => panic!("Expected InputJsonDelta"),
                }
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_content_block_start_tool_use() {
        let json = r#"{
            "type": "content_block_start",
            "index": 1,
            "content_block": {
                "type": "tool_use",
                "id": "toolu_01A",
                "name": "read_file"
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::ContentBlockStart {
                index,
                content_block,
            } => {
                assert_eq!(index, 1);
                assert_eq!(content_block.block_type, "tool_use");
                assert_eq!(content_block.id.as_deref(), Some("toolu_01A"));
                assert_eq!(content_block.name.as_deref(), Some("read_file"));
            }
            _ => panic!("Expected ContentBlockStart"),
        }
    }

    #[test]
    fn deserialize_message_delta_with_stop_reason() {
        let json = r#"{
            "type": "message_delta",
            "delta": {
                "stop_reason": "end_turn"
            },
            "usage": {
                "output_tokens": 15
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::MessageDelta { delta, usage } => {
                assert_eq!(delta.stop_reason.as_deref(), Some("end_turn"));
                assert_eq!(usage.output_tokens, 15);
            }
            _ => panic!("Expected MessageDelta"),
        }
    }

    #[test]
    fn deserialize_ping_event() {
        let json = r#"{"type": "ping"}"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, AntStreamEvent::Ping));
    }

    #[test]
    fn deserialize_message_stop_event() {
        let json = r#"{"type": "message_stop"}"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, AntStreamEvent::MessageStop));
    }

    #[test]
    fn deserialize_content_block_stop() {
        let json = r#"{"type": "content_block_stop", "index": 0}"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        assert!(matches!(event, AntStreamEvent::ContentBlockStop { index } if index == 0));
    }

    #[test]
    fn deserialize_message_start_with_cache_usage() {
        let json = r#"{
            "type": "message_start",
            "message": {
                "id": "msg_002",
                "type": "message",
                "role": "assistant",
                "content": [],
                "model": "claude-sonnet-4-20250514",
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 0,
                    "cache_creation_input_tokens": 50,
                    "cache_read_input_tokens": 100
                }
            }
        }"#;
        let event: AntStreamEvent = serde_json::from_str(json).unwrap();
        match event {
            AntStreamEvent::MessageStart { message } => {
                assert_eq!(message.usage.cache_creation_input_tokens, Some(50));
                assert_eq!(message.usage.cache_read_input_tokens, Some(100));
            }
            _ => panic!("Expected MessageStart"),
        }
    }

    #[test]
    fn parse_stop_reason_end_turn() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("end_turn")),
            FinishReason::Stop
        );
    }

    #[test]
    fn parse_stop_reason_max_tokens() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("max_tokens")),
            FinishReason::Length
        );
    }

    #[test]
    fn parse_stop_reason_tool_use() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("tool_use")),
            FinishReason::ToolUse
        );
    }

    #[test]
    fn parse_stop_reason_none_defaults_to_stop() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(None),
            FinishReason::Stop
        );
    }

    #[test]
    fn parse_stop_reason_unknown_defaults_to_stop() {
        assert_eq!(
            AnthropicProvider::parse_stop_reason(Some("unknown")),
            FinishReason::Stop
        );
    }

    #[test]
    fn convert_tools_to_anthropic_format() {
        let tools = vec![ToolDefinition {
            name: "read_file".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({"type": "object"}),
        }];
        let ant_tools = AnthropicProvider::convert_tools(&tools);
        assert_eq!(ant_tools.len(), 1);
        assert_eq!(ant_tools[0].name, "read_file");
        assert_eq!(ant_tools[0].description, "Read a file");
    }

    #[test]
    fn convert_response_text_block() {
        let blocks = vec![AntContentBlock {
            block_type: "text".into(),
            text: Some("Hello!".into()),
            thinking: None,
            signature: None,
            id: None,
            name: None,
            input: None,
        }];
        let content = AnthropicProvider::convert_response_content(blocks);
        assert_eq!(content.len(), 1);
        match &content[0] {
            ContentBlock::Text { text } => assert_eq!(text, "Hello!"),
            _ => panic!("Expected Text block"),
        }
    }

    #[test]
    fn convert_response_tool_use_block() {
        let blocks = vec![AntContentBlock {
            block_type: "tool_use".into(),
            text: None,
            thinking: None,
            signature: None,
            id: Some("toolu_123".into()),
            name: Some("read_file".into()),
            input: Some(serde_json::json!({"path": "/tmp/test.txt"})),
        }];
        let content = AnthropicProvider::convert_response_content(blocks);
        assert_eq!(content.len(), 1);
        match &content[0] {
            ContentBlock::ToolUse { id, name, input } => {
                assert_eq!(id, "toolu_123");
                assert_eq!(name, "read_file");
                assert_eq!(input["path"], "/tmp/test.txt");
            }
            _ => panic!("Expected ToolUse block"),
        }
    }

    #[test]
    fn convert_response_tool_use_with_missing_fields_defaults() {
        let blocks = vec![AntContentBlock {
            block_type: "tool_use".into(),
            text: None,
            thinking: None,
            signature: None,
            id: None,
            name: None,
            input: None,
        }];
        let content = AnthropicProvider::convert_response_content(blocks);
        assert_eq!(content.len(), 1);
        match &content[0] {
            ContentBlock::ToolUse { id, name, input } => {
                assert_eq!(id, "");
                assert_eq!(name, "");
                assert_eq!(input, &serde_json::json!({}));
            }
            _ => panic!("Expected ToolUse block"),
        }
    }

    #[test]
    fn convert_messages_filters_system_role() {
        let msgs = vec![
            Message::text(MessageRole::System, "You are helpful"),
            Message::text(MessageRole::User, "Hello"),
        ];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        assert_eq!(ant_msgs.len(), 1);
        assert_eq!(ant_msgs[0].role, "user");
    }

    #[test]
    fn convert_text_only_uses_string() {
        // Single text block should produce array (Anthropic always uses arrays)
        let msgs = vec![Message::text(MessageRole::User, "Hello")];
        let ant_msgs = AnthropicProvider::convert_messages(&msgs);
        let content = ant_msgs[0].content.as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[0]["text"], "Hello");
    }

    #[test]
    fn provider_debug_format() {
        let provider = AnthropicProvider::new(test_config());
        let debug = format!("{provider:?}");
        assert!(debug.contains("AnthropicProvider"));
        assert!(debug.contains("Test Anthropic"));
    }

    #[test]
    fn api_key_missing_returns_error() {
        let mut config = test_config();
        config.api_key = None;
        let provider = AnthropicProvider::new(config);
        let result = provider.api_key();
        assert!(result.is_err());
        match result.unwrap_err() {
            LlmError::ProviderNotConfigured(name) => assert_eq!(name, "Test Anthropic"),
            _ => panic!("Expected ProviderNotConfigured"),
        }
    }

    #[test]
    fn deserialize_ant_error() {
        let json = r#"{
            "error": {
                "type": "invalid_request_error",
                "message": "model not found"
            }
        }"#;
        let err: AntError = serde_json::from_str(json).unwrap();
        assert_eq!(err.error.message, "model not found");
    }

    #[test]
    fn deserialize_ant_response() {
        let json = r#"{
            "id": "msg_001",
            "model": "claude-sonnet-4-20250514",
            "content": [
                {"type": "text", "text": "Hello!"}
            ],
            "stop_reason": "end_turn",
            "usage": {
                "input_tokens": 10,
                "output_tokens": 5
            }
        }"#;
        let resp: AntResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.id, "msg_001");
        assert_eq!(resp.model, "claude-sonnet-4-20250514");
        assert_eq!(resp.content.len(), 1);
        assert_eq!(resp.stop_reason.as_deref(), Some("end_turn"));
        assert_eq!(resp.usage.input_tokens, 10);
        assert_eq!(resp.usage.output_tokens, 5);
    }
}
