//! # devpilot-media
//!
//! Image generation with multiple provider backends.
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

mod error;
mod manager;
mod providers;
mod types;

pub use error::{MediaError, MediaResult};
pub use manager::MediaManager;
pub use types::{GenerateRequest, GenerateResponse, ImageData, ImageProvider, ImageSize};
