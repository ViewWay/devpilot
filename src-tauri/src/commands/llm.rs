//! Tauri commands for LLM interactions.
//!
//! Provides invoke handlers for sending messages (streaming and non-streaming),
//! listing models, and checking provider connectivity.

use crate::AppState;
use devpilot_llm::create_provider;
use devpilot_protocol::{ChatRequest, ChatResponse, ProviderConfig, StreamEvent, Usage};
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
    /// Optional session ID for tracking the stream.
    pub session_id: Option<String>,
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

/// Send a streaming chat message.
///
/// Emits `stream-chunk`, `stream-done`, or `stream-error` events
/// to the frontend via Tauri's event system.
#[tauri::command(rename_all = "camelCase")]
pub async fn send_message_stream(
    app: AppHandle,
    request: StreamMessageRequest,
) -> Result<StreamResult, String> {
    let provider = create_provider(request.provider.clone()).map_err(|e| e.display_message())?;
    let mut chat_req = request.chat_request;
    chat_req.stream = true;
    let model_id = chat_req.model.clone();

    // Generate or extract session ID
    let session_id = request
        .session_id
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    info!(
        "Streaming message to {} (model: {}, session: {})",
        provider.name(),
        model_id,
        session_id
    );

    let mut stream = provider
        .chat_stream(chat_req, session_id.clone())
        .await
        .map_err(|e| e.display_message())?;

    // Track accumulated state
    let mut total_input: u32 = 0;
    let mut total_output: u32 = 0;
    let mut finish_reason = "stop".to_string();

    use futures::StreamExt;

    while let Some(event_result) = stream.next().await {
        match event_result {
            Ok(event) => {
                match &event {
                    StreamEvent::Chunk { .. } => {
                        // Forward the chunk to the frontend
                        if let Err(e) = app.emit("stream-chunk", &event) {
                            warn!("Failed to emit stream chunk: {}", e);
                        }
                    }
                    StreamEvent::Done {
                        session_id: _,
                        usage,
                        finish_reason: reason,
                    } => {
                        total_input = usage.input_tokens;
                        total_output = usage.output_tokens;
                        finish_reason = format!("{:?}", reason).to_lowercase();
                        if let Err(e) = app.emit("stream-done", &event) {
                            warn!("Failed to emit stream done: {}", e);
                        }
                    }
                    StreamEvent::Error {
                        session_id: _,
                        message,
                        code,
                    } => {
                        error!("Stream error: {} (code: {:?})", message, code);
                        if let Err(e) = app.emit("stream-error", &event) {
                            warn!("Failed to emit stream error: {}", e);
                        }
                    }
                }
            }
            Err(e) => {
                let error_event = StreamEvent::Error {
                    session_id: session_id.clone(),
                    message: e.display_message(),
                    code: None,
                };
                let _ = app.emit("stream-error", &error_event);
                return Err(e.display_message());
            }
        }
    }

    let cost_usd =
        calculate_cost_from_tokens(total_input, total_output, &request.provider, &model_id);

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

// ── Helpers ───────────────────────────────────────────

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
