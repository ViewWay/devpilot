//! Event bus — broadcast internal events to subscribers (e.g., Tauri frontend).
//!
//! Uses `tokio::sync::broadcast` for efficient fan-out to multiple listeners.

use devpilot_protocol::{FinishReason, Usage};
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use tracing::{debug, trace};

/// Default channel capacity for the broadcast bus.
const DEFAULT_CAPACITY: usize = 256;

/// Events emitted by the agent engine during a conversation turn.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
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

    /// Agent entered plan phase (PEV loop).
    #[serde(rename = "agent_planning")]
    AgentPlanning {
        session_id: String,
        cycle: u32,
    },

    /// Agent executing plan steps (PEV loop).
    #[serde(rename = "agent_executing")]
    AgentExecuting {
        session_id: String,
        cycle: u32,
        step: u32,
        total_steps: u32,
    },

    /// Agent verifying execution results (PEV loop).
    #[serde(rename = "agent_verifying")]
    AgentVerifying {
        session_id: String,
        cycle: u32,
    },

    /// PEV cycle result.
    #[serde(rename = "pev_cycle_done")]
    PevCycleDone {
        session_id: String,
        cycle: u32,
        success: bool,
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
        match &event {
            CoreEvent::Chunk { delta, .. } => {
                trace!(delta_len = delta.len(), "emitting chunk");
            }
            _ => {
                debug!(?event, "emitting core event");
            }
        }
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

    #[test]
    fn event_bus_no_subscribers_does_not_panic() {
        let bus = EventBus::new();
        // Emit without subscribers — should not panic
        bus.emit_chunk("s1", "hello");
        bus.emit_error("s1", "test error");
    }

    #[test]
    fn event_bus_custom_capacity() {
        let bus = EventBus::with_capacity(16);
        let mut sub = bus.subscribe();
        bus.emit_chunk("s1", "test");
        let rt = tokio::runtime::Runtime::new().unwrap();
        let ev = rt.block_on(sub.recv()).unwrap();
        assert!(matches!(ev, CoreEvent::Chunk { .. }));
    }

    #[test]
    fn event_serialization_all_variants() {
        // Test all CoreEvent variants serialize/deserialize correctly
        let events = vec![
            CoreEvent::Chunk {
                session_id: "s1".into(),
                delta: "hello".into(),
            },
            CoreEvent::ToolCallStarted {
                session_id: "s1".into(),
                call_id: "c1".into(),
                tool_name: "shell".into(),
                input: serde_json::json!({"cmd": "ls"}),
            },
            CoreEvent::ToolCallResult {
                session_id: "s1".into(),
                call_id: "c1".into(),
                output: "file1.txt\nfile2.txt".into(),
                is_error: false,
            },
            CoreEvent::ApprovalRequired {
                session_id: "s1".into(),
                call_id: "c1".into(),
                tool_name: "shell".into(),
                input: serde_json::json!({"cmd": "rm -rf /"}),
                risk_level: "high".into(),
            },
            CoreEvent::TurnDone {
                session_id: "s1".into(),
                usage: Usage::default(),
                finish_reason: FinishReason::Stop,
            },
            CoreEvent::AgentDone {
                session_id: "s1".into(),
                total_turns: 3,
                total_usage: Usage {
                    input_tokens: 100,
                    output_tokens: 200,
                    cache_read_tokens: None,
                    cache_write_tokens: None,
                },
            },
            CoreEvent::Error {
                session_id: "s1".into(),
                message: "timeout".into(),
            },
            CoreEvent::Compacted {
                session_id: "s1".into(),
                messages_removed: 5,
                summary_added: true,
            },
        ];

        for event in &events {
            let json = serde_json::to_string(event).unwrap();
            let parsed: CoreEvent = serde_json::from_str(&json).unwrap();
            let json2 = serde_json::to_string(&parsed).unwrap();
            assert_eq!(json, json2, "Roundtrip failed for event: {:?}", event);
        }
    }

    #[test]
    fn event_bus_sequential_events() {
        let bus = EventBus::new();
        let mut sub = bus.subscribe();

        bus.emit_chunk("s1", "hello");
        bus.emit_chunk("s1", " world");
        bus.emit_error("s1", "done");

        let rt = tokio::runtime::Runtime::new().unwrap();
        let ev1 = rt.block_on(sub.recv()).unwrap();
        let ev2 = rt.block_on(sub.recv()).unwrap();
        let ev3 = rt.block_on(sub.recv()).unwrap();

        assert!(matches!(ev1, CoreEvent::Chunk { ref delta, .. } if delta == "hello"));
        assert!(matches!(ev2, CoreEvent::Chunk { ref delta, .. } if delta == " world"));
        assert!(matches!(ev3, CoreEvent::Error { .. }));
    }

    #[test]
    fn event_serialization_format() {
        let event = CoreEvent::ToolCallStarted {
            session_id: "s1".into(),
            call_id: "c1".into(),
            tool_name: "shell".into(),
            input: serde_json::json!({}),
        };
        let json = serde_json::to_string(&event).unwrap();
        // The serde tag uses explicit rename
        assert!(json.contains("\"type\":\"tool_call_started\""));
        // Fields remain snake_case (rename_all on enum only affects variant tags)
        assert!(json.contains("\"session_id\":\"s1\""));
        assert!(json.contains("\"call_id\":\"c1\""));
        assert!(json.contains("\"tool_name\":\"shell\""));
    }
}
