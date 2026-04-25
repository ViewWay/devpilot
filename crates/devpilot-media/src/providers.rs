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

/// Google Gemini image generation provider.
///
/// Uses the Gemini `generateContent` endpoint with `responseModalities` set to
/// `["TEXT", "IMAGE"]` to produce images from text prompts.
///
/// The model must support image generation (e.g. `gemini-2.0-flash-exp`).
pub struct GeminiGenerator;

impl GeminiGenerator {
    /// Build the generateContent URL for the given model and API key.
    fn build_url(base: &str, model: &str, api_key: &str) -> String {
        let base = base.trim_end_matches('/');
        format!("{base}/v1beta/models/{model}:generateContent?key={api_key}")
    }
}

#[async_trait]
impl ImageGenerator for GeminiGenerator {
    async fn generate(&self, req: &GenerateRequest) -> Result<GenerateResponse, MediaError> {
        let url = Self::build_url(req.effective_base_url(), &req.model, &req.api_key);

        // Build the Gemini generateContent request body.
        // We send a single user turn with the prompt text and request
        // `responseModalities: ["TEXT", "IMAGE"]` so the model returns
        // inline image data.
        let body = json!({
            "contents": [{
                "role": "user",
                "parts": [{ "text": req.prompt }]
            }],
            "generationConfig": {
                "responseModalities": ["TEXT", "IMAGE"]
            }
        });

        let resp = reqwest::Client::new()
            .post(&url)
            .header("Content-Type", "application/json")
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

        // Extract images from candidates[].content.parts[] where
        // inline_data is present with an image mime type.
        let mut images = Vec::new();

        if let Some(candidates) = data["candidates"].as_array() {
            for candidate in candidates {
                if let Some(parts) = candidate
                    .get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    for part in parts {
                        if let Some(inline_data) = part.get("inline_data") {
                            let mime = inline_data["mimeType"].as_str().unwrap_or("image/png");
                            if mime.starts_with("image/") {
                                images.push(ImageData {
                                    url: None,
                                    b64_json: inline_data["data"].as_str().map(String::from),
                                    revised_prompt: None,
                                });
                            }
                        }
                    }
                }
            }
        }

        if images.is_empty() {
            return Err(MediaError::GenerationFailed(
                "Gemini returned no image data".into(),
            ));
        }

        Ok(GenerateResponse {
            images,
            provider: ImageProvider::Gemini,
            model: req.model.clone(),
            created_at: chrono::Utc::now(),
        })
    }
}

/// Get the appropriate generator for a provider.
pub fn get_generator(provider: ImageProvider) -> Box<dyn ImageGenerator> {
    match provider {
        ImageProvider::OpenAI => Box::new(OpenAIGenerator),
        ImageProvider::StabilityAI => Box::new(StabilityGenerator),
        ImageProvider::Generic => Box::new(GenericGenerator),
        ImageProvider::Gemini => Box::new(GeminiGenerator),
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
        assert_eq!(
            ImageProvider::Gemini.default_model(),
            "gemini-2.0-flash-exp"
        );
        assert_eq!(
            ImageProvider::Gemini.default_base_url(),
            "https://generativelanguage.googleapis.com"
        );
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

    #[test]
    fn gemini_build_url() {
        let url = GeminiGenerator::build_url(
            "https://generativelanguage.googleapis.com",
            "gemini-2.0-flash-exp",
            "AIzaSyTESTKEY",
        );
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=AIzaSyTESTKEY"
        );
    }

    #[test]
    fn gemini_build_url_trailing_slash() {
        let url = GeminiGenerator::build_url(
            "https://generativelanguage.googleapis.com/",
            "gemini-2.0-flash-exp",
            "key123",
        );
        assert_eq!(
            url,
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=key123"
        );
    }

    #[test]
    fn gemini_build_url_custom_base() {
        let url = GeminiGenerator::build_url("https://my-proxy.example.com", "my-model", "mykey");
        assert_eq!(
            url,
            "https://my-proxy.example.com/v1beta/models/my-model:generateContent?key=mykey"
        );
    }

    #[test]
    fn get_generator_returns_correct_type() {
        // Ensure all providers can produce a generator without panicking
        let _openai = get_generator(ImageProvider::OpenAI);
        let _stability = get_generator(ImageProvider::StabilityAI);
        let _generic = get_generator(ImageProvider::Generic);
        let _gemini = get_generator(ImageProvider::Gemini);
    }

    #[test]
    fn parse_gemini_response_empty_candidates() {
        // Verify that an empty candidates array results in no images extracted.
        let data: serde_json::Value = serde_json::json!({
            "candidates": []
        });
        let mut images = Vec::new();
        if let Some(candidates) = data["candidates"].as_array() {
            for candidate in candidates {
                if let Some(parts) = candidate
                    .get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    for part in parts {
                        if let Some(inline_data) = part.get("inline_data") {
                            let mime = inline_data["mimeType"].as_str().unwrap_or("image/png");
                            if mime.starts_with("image/") {
                                images.push(ImageData {
                                    url: None,
                                    b64_json: inline_data["data"].as_str().map(String::from),
                                    revised_prompt: None,
                                });
                            }
                        }
                    }
                }
            }
        }
        assert!(images.is_empty());
    }

    #[test]
    fn parse_gemini_response_with_image() {
        // Simulate a successful Gemini image generation response.
        let data: serde_json::Value = serde_json::json!({
            "candidates": [{
                "content": {
                    "parts": [
                        { "text": "Here is your image:" },
                        {
                            "inline_data": {
                                "mimeType": "image/png",
                                "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                            }
                        }
                    ]
                }
            }]
        });
        let mut images = Vec::new();
        if let Some(candidates) = data["candidates"].as_array() {
            for candidate in candidates {
                if let Some(parts) = candidate
                    .get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    for part in parts {
                        if let Some(inline_data) = part.get("inline_data") {
                            let mime = inline_data["mimeType"].as_str().unwrap_or("image/png");
                            if mime.starts_with("image/") {
                                images.push(ImageData {
                                    url: None,
                                    b64_json: inline_data["data"].as_str().map(String::from),
                                    revised_prompt: None,
                                });
                            }
                        }
                    }
                }
            }
        }
        assert_eq!(images.len(), 1);
        assert!(images[0].b64_json.is_some());
        assert!(images[0].url.is_none());
    }

    #[test]
    fn gemini_request_uses_default_base_url() {
        let req = GenerateRequest {
            prompt: "a beautiful sunset".into(),
            model: "gemini-2.0-flash-exp".into(),
            size: ImageSize::S1024x1024,
            n: 1,
            provider: ImageProvider::Gemini,
            api_key: "AIzaSyTESTKEY".into(),
            api_base: None,
            negative_prompt: None,
            seed: None,
        };
        assert_eq!(
            req.effective_base_url(),
            "https://generativelanguage.googleapis.com"
        );
    }

    #[test]
    fn gemini_request_custom_base_url() {
        let req = GenerateRequest {
            prompt: "a beautiful sunset".into(),
            model: "gemini-2.0-flash-exp".into(),
            size: ImageSize::S1024x1024,
            n: 1,
            provider: ImageProvider::Gemini,
            api_key: "AIzaSyTESTKEY".into(),
            api_base: Some("https://my-custom-proxy.com".into()),
            negative_prompt: None,
            seed: None,
        };
        assert_eq!(req.effective_base_url(), "https://my-custom-proxy.com");
    }
}
