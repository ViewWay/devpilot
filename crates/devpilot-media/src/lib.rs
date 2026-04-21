//! # devpilot-media
//!
//! Image generation with multiple provider backends and batch task queue.
//!
//! Supported providers:
//! - OpenAI DALL-E 3
//! - Stability AI (Stable Diffusion)
//! - Generic OpenAI-compatible endpoints
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_media::{MediaManager, GenerateRequest, ImageProvider};
//!
//! let manager = MediaManager::new();
//!
//! let req = GenerateRequest {
//!     prompt: "A sunset over mountains".into(),
//!     model: "dall-e-3".into(),
//!     size: ImageSize::S1024x1024,
//!     n: 1,
//!     provider: ImageProvider::OpenAI,
//!     api_key: "sk-...".into(),
//!     api_base: None,
//! };
//!
//! let result = manager.generate(req).await.unwrap();
//! ```
//!
//! ## Batch Queue
//!
//! ```ignore
//! use devpilot_media::{BatchQueue, MediaManager};
//! use std::sync::Arc;
//!
//! let media = Arc::new(MediaManager::new());
//! let queue = BatchQueue::new(media.clone());
//!
//! // Enqueue a batch of generation tasks
//! let (batch_id, task_ids) = queue.enqueue_batch(requests, "My batch".into()).await.unwrap();
//!
//! // Start processing
//! queue.start().await;
//!
//! // Check status
//! let task = queue.get_task(&task_ids[0]).await.unwrap();
//! println!("Status: {:?}", task.status);
//! ```

pub mod batch;
mod error;
mod manager;
mod providers;
mod types;

pub use batch::{BatchId, BatchQueue, BatchSummary, BatchTask, BatchTaskId, BatchTaskStatus};
pub use error::{MediaError, MediaResult};
pub use manager::MediaManager;
pub use types::{GenerateRequest, GenerateResponse, ImageData, ImageProvider, ImageSize};
