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
/// Supports text, images, tool calls, tool results, and thinking blocks.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ContentBlock {
    /// Plain text content.
    #[serde(rename = "text")]
    Text { text: String },
    /// Thinking/reasoning content (from models with extended thinking).
    /// e.g. Claude extended thinking, DeepSeek-R1 reasoning, OpenAI o1/o3.
    #[serde(rename = "thinking")]
    Thinking {
        /// The thinking/reasoning text content.
        thinking: String,
        /// Optional signature for verifying thinking content (Anthropic).
        #[serde(skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
    },
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
#[serde(rename_all = "camelCase")]
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
    /// Reasoning effort level (for models that support extended thinking).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<ReasoningEffort>,
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
        /// Thinking delta (for models with extended thinking).
        #[serde(skip_serializing_if = "Option::is_none")]
        thinking: Option<ThinkingDelta>,
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

/// Incremental thinking/reasoning content from a stream.
/// Used by models with extended thinking (Claude, DeepSeek-R1, o1/o3).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThinkingDelta {
    /// Incremental thinking text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    /// Signature for thinking content (Anthropic extended thinking).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

// ── Provider Types ─────────────────────────────────────

/// Supported provider backends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Anthropic,
    OpenAI,
    OpenRouter,
    Google,
    Ollama,
    /// 智谱 GLM (智谱清言)
    GLM,
    /// 通义千问 Qwen (阿里云)
    Qwen,
    /// DeepSeek (深度求索)
    DeepSeek,
    /// Kimi (Moonshot AI / 月之暗面)
    Kimi,
    /// MiniMax
    MiniMax,
    /// VolcEngine (豆包 / 字节跳动)
    VolcEngine,
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
            Self::GLM => write!(f, "glm"),
            Self::Qwen => write!(f, "qwen"),
            Self::DeepSeek => write!(f, "deepseek"),
            Self::Kimi => write!(f, "kimi"),
            Self::MiniMax => write!(f, "minimax"),
            Self::VolcEngine => write!(f, "volcengine"),
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
    /// Fallback provider IDs to try when this provider fails.
    /// Providers are tried in order until one succeeds.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_provider_ids: Vec<String>,
}

// ── Session Mode ───────────────────────────────────────

/// How the agent should behave in this session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
#[derive(Default)]
pub enum SessionMode {
    /// Full coding agent with tool access.
    #[default]
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

impl ReasoningEffort {
    /// Convert a 0-100 numeric value to a [`ReasoningEffort`].
    ///
    /// 0-33 → Low, 34-66 → Medium, 67-100 → High.
    pub fn from_number(value: u8) -> Self {
        match value {
            0..=33 => Self::Low,
            34..=66 => Self::Medium,
            _ => Self::High,
        }
    }
}

// ── Skill Types ──────────────────────────────────────

/// A skill loaded from `~/.devpilot/skills/{name}/SKILL.md`.
///
/// Each skill is a markdown file with optional YAML frontmatter that defines
/// metadata (name, description, tags, trigger, etc.) and a markdown body that
/// contains the skill instructions injected into the LLM system prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInfo {
    /// Unique skill name (directory name under skills/).
    pub name: String,
    /// Short human-readable description.
    pub description: String,
    /// Semantic version string (e.g. "1.0.0").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Author of the skill.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    /// Category grouping (e.g. "development", "writing").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    /// Tags for search/filter.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Natural-language description of when this skill should activate.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trigger: Option<String>,
    /// Full markdown body (everything after the YAML frontmatter).
    pub content: String,
    /// Whether this skill is currently enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// ISO-8601 timestamp when the skill was first installed.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<String>,
    /// ISO-8601 timestamp when the skill was last updated.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

// ── Risk Level ─────────────────────────────────────────

/// Risk classification for tool operations.
/// Shared across crates to avoid circular dependencies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RiskLevel {
    /// Read-only operations (ls, cat, grep, git status).
    Low,
    /// Write operations that modify files or run non-destructive commands.
    Medium,
    /// Destructive operations (rm -rf, force push, etc.).
    High,
}

// ── Permission Types ──────────────────────────────────

/// Which approval mode the agent operates under.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    /// Read-only mode — all write tools are blocked.
    Plan,
    /// Auto-approve tools below a configurable risk threshold.
    #[default]
    Auto,
    /// Every tool call needs explicit user approval.
    Manual,
}

impl PermissionMode {
    /// Parse from the string stored in settings ("plan" | "auto" | "manual").
    pub fn from_str_lossy(s: &str) -> Self {
        match s {
            "plan" => Self::Plan,
            "manual" => Self::Manual,
            _ => Self::Auto,
        }
    }

    /// Serialize to the string stored in settings.
    pub fn to_setting_str(self) -> &'static str {
        match self {
            Self::Plan => "plan",
            Self::Auto => "auto",
            Self::Manual => "manual",
        }
    }
}

/// The result of checking a tool call against the permission policy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ApprovalDecision {
    /// Tool is auto-approved — execute directly.
    AutoApproved,
    /// Tool needs user approval — trigger the approval flow.
    NeedsApproval,
    /// Tool is blocked — return an error immediately.
    Blocked,
}

/// Policy governing what the agent is allowed to do.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionPolicy {
    /// Active approval mode.
    pub mode: PermissionMode,
    /// Path whitelist for file operations. If non-empty, only these paths are allowed.
    pub allowed_paths: Vec<String>,
    /// Path blacklist — paths that are always denied (e.g. .git, node_modules).
    pub blocked_paths: Vec<String>,
    /// Whether to always auto-approve read-only tools regardless of mode.
    pub auto_approve_read: bool,
    /// Highest risk level that will be auto-approved in `Auto` mode.
    pub max_auto_approve_risk: RiskLevel,
}

impl Default for PermissionPolicy {
    fn default() -> Self {
        Self {
            mode: PermissionMode::Auto,
            allowed_paths: vec![],
            blocked_paths: vec![
                ".git".into(),
                "node_modules".into(),
                ".env".into(),
                "__pycache__".into(),
                ".DS_Store".into(),
            ],
            auto_approve_read: true,
            max_auto_approve_risk: RiskLevel::Medium,
        }
    }
}

/// Evaluates tool execution requests against a [`PermissionPolicy`].
pub struct PermissionGuard;

impl PermissionGuard {
    /// Check whether a tool call should be auto-approved, needs approval, or is blocked.
    pub fn check(
        policy: &PermissionPolicy,
        tool_name: &str,
        input: &serde_json::Value,
    ) -> ApprovalDecision {
        // Plan mode: block all write tools
        if policy.mode == PermissionMode::Plan && Self::is_write_tool(tool_name) {
            return ApprovalDecision::Blocked;
        }

        // Path validation for file tools
        if Self::is_file_tool(tool_name)
            && let Some(path) = Self::extract_path(input)
        {
            if Self::is_path_blocked(&path, &policy.blocked_paths) {
                return ApprovalDecision::Blocked;
            }
            if !policy.allowed_paths.is_empty()
                && !Self::is_path_allowed(&path, &policy.allowed_paths)
            {
                return ApprovalDecision::Blocked;
            }
        }

        // Shell dangerous-pattern check
        if tool_name == "shell_exec"
            && let Some(cmd) = input["command"].as_str()
            && Self::is_command_dangerous(cmd)
        {
            return ApprovalDecision::Blocked;
        }

        // Auto-approve read-only tools (if enabled)
        if policy.auto_approve_read && Self::is_read_tool(tool_name) {
            return ApprovalDecision::AutoApproved;
        }

        // Manual mode: everything needs approval
        if policy.mode == PermissionMode::Manual {
            return ApprovalDecision::NeedsApproval;
        }

        // Auto mode: check risk level
        if policy.mode == PermissionMode::Auto {
            let risk = Self::classify_risk(tool_name, input);
            if risk <= policy.max_auto_approve_risk {
                return ApprovalDecision::AutoApproved;
            }
            return ApprovalDecision::NeedsApproval;
        }

        ApprovalDecision::NeedsApproval
    }

    /// Tools that write to the file system or execute commands.
    fn is_write_tool(name: &str) -> bool {
        matches!(name, "file_write" | "shell_exec" | "apply_patch")
    }

    /// Tools that read from the file system.
    fn is_read_tool(name: &str) -> bool {
        matches!(
            name,
            "file_read" | "file_search" | "list_directory" | "glob"
        )
    }

    /// Tools that operate on file paths.
    fn is_file_tool(name: &str) -> bool {
        matches!(
            name,
            "file_read" | "file_write" | "apply_patch" | "file_search" | "list_directory" | "glob"
        )
    }

    fn extract_path(input: &serde_json::Value) -> Option<String> {
        input["path"].as_str().map(|s| s.to_string())
    }

    fn is_path_blocked(path: &str, blocked: &[String]) -> bool {
        let path_lower = path.to_lowercase();
        for pattern in blocked {
            if path_lower.contains(&pattern.to_lowercase()) {
                return true;
            }
        }
        false
    }

    fn is_path_allowed(path: &str, allowed: &[String]) -> bool {
        for prefix in allowed {
            if path.starts_with(prefix) || path.starts_with(&format!("{}/", prefix)) {
                return true;
            }
        }
        false
    }

    fn is_command_dangerous(cmd: &str) -> bool {
        let cmd_lower = cmd.to_lowercase();
        let patterns = [
            "rm -rf /",
            "rm -rf /*",
            "sudo rm",
            "dd if=",
            "mkfs.",
            "> /dev/sd",
            "chmod -r 777 /",
            "chown -r",
            ":(){ :|:& };:",
        ];
        for pat in &patterns {
            if cmd_lower.contains(pat) {
                return true;
            }
        }
        false
    }

    fn classify_risk(tool_name: &str, input: &serde_json::Value) -> RiskLevel {
        match tool_name {
            "file_read" | "file_search" | "list_directory" | "glob" => RiskLevel::Low,
            "shell_exec" => {
                if let Some(cmd) = input["command"].as_str() {
                    let destructive = [
                        "rm -rf",
                        "rm -r",
                        "rmdir",
                        "git push --force",
                        "git push -f",
                        "npm publish",
                        "cargo publish",
                        "drop table",
                        "delete from",
                        "truncate",
                        "mkfs",
                        "dd if=",
                        "> /dev/",
                        "format",
                    ];
                    let lower = cmd.to_lowercase();
                    for p in &destructive {
                        if lower.contains(p) {
                            return RiskLevel::High;
                        }
                    }
                    let write = [
                        "git commit",
                        "git add",
                        "git push",
                        "cargo build",
                        "npm install",
                        "pip install",
                        "mkdir",
                        "touch",
                        "cp ",
                        "mv ",
                    ];
                    for p in &write {
                        if lower.contains(p) {
                            return RiskLevel::Medium;
                        }
                    }
                }
                RiskLevel::Medium
            }
            "file_write" | "apply_patch" => RiskLevel::Medium,
            _ => RiskLevel::Medium,
        }
    }
}

/// Build a [`PermissionPolicy`] from a stored `permission_mode` string and defaults.
pub fn policy_from_mode(mode_str: &str) -> PermissionPolicy {
    PermissionPolicy {
        mode: PermissionMode::from_str_lossy(mode_str),
        ..Default::default()
    }
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
            reasoning_effort: None,
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
            thinking: None,
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("chunk"));
    }

    #[test]
    fn thinking_block_serialization() {
        let block = ContentBlock::Thinking {
            thinking: "Let me analyze this...".into(),
            signature: Some("sig_abc123".into()),
        };
        let json = serde_json::to_string(&block).unwrap();
        assert!(json.contains("\"type\":\"thinking\""));
        assert!(json.contains("Let me analyze this"));
        let parsed: ContentBlock = serde_json::from_str(&json).unwrap();
        match parsed {
            ContentBlock::Thinking {
                thinking,
                signature,
            } => {
                assert_eq!(thinking, "Let me analyze this...");
                assert_eq!(signature.unwrap(), "sig_abc123");
            }
            _ => panic!("Expected Thinking block"),
        }
    }

    #[test]
    fn thinking_delta_in_chunk() {
        let ev = StreamEvent::Chunk {
            session_id: "s1".into(),
            delta: None,
            role: None,
            tool_use: None,
            thinking: Some(ThinkingDelta {
                thinking: Some("Hmm...".into()),
                signature: None,
            }),
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("Hmm..."));
        let parsed: StreamEvent = serde_json::from_str(&json).unwrap();
        match parsed {
            StreamEvent::Chunk { thinking, .. } => {
                assert!(thinking.is_some());
                assert_eq!(thinking.unwrap().thinking.unwrap(), "Hmm...");
            }
            _ => panic!("Expected Chunk"),
        }
    }

    #[test]
    fn provider_type_display() {
        assert_eq!(ProviderType::Anthropic.to_string(), "anthropic");
        assert_eq!(ProviderType::Ollama.to_string(), "ollama");
        assert_eq!(ProviderType::GLM.to_string(), "glm");
        assert_eq!(ProviderType::Qwen.to_string(), "qwen");
        assert_eq!(ProviderType::DeepSeek.to_string(), "deepseek");
        assert_eq!(ProviderType::Kimi.to_string(), "kimi");
        assert_eq!(ProviderType::MiniMax.to_string(), "minimax");
        assert_eq!(ProviderType::VolcEngine.to_string(), "volcengine");
    }

    #[test]
    fn provider_type_serde_roundtrip() {
        for pt in [
            ProviderType::Anthropic,
            ProviderType::OpenAI,
            ProviderType::OpenRouter,
            ProviderType::Google,
            ProviderType::GLM,
            ProviderType::Qwen,
            ProviderType::DeepSeek,
            ProviderType::Ollama,
            ProviderType::Kimi,
            ProviderType::MiniMax,
            ProviderType::VolcEngine,
            ProviderType::Custom,
        ] {
            let json = serde_json::to_string(&pt).unwrap();
            let parsed: ProviderType = serde_json::from_str(&json).unwrap();
            assert_eq!(pt, parsed);
        }
    }

    #[test]
    fn message_role_display() {
        assert_eq!(MessageRole::User.to_string(), "user");
        assert_eq!(MessageRole::Assistant.to_string(), "assistant");
        assert_eq!(MessageRole::System.to_string(), "system");
        assert_eq!(MessageRole::Tool.to_string(), "tool");
    }

    #[test]
    fn message_role_serde_roundtrip() {
        for role in [
            MessageRole::User,
            MessageRole::Assistant,
            MessageRole::System,
            MessageRole::Tool,
        ] {
            let json = serde_json::to_string(&role).unwrap();
            let parsed: MessageRole = serde_json::from_str(&json).unwrap();
            assert_eq!(role, parsed);
        }
    }

    #[test]
    fn finish_reason_serde_roundtrip() {
        for fr in [
            FinishReason::Stop,
            FinishReason::Length,
            FinishReason::ToolUse,
            FinishReason::ContentFilter,
        ] {
            let json = serde_json::to_string(&fr).unwrap();
            let parsed: FinishReason = serde_json::from_str(&json).unwrap();
            assert_eq!(fr, parsed);
        }
    }

    #[test]
    fn usage_default_is_zero() {
        let u = Usage::default();
        assert_eq!(u.input_tokens, 0);
        assert_eq!(u.output_tokens, 0);
        assert_eq!(u.total_tokens(), 0);
    }

    #[test]
    fn usage_total_with_cache() {
        let u = Usage {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: Some(200),
            cache_write_tokens: Some(100),
        };
        assert_eq!(u.total_tokens(), 1800);
    }

    #[test]
    fn session_mode_default_is_code() {
        assert_eq!(SessionMode::default(), SessionMode::Code);
    }

    #[test]
    fn session_mode_serde_roundtrip() {
        for mode in [SessionMode::Code, SessionMode::Plan, SessionMode::Ask] {
            let json = serde_json::to_string(&mode).unwrap();
            let parsed: SessionMode = serde_json::from_str(&json).unwrap();
            assert_eq!(mode, parsed);
        }
    }

    #[test]
    fn reasoning_effort_from_number() {
        assert_eq!(ReasoningEffort::from_number(0), ReasoningEffort::Low);
        assert_eq!(ReasoningEffort::from_number(33), ReasoningEffort::Low);
        assert_eq!(ReasoningEffort::from_number(34), ReasoningEffort::Medium);
        assert_eq!(ReasoningEffort::from_number(50), ReasoningEffort::Medium);
        assert_eq!(ReasoningEffort::from_number(66), ReasoningEffort::Medium);
        assert_eq!(ReasoningEffort::from_number(67), ReasoningEffort::High);
        assert_eq!(ReasoningEffort::from_number(100), ReasoningEffort::High);
    }

    #[test]
    fn reasoning_effort_default_is_medium() {
        assert_eq!(ReasoningEffort::default(), ReasoningEffort::Medium);
    }

    #[test]
    fn reasoning_effort_serde_roundtrip() {
        for effort in [
            ReasoningEffort::Low,
            ReasoningEffort::Medium,
            ReasoningEffort::High,
        ] {
            let json = serde_json::to_string(&effort).unwrap();
            let parsed: ReasoningEffort = serde_json::from_str(&json).unwrap();
            assert_eq!(effort, parsed);
        }
    }

    #[test]
    fn stream_event_done_serialization() {
        let ev = StreamEvent::Done {
            session_id: "s1".into(),
            usage: Usage {
                input_tokens: 100,
                output_tokens: 50,
                cache_read_tokens: None,
                cache_write_tokens: None,
            },
            finish_reason: FinishReason::Stop,
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("\"event\":\"done\""));
        let parsed: StreamEvent = serde_json::from_str(&json).unwrap();
        match parsed {
            StreamEvent::Done {
                session_id, usage, ..
            } => {
                assert_eq!(session_id, "s1");
                assert_eq!(usage.input_tokens, 100);
            }
            _ => panic!("Expected Done event"),
        }
    }

    #[test]
    fn stream_event_error_serialization() {
        let ev = StreamEvent::Error {
            session_id: "s1".into(),
            message: "Rate limited".into(),
            code: Some("429".into()),
        };
        let json = serde_json::to_string(&ev).unwrap();
        assert!(json.contains("\"event\":\"error\""));
        let parsed: StreamEvent = serde_json::from_str(&json).unwrap();
        match parsed {
            StreamEvent::Error { message, code, .. } => {
                assert_eq!(message, "Rate limited");
                assert_eq!(code.unwrap(), "429");
            }
            _ => panic!("Expected Error event"),
        }
    }

    #[test]
    fn tool_use_delta_serialization() {
        let delta = ToolUseDelta {
            id: Some("tu-1".into()),
            name: Some("read_file".into()),
            input_json: Some("{\"path\":\"/tmp/test\"}".into()),
        };
        let json = serde_json::to_string(&delta).unwrap();
        let parsed: ToolUseDelta = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id.unwrap(), "tu-1");
        assert_eq!(parsed.name.unwrap(), "read_file");
    }

    #[test]
    fn content_block_tool_use_and_result() {
        let tool_use = ContentBlock::ToolUse {
            id: "tu-1".into(),
            name: "shell_exec".into(),
            input: serde_json::json!({"command": "ls"}),
        };
        let json = serde_json::to_string(&tool_use).unwrap();
        assert!(json.contains("\"type\":\"tool_use\""));
        let parsed: ContentBlock = serde_json::from_str(&json).unwrap();
        match parsed {
            ContentBlock::ToolUse { id, name, .. } => {
                assert_eq!(id, "tu-1");
                assert_eq!(name, "shell_exec");
            }
            _ => panic!("Expected ToolUse"),
        }

        let tool_result = ContentBlock::ToolResult {
            tool_use_id: "tu-1".into(),
            content: "file1.txt\nfile2.txt".into(),
            is_error: false,
        };
        let json2 = serde_json::to_string(&tool_result).unwrap();
        assert!(json2.contains("\"type\":\"tool_result\""));
        let parsed2: ContentBlock = serde_json::from_str(&json2).unwrap();
        match parsed2 {
            ContentBlock::ToolResult {
                tool_use_id,
                content,
                is_error,
            } => {
                assert_eq!(tool_use_id, "tu-1");
                assert_eq!(content, "file1.txt\nfile2.txt");
                assert!(!is_error);
            }
            _ => panic!("Expected ToolResult"),
        }
    }

    #[test]
    fn provider_config_serialization() {
        let config = ProviderConfig {
            id: "test-provider".into(),
            name: "Test Provider".into(),
            provider_type: ProviderType::OpenAI,
            base_url: "https://api.openai.com/v1".into(),
            api_key: Some("sk-test123".into()),
            models: vec![ModelInfo {
                id: "gpt-4o".into(),
                name: "GPT-4o".into(),
                provider: ProviderType::OpenAI,
                max_input_tokens: 128000,
                max_output_tokens: 4096,
                supports_streaming: true,
                supports_tools: true,
                supports_vision: true,
                input_price_per_million: Some(2.5),
                output_price_per_million: Some(10.0),
            }],
            enabled: true,
            fallback_provider_ids: vec![],
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: ProviderConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "test-provider");
        assert_eq!(parsed.models.len(), 1);
        assert_eq!(parsed.models[0].input_price_per_million.unwrap(), 2.5);
    }

    #[test]
    fn skill_info_serialization() {
        let skill = SkillInfo {
            name: "test-skill".into(),
            description: "A test skill".into(),
            version: Some("0.5.5".into()),
            author: None,
            category: Some("testing".into()),
            tags: vec!["test".into()],
            trigger: Some("when user says test".into()),
            content: "Do the test thing".into(),
            enabled: true,
            installed_at: Some("2026-01-01T00:00:00Z".into()),
            updated_at: None,
        };
        let json = serde_json::to_string(&skill).unwrap();
        let parsed: SkillInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.name, "test-skill");
        assert_eq!(parsed.tags.len(), 1);
    }

    #[test]
    fn message_text_content_concatenates_multiple_text_blocks() {
        let msg = Message {
            role: MessageRole::Assistant,
            content: vec![
                ContentBlock::Text {
                    text: "Hello ".into(),
                },
                ContentBlock::Text {
                    text: "World".into(),
                },
                ContentBlock::ToolUse {
                    id: "tu-1".into(),
                    name: "test".into(),
                    input: serde_json::json!({}),
                },
                ContentBlock::Text { text: "!".into() },
            ],
            name: None,
            tool_call_id: None,
        };
        // text_content should only concatenate Text blocks, skipping ToolUse
        assert_eq!(msg.text_content(), "Hello World!");
    }
}
