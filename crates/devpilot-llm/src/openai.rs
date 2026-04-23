//! OpenAI-compatible API provider.
//!
//! Supports: OpenAI, OpenRouter, GLM (智谱), Qwen (通义), DeepSeek,
//! Moonshot (月之暗面), Yi (零一万物), and any OpenAI-compatible endpoint.

use async_trait::async_trait;
use devpilot_protocol::{
    ChatRequest, ChatResponse, ContentBlock, FinishReason, Message, MessageRole, ProviderConfig,
    ProviderType, StreamEvent, ToolDefinition, ToolUseDelta, Usage,
};
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use std::sync::{Arc, Mutex};
use tracing::{debug, warn};

use crate::error::LlmError;
use crate::provider::{ModelProvider, StreamResult};

// ── OpenAI request/response types ──────────────────────

#[derive(serde::Serialize)]
struct OaiRequest {
    model: String,
    messages: Vec<OaiMessage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<OaiTool>>,
    stream: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct OaiMessage {
    role: String,
    content: serde_json::Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_call_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_calls: Option<Vec<OaiToolCall>>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct OaiToolCall {
    id: String,
    #[serde(rename = "type")]
    call_type: String,
    function: OaiFunction,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct OaiFunction {
    name: String,
    arguments: String,
}

#[derive(serde::Serialize)]
struct OaiTool {
    #[serde(rename = "type")]
    tool_type: String,
    function: OaiToolDef,
}

#[derive(serde::Serialize)]
struct OaiToolDef {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

#[derive(serde::Deserialize)]
struct OaiResponse {
    id: String,
    model: String,
    choices: Vec<OaiChoice>,
    usage: Option<OaiUsage>,
}

#[derive(serde::Deserialize)]
struct OaiChoice {
    message: OaiResponseMessage,
    finish_reason: Option<String>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct OaiResponseMessage {
    role: String,
    content: Option<serde_json::Value>,
    tool_calls: Option<Vec<OaiToolCall>>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct OaiUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct OaiStreamChunk {
    id: Option<String>,
    model: Option<String>,
    choices: Vec<OaiStreamChoice>,
    usage: Option<OaiUsage>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct OaiStreamChoice {
    delta: OaiStreamDelta,
    finish_reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct OaiStreamDelta {
    role: Option<String>,
    content: Option<String>,
    tool_calls: Option<Vec<OaiStreamToolCall>>,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct OaiStreamToolCall {
    index: u32,
    id: Option<String>,
    #[serde(rename = "type")]
    call_type: Option<String>,
    function: Option<OaiStreamFunction>,
}

#[derive(serde::Deserialize)]
struct OaiStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(serde::Deserialize)]
struct OaiModelError {
    error: OaiErrorBody,
}

#[derive(serde::Deserialize)]
#[allow(dead_code)]
struct OaiErrorBody {
    message: String,
    #[serde(rename = "type")]
    error_type: Option<String>,
    code: Option<String>,
}

#[derive(serde::Deserialize)]
struct OaiModelList {
    data: Vec<OaiModelInfo>,
}

#[derive(serde::Deserialize)]
struct OaiModelInfo {
    id: String,
}

// ── Provider implementation ────────────────────────────

/// OpenAI-compatible API provider.
///
/// Works with any API that follows the OpenAI chat completions format:
/// - OpenAI (GPT-4, GPT-4o, o1, o3, etc.)
/// - OpenRouter (multi-model gateway)
/// - GLM (智谱清言)
/// - Qwen (通义千问)
/// - DeepSeek
/// - Moonshot (月之暗面)
/// - Yi (零一万物)
/// - Any custom endpoint with OpenAI-compatible format
pub struct OpenAiProvider {
    config: ProviderConfig,
    client: Client,
}

impl std::fmt::Debug for OpenAiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OpenAiProvider")
            .field("name", &self.config.name)
            .finish()
    }
}

impl OpenAiProvider {
    /// Create a new OpenAI-compatible provider.
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

    /// Convert protocol messages to OpenAI format.
    fn convert_messages(messages: &[Message]) -> Vec<OaiMessage> {
        messages
            .iter()
            .map(|msg| {
                let content = Self::convert_content(&msg.content);
                OaiMessage {
                    role: msg.role.to_string(),
                    content,
                    name: msg.name.clone(),
                    tool_call_id: msg.tool_call_id.clone(),
                    tool_calls: msg
                        .content
                        .iter()
                        .filter_map(|b| match b {
                            ContentBlock::ToolUse { id, name, input } => Some(OaiToolCall {
                                id: id.clone(),
                                call_type: "function".into(),
                                function: OaiFunction {
                                    name: name.clone(),
                                    arguments: serde_json::to_string(input).unwrap_or_default(),
                                },
                            }),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                        .into(),
                }
            })
            .collect()
    }

    /// Convert content blocks to OpenAI's content format.
    /// OpenAI uses:
    /// - string for text-only
    /// - array of content parts for multimodal
    fn convert_content(blocks: &[ContentBlock]) -> serde_json::Value {
        if blocks.len() == 1
            && let ContentBlock::Text { text } = &blocks[0]
        {
            return serde_json::Value::String(text.clone());
        }

        let parts: Vec<serde_json::Value> = blocks
            .iter()
            .map(|block| match block {
                ContentBlock::Text { text } => serde_json::json!({
                    "type": "text",
                    "text": text,
                }),
                ContentBlock::Image { source } => match source {
                    devpilot_protocol::ImageSource::Url { url } => serde_json::json!({
                        "type": "image_url",
                        "image_url": { "url": url },
                    }),
                    devpilot_protocol::ImageSource::Base64 { media_type, data } => {
                        serde_json::json!({
                            "type": "image_url",
                            "image_url": {
                                "url": format!("data:{};base64,{}", media_type, data),
                            },
                        })
                    }
                },
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
                ContentBlock::ToolUse { .. } => {
                    // Tool calls are handled separately in OaiMessage.tool_calls
                    serde_json::Value::Null
                }
                ContentBlock::Thinking { thinking, .. } => {
                    // OpenAI doesn't have a native thinking block format.
                    // For models like o1/o3 that use reasoning_tokens in the response,
                    // we skip sending thinking blocks back (they're not part of the API).
                    // The reasoning content is only in the response, not in the request.
                    let _ = thinking;
                    serde_json::Value::Null
                }
            })
            .filter(|v| !v.is_null())
            .collect();

        serde_json::Value::Array(parts)
    }

    /// Convert protocol tools to OpenAI format.
    fn convert_tools(tools: &[ToolDefinition]) -> Vec<OaiTool> {
        tools
            .iter()
            .map(|t| OaiTool {
                tool_type: "function".into(),
                function: OaiToolDef {
                    name: t.name.clone(),
                    description: t.description.clone(),
                    parameters: t.input_schema.clone(),
                },
            })
            .collect()
    }

    /// Build the messages array with an optional system prompt prepended.
    ///
    /// OpenAI's chat completions API uses a `system`-role message in the
    /// messages array (unlike Anthropic which has a top-level `system` field).
    fn build_messages(system: Option<&str>, messages: &[Message]) -> Vec<OaiMessage> {
        let mut oai_messages = Vec::new();

        // Prepend system prompt as a system-role message if present
        if let Some(sys) = system {
            oai_messages.push(OaiMessage {
                role: "system".to_string(),
                content: serde_json::Value::String(sys.to_string()),
                name: None,
                tool_call_id: None,
                tool_calls: None,
            });
        }

        oai_messages.extend(Self::convert_messages(messages));
        oai_messages
    }

    /// Parse finish reason from OpenAI's string format.
    fn parse_finish_reason(reason: Option<&str>) -> FinishReason {
        match reason {
            Some("stop") => FinishReason::Stop,
            Some("length") => FinishReason::Length,
            Some("tool_calls") | Some("function_call") => FinishReason::ToolUse,
            Some("content_filter") => FinishReason::ContentFilter,
            _ => FinishReason::Stop,
        }
    }

    /// Convert OAI response message to protocol Message.
    fn convert_response_message(msg: OaiResponseMessage) -> Message {
        let mut content_blocks = Vec::new();

        if let Some(c) = msg.content {
            match c {
                serde_json::Value::String(text) if !text.is_empty() => {
                    content_blocks.push(ContentBlock::Text { text });
                }
                serde_json::Value::Array(parts) => {
                    for part in parts {
                        if part["type"] == "text"
                            && let Some(text) = part["text"].as_str()
                        {
                            content_blocks.push(ContentBlock::Text {
                                text: text.to_string(),
                            });
                        }
                    }
                }
                _ => {}
            }
        }

        if let Some(calls) = msg.tool_calls {
            for call in calls {
                let input: serde_json::Value =
                    serde_json::from_str(&call.function.arguments).unwrap_or(serde_json::json!({}));
                content_blocks.push(ContentBlock::ToolUse {
                    id: call.id,
                    name: call.function.name,
                    input,
                });
            }
        }

        Message {
            role: MessageRole::Assistant,
            content: content_blocks,
            name: None,
            tool_call_id: None,
        }
    }

    /// Build the chat completions URL.
    ///
    /// The base URL should include the API version path (e.g. `/v1`).
    /// Examples:
    /// - OpenAI: `https://api.openai.com/v1` → `https://api.openai.com/v1/chat/completions`
    /// - GLM:    `https://open.bigmodel.cn/api/paas/v4` → `.../v4/chat/completions`
    /// - Ollama: `http://localhost:11434/v1` → `http://localhost:11434/v1/chat/completions`
    fn chat_url(&self) -> String {
        let base = self.base_url().trim_end_matches('/');
        format!("{base}/chat/completions")
    }

    /// Build the models list URL.
    fn models_url(&self) -> String {
        let base = self.base_url().trim_end_matches('/');
        format!("{base}/models")
    }
}

#[async_trait]
impl ModelProvider for OpenAiProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let url = self.chat_url();
        let tools = request.tools.as_ref().map(|t| Self::convert_tools(t));

        let oai_req = OaiRequest {
            model: request.model.clone(),
            messages: Self::build_messages(request.system.as_deref(), &request.messages),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
            stop: request.stop,
            tools,
            stream: false,
        };

        debug!(model = %request.model, "Sending non-streaming chat request to {}", url);

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key()?))
            .header("Content-Type", "application/json")
            .json(&oai_req)
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            if let Ok(err) = serde_json::from_str::<OaiModelError>(&body) {
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

        let oai_resp: OaiResponse = serde_json::from_str(&body)
            .map_err(|e| LlmError::UnexpectedResponse(format!("Failed to parse response: {e}")))?;

        let choice = oai_resp
            .choices
            .into_iter()
            .next()
            .ok_or_else(|| LlmError::UnexpectedResponse("No choices in response".into()))?;

        let usage = oai_resp
            .usage
            .map(|u| Usage {
                input_tokens: u.prompt_tokens,
                output_tokens: u.completion_tokens,
                cache_read_tokens: None,
                cache_write_tokens: None,
            })
            .unwrap_or_default();

        Ok(ChatResponse {
            id: oai_resp.id,
            message: Self::convert_response_message(choice.message),
            model: oai_resp.model,
            usage,
            finish_reason: Self::parse_finish_reason(choice.finish_reason.as_deref()),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
        session_id: String,
    ) -> Result<StreamResult, LlmError> {
        let url = self.chat_url();
        let tools = request.tools.as_ref().map(|t| Self::convert_tools(t));

        let oai_req = OaiRequest {
            model: request.model.clone(),
            messages: Self::build_messages(request.system.as_deref(), &request.messages),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
            top_p: request.top_p,
            stop: request.stop,
            tools,
            stream: true,
        };

        debug!(model = %request.model, %session_id, "Sending streaming chat request to {}", url);

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key()?))
            .header("Content-Type", "application/json")
            .json(&oai_req)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await?;
            if let Ok(err) = serde_json::from_str::<OaiModelError>(&body) {
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

        let stream = resp.bytes_stream().eventsource();

        /// Shared state tracked across stream chunks for the final Done event.
        struct StreamState {
            finish_reason: Option<FinishReason>,
            usage: Option<Usage>,
        }

        let state = Arc::new(Mutex::new(StreamState {
            finish_reason: None,
            usage: None,
        }));

        let event_stream = stream.filter_map(move |result| {
            let sid = session_id.clone();
            let st = state.clone();
            async move {
                match result {
                    Ok(event) => {
                        // [DONE] is the standard OpenAI stream termination marker
                        if event.data == "[DONE]" {
                            let s = st.lock().unwrap();
                            let finish = s.finish_reason.unwrap_or(FinishReason::Stop);
                            let usage = s.usage.clone().unwrap_or(Usage {
                                input_tokens: 0,
                                output_tokens: 0,
                                cache_read_tokens: None,
                                cache_write_tokens: None,
                            });
                            return Some(Ok(StreamEvent::Done {
                                session_id: sid,
                                usage,
                                finish_reason: finish,
                            }));
                        }
                        let chunk: OaiStreamChunk = match serde_json::from_str(&event.data) {
                            Ok(c) => c,
                            Err(e) => {
                                warn!("Failed to parse stream chunk: {e}");
                                return None;
                            }
                        };

                        // Track usage from any chunk that includes it
                        if let Some(u) = &chunk.usage {
                            let mut s = st.lock().unwrap();
                            s.usage = Some(Usage {
                                input_tokens: u.prompt_tokens,
                                output_tokens: u.completion_tokens,
                                cache_read_tokens: None,
                                cache_write_tokens: None,
                            });
                        }

                        let choice = match chunk.choices.first() {
                            Some(c) => c,
                            None => return None,
                        };

                        // Track finish_reason from the last chunk
                        if let Some(reason) = &choice.finish_reason {
                            let mut s = st.lock().unwrap();
                            s.finish_reason =
                                Some(Self::parse_finish_reason(Some(reason.as_str())));
                        }

                        let delta = &choice.delta;

                        let role = delta.role.as_deref().and_then(|r| match r {
                            "assistant" => Some(MessageRole::Assistant),
                            _ => None,
                        });

                        let tool_use = delta.tool_calls.as_ref().and_then(|calls| {
                            calls.first().map(|tc| ToolUseDelta {
                                id: tc.id.clone(),
                                name: tc.function.as_ref().and_then(|f| f.name.clone()),
                                input_json: tc.function.as_ref().and_then(|f| f.arguments.clone()),
                            })
                        });

                        Some(Ok(StreamEvent::Chunk {
                            session_id: sid,
                            delta: delta.content.clone(),
                            role,
                            tool_use,
                            thinking: None,
                        }))
                    }
                    Err(e) => Some(Err(LlmError::StreamError(e.to_string()))),
                }
            }
        });

        Ok(Box::pin(event_stream))
    }

    async fn probe(&self) -> Result<(), LlmError> {
        let url = self.models_url();
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key()?))
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
        let url = self.models_url();
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key()?))
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            // Some providers don't support /v1/models, fall back to config
            warn!(
                provider = %self.config.name,
                "Failed to list models (HTTP {}), using config list",
                status
            );
            return Ok(self.config.models.iter().map(|m| m.id.clone()).collect());
        }

        match serde_json::from_str::<OaiModelList>(&body) {
            Ok(list) => Ok(list.data.into_iter().map(|m| m.id).collect()),
            Err(_) => {
                warn!("Failed to parse model list, using config");
                Ok(self.config.models.iter().map(|m| m.id.clone()).collect())
            }
        }
    }
}

// ── Factory ────────────────────────────────────────────

/// Create an OpenAI-compatible provider from config.
/// This is a convenience function for the provider registry.
pub fn create_openai_provider(config: ProviderConfig) -> Result<OpenAiProvider, LlmError> {
    if config.api_key.is_none() && config.provider_type != ProviderType::Ollama {
        return Err(LlmError::ProviderNotConfigured(format!(
            "No API key for {}",
            config.name
        )));
    }
    Ok(OpenAiProvider::new(config))
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::{ImageSource, ProviderType};

    fn test_config() -> ProviderConfig {
        ProviderConfig {
            id: "test-openai".into(),
            name: "Test OpenAI".into(),
            provider_type: ProviderType::OpenAI,
            base_url: "https://api.openai.com/v1".into(),
            api_key: Some("sk-test-key".into()),
            models: vec![],
            enabled: true,
            fallback_provider_ids: vec![],
        }
    }

    #[test]
    fn provider_creation() {
        let config = test_config();
        let provider = create_openai_provider(config).unwrap();
        assert_eq!(provider.name(), "Test OpenAI");
    }

    #[test]
    fn provider_creation_no_key() {
        let config = ProviderConfig {
            api_key: None,
            ..test_config()
        };
        let result = create_openai_provider(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No API key"));
    }

    #[test]
    fn convert_simple_message() {
        let msgs = vec![Message::text(MessageRole::User, "Hello")];
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        assert_eq!(oai_msgs.len(), 1);
        assert_eq!(oai_msgs[0].role, "user");
        assert_eq!(
            oai_msgs[0].content,
            serde_json::Value::String("Hello".into())
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
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        assert_eq!(oai_msgs.len(), 1);
        let content = oai_msgs[0].content.as_array().unwrap();
        assert_eq!(content.len(), 2);
        assert_eq!(content[0]["type"], "text");
        assert_eq!(content[1]["type"], "image_url");
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
        let oai_tools = OpenAiProvider::convert_tools(&tools);
        assert_eq!(oai_tools.len(), 1);
        assert_eq!(oai_tools[0].tool_type, "function");
        assert_eq!(oai_tools[0].function.name, "read_file");
    }

    #[test]
    fn parse_finish_reasons() {
        assert_eq!(
            OpenAiProvider::parse_finish_reason(Some("stop")),
            FinishReason::Stop
        );
        assert_eq!(
            OpenAiProvider::parse_finish_reason(Some("length")),
            FinishReason::Length
        );
        assert_eq!(
            OpenAiProvider::parse_finish_reason(Some("tool_calls")),
            FinishReason::ToolUse
        );
        assert_eq!(
            OpenAiProvider::parse_finish_reason(None),
            FinishReason::Stop
        );
    }

    #[test]
    fn chat_url_construction() {
        let provider = OpenAiProvider::new(test_config());
        assert_eq!(
            provider.chat_url(),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn chat_url_trailing_slash() {
        let mut config = test_config();
        config.base_url = "https://api.openai.com/v1/".into();
        let provider = OpenAiProvider::new(config);
        assert_eq!(
            provider.chat_url(),
            "https://api.openai.com/v1/chat/completions"
        );
    }

    #[test]
    fn ollama_allows_no_key() {
        let config = ProviderConfig {
            id: "test-ollama".into(),
            name: "Ollama".into(),
            provider_type: ProviderType::Ollama,
            base_url: "http://localhost:11434".into(),
            api_key: None,
            models: vec![],
            enabled: true,
            fallback_provider_ids: vec![],
        };
        // Ollama should not require an API key
        assert!(create_openai_provider(config).is_ok());
    }

    #[test]
    fn convert_tool_use_message() {
        let msgs = vec![Message {
            role: MessageRole::Assistant,
            content: vec![ContentBlock::ToolUse {
                id: "call_abc123".into(),
                name: "read_file".into(),
                input: serde_json::json!({"path": "/tmp/a.txt"}),
            }],
            name: None,
            tool_call_id: None,
        }];
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        assert_eq!(oai_msgs.len(), 1);
        // Tool calls go into the tool_calls field, not content
        let tc = oai_msgs[0].tool_calls.as_ref().unwrap();
        assert_eq!(tc.len(), 1);
        assert_eq!(tc[0].id, "call_abc123");
        assert_eq!(tc[0].call_type, "function");
        assert_eq!(tc[0].function.name, "read_file");
    }

    #[test]
    fn convert_tool_result_message() {
        let msgs = vec![Message {
            role: MessageRole::Tool,
            content: vec![ContentBlock::ToolResult {
                tool_use_id: "call_abc123".into(),
                content: "file contents".into(),
                is_error: false,
            }],
            name: None,
            tool_call_id: Some("call_abc123".into()),
        }];
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        assert_eq!(oai_msgs.len(), 1);
        assert_eq!(oai_msgs[0].role, "tool");
        assert_eq!(oai_msgs[0].tool_call_id.as_deref(), Some("call_abc123"));
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
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        let content = oai_msgs[0].content.as_array().unwrap();
        assert_eq!(content[0]["type"], "image_url");
        // Should be data:image/png;base64,... format
        let url = content[0]["image_url"]["url"].as_str().unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn convert_thinking_block_skipped() {
        // Thinking blocks should produce Null and be filtered out
        let msgs = vec![Message {
            role: MessageRole::Assistant,
            content: vec![
                ContentBlock::Thinking {
                    thinking: "internal reasoning".into(),
                    signature: None,
                },
                ContentBlock::Text {
                    text: "actual response".into(),
                },
            ],
            name: None,
            tool_call_id: None,
        }];
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        // Thinking block is filtered, only text remains as array
        let content = oai_msgs[0].content.as_array().unwrap();
        assert_eq!(content.len(), 1);
        assert_eq!(content[0]["type"], "text");
    }

    #[test]
    fn convert_mixed_content_with_tool_use() {
        let msgs = vec![Message {
            role: MessageRole::Assistant,
            content: vec![
                ContentBlock::Text {
                    text: "Let me read that file.".into(),
                },
                ContentBlock::ToolUse {
                    id: "call_1".into(),
                    name: "file_read".into(),
                    input: serde_json::json!({"path": "/tmp/a.txt"}),
                },
            ],
            name: None,
            tool_call_id: None,
        }];
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        // Text goes to content, tool_use goes to tool_calls
        assert!(oai_msgs[0].content.is_array());
        let tc = oai_msgs[0].tool_calls.as_ref().unwrap();
        assert_eq!(tc.len(), 1);
    }

    #[test]
    fn convert_response_with_tool_calls() {
        let msg = OaiResponseMessage {
            role: "assistant".into(),
            content: Some(serde_json::Value::String("Using tool...".into())),
            tool_calls: Some(vec![OaiToolCall {
                id: "call_1".into(),
                call_type: "function".into(),
                function: OaiFunction {
                    name: "read_file".into(),
                    arguments: r#"{"path":"/tmp/a.txt"}"#.into(),
                },
            }]),
        };
        let result = OpenAiProvider::convert_response_message(msg);
        assert_eq!(result.role, MessageRole::Assistant);
        // Should have both text and tool_use blocks
        assert!(
            result
                .content
                .iter()
                .any(|b| matches!(b, ContentBlock::Text { .. }))
        );
        assert!(
            result
                .content
                .iter()
                .any(|b| matches!(b, ContentBlock::ToolUse { .. }))
        );
    }

    #[test]
    fn convert_response_empty_content() {
        let msg = OaiResponseMessage {
            role: "assistant".into(),
            content: None,
            tool_calls: None,
        };
        let result = OpenAiProvider::convert_response_message(msg);
        assert_eq!(result.role, MessageRole::Assistant);
        assert!(result.content.is_empty());
    }

    #[test]
    fn convert_response_invalid_tool_arguments() {
        let msg = OaiResponseMessage {
            role: "assistant".into(),
            content: None,
            tool_calls: Some(vec![OaiToolCall {
                id: "call_1".into(),
                call_type: "function".into(),
                function: OaiFunction {
                    name: "read_file".into(),
                    arguments: "invalid json {{{".into(),
                },
            }]),
        };
        let result = OpenAiProvider::convert_response_message(msg);
        // Should still create ToolUse block with empty object fallback
        assert_eq!(result.content.len(), 1);
        if let ContentBlock::ToolUse { input, .. } = &result.content[0] {
            assert_eq!(input, &serde_json::json!({}));
        } else {
            panic!("Expected ToolUse block");
        }
    }

    #[test]
    fn parse_finish_reason_function_call() {
        assert_eq!(
            OpenAiProvider::parse_finish_reason(Some("function_call")),
            FinishReason::ToolUse
        );
    }

    #[test]
    fn parse_finish_reason_content_filter() {
        assert_eq!(
            OpenAiProvider::parse_finish_reason(Some("content_filter")),
            FinishReason::ContentFilter
        );
    }

    #[test]
    fn models_url_construction() {
        let provider = OpenAiProvider::new(test_config());
        assert_eq!(provider.models_url(), "https://api.openai.com/v1/models");
    }

    #[test]
    fn convert_message_with_name() {
        let mut msgs = vec![Message::text(MessageRole::User, "Hello")];
        msgs[0].name = Some("alice".into());
        let oai_msgs = OpenAiProvider::convert_messages(&msgs);
        assert_eq!(oai_msgs[0].name.as_deref(), Some("alice"));
    }

    #[test]
    fn request_serialization_includes_stream() {
        let oai_req = OaiRequest {
            model: "gpt-4".into(),
            messages: vec![],
            temperature: Some(0.7),
            max_tokens: Some(100),
            top_p: None,
            stop: None,
            tools: None,
            stream: true,
        };
        let json = serde_json::to_value(&oai_req).unwrap();
        assert_eq!(json["stream"], true);
        assert_eq!(json["model"], "gpt-4");
        // temperature is f32 which has float precision, just verify it's present
        assert!(json.get("temperature").is_some());
        // None fields should not be present
        assert!(json.get("tools").is_none());
        assert!(json.get("stop").is_none());
    }

    #[test]
    fn build_messages_without_system() {
        let msgs = vec![Message::text(MessageRole::User, "Hello")];
        let oai_msgs = OpenAiProvider::build_messages(None, &msgs);
        assert_eq!(oai_msgs.len(), 1);
        assert_eq!(oai_msgs[0].role, "user");
    }

    #[test]
    fn build_messages_with_system() {
        let msgs = vec![Message::text(MessageRole::User, "Hello")];
        let oai_msgs = OpenAiProvider::build_messages(Some("You are helpful."), &msgs);
        assert_eq!(oai_msgs.len(), 2);
        assert_eq!(oai_msgs[0].role, "system");
        assert_eq!(
            oai_msgs[0].content,
            serde_json::Value::String("You are helpful.".into())
        );
        assert_eq!(oai_msgs[1].role, "user");
    }
}
