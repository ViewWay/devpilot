//! Agent engine — the core LLM ↔ tool calling loop.
//!
//! The agent orchestrates the conversation:
//! 1. Send user message + history to LLM
//! 2. Receive streaming response
//! 3. If the LLM requests tool calls:
//!    a. Execute tools (with approval if needed)
//!    b. Send tool results back to LLM
//!    c. Go back to step 2
//! 4. When LLM finishes (no more tool calls), return the response

use devpilot_llm::provider::{ModelProvider, StreamResult};
use devpilot_protocol::{ContentBlock, FinishReason, Message, MessageRole, StreamEvent, Usage};
use devpilot_tools::{ToolContext, ToolExecutor};
use futures::StreamExt;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::compact::{CompactStrategy, compact_messages, estimate_message_tokens};
use crate::error::{CoreError, CoreResult};
use crate::event_bus::{CoreEvent, EventBus};
use crate::session::{Session, SessionState};

/// Configuration for the agent engine.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    /// Maximum consecutive LLM turns before stopping (prevents infinite loops).
    pub max_turns: u32,
    /// Token threshold to trigger auto-compact (0 = disabled).
    pub compact_threshold: u32,
    /// Strategy for context compression.
    pub compact_strategy: CompactStrategy,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            max_turns: 50,
            compact_threshold: 80_000, // ~80K tokens → compact
            compact_strategy: CompactStrategy::Summarize { keep_last: 20 },
        }
    }
}

/// The agent engine — drives the LLM ↔ tool loop for a session.
pub struct Agent {
    config: AgentConfig,
    event_bus: EventBus,
    tool_executor: Arc<Mutex<ToolExecutor>>,
}

impl Agent {
    /// Create a new agent engine.
    pub fn new(
        config: AgentConfig,
        event_bus: EventBus,
        tool_executor: Arc<Mutex<ToolExecutor>>,
    ) -> Self {
        Self {
            config,
            event_bus,
            tool_executor,
        }
    }

    /// Run the agent loop: send user message, get response, execute tools, repeat.
    ///
    /// This is the main entry point for processing a user message.
    /// It streams events via the event bus so the frontend can show progress.
    pub async fn run(
        &self,
        session: &mut Session,
        provider: &dyn ModelProvider,
        user_message: String,
    ) -> CoreResult<()> {
        // Validate state
        if session.state == SessionState::Archived {
            return Err(CoreError::InvalidState {
                expected: "idle or running".into(),
                actual: "archived".into(),
            });
        }

        // Add user message
        session.add_user_message(&user_message);
        session.auto_title();

        // Transition to running
        session.set_state(SessionState::Running);

        // Run the agent loop
        let result = self.agent_loop(session, provider).await;

        // Transition back to idle
        session.set_state(SessionState::Idle);

        result
    }

    /// The core agent loop.
    async fn agent_loop(
        &self,
        session: &mut Session,
        provider: &dyn ModelProvider,
    ) -> CoreResult<()> {
        let mut total_usage = Usage::default();
        let mut turn_count: u32 = 0;
        let session_mode = session.config.mode;

        loop {
            // Check max turns
            if turn_count >= self.config.max_turns {
                self.event_bus.emit_error(
                    &session.id,
                    format!("Maximum turns exceeded ({})", self.config.max_turns),
                );
                return Err(CoreError::MaxTurnsExceeded(self.config.max_turns));
            }

            // Auto-compact if needed
            if self.config.compact_threshold > 0 {
                let estimated_tokens = estimate_message_tokens(&session.messages);
                if estimated_tokens > self.config.compact_threshold {
                    let result =
                        compact_messages(&mut session.messages, self.config.compact_strategy);
                    self.event_bus.emit(CoreEvent::Compacted {
                        session_id: session.id.clone(),
                        messages_removed: result.messages_removed,
                        summary_added: result.summary_added,
                    });
                }
            }

            // Get tool definitions for the request.
            //
            // *Code* mode: include tool definitions so the LLM can call them.
            // *Plan* mode: include tool definitions so the LLM can *plan* with
            //   them, but we will not execute any calls.
            // *Ask*  mode: skip tool definitions entirely (pure Q&A).
            let tool_defs = if session_mode == devpilot_protocol::SessionMode::Ask {
                vec![]
            } else {
                let executor = self.tool_executor.lock().await;
                executor.registry().definitions().await
            };

            // Build chat request
            let chat_request = session.build_chat_request(tool_defs);

            // Send to LLM (streaming)
            let stream = provider
                .chat_stream(chat_request, session.id.clone())
                .await
                .map_err(CoreError::Llm)?;

            // Process the stream
            let assistant_message = self.process_stream(stream, &session.id).await?;

            // Extract usage from the final event
            turn_count += 1;

            // Add assistant message to session
            session.add_message(assistant_message.message.clone());
            session.record_usage(&assistant_message.usage);
            total_usage.input_tokens += assistant_message.usage.input_tokens;
            total_usage.output_tokens += assistant_message.usage.output_tokens;

            // Emit turn done
            self.event_bus.emit(CoreEvent::TurnDone {
                session_id: session.id.clone(),
                usage: assistant_message.usage.clone(),
                finish_reason: assistant_message.finish_reason,
            });

            // Check if LLM wants to call tools
            let tool_calls: Vec<&ContentBlock> = assistant_message
                .message
                .content
                .iter()
                .filter(|b| matches!(b, ContentBlock::ToolUse { .. }))
                .collect();

            if tool_calls.is_empty() || assistant_message.finish_reason != FinishReason::ToolUse {
                // No tool calls — agent loop is done
                break;
            }

            // In Plan mode, include tools in definitions but don't execute them.
            // Break out of the loop so the LLM's planned tool calls are shown
            // but never actually run.
            if session_mode == devpilot_protocol::SessionMode::Plan {
                break;
            }

            // Execute tool calls (Code mode only)
            let tool_results = self
                .execute_tool_calls(
                    tool_calls,
                    &session.id,
                    session.config.working_dir.as_deref(),
                )
                .await?;

            // Add tool result messages
            for result in tool_results {
                let tool_msg = Message {
                    role: MessageRole::Tool,
                    content: vec![result],
                    name: None,
                    tool_call_id: None,
                };
                session.add_message(tool_msg);
            }
        }

        // Emit agent done
        self.event_bus.emit(CoreEvent::AgentDone {
            session_id: session.id.clone(),
            total_turns: turn_count,
            total_usage: total_usage.clone(),
        });

        session.turn_count = turn_count;

        Ok(())
    }

    /// Process a stream of events, emitting chunks and collecting the full response.
    async fn process_stream(
        &self,
        mut stream: StreamResult,
        session_id: &str,
    ) -> CoreResult<StreamComplete> {
        let mut full_text = String::new();
        let mut tool_uses: Vec<ContentBlock> = Vec::new();
        let mut current_tool_id: Option<String> = None;
        let mut current_tool_name: Option<String> = current_tool_id.take();
        let mut current_tool_input: Option<String> = None;
        let mut usage = Usage::default();
        let mut finish_reason = FinishReason::Stop;

        while let Some(item) = stream.next().await {
            match item {
                Ok(event) => match event {
                    StreamEvent::Chunk {
                        delta, tool_use, ..
                    } => {
                        if let Some(text) = delta {
                            full_text.push_str(&text);
                            self.event_bus.emit_chunk(session_id, &text);
                        }
                        if let Some(tu) = tool_use {
                            if let Some(id) = tu.id {
                                // New tool call started
                                // First finalize any previous tool call
                                if let (Some(tid), Some(tname), Some(tinput)) = (
                                    current_tool_id.take(),
                                    current_tool_name.take(),
                                    current_tool_input.take(),
                                ) {
                                    let input_val: serde_json::Value =
                                        serde_json::from_str(&tinput)
                                            .unwrap_or(serde_json::Value::Null);
                                    tool_uses.push(ContentBlock::ToolUse {
                                        id: tid,
                                        name: tname,
                                        input: input_val,
                                    });
                                }
                                current_tool_id = Some(id);
                                current_tool_name = tu.name;
                                current_tool_input = tu.input_json;
                            } else {
                                // Continuation of existing tool call
                                if let Some(ref mut input) = current_tool_input
                                    && let Some(more) = tu.input_json
                                {
                                    input.push_str(&more);
                                }
                                if current_tool_name.is_none() {
                                    current_tool_name = tu.name;
                                }
                            }
                        }
                    }
                    StreamEvent::Done {
                        usage: u,
                        finish_reason: fr,
                        ..
                    } => {
                        usage = u;
                        finish_reason = fr;
                    }
                    StreamEvent::Error { message, .. } => {
                        self.event_bus.emit_error(session_id, &message);
                        return Err(CoreError::Internal(message));
                    }
                },
                Err(e) => {
                    return Err(CoreError::Llm(e));
                }
            }
        }

        // Finalize any pending tool call
        if let (Some(id), Some(name), Some(input)) =
            (current_tool_id, current_tool_name, current_tool_input)
        {
            let input_val: serde_json::Value =
                serde_json::from_str(&input).unwrap_or(serde_json::Value::Null);
            tool_uses.push(ContentBlock::ToolUse {
                id,
                name,
                input: input_val,
            });
        }

        // Build the complete assistant message
        let mut content: Vec<ContentBlock> = Vec::new();
        if !full_text.is_empty() {
            content.push(ContentBlock::Text { text: full_text });
        }
        content.extend(tool_uses);

        let message = Message {
            role: MessageRole::Assistant,
            content,
            name: None,
            tool_call_id: None,
        };

        Ok(StreamComplete {
            message,
            usage,
            finish_reason,
        })
    }

    /// Execute a batch of tool calls.
    async fn execute_tool_calls(
        &self,
        tool_calls: Vec<&ContentBlock>,
        session_id: &str,
        working_dir: Option<&str>,
    ) -> CoreResult<Vec<ContentBlock>> {
        let mut results = Vec::new();

        for block in tool_calls {
            let (call_id, tool_name, input) = match block {
                ContentBlock::ToolUse { id, name, input } => {
                    (id.clone(), name.clone(), input.clone())
                }
                _ => continue,
            };

            // Emit tool call started
            self.event_bus.emit(CoreEvent::ToolCallStarted {
                session_id: session_id.to_string(),
                call_id: call_id.clone(),
                tool_name: tool_name.clone(),
                input: input.clone(),
            });

            // Execute the tool
            let executor = self.tool_executor.lock().await;
            let ctx = ToolContext {
                session_id: session_id.to_string(),
                working_dir: working_dir.unwrap_or(".").to_string(),
            };

            let result = executor
                .execute(&tool_name, input.clone(), &ctx)
                .await
                .map_err(CoreError::Tool)?;

            let (output_text, is_error) = match result.output {
                Some(out) => (out.content, out.is_error),
                None => ("No output".to_string(), false),
            };

            // Emit tool call result
            self.event_bus.emit(CoreEvent::ToolCallResult {
                session_id: session_id.to_string(),
                call_id: call_id.clone(),
                output: output_text.clone(),
                is_error,
            });

            results.push(ContentBlock::ToolResult {
                tool_use_id: call_id,
                content: output_text,
                is_error,
            });
        }

        Ok(results)
    }
}

/// Internal struct to hold the completed stream result.
struct StreamComplete {
    message: Message,
    usage: Usage,
    finish_reason: FinishReason,
}

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_llm::error::LlmError;
    use devpilot_protocol::{ChatRequest, ChatResponse, ProviderConfig};

    /// A mock provider that returns a simple text response.
    struct MockProvider {
        config: ProviderConfig,
        response_text: String,
        finish_reason: FinishReason,
    }

    impl MockProvider {
        fn new(response_text: &str) -> Self {
            Self {
                config: ProviderConfig {
                    id: "mock".into(),
                    name: "Mock".into(),
                    provider_type: devpilot_protocol::ProviderType::Custom,
                    base_url: "http://localhost".into(),
                    api_key: None,
                    models: vec![],
                    enabled: true,
                },
                response_text: response_text.into(),
                finish_reason: FinishReason::Stop,
            }
        }
    }

    #[async_trait::async_trait]
    impl ModelProvider for MockProvider {
        fn config(&self) -> &ProviderConfig {
            &self.config
        }

        async fn chat(&self, _request: ChatRequest) -> Result<ChatResponse, LlmError> {
            Ok(ChatResponse {
                id: "resp-1".into(),
                message: Message::text(MessageRole::Assistant, &self.response_text),
                model: "mock-model".into(),
                usage: Usage::default(),
                finish_reason: self.finish_reason,
            })
        }

        async fn chat_stream(
            &self,
            _request: ChatRequest,
            session_id: String,
        ) -> Result<StreamResult, LlmError> {
            let text = self.response_text.clone();
            let sid1 = session_id.clone();
            let sid2 = session_id.clone();
            let stream = futures::stream::once(async move {
                Ok(StreamEvent::Chunk {
                    session_id: sid1,
                    delta: Some(text),
                    role: Some(MessageRole::Assistant),
                    tool_use: None,
                })
            })
            .chain(futures::stream::once(async move {
                Ok(StreamEvent::Done {
                    session_id: sid2,
                    usage: Usage {
                        input_tokens: 10,
                        output_tokens: 20,
                        cache_read_tokens: None,
                        cache_write_tokens: None,
                    },
                    finish_reason: FinishReason::Stop,
                })
            }))
            .boxed();
            Ok(stream)
        }

        async fn probe(&self) -> Result<(), LlmError> {
            Ok(())
        }

        async fn list_models(&self) -> Result<Vec<String>, LlmError> {
            Ok(vec!["mock-model".into()])
        }
    }

    fn make_agent() -> (Agent, EventBus) {
        let event_bus = EventBus::new();
        let registry = devpilot_tools::ToolRegistry::new();
        let executor = ToolExecutor::new(Arc::new(registry));
        let agent = Agent::new(
            AgentConfig::default(),
            event_bus.clone(),
            Arc::new(Mutex::new(executor)),
        );
        (agent, event_bus)
    }

    #[tokio::test]
    async fn simple_chat_no_tools() {
        let (agent, _bus) = make_agent();
        let provider = MockProvider::new("Hello! How can I help?");

        let mut session = Session::new(crate::session::SessionConfig {
            id: Some("test-session".into()),
            model: "mock-model".into(),
            provider_type: devpilot_protocol::ProviderType::Custom,
            mode: devpilot_protocol::SessionMode::Ask,
            reasoning_effort: devpilot_protocol::ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
        });

        let result = agent.run(&mut session, &provider, "Hi there!".into()).await;
        assert!(result.is_ok());
        assert_eq!(session.messages.len(), 2); // user + assistant
        assert_eq!(session.state, SessionState::Idle);
    }

    #[tokio::test]
    async fn session_state_transitions() {
        let (agent, _bus) = make_agent();
        let provider = MockProvider::new("Response");

        let mut session = Session::new(crate::session::SessionConfig {
            id: Some("test-2".into()),
            model: "mock-model".into(),
            provider_type: devpilot_protocol::ProviderType::Custom,
            mode: devpilot_protocol::SessionMode::Ask,
            reasoning_effort: devpilot_protocol::ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
        });

        assert_eq!(session.state, SessionState::Idle);
        agent
            .run(&mut session, &provider, "test".into())
            .await
            .unwrap();
        assert_eq!(session.state, SessionState::Idle); // back to idle after run
    }

    #[tokio::test]
    async fn archived_session_rejected() {
        let (agent, _bus) = make_agent();
        let provider = MockProvider::new("Response");

        let mut session = Session::new(crate::session::SessionConfig {
            id: Some("test-3".into()),
            model: "mock-model".into(),
            provider_type: devpilot_protocol::ProviderType::Custom,
            mode: devpilot_protocol::SessionMode::Ask,
            reasoning_effort: devpilot_protocol::ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
        });
        session.set_state(SessionState::Archived);

        let result = agent.run(&mut session, &provider, "test".into()).await;
        assert!(result.is_err());
        assert!(matches!(
            result.unwrap_err(),
            CoreError::InvalidState { .. }
        ));
    }

    // ── Mode enforcement tests ──────────────────────────
    //
    // These tests verify that the agent respects session mode
    // when deciding whether to include and execute tools.

    /// A mock provider that returns a tool-use response.
    struct ToolCallMockProvider {
        config: ProviderConfig,
    }

    impl ToolCallMockProvider {
        fn new() -> Self {
            Self {
                config: ProviderConfig {
                    id: "mock".into(),
                    name: "Mock".into(),
                    provider_type: devpilot_protocol::ProviderType::Custom,
                    base_url: "http://localhost".into(),
                    api_key: None,
                    models: vec![],
                    enabled: true,
                },
            }
        }
    }

    #[async_trait::async_trait]
    impl ModelProvider for ToolCallMockProvider {
        fn config(&self) -> &ProviderConfig {
            &self.config
        }

        async fn chat(&self, _request: ChatRequest) -> Result<ChatResponse, LlmError> {
            Ok(ChatResponse {
                id: "resp-tool".into(),
                message: Message {
                    role: MessageRole::Assistant,
                    content: vec![
                        ContentBlock::Text {
                            text: "I'll read the file.".into(),
                        },
                        ContentBlock::ToolUse {
                            id: "tu-1".into(),
                            name: "read_file".into(),
                            input: serde_json::json!({"path": "/tmp/test.txt"}),
                        },
                    ],
                    name: None,
                    tool_call_id: None,
                },
                model: "mock-model".into(),
                usage: Usage::default(),
                finish_reason: FinishReason::ToolUse,
            })
        }

        async fn chat_stream(
            &self,
            _request: ChatRequest,
            session_id: String,
        ) -> Result<StreamResult, LlmError> {
            let sid1 = session_id.clone();
            let sid2 = session_id;
            let stream = futures::stream::once(async move {
                Ok(StreamEvent::Chunk {
                    session_id: sid1,
                    delta: Some("I'll read the file.".into()),
                    role: Some(MessageRole::Assistant),
                    tool_use: Some(devpilot_protocol::ToolUseDelta {
                        id: Some("tu-1".into()),
                        name: Some("read_file".into()),
                        input_json: Some("{\"path\":\"/tmp/test.txt\"}".into()),
                    }),
                })
            })
            .chain(futures::stream::once(async move {
                Ok(StreamEvent::Done {
                    session_id: sid2,
                    usage: Usage {
                        input_tokens: 10,
                        output_tokens: 20,
                        cache_read_tokens: None,
                        cache_write_tokens: None,
                    },
                    finish_reason: FinishReason::ToolUse,
                })
            }))
            .boxed();
            Ok(stream)
        }

        async fn probe(&self) -> Result<(), LlmError> {
            Ok(())
        }

        async fn list_models(&self) -> Result<Vec<String>, LlmError> {
            Ok(vec!["mock-model".into()])
        }
    }

    #[tokio::test]
    async fn ask_mode_no_tools_in_request() {
        let session = Session::new(crate::session::SessionConfig {
            id: Some("ask-test".into()),
            model: "mock-model".into(),
            provider_type: devpilot_protocol::ProviderType::Custom,
            mode: devpilot_protocol::SessionMode::Ask,
            reasoning_effort: devpilot_protocol::ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
        });
        // build_chat_request with Ask mode should always return tools: None
        let req = session.build_chat_request(vec![devpilot_protocol::ToolDefinition {
            name: "read_file".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({"type": "object"}),
        }]);
        assert!(
            req.tools.is_none(),
            "Ask mode should strip tools from the request"
        );
    }

    #[tokio::test]
    async fn plan_mode_tools_included_but_not_executed() {
        let (agent, _bus) = make_agent();
        let provider = ToolCallMockProvider::new();

        let mut session = Session::new(crate::session::SessionConfig {
            id: Some("plan-test".into()),
            model: "mock-model".into(),
            provider_type: devpilot_protocol::ProviderType::Custom,
            mode: devpilot_protocol::SessionMode::Plan,
            reasoning_effort: devpilot_protocol::ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
        });

        let result = agent
            .run(&mut session, &provider, "Read /tmp/test.txt".into())
            .await;
        assert!(result.is_ok());

        // In Plan mode, the agent should have the user message and the
        // assistant response (with tool_use block), but NO tool-result
        // message because execution was skipped.
        let has_tool_result = session.messages.iter().any(|m| {
            m.content
                .iter()
                .any(|b| matches!(b, ContentBlock::ToolResult { .. }))
        });
        assert!(
            !has_tool_result,
            "Plan mode should not produce tool-result messages"
        );

        // Verify the assistant message contains a ToolUse (the plan)
        let has_tool_use = session.messages.iter().any(|m| {
            m.content
                .iter()
                .any(|b| matches!(b, ContentBlock::ToolUse { .. }))
        });
        assert!(
            has_tool_use,
            "Plan mode should keep the LLM's tool-use plan in the response"
        );
    }

    #[tokio::test]
    async fn code_mode_tools_included_in_request() {
        let mut session = Session::new(crate::session::SessionConfig {
            id: Some("code-test".into()),
            model: "mock-model".into(),
            provider_type: devpilot_protocol::ProviderType::Custom,
            mode: devpilot_protocol::SessionMode::Code,
            reasoning_effort: devpilot_protocol::ReasoningEffort::Medium,
            working_dir: None,
            system_prompt: None,
            temperature: None,
        });
        let tool_def = devpilot_protocol::ToolDefinition {
            name: "read_file".into(),
            description: "Read a file".into(),
            input_schema: serde_json::json!({"type": "object"}),
        };
        let req = session.build_chat_request(vec![tool_def.clone()]);
        assert!(
            req.tools.is_some(),
            "Code mode should include tools in the request"
        );
        assert_eq!(req.tools.unwrap().len(), 1);

        // Plan mode should also include tools
        session.config.mode = devpilot_protocol::SessionMode::Plan;
        let req = session.build_chat_request(vec![tool_def]);
        assert!(
            req.tools.is_some(),
            "Plan mode should include tools in the request"
        );
    }
}
