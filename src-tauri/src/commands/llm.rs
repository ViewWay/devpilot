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
use devpilot_tools::SkillLoader;
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
    /// All configured providers (for failover resolution).
    /// If empty, failover is disabled.
    #[serde(default)]
    pub all_providers: Vec<ProviderConfig>,
}

/// Result of a non-streaming send_message call.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResult {
    pub response: ChatResponse,
    pub cost_usd: f64,
    /// The provider config that actually handled the request (may differ if failover occurred).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub used_provider_id: Option<String>,
    /// How many providers were tried (1 = primary only, >1 = failover).
    pub attempts: u32,
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
    /// Agent type override (e.g. "general", "architect", "code_reviewer", "test_writer").
    /// If set, the system prompt is augmented with the agent's custom prompt from
    /// `.devpilot/agents/<agent_type>.md`.
    #[serde(default)]
    pub agent_type: Option<String>,
    /// Reasoning effort (0-100).
    #[serde(default)]
    pub reasoning_effort: Option<u8>,
    /// All configured providers (for failover resolution).
    /// If empty or the primary has no fallback_provider_ids, failover is disabled.
    #[serde(default)]
    pub all_providers: Vec<ProviderConfig>,
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
///
/// If the primary provider fails with a retryable error and fallback providers
/// are configured (via `all_providers`), the request is retried on each fallback
/// in order until one succeeds.
#[tauri::command(rename_all = "camelCase")]
pub async fn send_message(
    _state: State<'_, AppState>,
    request: SendMessageRequest,
) -> Result<SendMessageResult, String> {
    let model_id = request.chat_request.model.clone();

    // Resolve fallback providers if configured
    let fallback_configs = devpilot_llm::resolve_fallback_configs(
        &request.provider.fallback_provider_ids,
        &request.all_providers,
    );
    let fallback_owned: Vec<ProviderConfig> = fallback_configs.into_iter().cloned().collect();

    if fallback_owned.is_empty() {
        // No failover — direct call
        let provider =
            create_provider(request.provider.clone()).map_err(|e| e.display_message())?;
        info!(
            "Sending message to {} (model: {})",
            provider.name(),
            model_id
        );

        let response = provider
            .chat(request.chat_request)
            .await
            .map_err(|e| e.display_message())?;

        let cost_usd = calculate_cost(&response.usage, &request.provider, &model_id);
        Ok(SendMessageResult {
            response,
            cost_usd,
            used_provider_id: None,
            attempts: 1,
        })
    } else {
        // Failover-enabled call
        let registry = devpilot_llm::ProviderRegistry::with_defaults();
        let result = devpilot_llm::chat_with_failover(
            &registry,
            &request.provider,
            &fallback_owned,
            request.chat_request,
        )
        .await
        .map_err(|e| e.display_message())?;

        let cost_usd = calculate_cost(&result.response.usage, &result.used_provider, &model_id);
        let used_id = if result.fell_back {
            Some(result.used_provider.id.clone())
        } else {
            None
        };
        Ok(SendMessageResult {
            response: result.response,
            cost_usd,
            used_provider_id: used_id,
            attempts: result.attempts,
        })
    }
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
    let provider = {
        // Resolve fallback providers if configured
        let fallback_refs = devpilot_llm::resolve_fallback_configs(
            &request.provider.fallback_provider_ids,
            &request.all_providers,
        );
        let fallback_owned: Vec<ProviderConfig> = fallback_refs.into_iter().cloned().collect();

        if fallback_owned.is_empty() {
            // No failover — use primary directly
            let p = create_provider(request.provider.clone()).map_err(|e| e.display_message())?;
            p as Arc<dyn devpilot_llm::ModelProvider>
        } else {
            // Wrap with FallbackProvider for transparent failover
            let registry = devpilot_llm::ProviderRegistry::with_defaults();
            let fb = devpilot_llm::FallbackProvider::from_configs(
                &registry,
                &request.provider,
                &fallback_owned,
            )
            .map_err(|e| e.display_message())?;
            info!(
                "Streaming with failover chain of {} providers for session {}",
                fb.chain_len(),
                request.session_id
            );
            Arc::new(fb) as Arc<dyn devpilot_llm::ModelProvider>
        }
    };
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
    // Load enabled skills and append their context to the system prompt.
    let skill_context = {
        let global_dir = dirs::home_dir()
            .unwrap_or_default()
            .join(".devpilot")
            .join("skills");
        let project_dir = request.working_dir.as_ref().map(|wd| {
            std::path::PathBuf::from(wd)
                .join(".devpilot")
                .join("skills")
        });
        SkillLoader::load_skill_context(global_dir, project_dir).await
    };
    let mut system_prompt = match (&request.chat_request.system, skill_context.is_empty()) {
        (Some(sp), false) => Some(format!("{sp}\n\n{skill_context}")),
        (None, false) => Some(skill_context),
        (Some(sp), true) => Some(sp.clone()),
        (None, true) => None,
    };

    // Inject custom agent prompt from `.devpilot/agents/<agent_type>.md` if specified.
    if let Some(ref agent_type) = request.agent_type
        && let Some(ref wd) = request.working_dir
    {
        let agents = devpilot_agent::load_agents_from_dir(std::path::Path::new(wd));
        if let Some(agent_def) = agents.iter().find(|a| &a.agent_type == agent_type)
            && !agent_def.prompt.is_empty()
        {
            system_prompt = Some(match system_prompt {
                Some(sp) => format!(
                    "{sp}\n\n---\n# Agent: {}\n\n{}",
                    agent_def.agent_type, agent_def.prompt
                ),
                None => format!("# Agent: {}\n\n{}", agent_def.agent_type, agent_def.prompt),
            });
        }
    }

    // P11-7: Inject relevant code symbols from the index into system prompt.
    // This gives the LLM context about the project's code structure.
    if request.working_dir.is_some() {
        let index = state.symbol_index.lock().await;
        let stats = index.stats().await;
        if stats.symbols_count > 0 {
            // Extract keywords from the user message for symbol search
            let query = &request.user_message;
            let results = index.search(query).await;
            if !results.is_empty() {
                let top_k: Vec<String> = results
                    .iter()
                    .take(10)
                    .map(|r| {
                        let sym = &r.symbol;
                        let loc = format!("{}:{}", sym.file_path, sym.line);
                        match &sym.doc_summary {
                            Some(doc) => {
                                format!("  - {} {} ({}) — {}", sym.kind, sym.full_path, loc, doc)
                            }
                            None => format!("  - {} {} ({})", sym.kind, sym.full_path, loc),
                        }
                    })
                    .collect();
                let ctx = format!(
                    "\n\n[Project Code Index — {} symbols in {} files]\nRelevant symbols:\n{}",
                    stats.symbols_count,
                    stats.files_indexed,
                    top_k.join("\n")
                );
                system_prompt = Some(match system_prompt {
                    Some(sp) => format!("{sp}{ctx}"),
                    None => ctx,
                });
            }
        }
    }

    let session_config = SessionConfig {
        id: Some(session_id.clone()),
        model: model_id.clone(),
        provider_type: request.provider.provider_type,
        mode,
        reasoning_effort,
        working_dir: request.working_dir.clone(),
        system_prompt,
        temperature: request.chat_request.temperature,
        env_vars: {
            let db = state.db.lock().map_err(|e| e.to_string())?;
            db.get_session(&session_id)
                .ok()
                .and_then(|s| s.env_vars)
                .and_then(|json| serde_json::from_str::<Vec<Vec<String>>>(&json).ok())
                .map(|pairs| {
                    pairs
                        .into_iter()
                        .filter_map(|p| {
                            if p.len() == 2 {
                                Some((p[0].clone(), p[1].clone()))
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        },
        context_window_tokens: None,
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

    // Store the abort handle so the frontend can cancel this stream
    {
        let abort_handle = agent_handle.abort_handle();
        let mut active = state.active_streams.lock().map_err(|e| e.to_string())?;
        active.insert(session_id.clone(), abort_handle);
    }

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
                        if let CoreEvent::TurnDone { usage, finish_reason: fr, .. } = &core_event {
                            total_input += usage.input_tokens;
                            total_output += usage.output_tokens;
                            finish_reason = format!("{:?}", fr).to_lowercase();
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

    // Remove the abort handle — stream finished normally
    {
        if let Ok(mut active) = state.active_streams.lock() {
            active.remove(&session_id);
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
        CoreEvent::AgentPlanning { .. } => "stream-agent-planning",
        CoreEvent::AgentExecuting { .. } => "stream-agent-executing",
        CoreEvent::AgentVerifying { .. } => "stream-agent-verifying",
        CoreEvent::PevCycleDone { .. } => "stream-pev-cycle-done",
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

/// Cancel an active streaming session.
///
/// Aborts the agent task associated with the given session ID.
/// Returns `true` if a stream was found and cancelled, `false` if no
/// active stream exists for that session.
#[tauri::command(rename_all = "camelCase")]
pub async fn cancel_stream(state: State<'_, AppState>, session_id: String) -> Result<bool, String> {
    let abort_handle = {
        let mut active = state.active_streams.lock().map_err(|e| e.to_string())?;
        active.remove(&session_id)
    };

    match abort_handle {
        Some(handle) => {
            info!("Cancelling stream for session {}", session_id);
            handle.abort();
            Ok(true)
        }
        None => {
            warn!("No active stream found for session {}", session_id);
            Ok(false)
        }
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
            fallback_provider_ids: vec![],
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
            fallback_provider_ids: vec![],
        };
        // 1M input tokens @ $30 = $30, 1M output tokens @ $60 = $60, total = $90
        let cost = calculate_cost_from_tokens(1_000_000, 1_000_000, &config, "gpt-4");
        assert!((cost - 90.0).abs() < 0.001);
    }
}
