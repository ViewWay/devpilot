//! DevPilot Protocol — shared types used across crates and Tauri IPC.
//!
//! These types are the "lingua franca" between the frontend, Tauri commands,
//! and backend crates. Every type here is `Serialize + Deserialize` for
//! JSON IPC compatibility.

use serde::{Deserialize, Serialize};

// ── Identifiers ────────────────────────────────────────

/// Unique session identifier (UUID v4).
pub type SessionId = String;

/// Unique message identifier (UUID v4).
pub type MessageId = String;

/// Unique tool-call identifier (UUID v4).
pub type ToolCallId = String;

// ── Message Role ───────────────────────────────────────

/// Who sent this message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Tool,
}

impl std::fmt::Display for MessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::User => write!(f, "user"),
            Self::Assistant => write!(f, "assistant"),
            Self::System => write!(f, "system"),
            Self::Tool => write!(f, "tool"),
        }
    }
}

// ── Content Blocks ─────────────────────────────────────

/// A single block within a message's content array.
/// Supports text, images, tool calls, and tool results.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    /// Plain text content.
    #[serde(rename = "text")]
    Text { text: String },
    /// Image content (URL or base64).
    #[serde(rename = "image")]
    Image {
        /// Public URL or `data:<media_type>;base64,...`.
        source: ImageSource,
    },
    /// Assistant requesting a tool call.
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    /// Result returned by a tool execution.
    #[serde(rename = "tool_result")]
    ToolResult {
        tool_use_id: String,
        content: String,
        #[serde(default)]
        is_error: bool,
    },
}

/// Image source — either a URL or inline base64 data.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ImageSource {
    #[serde(rename = "url")]
    Url { url: String },
    #[serde(rename = "base64")]
    Base64 { media_type: String, data: String },
}

// ── Message ────────────────────────────────────────────

/// A single message in a conversation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: MessageRole,
    /// Content blocks (text, images, tool calls, tool results).
    /// For simple text messages this is a single `ContentBlock::Text`.
    #[serde(default)]
    pub content: Vec<ContentBlock>,
    /// For tool-role messages: which tool produced this.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// For tool-result messages: the ID of the corresponding tool_use.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl Message {
    /// Convenience: create a simple text message.
    pub fn text(role: MessageRole, text: impl Into<String>) -> Self {
        Self {
            role,
            content: vec![ContentBlock::Text { text: text.into() }],
            name: None,
            tool_call_id: None,
        }
    }

    /// Extract the concatenated text from all Text blocks.
    pub fn text_content(&self) -> String {
        self.content
            .iter()
            .filter_map(|b| match b {
                ContentBlock::Text { text } => Some(text.as_str()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("")
    }
}

// ── Tool Definition ────────────────────────────────────

/// A tool that the LLM can invoke.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    /// Tool name (e.g. "read_file", "shell_exec").
    pub name: String,
    /// Human-readable description shown to the LLM.
    pub description: String,
    /// JSON Schema object describing the tool's input parameters.
    pub input_schema: serde_json::Value,
}

// ── Usage / Token Counts ───────────────────────────────

/// Token usage statistics returned by the provider.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_tokens: Option<u32>,
}

impl Usage {
    pub fn total_tokens(&self) -> u32 {
        self.input_tokens
            + self.output_tokens
            + self.cache_read_tokens.unwrap_or(0)
            + self.cache_write_tokens.unwrap_or(0)
    }
}

// ── Finish Reason ──────────────────────────────────────

/// Why the model stopped generating.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FinishReason {
    /// Natural stop or stop sequence.
    Stop,
    /// Max tokens reached.
    Length,
    /// The model wants to call a tool.
    ToolUse,
    /// Content was filtered by safety.
    ContentFilter,
}

// ── Chat Request ───────────────────────────────────────

/// Parameters sent to the LLM provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<Message>,
    /// System prompt (separate from messages for providers that support it).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub system: Option<String>,
    /// Sampling temperature (0.0 – 2.0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    /// Maximum tokens to generate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    /// Nucleus sampling parameter.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f32>,
    /// Stop sequences.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stop: Option<Vec<String>>,
    /// Available tools the model can call.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDefinition>>,
    /// Whether to stream the response.
    #[serde(default)]
    pub stream: bool,
}

// ── Chat Response ──────────────────────────────────────

/// Complete (non-streaming) response from the provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    /// Provider-assigned response ID.
    pub id: String,
    /// The assistant's reply message.
    pub message: Message,
    /// Model actually used (may differ from requested).
    pub model: String,
    /// Token usage.
    pub usage: Usage,
    /// Why generation stopped.
    pub finish_reason: FinishReason,
}

// ── Stream Events ──────────────────────────────────────

/// A single event in an SSE stream from the provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event")]
pub enum StreamEvent {
    /// Incremental content delta.
    #[serde(rename = "chunk")]
    Chunk {
        /// Session this chunk belongs to.
        session_id: String,
        /// Text delta (if any).
        #[serde(skip_serializing_if = "Option::is_none")]
        delta: Option<String>,
        /// Role (only on first chunk).
        #[serde(skip_serializing_if = "Option::is_none")]
        role: Option<MessageRole>,
        /// Tool-use delta (for streaming tool calls).
        #[serde(skip_serializing_if = "Option::is_none")]
        tool_use: Option<ToolUseDelta>,
    },
    /// Stream completed successfully.
    #[serde(rename = "done")]
    Done {
        session_id: String,
        usage: Usage,
        finish_reason: FinishReason,
    },
    /// An error occurred during streaming.
    #[serde(rename = "error")]
    Error {
        session_id: String,
        message: String,
        code: Option<String>,
    },
}

/// Incremental tool-use information from a stream.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolUseDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Partial JSON string of tool input arguments.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_json: Option<String>,
}

// ── Provider Types ─────────────────────────────────────

/// Supported provider backends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Anthropic,
    OpenAI,
    OpenRouter,
    Google,
    Ollama,
    Custom,
}

impl std::fmt::Display for ProviderType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Anthropic => write!(f, "anthropic"),
            Self::OpenAI => write!(f, "openai"),
            Self::OpenRouter => write!(f, "openrouter"),
            Self::Google => write!(f, "google"),
            Self::Ollama => write!(f, "ollama"),
            Self::Custom => write!(f, "custom"),
        }
    }
}

// ── Model Info ─────────────────────────────────────────

/// Metadata about a specific model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub id: String,
    /// Human-readable display name.
    pub name: String,
    /// Which provider owns this model.
    pub provider: ProviderType,
    /// Maximum input context tokens.
    pub max_input_tokens: u32,
    /// Maximum output tokens.
    pub max_output_tokens: u32,
    /// Whether the model supports SSE streaming.
    #[serde(default = "default_true")]
    pub supports_streaming: bool,
    /// Whether the model supports tool/function calling.
    #[serde(default = "default_true")]
    pub supports_tools: bool,
    /// Whether the model supports image input (vision).
    #[serde(default)]
    pub supports_vision: bool,
    /// Input price per 1M tokens (USD), if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_price_per_million: Option<f64>,
    /// Output price per 1M tokens (USD), if known.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_price_per_million: Option<f64>,
}

fn default_true() -> bool {
    true
}

// ── Provider Config ────────────────────────────────────

/// Configuration for an LLM provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    /// Unique provider ID.
    pub id: String,
    /// Display name (e.g. "Anthropic", "GLM-4").
    pub name: String,
    /// Provider backend type.
    pub provider_type: ProviderType,
    /// Base URL for API requests.
    pub base_url: String,
    /// API key (stored encrypted at rest).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Available models.
    #[serde(default)]
    pub models: Vec<ModelInfo>,
    /// Whether this provider is enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

// ── Session Mode ───────────────────────────────────────

/// How the agent should behave in this session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SessionMode {
    /// Full coding agent with tool access.
    Code,
    /// Plan-only mode (no tool execution).
    Plan,
    /// Simple Q&A (no tools).
    Ask,
}

// ── Reasoning Effort ───────────────────────────────────

/// How hard the model should think (for models that support it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReasoningEffort {
    Low,
    #[default]
    Medium,
    High,
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn message_text_helper() {
        let msg = Message::text(MessageRole::User, "hello");
        assert_eq!(msg.text_content(), "hello");
        assert_eq!(msg.role, MessageRole::User);
    }

    #[test]
    fn message_multimodal() {
        let msg = Message {
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
        };
        assert_eq!(msg.text_content(), "What is this?");
        assert_eq!(msg.content.len(), 2);
    }

    #[test]
    fn chat_request_serialization() {
        let req = ChatRequest {
            model: "claude-sonnet-4".into(),
            messages: vec![Message::text(MessageRole::User, "hi")],
            system: Some("You are helpful.".into()),
            temperature: Some(0.7),
            max_tokens: None,
            top_p: None,
            stop: None,
            tools: None,
            stream: false,
        };
        let json = serde_json::to_string(&req).unwrap();
        let parsed: ChatRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.model, "claude-sonnet-4");
        assert_eq!(parsed.messages.len(), 1);
    }

    #[test]
    fn usage_total() {
        let u = Usage {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: Some(20),
            cache_write_tokens: None,
        };
        assert_eq!(u.total_tokens(), 170);
    }

    #[test]
    fn stream_event_serialization() {
        let ev = StreamEvent::Chunk {
            session_id: "abc".into(),
            delta: Some("Hello".into()),
            role: None,
            tool_use: None,
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("chunk"));
    }

    #[test]
    fn provider_type_display() {
        assert_eq!(ProviderType::Anthropic.to_string(), "anthropic");
        assert_eq!(ProviderType::Ollama.to_string(), "ollama");
    }
}
