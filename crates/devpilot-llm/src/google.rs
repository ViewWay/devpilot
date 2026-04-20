//! Google Gemini native API provider.
//!
//! Implements the `ModelProvider` trait for Google's Gemini API.
//! Supports Gemini models (gemini-2.0-flash, gemini-2.5-pro, etc.) with
//! streaming, tool/function calling, and image input.
//!
//! Uses the `generateContent` and `streamGenerateContent` REST endpoints.

use async_trait::async_trait;
use devpilot_protocol::{
    ChatRequest, ChatResponse, ContentBlock, FinishReason, ImageSource, Message, MessageRole,
    ProviderConfig, StreamEvent, ToolDefinition, ToolUseDelta, Usage,
};
#[cfg(test)]
use devpilot_protocol::ProviderType;
use eventsource_stream::Eventsource;
use futures::StreamExt;
use reqwest::Client;
use tracing::{debug, warn};

use crate::error::LlmError;
use crate::provider::{ModelProvider, StreamResult};

// ── Gemini request/response types ─────────────────────

#[derive(serde::Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<GeminiTools>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<serde_json::Value>,
}

#[derive(serde::Serialize)]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    stop_sequences: Option<Vec<String>>,
}

#[derive(serde::Serialize)]
struct GeminiTools {
    function_declarations: Vec<GeminiFunctionDecl>,
}

#[derive(serde::Serialize)]
struct GeminiFunctionDecl {
    name: String,
    description: String,
    parameters: serde_json::Value,
}

// ── Non-streaming response types ──────────────────────

#[derive(serde::Deserialize)]
struct GeminiResponse {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
    #[serde(default)]
    usage_metadata: Option<GeminiUsage>,
}

#[derive(serde::Deserialize)]
struct GeminiCandidate {
    #[serde(default)]
    content: Option<GeminiContent>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(serde::Deserialize)]
struct GeminiUsage {
    #[serde(default)]
    prompt_token_count: u32,
    #[serde(default)]
    candidates_token_count: u32,
}

// ── Streaming event types ─────────────────────────────

#[derive(serde::Deserialize)]
struct GeminiStreamChunk {
    #[serde(default)]
    candidates: Vec<GeminiCandidate>,
    #[serde(default)]
    usage_metadata: Option<GeminiUsage>,
}

// ── Model list response ───────────────────────────────

#[derive(serde::Deserialize)]
struct GeminiModelList {
    #[serde(default)]
    models: Vec<GeminiModelInfo>,
}

#[derive(serde::Deserialize)]
struct GeminiModelInfo {
    name: String,
}

// ── Error types ───────────────────────────────────────

#[derive(serde::Deserialize)]
struct GeminiError {
    error: GeminiErrorBody,
}

#[derive(serde::Deserialize)]
struct GeminiErrorBody {
    message: String,
}

// ── Provider implementation ───────────────────────────

/// Google Gemini API provider.
///
/// Works with Google's Generative Language API:
/// - Gemini 2.5 Pro (gemini-2.5-pro)
/// - Gemini 2.5 Flash (gemini-2.5-flash)
/// - Gemini 2.0 Flash (gemini-2.0-flash)
/// - Any model available via the Gemini API
pub struct GeminiProvider {
    config: ProviderConfig,
    client: Client,
}

impl std::fmt::Debug for GeminiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GeminiProvider")
            .field("name", &self.config.name)
            .finish()
    }
}

impl GeminiProvider {
    /// Create a new Gemini provider.
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

    /// Convert protocol messages to Gemini format.
    fn convert_messages(messages: &[Message]) -> Vec<GeminiContent> {
        messages
            .iter()
            .filter(|m| m.role != MessageRole::System)
            .map(|msg| {
                let role = match msg.role {
                    MessageRole::User => "user",
                    MessageRole::Assistant => "model",
                    MessageRole::Tool => "user", // tool results go as user in Gemini
                    _ => "user",
                };
                let parts = Self::convert_content_to_parts(&msg.content);
                GeminiContent {
                    role: role.to_string(),
                    parts,
                }
            })
            .collect()
    }

    /// Convert content blocks to Gemini's "parts" format.
    fn convert_content_to_parts(blocks: &[ContentBlock]) -> Vec<serde_json::Value> {
        blocks
            .iter()
            .map(|block| match block {
                ContentBlock::Text { text } => serde_json::json!({
                    "text": text,
                }),
                ContentBlock::Image { source } => match source {
                    ImageSource::Url { url } => {
                        // Gemini supports inline_data with URL
                        serde_json::json!({
                            "file_data": {
                                "file_uri": url,
                            }
                        })
                    }
                    ImageSource::Base64 { media_type, data } => serde_json::json!({
                        "inline_data": {
                            "mime_type": media_type,
                            "data": data,
                        }
                    }),
                },
                ContentBlock::ToolUse { id: _, name, input } => serde_json::json!({
                    "function_call": {
                        "name": name,
                        "args": input,
                    },
                    // Gemini doesn't have a separate ID field for function calls
                    // We'll store the ID in a metadata wrapper
                }),
                ContentBlock::ToolResult {
                    tool_use_id,
                    content,
                    is_error,
                } => {
                    if *is_error {
                        serde_json::json!({
                            "function_response": {
                                "name": tool_use_id,
                                "response": {
                                    "error": content,
                                }
                            }
                        })
                    } else {
                        // Try to parse content as JSON for structured response
                        let response_val: serde_json::Value = serde_json::from_str(content)
                            .unwrap_or(serde_json::json!({
                                "result": content,
                            }));
                        serde_json::json!({
                            "function_response": {
                                "name": tool_use_id,
                                "response": response_val,
                            }
                        })
                    }
                }
            })
            .collect()
    }

    /// Convert protocol tools to Gemini function declarations.
    fn convert_tools(tools: &[ToolDefinition]) -> GeminiTools {
        let declarations = tools
            .iter()
            .map(|t| GeminiFunctionDecl {
                name: t.name.clone(),
                description: t.description.clone(),
                parameters: t.input_schema.clone(),
            })
            .collect();
        GeminiTools {
            function_declarations: declarations,
        }
    }

    /// Parse finish reason from Gemini's format.
    fn parse_finish_reason(reason: Option<&str>) -> FinishReason {
        match reason {
            Some("STOP") => FinishReason::Stop,
            Some("MAX_TOKENS") => FinishReason::Length,
            Some("FUNCTION_CALL") => FinishReason::ToolUse,
            Some("SAFETY") | Some("RECITATION") => FinishReason::ContentFilter,
            _ => FinishReason::Stop,
        }
    }

    /// Convert Gemini response content back to protocol Message.
    fn convert_response_content(content: &GeminiContent) -> Message {
        let mut content_blocks = Vec::new();

        for part in &content.parts {
            if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                if !text.is_empty() {
                    content_blocks.push(ContentBlock::Text {
                        text: text.to_string(),
                    });
                }
            } else if let Some(fc) = part.get("function_call") {
                let name = fc["name"].as_str().unwrap_or_default().to_string();
                let input = fc.get("args").cloned().unwrap_or(serde_json::json!({}));
                // Generate a deterministic ID from the function name
                let id = format!("call_{}", name);
                content_blocks.push(ContentBlock::ToolUse { id, name, input });
            }
        }

        Message {
            role: MessageRole::Assistant,
            content: content_blocks,
            name: None,
            tool_call_id: None,
        }
    }

    /// Build the generateContent URL.
    fn generate_url(&self, model: &str) -> String {
        let base = self.base_url().trim_end_matches('/');
        format!(
            "{base}/v1beta/models/{model}:generateContent?key={}",
            self.config.api_key.as_deref().unwrap_or_default()
        )
    }

    /// Build the streamGenerateContent URL.
    fn stream_url(&self, model: &str) -> String {
        let base = self.base_url().trim_end_matches('/');
        format!(
            "{base}/v1beta/models/{model}:streamGenerateContent?alt=sse&key={}",
            self.config.api_key.as_deref().unwrap_or_default()
        )
    }

    /// Build the models list URL.
    fn models_url(&self) -> String {
        let base = self.base_url().trim_end_matches('/');
        format!(
            "{base}/v1beta/models?key={}",
            self.config.api_key.as_deref().unwrap_or_default()
        )
    }
}

#[async_trait]
impl ModelProvider for GeminiProvider {
    fn config(&self) -> &ProviderConfig {
        &self.config
    }

    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, LlmError> {
        let url = self.generate_url(&request.model);

        let mut system_instruction = None;
        if let Some(sys) = &request.system {
            system_instruction = Some(GeminiContent {
                role: "user".to_string(),
                parts: vec![serde_json::json!({ "text": sys })],
            });
        }

        let tools = request.tools.as_ref().map(|t| Self::convert_tools(t));

        let generation_config = GeminiGenerationConfig {
            temperature: request.temperature,
            max_output_tokens: request.max_tokens,
            top_p: request.top_p,
            stop_sequences: request.stop,
        };

        let gemini_req = GeminiRequest {
            contents: Self::convert_messages(&request.messages),
            system_instruction,
            generation_config: Some(generation_config),
            tools,
        };

        debug!(model = %request.model, "Sending non-streaming chat request to Gemini");

        let resp = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&gemini_req)
            .send()
            .await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            if let Ok(err) = serde_json::from_str::<GeminiError>(&body) {
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

        let gemini_resp: GeminiResponse = serde_json::from_str(&body).map_err(|e| {
            LlmError::UnexpectedResponse(format!("Failed to parse Gemini response: {e}"))
        })?;

        let candidate = gemini_resp.candidates.into_iter().next().ok_or_else(|| {
            LlmError::UnexpectedResponse("No candidates in Gemini response".into())
        })?;

        let message = candidate
            .content
            .as_ref()
            .map(Self::convert_response_content)
            .unwrap_or_else(|| Message::text(MessageRole::Assistant, ""));

        let usage = gemini_resp
            .usage_metadata
            .map(|u| Usage {
                input_tokens: u.prompt_token_count,
                output_tokens: u.candidates_token_count,
                cache_read_tokens: None,
                cache_write_tokens: None,
            })
            .unwrap_or_default();

        Ok(ChatResponse {
            id: format!("gemini-{}", uuid::Uuid::new_v4().as_simple()),
            message,
            model: request.model,
            usage,
            finish_reason: Self::parse_finish_reason(candidate.finish_reason.as_deref()),
        })
    }

    async fn chat_stream(
        &self,
        request: ChatRequest,
        session_id: String,
    ) -> Result<StreamResult, LlmError> {
        let url = self.stream_url(&request.model);

        let mut system_instruction = None;
        if let Some(sys) = &request.system {
            system_instruction = Some(GeminiContent {
                role: "user".to_string(),
                parts: vec![serde_json::json!({ "text": sys })],
            });
        }

        let tools = request.tools.as_ref().map(|t| Self::convert_tools(t));

        let generation_config = GeminiGenerationConfig {
            temperature: request.temperature,
            max_output_tokens: request.max_tokens,
            top_p: request.top_p,
            stop_sequences: request.stop,
        };

        let gemini_req = GeminiRequest {
            contents: Self::convert_messages(&request.messages),
            system_instruction,
            generation_config: Some(generation_config),
            tools,
        };

        debug!(model = %request.model, %session_id, "Sending streaming chat request to Gemini");

        let resp = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&gemini_req)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await?;
            if let Ok(err) = serde_json::from_str::<GeminiError>(&body) {
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

        let event_stream = stream.filter_map(move |result| {
            let sid = session_id.clone();
            async move {
                match result {
                    Ok(event) => {
                        let chunk: GeminiStreamChunk = match serde_json::from_str(&event.data) {
                            Ok(c) => c,
                            Err(e) => {
                                warn!("Failed to parse Gemini stream chunk: {e}");
                                return None;
                            }
                        };

                        // Extract text delta from first candidate's content parts
                        let delta = chunk
                            .candidates
                            .first()
                            .and_then(|c| c.content.as_ref())
                            .and_then(|c| c.parts.first())
                            .and_then(|p| p.get("text"))
                            .and_then(|t| t.as_str())
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string());

                        // Extract function call delta
                        let tool_use = chunk
                            .candidates
                            .first()
                            .and_then(|c| c.content.as_ref())
                            .and_then(|c| c.parts.first())
                            .and_then(|p| p.get("function_call"))
                            .map(|fc| ToolUseDelta {
                                id: None,
                                name: fc
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .map(|s| s.to_string()),
                                input_json: fc
                                    .get("args")
                                    .map(|a| serde_json::to_string(a).unwrap_or_default()),
                            });

                        // Check for finish
                        let finish_reason = chunk
                            .candidates
                            .first()
                            .and_then(|c| c.finish_reason.as_deref());

                        if let Some(_reason) = finish_reason {
                            let usage = chunk
                                .usage_metadata
                                .map(|u| Usage {
                                    input_tokens: u.prompt_token_count,
                                    output_tokens: u.candidates_token_count,
                                    cache_read_tokens: None,
                                    cache_write_tokens: None,
                                })
                                .unwrap_or_default();

                            return Some(Ok(StreamEvent::Done {
                                session_id: sid,
                                usage,
                                finish_reason: Self::parse_finish_reason(finish_reason),
                            }));
                        }

                        if delta.is_none() && tool_use.is_none() {
                            return None;
                        }

                        Some(Ok(StreamEvent::Chunk {
                            session_id: sid,
                            delta,
                            role: None,
                            tool_use,
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
        let resp = self.client.get(&url).send().await?;

        let status = resp.status();
        if status.is_success() {
            debug!(provider = %self.config.name, "Gemini probe successful");
            Ok(())
        } else if status.as_u16() == 400 || status.as_u16() == 401 || status.as_u16() == 403 {
            Err(LlmError::AuthError("Invalid Gemini API key".to_string()))
        } else if status.as_u16() == 429 {
            Err(LlmError::RateLimitError { retry_after: None })
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
        let resp = self.client.get(&url).send().await?;

        let status = resp.status();
        let body = resp.text().await?;

        if !status.is_success() {
            warn!(
                provider = %self.config.name,
                "Failed to list Gemini models (HTTP {}), using config list",
                status
            );
            return Ok(self.config.models.iter().map(|m| m.id.clone()).collect());
        }

        match serde_json::from_str::<GeminiModelList>(&body) {
            Ok(list) => {
                let model_ids: Vec<String> = list
                    .models
                    .into_iter()
                    .filter_map(|m| {
                        // Gemini returns "models/gemini-2.0-flash" — strip the prefix
                        m.name.strip_prefix("models/").map(|s| s.to_string())
                    })
                    .collect();
                if model_ids.is_empty() {
                    Ok(self.config.models.iter().map(|m| m.id.clone()).collect())
                } else {
                    Ok(model_ids)
                }
            }
            Err(_) => {
                warn!("Failed to parse Gemini model list, using config");
                Ok(self.config.models.iter().map(|m| m.id.clone()).collect())
            }
        }
    }
}

// ── Factory ────────────────────────────────────────────

/// Create a Gemini provider from config.
pub fn create_gemini_provider(config: ProviderConfig) -> Result<GeminiProvider, LlmError> {
    if config.api_key.is_none() {
        return Err(LlmError::ProviderNotConfigured(format!(
            "No API key for {}",
            config.name
        )));
    }
    Ok(GeminiProvider::new(config))
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> ProviderConfig {
        ProviderConfig {
            id: "test-gemini".into(),
            name: "Test Gemini".into(),
            provider_type: ProviderType::Google,
            base_url: "https://generativelanguage.googleapis.com".into(),
            api_key: Some("test-api-key".into()),
            models: vec![],
            enabled: true,
        }
    }

    #[test]
    fn provider_creation() {
        let config = test_config();
        let provider = create_gemini_provider(config).unwrap();
        assert_eq!(provider.name(), "Test Gemini");
    }

    #[test]
    fn provider_creation_no_key() {
        let config = ProviderConfig {
            api_key: None,
            ..test_config()
        };
        let result = create_gemini_provider(config);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("No API key"));
    }

    #[test]
    fn convert_simple_message() {
        let msgs = vec![Message::text(MessageRole::User, "Hello")];
        let contents = GeminiProvider::convert_messages(&msgs);
        assert_eq!(contents.len(), 1);
        assert_eq!(contents[0].role, "user");
        assert_eq!(contents[0].parts.len(), 1);
        assert_eq!(contents[0].parts[0]["text"], "Hello");
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
                    source: ImageSource::Base64 {
                        media_type: "image/png".into(),
                        data: "iVBORw0KGgo=".into(),
                    },
                },
            ],
            name: None,
            tool_call_id: None,
        }];
        let contents = GeminiProvider::convert_messages(&msgs);
        assert_eq!(contents.len(), 1);
        let parts = &contents[0].parts;
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0]["text"], "What is this?");
        assert_eq!(parts[1]["inline_data"]["mime_type"], "image/png");
        assert_eq!(parts[1]["inline_data"]["data"], "iVBORw0KGgo=");
    }

    #[test]
    fn convert_image_url() {
        let msgs = vec![Message {
            role: MessageRole::User,
            content: vec![ContentBlock::Image {
                source: ImageSource::Url {
                    url: "https://example.com/img.png".into(),
                },
            }],
            name: None,
            tool_call_id: None,
        }];
        let contents = GeminiProvider::convert_messages(&msgs);
        let parts = &contents[0].parts;
        assert_eq!(
            parts[0]["file_data"]["file_uri"],
            "https://example.com/img.png"
        );
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
        let gemini_tools = GeminiProvider::convert_tools(&tools);
        assert_eq!(gemini_tools.function_declarations.len(), 1);
        assert_eq!(gemini_tools.function_declarations[0].name, "read_file");
    }

    #[test]
    fn parse_finish_reasons() {
        assert_eq!(
            GeminiProvider::parse_finish_reason(Some("STOP")),
            FinishReason::Stop
        );
        assert_eq!(
            GeminiProvider::parse_finish_reason(Some("MAX_TOKENS")),
            FinishReason::Length
        );
        assert_eq!(
            GeminiProvider::parse_finish_reason(Some("FUNCTION_CALL")),
            FinishReason::ToolUse
        );
        assert_eq!(
            GeminiProvider::parse_finish_reason(Some("SAFETY")),
            FinishReason::ContentFilter
        );
        assert_eq!(
            GeminiProvider::parse_finish_reason(None),
            FinishReason::Stop
        );
    }

    #[test]
    fn generate_url_construction() {
        let provider = GeminiProvider::new(test_config());
        let url = provider.generate_url("gemini-2.0-flash");
        assert!(url.contains("/v1beta/models/gemini-2.0-flash:generateContent"));
        assert!(url.contains("key=test-api-key"));
    }

    #[test]
    fn stream_url_construction() {
        let provider = GeminiProvider::new(test_config());
        let url = provider.stream_url("gemini-2.0-flash");
        assert!(url.contains("/v1beta/models/gemini-2.0-flash:streamGenerateContent"));
        assert!(url.contains("alt=sse"));
        assert!(url.contains("key=test-api-key"));
    }

    #[test]
    fn system_role_filtered() {
        let msgs = vec![
            Message::text(MessageRole::System, "System prompt"),
            Message::text(MessageRole::User, "Hello"),
        ];
        let contents = GeminiProvider::convert_messages(&msgs);
        assert_eq!(contents.len(), 1); // system filtered out
        assert_eq!(contents[0].role, "user");
    }

    #[test]
    fn assistant_role_maps_to_model() {
        let msgs = vec![Message::text(MessageRole::Assistant, "Hi there")];
        let contents = GeminiProvider::convert_messages(&msgs);
        assert_eq!(contents[0].role, "model");
    }
}
