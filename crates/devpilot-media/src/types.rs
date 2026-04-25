//! Media types — request, response, provider config.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Supported image providers.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ImageProvider {
    #[default]
    OpenAI,
    StabilityAI,
    Generic,
    Gemini,
}

impl ImageProvider {
    /// Default API base URL.
    pub fn default_base_url(&self) -> &'static str {
        match self {
            ImageProvider::OpenAI => "https://api.openai.com/v1",
            ImageProvider::StabilityAI => "https://api.stability.ai/v1",
            ImageProvider::Generic => "",
            ImageProvider::Gemini => "https://generativelanguage.googleapis.com",
        }
    }

    /// Default model name.
    pub fn default_model(&self) -> &'static str {
        match self {
            ImageProvider::OpenAI => "dall-e-3",
            ImageProvider::StabilityAI => "stable-diffusion-xl-1024-v1-0",
            ImageProvider::Generic => "",
            ImageProvider::Gemini => "gemini-2.0-flash-exp",
        }
    }
}

/// Image size presets.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum ImageSize {
    S256x256,
    S512x512,
    #[default]
    S1024x1024,
    S1024x1792,
    S1792x1024,
}

impl ImageSize {
    /// Convert to (width, height).
    pub fn dimensions(&self) -> (u32, u32) {
        match self {
            ImageSize::S256x256 => (256, 256),
            ImageSize::S512x512 => (512, 512),
            ImageSize::S1024x1024 => (1024, 1024),
            ImageSize::S1024x1792 => (1024, 1792),
            ImageSize::S1792x1024 => (1792, 1024),
        }
    }

    /// Convert to size string for API calls.
    pub fn as_str(&self) -> &'static str {
        match self {
            ImageSize::S256x256 => "256x256",
            ImageSize::S512x512 => "512x512",
            ImageSize::S1024x1024 => "1024x1024",
            ImageSize::S1024x1792 => "1024x1792",
            ImageSize::S1792x1024 => "1792x1024",
        }
    }
}

/// An image generation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateRequest {
    /// Text prompt.
    pub prompt: String,
    /// Model name.
    pub model: String,
    /// Image size.
    pub size: ImageSize,
    /// Number of images to generate.
    pub n: u32,
    /// Provider to use.
    pub provider: ImageProvider,
    /// API key.
    pub api_key: String,
    /// Optional API base URL override.
    pub api_base: Option<String>,
    /// Optional negative prompt.
    pub negative_prompt: Option<String>,
    /// Optional seed for reproducibility.
    pub seed: Option<u64>,
}

impl GenerateRequest {
    /// Validate the request.
    pub fn validate(&self) -> Result<(), String> {
        if self.prompt.is_empty() {
            return Err("prompt cannot be empty".into());
        }
        if self.api_key.is_empty() {
            return Err("api_key cannot be empty".into());
        }
        if self.n == 0 {
            return Err("n must be at least 1".into());
        }
        Ok(())
    }

    /// Get the effective API base URL.
    pub fn effective_base_url(&self) -> &str {
        self.api_base
            .as_deref()
            .unwrap_or_else(|| self.provider.default_base_url())
    }
}

/// An image generation response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateResponse {
    /// Generated images.
    pub images: Vec<ImageData>,
    /// Provider that generated them.
    pub provider: ImageProvider,
    /// Model used.
    pub model: String,
    /// Timestamp.
    pub created_at: DateTime<Utc>,
}

/// A single generated image.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageData {
    /// URL to download the image (if available).
    pub url: Option<String>,
    /// Base64-encoded image data (if returned inline).
    pub b64_json: Option<String>,
    /// Revised prompt (DALL-E 3 returns this).
    pub revised_prompt: Option<String>,
}
