//! Tauri commands for LLM interactions.
//!
//! Provides invoke handlers for sending messages (streaming and non-streaming),
//! listing models, and checking provider connectivity.
//!
//! The streaming path goes through the Agent engine (devpilot-core), which
//! orchestrates the full LLM <-> tool calling loop.

use crate::AppState;
use std::sync::Arc;

use devpilot_core::{CoreEvent, Session, SessionConfig};
use devpilot_llm::create_provider;
use devpilot_protocol::{ChatRequest, ChatResponse, Message, MessageRole, ProviderConfig, Usage};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tracing::{error, info, warn};

// ── Request/Response types for Tauri IPC ──

/// Request payload for sending a chat message.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    /// The provider config to use.
    pub provider: ProviderConfig,
    /// Chat request details.
    pub chat_request: ChatRequest,
}

/// Result of a non-streaming send_message call.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResult {
    pub response: ChatResponse,
    pub cost_usd: f64,
}

/// Request payload for streaming chat.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamMessageRequest {
    /// The provider config to use.
    pub provider: ProviderConfig,
    /// Chat request details (stream field is forced to true).
    pub chat_request: ChatRequest,
    /// Session ID for tracking the stream.
    pub session_id: String,
    /// User message content to send.
    pub user_message: String,
    /// Optional working directory for tool execution.
    pub working_dir: Option<String>,
    /// Interaction mode: "code", "plan", or "ask".
    #[serde(default)]
    pub mode: Option<String>,
    /// Reasoning effort (0-100).
    #[serde(default)]
    pub reasoning_effort: Option<u8>,
}

/// Result of a streaming send_message_stream call (emitted at the end).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamResult {
    pub session_id: String,
    pub total_input_tokens: u32,
    pub total_output_tokens: u32,
    pub cost_usd: f64,
    pub finish_reason: String,
}

/// Result of a provider check.
#[derive(Debug, Serialize)]
pub struct ProviderCheckResult {
    pub connected: bool,
    pub message: String,
    pub models_count: Option<usize>,
}

// ── Commands ──────────────────────────────────────────

/// Send a non-streaming chat message and return the complete response.
#[tauri::command(rename_all = "camelCase")]
pub async fn send_message(
    _state: State<'_, AppState>,
    request: SendMessageRequest,
) -> Result<SendMessageResult, String> {
    let provider = create_provider(request.provider.clone()).map_err(|e| e.display_message())?;
    let model_id = request.chat_request.model.clone();

    info!(
        "Sending message to {} (model: {})",
        provider.name(),
        model_id
    );

    let response = provider
        .chat(request.chat_request)
        .await
        .map_err(|e| e.display_message())?;

    // Calculate cost
    let cost_usd = calculate_cost(&response.usage, &request.provider, &model_id);

    Ok(SendMessageResult { response, cost_usd })
}

/// Send a streaming chat message through the Agent engine.
///
/// The Agent engine runs the full LLM <-> tool calling loop:
/// 1. Send user message + history to LLM (streaming)
/// 2. If LLM requests tool calls → execute tools → send results back
/// 3. Repeat until LLM finishes (no more tool calls)
///
/// All events are forwarded to the frontend via Tauri's event system:
/// - `stream-chunk` — text delta from LLM
/// - `stream-tool-start` — tool call started
/// - `stream-tool-result` — tool call completed
/// - `stream-approval` — tool approval requested
/// - `stream-done` — agent loop finished
/// - `stream-error` — error occurred
#[tauri::command(rename_all = "camelCase")]
pub async fn send_message_stream(
    app: AppHandle,
    state: State<'_, AppState>,
    request: StreamMessageRequest,
) -> Result<StreamResult, String> {
    let provider = create_provider(request.provider.clone()).map_err(|e| e.display_message())?;
    let session_id = request.session_id.clone();
    let model_id = request.chat_request.model.clone();

    info!(
        "Agent streaming to {} (model: {}, session: {})",
        provider.name(),
        model_id,
        session_id
    );

    // Parse mode from string (default: Code)
    let mode = match request.mode.as_deref() {
        Some("plan") => devpilot_protocol::SessionMode::Plan,
        Some("ask") => devpilot_protocol::SessionMode::Ask,
        Some("code") | None => devpilot_protocol::SessionMode::Code,
        _ => devpilot_protocol::SessionMode::Code,
    };

    // Parse reasoning effort from number (default: Medium)
    let reasoning_effort = request
        .reasoning_effort
        .map(devpilot_protocol::ReasoningEffort::from_number)
        .unwrap_or_default();

    // Build session config from request
    let session_config = SessionConfig {
        id: Some(session_id.clone()),
        model: model_id.clone(),
        provider_type: request.provider.provider_type,
        mode,
        reasoning_effort,
        working_dir: request.working_dir.clone(),
        system_prompt: request.chat_request.system.clone(),
        temperature: request.chat_request.temperature,
    };

    // Create session and load history from DB
    let mut session = Session::new(session_config);

    // Load existing messages from DB for context continuity
    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Ok(messages) = db.get_session_messages(&session_id) {
            for msg_info in &messages {
                let role = match msg_info.role.as_str() {
                    "user" => MessageRole::User,
                    "assistant" => MessageRole::Assistant,
                    "system" => MessageRole::System,
                    "tool" => MessageRole::Tool,
                    _ => continue,
                };
                // Parse tool_calls JSON if present
                let content = if let Some(ref tc_json) = msg_info.tool_calls {
                    if let Ok(blocks) =
                        serde_json::from_str::<Vec<devpilot_protocol::ContentBlock>>(tc_json)
                    {
                        blocks
                    } else {
                        vec![devpilot_protocol::ContentBlock::Text {
                            text: msg_info.content.clone(),
                        }]
                    }
                } else {
                    vec![devpilot_protocol::ContentBlock::Text {
                        text: msg_info.content.clone(),
                    }]
                };
                session.add_message(Message {
                    role,
                    content,
                    name: None,
                    tool_call_id: msg_info.tool_call_id.clone(),
                });
            }
        }
    }

    // Subscribe to event bus BEFORE starting the agent
    let mut event_rx = state.event_bus.subscribe();

    // Spawn the agent run in a separate task
    let agent = Arc::clone(&state.agent);
    let user_message = request.user_message.clone();

    let mut agent_handle =
        tokio::spawn(async move { agent.run(&mut session, &*provider, user_message).await });

    // Bridge EventBus events → Tauri emit
    let mut total_input: u32 = 0;
    let mut total_output: u32 = 0;
    let mut finish_reason = "stop".to_string();

    // Forward events until agent is done or error
    loop {
        tokio::select! {
            event = event_rx.recv() => {
                match event {
                    Ok(core_event) => {
                        let name = event_name(&core_event);
                        if matches!(core_event, CoreEvent::TurnDone { .. }) {
                            if let CoreEvent::TurnDone { usage, finish_reason: fr, .. } = &core_event {
                                total_input += usage.input_tokens;
                                total_output += usage.output_tokens;
                                finish_reason = format!("{:?}", fr).to_lowercase();
                            }
                        }
                        let _ = app.emit(name, &core_event);
                        if matches!(core_event, CoreEvent::AgentDone { .. }) {
                            if let CoreEvent::AgentDone { total_usage, .. } = &core_event {
                                total_input = total_usage.input_tokens;
                                total_output = total_usage.output_tokens;
                            }
                            break;
                        }
                        if matches!(core_event, CoreEvent::Error { .. }) {
                            if let CoreEvent::Error { message, .. } = &core_event {
                                error!("Agent error: {}", message);
                            }
                            break;
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(count)) => {
                        warn!("Event bus lagged by {} events", count);
                        continue;
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        break;
                    }
                }
            }
            result = &mut agent_handle => {
                // Agent task finished
                match result {
                    Ok(Ok(())) => {
                        info!("Agent completed successfully for session {}", session_id);
                    }
                    Ok(Err(e)) => {
                        error!("Agent error for session {}: {}", session_id, e);
                        let core_event = CoreEvent::Error {
                            session_id: session_id.clone(),
                            message: e.to_string(),
                        };
                        let _ = app.emit(event_name(&core_event), &core_event);
                        return Err(e.to_string());
                    }
                    Err(e) => {
                        error!("Agent task panicked for session {}: {}", session_id, e);
                        return Err(format!("Agent task failed: {}", e));
                    }
                }
                break;
            }
        }
    }

    let cost_usd =
        calculate_cost_from_tokens(total_input, total_output, &request.provider, &model_id);

    // Persist usage to database
    if total_input > 0 || total_output > 0 {
        let provider_name = request.provider.name.clone();
        if let Ok(db) = state.db.lock() {
            if let Err(e) = db.add_usage(
                &session_id,
                &model_id,
                &provider_name,
                total_input as i64,
                total_output as i64,
                cost_usd,
            ) {
                warn!("Failed to persist usage: {}", e);
            } else {
                info!(
                    "Usage persisted: {} input, {} output, ${:.4} cost",
                    total_input, total_output, cost_usd
                );
            }
        }
    }

    Ok(StreamResult {
        session_id,
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        cost_usd,
        finish_reason,
    })
}

/// Check if a provider is reachable and optionally list its models.
#[tauri::command]
pub async fn check_provider(config: ProviderConfig) -> Result<ProviderCheckResult, String> {
    let provider = create_provider(config).map_err(|e| e.display_message())?;

    match provider.probe().await {
        Ok(()) => {
            let models_count = provider.list_models().await.ok().map(|models| models.len());

            Ok(ProviderCheckResult {
                connected: true,
                message: format!("{} is reachable", provider.name()),
                models_count,
            })
        }
        Err(e) => Ok(ProviderCheckResult {
            connected: false,
            message: e.display_message(),
            models_count: None,
        }),
    }
}

/// List available models for a provider.
#[tauri::command]
pub async fn list_provider_models(config: ProviderConfig) -> Result<Vec<String>, String> {
    let provider = create_provider(config).map_err(|e| e.display_message())?;
    provider
        .list_models()
        .await
        .map_err(|e| e.display_message())
}

/// Run comprehensive diagnostics on a provider.
///
/// Checks configuration completeness, connectivity, authentication,
/// model availability, and returns actionable suggestions for fixes.
#[tauri::command]
pub async fn diagnose_provider(
    config: ProviderConfig,
) -> Result<devpilot_llm::DiagnosticReport, String> {
    let report = devpilot_llm::run_diagnostics(config).await;
    Ok(report)
}

// ── Helpers ───────────────────────────────────────────

/// Map a CoreEvent variant to the frontend Tauri event name.
fn event_name(event: &CoreEvent) -> &'static str {
    match event {
        CoreEvent::Chunk { .. } => "stream-chunk",
        CoreEvent::ToolCallStarted { .. } => "stream-tool-start",
        CoreEvent::ToolCallResult { .. } => "stream-tool-result",
        CoreEvent::ApprovalRequired { .. } => "stream-approval",
        CoreEvent::TurnDone { .. } => "stream-turn-done",
        CoreEvent::AgentDone { .. } => "stream-done",
        CoreEvent::Error { .. } => "stream-error",
        CoreEvent::Compacted { .. } => "stream-compacted",
    }
}

/// Calculate the cost of a request based on usage and model pricing.
fn calculate_cost(usage: &Usage, config: &ProviderConfig, model_id: &str) -> f64 {
    calculate_cost_from_tokens(usage.input_tokens, usage.output_tokens, config, model_id)
}

fn calculate_cost_from_tokens(
    input_tokens: u32,
    output_tokens: u32,
    config: &ProviderConfig,
    model_id: &str,
) -> f64 {
    let model = config.models.iter().find(|m| m.id == model_id);

    if let Some(model) = model {
        let input_cost = model
            .input_price_per_million
            .map_or(0.0, |p| (input_tokens as f64 / 1_000_000.0) * p);
        let output_cost = model
            .output_price_per_million
            .map_or(0.0, |p| (output_tokens as f64 / 1_000_000.0) * p);
        input_cost + output_cost
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use devpilot_protocol::ProviderType;

    #[test]
    fn test_calculate_cost_no_pricing() {
        let config = ProviderConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            provider_type: ProviderType::OpenAI,
            base_url: "http://localhost".to_string(),
            api_key: None,
            models: vec![],
            enabled: true,
        };
        let cost = calculate_cost_from_tokens(1000, 500, &config, "gpt-4");
        assert_eq!(cost, 0.0);
    }

    #[test]
    fn test_calculate_cost_with_pricing() {
        let config = ProviderConfig {
            id: "test".to_string(),
            name: "Test".to_string(),
            provider_type: ProviderType::OpenAI,
            base_url: "http://localhost".to_string(),
            api_key: None,
            models: vec![devpilot_protocol::ModelInfo {
                id: "gpt-4".to_string(),
                name: "GPT-4".to_string(),
                provider: ProviderType::OpenAI,
                max_input_tokens: 128000,
                max_output_tokens: 4096,
                supports_streaming: true,
                supports_tools: true,
                supports_vision: true,
                input_price_per_million: Some(30.0),
                output_price_per_million: Some(60.0),
            }],
            enabled: true,
        };
        // 1M input tokens @ $30 = $30, 1M output tokens @ $60 = $60, total = $90
        let cost = calculate_cost_from_tokens(1_000_000, 1_000_000, &config, "gpt-4");
        assert!((cost - 90.0).abs() < 0.001);
    }
}
