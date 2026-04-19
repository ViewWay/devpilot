//! Media manager — orchestrates image generation.

use crate::error::{MediaError, MediaResult};
use crate::providers::{self, ImageGenerator};
use crate::types::{GenerateRequest, GenerateResponse, ImageProvider};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages image generation across providers.
pub struct MediaManager {
    generators: Arc<RwLock<HashMap<ImageProvider, Box<dyn ImageGenerator>>>>,
}

impl Default for MediaManager {
    fn default() -> Self {
        Self::new()
    }
}

impl MediaManager {
    /// Create a new manager with default generators.
    pub fn new() -> Self {
        let mut generators: HashMap<ImageProvider, Box<dyn ImageGenerator>> = HashMap::new();
        generators.insert(
            ImageProvider::OpenAI,
            providers::get_generator(ImageProvider::OpenAI),
        );
        generators.insert(
            ImageProvider::StabilityAI,
            providers::get_generator(ImageProvider::StabilityAI),
        );
        generators.insert(
            ImageProvider::Generic,
            providers::get_generator(ImageProvider::Generic),
        );

        Self {
            generators: Arc::new(RwLock::new(generators)),
        }
    }

    /// Register a custom generator for a provider.
    pub async fn register_generator(
        &self,
        provider: ImageProvider,
        generator: Box<dyn ImageGenerator>,
    ) {
        self.generators.write().await.insert(provider, generator);
    }

    /// Generate images.
    pub async fn generate(&self, req: GenerateRequest) -> MediaResult<GenerateResponse> {
        req.validate().map_err(MediaError::InvalidConfig)?;

        let generators = self.generators.read().await;
        let generator = generators.get(&req.provider).ok_or_else(|| {
            MediaError::InvalidConfig(format!("no generator registered for {:?}", req.provider))
        })?;

        generator.generate(&req).await
    }

    /// List available providers.
    pub async fn available_providers(&self) -> Vec<ImageProvider> {
        let generators = self.generators.read().await;
        generators.keys().copied().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ImageSize;

    #[tokio::test]
    async fn available_providers() {
        let mgr = MediaManager::new();
        let providers = mgr.available_providers().await;
        assert_eq!(providers.len(), 3);
        assert!(providers.contains(&ImageProvider::OpenAI));
        assert!(providers.contains(&ImageProvider::StabilityAI));
        assert!(providers.contains(&ImageProvider::Generic));
    }

    #[tokio::test]
    async fn generate_validates_request() {
        let mgr = MediaManager::new();
        let req = GenerateRequest {
            prompt: "".into(),
            model: "dall-e-3".into(),
            size: ImageSize::S1024x1024,
            n: 1,
            provider: ImageProvider::OpenAI,
            api_key: "sk-test".into(),
            api_base: None,
            negative_prompt: None,
            seed: None,
        };
        let result = mgr.generate(req).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn register_custom_generator() {
        let mgr = MediaManager::new();
        let providers = mgr.available_providers().await;
        assert_eq!(providers.len(), 3);

        // Registering overwrites existing
        mgr.register_generator(
            ImageProvider::Generic,
            providers::get_generator(ImageProvider::Generic),
        )
        .await;
        let providers = mgr.available_providers().await;
        assert_eq!(providers.len(), 3);
    }
}
