//! Session management — lifecycle and state for a conversation.
//!
//! A `Session` holds the conversation history, configuration, and state
//! for a single chat session. It is the primary data structure used by
//! the agent engine.

use devpilot_protocol::{
    ChatRequest, Message, ProviderType, ReasoningEffort, SessionId, SessionMode, Usage,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Configuration for creating a new session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    /// Optional explicit session ID (auto-generated if not provided).
    #[serde(default)]
    pub id: Option<SessionId>,
    /// Model to use (e.g. "claude-sonnet-4-20250514").
    pub model: String,
    /// Provider type.
    pub provider_type: ProviderType,
    /// Session mode (code, plan, ask).
    #[serde(default)]
    pub mode: SessionMode,
    /// Reasoning effort level.
    #[serde(default)]
    pub reasoning_effort: ReasoningEffort,
    /// Working directory for tool execution.
    #[serde(default)]
    pub working_dir: Option<String>,
    /// System prompt override.
    #[serde(default)]
    pub system_prompt: Option<String>,
    /// Temperature override.
    #[serde(default)]
    pub temperature: Option<f32>,
    /// Per-session environment variables (KEY=VALUE pairs) injected into shell commands.
    #[serde(default)]
    pub env_vars: Vec<(String, String)>,
}

/// Current state of a session.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    /// Session is idle, waiting for user input.
    Idle,
    /// Agent is actively processing (LLM call or tool execution).
    Running,
    /// Agent is paused (user interrupted or approval pending).
    Paused,
    /// Session has been archived.
    Archived,
}

impl std::fmt::Display for SessionState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Idle => write!(f, "idle"),
            Self::Running => write!(f, "running"),
            Self::Paused => write!(f, "paused"),
            Self::Archived => write!(f, "archived"),
        }
    }
}

/// A conversation session.
pub struct Session {
    /// Unique session identifier.
    pub id: SessionId,
    /// Display title (auto-generated from first message or user-set).
    pub title: String,
    /// Session configuration.
    pub config: SessionConfig,
    /// Current state.
    pub state: SessionState,
    /// Conversation messages (in order).
    pub messages: Vec<Message>,
    /// Accumulated token usage for this session.
    pub total_usage: Usage,
    /// Number of agent turns in the current run.
    pub turn_count: u32,
    /// Timestamps.
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl Session {
    /// Create a new session with the given configuration.
    pub fn new(config: SessionConfig) -> Self {
        let id = config
            .id
            .clone()
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = chrono::Utc::now();
        Self {
            id,
            title: "New Chat".to_string(),
            config,
            state: SessionState::Idle,
            messages: Vec::new(),
            total_usage: Usage::default(),
            turn_count: 0,
            created_at: now,
            updated_at: now,
        }
    }

    /// Add a user message to the conversation.
    pub fn add_user_message(&mut self, content: impl Into<String>) {
        let msg = Message::text(devpilot_protocol::MessageRole::User, content.into());
        self.messages.push(msg);
        self.touch();
    }

    /// Add an assistant message to the conversation.
    pub fn add_assistant_message(&mut self, content: impl Into<String>) {
        let msg = Message::text(devpilot_protocol::MessageRole::Assistant, content.into());
        self.messages.push(msg);
        self.touch();
    }

    /// Add a system message to the conversation.
    pub fn add_system_message(&mut self, content: impl Into<String>) {
        let msg = Message::text(devpilot_protocol::MessageRole::System, content.into());
        self.messages.push(msg);
        self.touch();
    }

    /// Add a raw message to the conversation.
    pub fn add_message(&mut self, message: Message) {
        self.messages.push(message);
        self.touch();
    }

    /// Build a `ChatRequest` from the current session state.
    ///
    /// This assembles the message history, system prompt, tools, and
    /// model parameters into a request ready to send to the LLM provider.
    ///
    /// Mode behaviour:
    /// - **Ask** — tools are omitted entirely (pure Q&A).
    /// - **Plan** — tool definitions are included so the LLM can *plan*
    ///   what to call, but the agent loop will not execute them.
    /// - **Code** — tool definitions are included and will be executed.
    pub fn build_chat_request(&self, tools: Vec<devpilot_protocol::ToolDefinition>) -> ChatRequest {
        let resolved_tools = match self.config.mode {
            SessionMode::Ask => None,
            SessionMode::Plan | SessionMode::Code => {
                if tools.is_empty() {
                    None
                } else {
                    Some(tools)
                }
            }
        };

        ChatRequest {
            model: self.config.model.clone(),
            messages: self.messages_for_request(),
            system: self.config.system_prompt.clone(),
            temperature: self.config.temperature,
            max_tokens: None,
            top_p: None,
            stop: None,
            tools: resolved_tools,
            stream: true,
            reasoning_effort: Some(self.config.reasoning_effort),
        }
    }

    /// Get messages formatted for the LLM request.
    /// Filters out any internal-only messages if needed.
    fn messages_for_request(&self) -> Vec<Message> {
        self.messages.clone()
    }

    /// Record token usage from a completed turn.
    pub fn record_usage(&mut self, usage: &Usage) {
        self.total_usage.input_tokens += usage.input_tokens;
        self.total_usage.output_tokens += usage.output_tokens;
        if let Some(cr) = usage.cache_read_tokens {
            self.total_usage.cache_read_tokens =
                Some(self.total_usage.cache_read_tokens.unwrap_or(0) + cr);
        }
        if let Some(cw) = usage.cache_write_tokens {
            self.total_usage.cache_write_tokens =
                Some(self.total_usage.cache_write_tokens.unwrap_or(0) + cw);
        }
        self.touch();
    }

    /// Auto-generate a title from the first user message.
    pub fn auto_title(&mut self) {
        if self.title == "New Chat"
            && let Some(first_user) = self
                .messages
                .iter()
                .find(|m| m.role == devpilot_protocol::MessageRole::User)
        {
            let text = first_user.text_content();
            // Take first 50 chars as title
            let title = if text.len() > 50 {
                format!("{}...", &text[..50])
            } else {
                text
            };
            self.title = title;
        }
    }

    /// Transition to a new state.
    pub fn set_state(&mut self, new_state: SessionState) {
        self.state = new_state;
        self.touch();
    }

    /// Remove messages from the history (used by compact).
    pub fn truncate_messages(&mut self, keep_last: usize) {
        if self.messages.len() > keep_last {
            self.messages = self.messages.split_off(self.messages.len() - keep_last);
            self.touch();
        }
    }

    /// Update the `updated_at` timestamp.
    fn touch(&mut self) {
        self.updated_at = chrono::Utc::now();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config() -> SessionConfig {
        SessionConfig {
            id: None,
            model: "test-model".into(),
            provider_type: ProviderType::Anthropic,
            mode: SessionMode::Code,
            reasoning_effort: ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
            env_vars: vec![],
        }
    }

    #[test]
    fn session_creation() {
        let session = Session::new(test_config());
        assert_eq!(session.state, SessionState::Idle);
        assert_eq!(session.messages.len(), 0);
        assert_eq!(session.title, "New Chat");
        assert!(!session.id.is_empty());
    }

    #[test]
    fn add_messages() {
        let mut session = Session::new(test_config());
        session.add_system_message("You are helpful.");
        session.add_user_message("Hello!");
        session.add_assistant_message("Hi there!");

        assert_eq!(session.messages.len(), 3);
        assert_eq!(
            session.messages[0].role,
            devpilot_protocol::MessageRole::System
        );
        assert_eq!(
            session.messages[1].role,
            devpilot_protocol::MessageRole::User
        );
        assert_eq!(
            session.messages[2].role,
            devpilot_protocol::MessageRole::Assistant
        );
    }

    #[test]
    fn auto_title() {
        let mut session = Session::new(test_config());
        session.add_user_message("This is a very long user message that definitely exceeds fifty characters total length here");
        session.auto_title();
        assert!(session.title.ends_with("..."));
        assert_eq!(session.title.len(), 53); // 50 chars + "..."
    }

    #[test]
    fn record_usage() {
        let mut session = Session::new(test_config());
        session.record_usage(&Usage {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_tokens: Some(20),
            cache_write_tokens: None,
        });
        session.record_usage(&Usage {
            input_tokens: 200,
            output_tokens: 100,
            cache_read_tokens: None,
            cache_write_tokens: Some(30),
        });

        assert_eq!(session.total_usage.input_tokens, 300);
        assert_eq!(session.total_usage.output_tokens, 150);
        assert_eq!(session.total_usage.cache_read_tokens, Some(20));
        assert_eq!(session.total_usage.cache_write_tokens, Some(30));
    }

    #[test]
    fn build_chat_request() {
        let mut session = Session::new(test_config());
        session.add_user_message("Hello!");
        let req = session.build_chat_request(vec![]);
        assert_eq!(req.model, "test-model");
        assert_eq!(req.messages.len(), 1);
        assert!(req.stream);
    }

    #[test]
    fn build_chat_request_ask_mode_strips_tools() {
        let mut config = test_config();
        config.mode = SessionMode::Ask;
        let mut session = Session::new(config);
        session.add_user_message("Hello!");
        let tool_def = devpilot_protocol::ToolDefinition {
            name: "shell".into(),
            description: "Run a command".into(),
            input_schema: serde_json::json!({"type": "object"}),
        };
        let req = session.build_chat_request(vec![tool_def]);
        assert!(
            req.tools.is_none(),
            "Ask mode should strip all tools from the request"
        );
    }

    #[test]
    fn build_chat_request_plan_mode_includes_tools() {
        let mut config = test_config();
        config.mode = SessionMode::Plan;
        let mut session = Session::new(config);
        session.add_user_message("Plan a refactor");
        let tool_def = devpilot_protocol::ToolDefinition {
            name: "read_file".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({"type": "object"}),
        };
        let req = session.build_chat_request(vec![tool_def]);
        assert!(
            req.tools.is_some(),
            "Plan mode should include tool definitions"
        );
    }

    #[test]
    fn state_transitions() {
        let mut session = Session::new(test_config());
        assert_eq!(session.state, SessionState::Idle);

        session.set_state(SessionState::Running);
        assert_eq!(session.state, SessionState::Running);

        session.set_state(SessionState::Paused);
        assert_eq!(session.state, SessionState::Paused);

        session.set_state(SessionState::Idle);
        assert_eq!(session.state, SessionState::Idle);
    }

    #[test]
    fn truncate_messages() {
        let mut session = Session::new(test_config());
        for i in 0..10 {
            session.add_user_message(format!("msg {i}"));
        }
        assert_eq!(session.messages.len(), 10);

        session.truncate_messages(4);
        assert_eq!(session.messages.len(), 4);
        assert_eq!(session.messages[0].text_content(), "msg 6");
    }
}
