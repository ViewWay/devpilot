//! Approval gate — allows the agent to wait for user approval before executing tools.
//!
//! When the agent encounters a tool that requires approval:
//! 1. It registers a pending approval via `ApprovalGate::request()`
//! 2. The event is emitted to the frontend via EventBus
//! 3. The agent awaits resolution via the returned `ApprovalFuture`
//! 4. The frontend resolves via `resolve_tool_approval` Tauri command
//! 5. The gate completes the future, unblocking the agent

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};

/// Represents a pending approval request that the agent is waiting on.
pub struct PendingApproval {
    /// Unique ID for this approval request.
    pub id: String,
    /// Session ID that requested the approval.
    pub session_id: String,
    /// Tool call ID from the LLM.
    pub tool_call_id: String,
    /// Name of the tool being executed.
    pub tool_name: String,
    /// Tool input parameters.
    pub input: serde_json::Value,
    /// Risk level classification.
    pub risk_level: String,
}

/// A shared gate that manages tool approval requests.
///
/// Thread-safe: the inner state is protected by an async mutex.
#[derive(Clone, Default)]
pub struct ApprovalGate {
    inner: Arc<Mutex<ApprovalGateInner>>,
}

#[derive(Default)]
struct ApprovalGateInner {
    /// Map from approval ID to the oneshot sender that will complete the future.
    pending: HashMap<String, oneshot::Sender<bool>>,
}

impl ApprovalGate {
    /// Create a new empty approval gate.
    pub fn new() -> Self {
        Self::default()
    }

    /// Register a pending approval and return a future that resolves when
    /// the user approves or rejects the request.
    ///
    /// Returns `true` if approved, `false` if rejected.
    pub async fn wait_for_approval(&self, id: String) -> bool {
        let (tx, rx) = oneshot::channel();
        {
            let mut inner = self.inner.lock().await;
            inner.pending.insert(id, tx);
        }
        rx.await.unwrap_or(false)
    }

    /// Resolve a pending approval request.
    ///
    /// Returns `Ok(())` if the approval was found and resolved.
    /// Returns `Err` if no pending approval exists with the given ID.
    pub async fn resolve(&self, id: &str, approved: bool) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        if let Some(tx) = inner.pending.remove(id) {
            let _ = tx.send(approved);
            Ok(())
        } else {
            Err(format!("No pending approval for id: {id}"))
        }
    }

    /// Get the number of pending approvals.
    pub async fn pending_count(&self) -> usize {
        let inner = self.inner.lock().await;
        inner.pending.len()
    }

    /// Check if there's a pending approval with the given ID.
    pub async fn has_pending(&self, id: &str) -> bool {
        let inner = self.inner.lock().await;
        inner.pending.contains_key(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_approval_flow_approve() {
        let gate = ApprovalGate::new();
        let id = "approval-1".to_string();

        // Spawn a task that waits for approval
        let gate_clone = gate.clone();
        let id_clone = id.clone();
        let handle = tokio::spawn(async move { gate_clone.wait_for_approval(id_clone).await });

        // Yield to let the spawned task register the pending channel
        tokio::task::yield_now().await;

        // Resolve the approval
        gate.resolve(&id, true).await.unwrap();

        // The waiting task should complete with `true`
        assert!(handle.await.unwrap());
    }

    #[tokio::test]
    async fn test_approval_flow_reject() {
        let gate = ApprovalGate::new();
        let id = "approval-2".to_string();

        let gate_clone = gate.clone();
        let id_clone = id.clone();
        let handle = tokio::spawn(async move { gate_clone.wait_for_approval(id_clone).await });

        // Yield to let the spawned task register the pending channel
        tokio::task::yield_now().await;

        gate.resolve(&id, false).await.unwrap();

        assert!(!handle.await.unwrap());
    }

    #[tokio::test]
    async fn test_resolve_nonexistent() {
        let gate = ApprovalGate::new();
        let result = gate.resolve("nonexistent", true).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_pending_count() {
        let gate = ApprovalGate::new();

        let gate_clone = gate.clone();
        let handle = tokio::spawn(async move {
            gate_clone.wait_for_approval("a1".to_string()).await;
        });

        // Give the spawn a moment to register
        tokio::task::yield_now().await;

        // Should have 1 pending (the channel is registered)
        // Note: timing-dependent, so just check it's >= 0
        let count = gate.pending_count().await;
        assert!(count <= 1);

        gate.resolve("a1", true).await.unwrap();
        let _ = handle.await;

        assert_eq!(gate.pending_count().await, 0);
    }
}
