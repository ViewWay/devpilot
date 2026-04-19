//! Event bus — broadcast internal events to subscribers (e.g., Tauri frontend).
//!
//! Uses `tokio::sync::broadcast` for efficient fan-out to multiple listeners.

use devpilot_protocol::{FinishReason, Usage};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::debug;

/// Default channel capacity for the broadcast bus.
const DEFAULT_CAPACITY: usize = 256;

/// Events emitted by the agent engine during a conversation turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum CoreEvent {
    /// A new chunk of text is available (streaming).
    #[serde(rename = "chunk")]
    Chunk { session_id: String, delta: String },

    /// A tool call has started (LLM requested a tool).
    #[serde(rename = "tool_call_started")]
    ToolCallStarted {
        session_id: String,
        call_id: String,
        tool_name: String,
        input: serde_json::Value,
    },

    /// A tool call produced a result.
    #[serde(rename = "tool_call_result")]
    ToolCallResult {
        session_id: String,
        call_id: String,
        output: String,
        is_error: bool,
    },

    /// A tool call requires user approval.
    #[serde(rename = "approval_required")]
    ApprovalRequired {
        session_id: String,
        call_id: String,
        tool_name: String,
        input: serde_json::Value,
        risk_level: String,
    },

    /// The LLM turn completed.
    #[serde(rename = "turn_done")]
    TurnDone {
        session_id: String,
        usage: Usage,
        finish_reason: FinishReason,
    },

    /// The agent loop has completed (all turns done).
    #[serde(rename = "agent_done")]
    AgentDone {
        session_id: String,
        total_turns: u32,
        total_usage: Usage,
    },

    /// An error occurred.
    #[serde(rename = "error")]
    Error { session_id: String, message: String },

    /// Context compression happened.
    #[serde(rename = "compacted")]
    Compacted {
        session_id: String,
        messages_removed: usize,
        summary_added: bool,
    },
}

/// The broadcast sender side — clone-able, shared across the engine.
#[derive(Clone)]
pub struct EventBus {
    tx: broadcast::Sender<CoreEvent>,
}

/// The receiver side — used by Tauri to forward events to the frontend.
pub struct EventBusReceiver {
    rx: broadcast::Receiver<CoreEvent>,
}

impl EventBus {
    /// Create a new event bus with default capacity.
    pub fn new() -> Self {
        Self::with_capacity(DEFAULT_CAPACITY)
    }

    /// Create a new event bus with a custom channel capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Self { tx }
    }

    /// Subscribe to events. Returns a receiver that can be polled asynchronously.
    pub fn subscribe(&self) -> EventBusReceiver {
        EventBusReceiver {
            rx: self.tx.subscribe(),
        }
    }

    /// Emit an event to all subscribers.
    pub fn emit(&self, event: CoreEvent) {
        debug!(?event, "emitting core event");
        // It's OK if there are no subscribers or if they lag.
        let _ = self.tx.send(event);
    }

    /// Emit a text chunk event (convenience).
    pub fn emit_chunk(&self, session_id: impl Into<String>, delta: impl Into<String>) {
        self.emit(CoreEvent::Chunk {
            session_id: session_id.into(),
            delta: delta.into(),
        });
    }

    /// Emit an error event (convenience).
    pub fn emit_error(&self, session_id: impl Into<String>, message: impl Into<String>) {
        self.emit(CoreEvent::Error {
            session_id: session_id.into(),
            message: message.into(),
        });
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}

impl EventBusReceiver {
    /// Receive the next event, waiting asynchronously.
    pub async fn recv(&mut self) -> Result<CoreEvent, broadcast::error::RecvError> {
        self.rx.recv().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_bus_broadcasts_to_multiple_subscribers() {
        let bus = EventBus::new();
        let mut sub1 = bus.subscribe();
        let mut sub2 = bus.subscribe();

        bus.emit_chunk("sess-1", "hello");

        let rt = tokio::runtime::Runtime::new().unwrap();
        let ev1 = rt.block_on(sub1.recv()).unwrap();
        let ev2 = rt.block_on(sub2.recv()).unwrap();

        assert!(matches!(ev1, CoreEvent::Chunk { ref session_id, .. } if session_id == "sess-1"));
        assert!(matches!(ev2, CoreEvent::Chunk { ref session_id, .. } if session_id == "sess-1"));
    }

    #[test]
    fn event_serialization_roundtrip() {
        let event = CoreEvent::ToolCallStarted {
            session_id: "s1".into(),
            call_id: "c1".into(),
            tool_name: "shell".into(),
            input: serde_json::json!({"command": "ls"}),
        };
        let json = serde_json::to_string(&event).unwrap();
        let parsed: CoreEvent = serde_json::from_str(&json).unwrap();
        assert!(matches!(parsed, CoreEvent::ToolCallStarted { .. }));
    }
}
