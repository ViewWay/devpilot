//! Provider-specific implementations.

use crate::error::MediaError;
use crate::types::{GenerateRequest, GenerateResponse, ImageData, ImageProvider};
use async_trait::async_trait;
use serde_json::json;

/// Trait for image generation providers.
#[async_trait]
pub trait ImageGenerator: Send + Sync {
    /// Generate images from a request.
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateResponse, MediaError>;
}

/// OpenAI DALL-E provider.
pub struct OpenAIGenerator;

#[async_trait]
impl ImageGenerator for OpenAIGenerator {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateResponse, MediaError> {
        let url = format!(
            "{}/images/generations",
            req.effective_base_url().trim_end_matches('/')
        );

        let body = json!({
            "model": req.model,
            "prompt": req.prompt,
            "n": req.n,
            "size": req.size.as_str(),
        });

        let resp = reqwest::Client::new()
            .post(&url)
            .header("Authorization", format!("Bearer {}", req.api_key))
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(MediaError::GenerationFailed(format!(
                "HTTP {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp.json().await?;
        let images = data["data"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|item| ImageData {
                        url: item["url"].as_str().map(String::from),
                        b64_json: item["b64_json"].as_str().map(String::from),
                        revised_prompt: item["revised_prompt"].as_str().map(String::from),
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(GenerateResponse {
            images,
            provider: ImageProvider::OpenAI,
            model: req.model.clone(),
            created_at: chrono::Utc::now(),
        })
    }
}

/// Stability AI provider.
pub struct StabilityGenerator;

#[async_trait]
impl ImageGenerator for StabilityGenerator {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateResponse, MediaError> {
        let url = format!(
            "{}/generation/{}/text-to-image",
            req.effective_base_url().trim_end_matches('/'),
            req.model
        );

        let (width, height) = req.size.dimensions();

        let body = json!({
            "text_prompts": [{
                "text": req.prompt,
                "weight": 1.0,
            }],
            "cfg_scale": 7,
            "width": width,
            "height": height,
            "samples": req.n,
            "steps": 30,
        });

        let resp = reqwest::Client::new()
            .post(&url)
            .header("Authorization", format!("Bearer {}", req.api_key))
            .header("Accept", "application/json")
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(MediaError::GenerationFailed(format!(
                "HTTP {status}: {text}"
            )));
        }

        let data: serde_json::Value = resp.json().await?;
        let images = data["artifacts"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .map(|item| ImageData {
                        url: None,
                        b64_json: item["base64"].as_str().map(String::from),
                        revised_prompt: None,
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        Ok(GenerateResponse {
            images,
            provider: ImageProvider::StabilityAI,
            model: req.model.clone(),
            created_at: chrono::Utc::now(),
        })
    }
}

/// Generic OpenAI-compatible provider.
pub struct GenericGenerator;

#[async_trait]
impl ImageGenerator for GenericGenerator {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateResponse, MediaError> {
        // Reuse OpenAI logic for generic endpoints
        let generator = OpenAIGenerator;
        let mut resp = generator.generate(req).await?;
        resp.provider = ImageProvider::Generic;
        Ok(resp)
    }
}

/// Get the appropriate generator for a provider.
pub fn get_generator(provider: ImageProvider) -> Box<dyn ImageGenerator> {
    match provider {
        ImageProvider::OpenAI => Box::new(OpenAIGenerator),
        ImageProvider::StabilityAI => Box::new(StabilityGenerator),
        ImageProvider::Generic => Box::new(GenericGenerator),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ImageSize;

    #[test]
    fn image_size_dimensions() {
        assert_eq!(ImageSize::S256x256.dimensions(), (256, 256));
        assert_eq!(ImageSize::S1024x1024.dimensions(), (1024, 1024));
        assert_eq!(ImageSize::S1792x1024.dimensions(), (1792, 1024));
    }

    #[test]
    fn image_size_as_str() {
        assert_eq!(ImageSize::S1024x1024.as_str(), "1024x1024");
        assert_eq!(ImageSize::S1024x1792.as_str(), "1024x1792");
    }

    #[test]
    fn provider_defaults() {
        assert_eq!(ImageProvider::OpenAI.default_model(), "dall-e-3");
        assert!(!ImageProvider::OpenAI.default_base_url().is_empty());
    }

    #[test]
    fn request_validation() {
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
        assert!(req.validate().is_err());

        let req = GenerateRequest {
            prompt: "test".into(),
            ..req
        };
        assert!(req.validate().is_ok());
    }

    #[test]
    fn effective_base_url() {
        let req = GenerateRequest {
            prompt: "test".into(),
            model: "dall-e-3".into(),
            size: ImageSize::default(),
            n: 1,
            provider: ImageProvider::OpenAI,
            api_key: "sk-test".into(),
            api_base: Some("https://custom.api.com/v1".into()),
            negative_prompt: None,
            seed: None,
        };
        assert_eq!(req.effective_base_url(), "https://custom.api.com/v1");
    }
}
