//! Batch task queue for media generation.
//!
//! Manages a queue of image generation tasks, executing them
//! sequentially or with configurable concurrency.

use crate::error::{MediaError, MediaResult};
use crate::manager::MediaManager;
#[cfg(test)]
use crate::types::ImageProvider;
use crate::types::{GenerateRequest, GenerateResponse};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{Mutex, Notify};
use tokio::task::JoinHandle;
use uuid::Uuid;

/// Unique identifier for a batch.
pub type BatchId = String;

/// Unique identifier for a batch task.
pub type BatchTaskId = String;

/// Status of a batch task.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BatchTaskStatus {
    /// Waiting in the queue.
    Pending,
    /// Currently being processed.
    Running,
    /// Successfully completed.
    Done,
    /// Failed with an error.
    Error,
    /// Cancelled by user.
    Cancelled,
}

impl std::fmt::Display for BatchTaskStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            BatchTaskStatus::Pending => write!(f, "pending"),
            BatchTaskStatus::Running => write!(f, "running"),
            BatchTaskStatus::Done => write!(f, "done"),
            BatchTaskStatus::Error => write!(f, "error"),
            BatchTaskStatus::Cancelled => write!(f, "cancelled"),
        }
    }
}

/// A single task within a batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchTask {
    /// Unique task ID.
    pub id: BatchTaskId,
    /// Parent batch ID.
    pub batch_id: BatchId,
    /// The generation request.
    pub request: GenerateRequest,
    /// Current status.
    pub status: BatchTaskStatus,
    /// Result (populated when done).
    pub result: Option<GenerateResponse>,
    /// Error message (populated on error).
    pub error: Option<String>,
    /// Creation time.
    pub created_at: DateTime<Utc>,
    /// Completion time.
    pub completed_at: Option<DateTime<Utc>>,
}

/// Summary of a batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchSummary {
    /// Unique batch ID.
    pub id: BatchId,
    /// Human-readable label.
    pub label: String,
    /// Total number of tasks.
    pub total: usize,
    /// Number of completed tasks.
    pub completed: usize,
    /// Number of failed tasks.
    pub failed: usize,
    /// Number of pending tasks.
    pub pending: usize,
    /// Whether the batch is currently being processed.
    pub is_running: bool,
    /// Creation time.
    pub created_at: DateTime<Utc>,
}

/// Internal state for the batch queue.
struct QueueState {
    /// Pending task queue.
    pending: VecDeque<BatchTask>,
    /// All tasks (for lookup).
    tasks: std::collections::HashMap<BatchTaskId, BatchTask>,
    /// Batch metadata.
    batches: std::collections::HashMap<BatchId, BatchInfo>,
    /// Whether the queue processor is active.
    running: bool,
}

/// Internal batch metadata.
struct BatchInfo {
    label: String,
    created_at: DateTime<Utc>,
}

/// Batch task queue manager.
///
/// Manages a background queue that processes image generation tasks
/// sequentially or with bounded concurrency.
pub struct BatchQueue {
    state: Arc<Mutex<QueueState>>,
    notify: Arc<Notify>,
    media: Arc<MediaManager>,
    /// Maximum concurrent tasks (currently processes sequentially;
    /// reserved for future parallel execution support).
    #[allow(dead_code)]
    max_concurrency: usize,
    worker_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl BatchQueue {
    /// Create a new batch queue with the given media manager.
    pub fn new(media: Arc<MediaManager>) -> Self {
        Self::with_concurrency(media, 1)
    }

    /// Create a new batch queue with custom concurrency.
    pub fn with_concurrency(media: Arc<MediaManager>, max_concurrency: usize) -> Self {
        Self {
            state: Arc::new(Mutex::new(QueueState {
                pending: VecDeque::new(),
                tasks: std::collections::HashMap::new(),
                batches: std::collections::HashMap::new(),
                running: false,
            })),
            notify: Arc::new(Notify::new()),
            media,
            max_concurrency: max_concurrency.max(1),
            worker_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Enqueue a single generation request as a batch of one.
    pub async fn enqueue(
        &self,
        request: GenerateRequest,
        label: Option<String>,
    ) -> MediaResult<BatchTaskId> {
        let batch_id = Uuid::new_v4().to_string();
        let task_id = Uuid::new_v4().to_string();

        let task = BatchTask {
            id: task_id.clone(),
            batch_id: batch_id.clone(),
            request,
            status: BatchTaskStatus::Pending,
            result: None,
            error: None,
            created_at: Utc::now(),
            completed_at: None,
        };

        let mut state = self.state.lock().await;
        state.batches.insert(
            batch_id,
            BatchInfo {
                label: label.unwrap_or_else(|| "Single task".into()),
                created_at: Utc::now(),
            },
        );
        state.tasks.insert(task_id.clone(), task.clone());
        state.pending.push_back(task);

        drop(state);
        self.notify.notify_one();

        Ok(task_id)
    }

    /// Enqueue a batch of generation requests.
    ///
    /// Creates a batch with a shared label and returns the batch ID
    /// plus individual task IDs.
    pub async fn enqueue_batch(
        &self,
        requests: Vec<GenerateRequest>,
        label: String,
    ) -> MediaResult<(BatchId, Vec<BatchTaskId>)> {
        if requests.is_empty() {
            return Err(MediaError::InvalidConfig("batch cannot be empty".into()));
        }

        let batch_id = Uuid::new_v4().to_string();
        let mut task_ids = Vec::with_capacity(requests.len());

        let mut state = self.state.lock().await;
        state.batches.insert(
            batch_id.clone(),
            BatchInfo {
                label,
                created_at: Utc::now(),
            },
        );

        for request in requests {
            let task_id = Uuid::new_v4().to_string();
            let task = BatchTask {
                id: task_id.clone(),
                batch_id: batch_id.clone(),
                request,
                status: BatchTaskStatus::Pending,
                result: None,
                error: None,
                created_at: Utc::now(),
                completed_at: None,
            };
            state.tasks.insert(task_id.clone(), task.clone());
            state.pending.push_back(task);
            task_ids.push(task_id);
        }

        drop(state);
        self.notify.notify_one();

        Ok((batch_id, task_ids))
    }

    /// Start the background queue processor.
    pub async fn start(&self) {
        let mut state = self.state.lock().await;
        if state.running {
            return;
        }
        state.running = true;
        drop(state);

        let state = self.state.clone();
        let notify = self.notify.clone();
        let media = self.media.clone();

        let handle = tokio::spawn(async move {
            loop {
                // Wait for notification or periodic check
                notify.notified().await;

                loop {
                    // Try to grab a pending task
                    let task = {
                        let mut s = state.lock().await;
                        if !s.running {
                            break;
                        }
                        s.pending.pop_front()
                    };

                    let Some(task) = task else {
                        break;
                    };

                    // Update status to running
                    {
                        let mut s = state.lock().await;
                        if let Some(t) = s.tasks.get_mut(&task.id) {
                            t.status = BatchTaskStatus::Running;
                        }
                    }

                    // Execute the generation
                    let result = media.generate(task.request.clone()).await;

                    // Update the task with result
                    {
                        let mut s = state.lock().await;
                        if let Some(t) = s.tasks.get_mut(&task.id) {
                            match result {
                                Ok(resp) => {
                                    t.status = BatchTaskStatus::Done;
                                    t.result = Some(resp);
                                }
                                Err(e) => {
                                    t.status = BatchTaskStatus::Error;
                                    t.error = Some(e.to_string());
                                }
                            }
                            t.completed_at = Some(Utc::now());
                        }
                    }
                }

                // Check if we should stop
                let should_stop = {
                    let s = state.lock().await;
                    !s.running
                };
                if should_stop {
                    break;
                }
            }
        });

        *self.worker_handle.lock().await = Some(handle);
    }

    /// Stop the background queue processor.
    pub async fn stop(&self) {
        let mut state = self.state.lock().await;
        state.running = false;
        drop(state);

        self.notify.notify_one();

        if let Some(handle) = self.worker_handle.lock().await.take() {
            handle.abort();
        }
    }

    /// Cancel a specific task.
    pub async fn cancel_task(&self, task_id: &str) -> MediaResult<()> {
        let mut state = self.state.lock().await;
        if let Some(task) = state.tasks.get_mut(task_id) {
            if task.status == BatchTaskStatus::Pending {
                task.status = BatchTaskStatus::Cancelled;
                task.completed_at = Some(Utc::now());
                // Also remove from pending queue
                state.pending.retain(|t| t.id != task_id);
                Ok(())
            } else if task.status == BatchTaskStatus::Running {
                Err(MediaError::InvalidConfig(
                    "cannot cancel a running task".into(),
                ))
            } else {
                Err(MediaError::InvalidConfig(format!(
                    "task is already {}",
                    task.status
                )))
            }
        } else {
            Err(MediaError::InvalidConfig(format!(
                "task {} not found",
                task_id
            )))
        }
    }

    /// Cancel all pending tasks in a batch.
    pub async fn cancel_batch(&self, batch_id: &str) -> MediaResult<usize> {
        let mut state = self.state.lock().await;
        let mut cancelled = 0;

        // Find all pending tasks in this batch
        let task_ids: Vec<String> = state
            .tasks
            .iter()
            .filter(|(_, t)| t.batch_id == batch_id && t.status == BatchTaskStatus::Pending)
            .map(|(id, _)| id.clone())
            .collect();

        for id in &task_ids {
            if let Some(task) = state.tasks.get_mut(id) {
                task.status = BatchTaskStatus::Cancelled;
                task.completed_at = Some(Utc::now());
                cancelled += 1;
            }
        }

        // Remove cancelled tasks from pending queue
        let cancelled_ids: Vec<String> = task_ids;
        state.pending.retain(|t| !cancelled_ids.contains(&t.id));

        Ok(cancelled)
    }

    /// Get a specific task's status.
    pub async fn get_task(&self, task_id: &str) -> Option<BatchTask> {
        let state = self.state.lock().await;
        state.tasks.get(task_id).cloned()
    }

    /// List all tasks in a batch.
    pub async fn list_batch_tasks(&self, batch_id: &str) -> Vec<BatchTask> {
        let state = self.state.lock().await;
        state
            .tasks
            .values()
            .filter(|t| t.batch_id == batch_id)
            .cloned()
            .collect()
    }

    /// List all batches with summaries.
    pub async fn list_batches(&self) -> Vec<BatchSummary> {
        let state = self.state.lock().await;
        let mut summaries = Vec::new();

        for (batch_id, info) in &state.batches {
            let tasks: Vec<&BatchTask> = state
                .tasks
                .values()
                .filter(|t| t.batch_id == *batch_id)
                .collect();

            let total = tasks.len();
            let completed = tasks
                .iter()
                .filter(|t| t.status == BatchTaskStatus::Done)
                .count();
            let failed = tasks
                .iter()
                .filter(|t| t.status == BatchTaskStatus::Error)
                .count();
            let pending = tasks
                .iter()
                .filter(|t| t.status == BatchTaskStatus::Pending)
                .count();
            let is_running = tasks.iter().any(|t| t.status == BatchTaskStatus::Running);

            summaries.push(BatchSummary {
                id: batch_id.clone(),
                label: info.label.clone(),
                total,
                completed,
                failed,
                pending,
                is_running,
                created_at: info.created_at,
            });
        }

        // Sort by creation time (newest first)
        summaries.sort_by_key(|b| std::cmp::Reverse(b.created_at));
        summaries
    }

    /// Get queue depth (number of pending tasks).
    pub async fn queue_depth(&self) -> usize {
        let state = self.state.lock().await;
        state.pending.len()
    }
}

impl Drop for BatchQueue {
    #[allow(clippy::collapsible_if)]
    fn drop(&mut self) {
        // Attempt to stop the worker (best effort)
        if let Ok(mut handle) = self.worker_handle.try_lock() {
            if let Some(h) = handle.take() {
                h.abort();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ImageSize;

    fn make_request(prompt: &str) -> GenerateRequest {
        GenerateRequest {
            prompt: prompt.into(),
            model: "dall-e-3".into(),
            size: ImageSize::S1024x1024,
            n: 1,
            provider: ImageProvider::OpenAI,
            api_key: "sk-test".into(),
            api_base: None,
            negative_prompt: None,
            seed: None,
        }
    }

    #[tokio::test]
    async fn enqueue_single_task() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let task_id = queue
            .enqueue(make_request("test image"), None)
            .await
            .unwrap();
        assert!(!task_id.is_empty());
        assert_eq!(queue.queue_depth().await, 1);

        let task = queue.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, BatchTaskStatus::Pending);
    }

    #[tokio::test]
    async fn enqueue_batch() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let requests = vec![
            make_request("image 1"),
            make_request("image 2"),
            make_request("image 3"),
        ];

        let (batch_id, task_ids) = queue
            .enqueue_batch(requests, "Test batch".into())
            .await
            .unwrap();

        assert!(!batch_id.is_empty());
        assert_eq!(task_ids.len(), 3);
        assert_eq!(queue.queue_depth().await, 3);

        let tasks = queue.list_batch_tasks(&batch_id).await;
        assert_eq!(tasks.len(), 3);
    }

    #[tokio::test]
    async fn enqueue_empty_batch_fails() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let result = queue.enqueue_batch(vec![], "Empty".into()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn cancel_pending_task() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let task_id = queue
            .enqueue(make_request("cancel me"), None)
            .await
            .unwrap();

        queue.cancel_task(&task_id).await.unwrap();

        let task = queue.get_task(&task_id).await.unwrap();
        assert_eq!(task.status, BatchTaskStatus::Cancelled);
        assert_eq!(queue.queue_depth().await, 0);
    }

    #[tokio::test]
    async fn cancel_batch() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let requests = vec![make_request("b1"), make_request("b2")];

        let (batch_id, _) = queue
            .enqueue_batch(requests, "Cancel batch".into())
            .await
            .unwrap();

        let cancelled = queue.cancel_batch(&batch_id).await.unwrap();
        assert_eq!(cancelled, 2);
        assert_eq!(queue.queue_depth().await, 0);
    }

    #[tokio::test]
    async fn cancel_nonexistent_task() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let result = queue.cancel_task("nonexistent").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_batches() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        queue
            .enqueue_batch(vec![make_request("a")], "Batch A".into())
            .await
            .unwrap();
        queue
            .enqueue_batch(vec![make_request("b"), make_request("c")], "Batch B".into())
            .await
            .unwrap();

        let batches = queue.list_batches().await;
        assert_eq!(batches.len(), 2);

        // Newest first
        assert_eq!(batches[0].label, "Batch B");
        assert_eq!(batches[0].total, 2);
        assert_eq!(batches[0].pending, 2);

        assert_eq!(batches[1].label, "Batch A");
        assert_eq!(batches[1].total, 1);
        assert_eq!(batches[1].pending, 1);
    }

    #[tokio::test]
    async fn get_nonexistent_task() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let task = queue.get_task("nonexistent").await;
        assert!(task.is_none());
    }

    #[tokio::test]
    async fn cancel_already_cancelled_task() {
        let media = Arc::new(MediaManager::new());
        let queue = BatchQueue::new(media);

        let task_id = queue.enqueue(make_request("test"), None).await.unwrap();

        queue.cancel_task(&task_id).await.unwrap();

        // Second cancel should fail
        let result = queue.cancel_task(&task_id).await;
        assert!(result.is_err());
    }
}
