//! Tauri commands for image generation.

use crate::AppState;
use devpilot_media::{GenerateRequest, ImageProvider, ImageSize, MediaManager};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Media state stored in AppState.
pub struct MediaState {
    pub manager: MediaManager,
}

/// Generate image request.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageRequest {
    /// Text prompt.
    pub prompt: String,
    /// Model name.
    pub model: Option<String>,
    /// Size preset: "256x256", "512x512", "1024x1024", "1024x1792", "1792x1024".
    pub size: Option<String>,
    /// Number of images.
    pub n: Option<u32>,
    /// Provider: "openai", "stability", "generic".
    pub provider: Option<String>,
    /// API key.
    pub api_key: String,
    /// Optional API base URL override.
    pub api_base: Option<String>,
}

/// Generated image result.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageResult {
    /// Provider used.
    pub provider: String,
    /// Model used.
    pub model: String,
    /// Generated images.
    pub images: Vec<ImageResultItem>,
}

/// Single generated image.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResultItem {
    /// URL (if available).
    pub url: Option<String>,
    /// Base64 data (if returned inline).
    pub b64_json: Option<String>,
    /// Revised prompt (DALL-E 3).
    pub revised_prompt: Option<String>,
}

/// Generate an image.
#[tauri::command(rename_all = "camelCase")]
pub async fn media_generate(
    state: State<'_, AppState>,
    req: GenerateImageRequest,
) -> Result<GenerateImageResult, String> {
    let provider = match req.provider.as_deref() {
        Some("stability") => ImageProvider::StabilityAI,
        Some("generic") => ImageProvider::Generic,
        _ => ImageProvider::OpenAI,
    };

    let size = match req.size.as_deref() {
        Some("256x256") => ImageSize::S256x256,
        Some("512x512") => ImageSize::S512x512,
        Some("1024x1792") => ImageSize::S1024x1792,
        Some("1792x1024") => ImageSize::S1792x1024,
        _ => ImageSize::S1024x1024,
    };

    let model = req
        .model
        .unwrap_or_else(|| provider.default_model().to_string());

    let gen_req = GenerateRequest {
        prompt: req.prompt,
        model,
        size,
        n: req.n.unwrap_or(1),
        provider,
        api_key: req.api_key,
        api_base: req.api_base,
        negative_prompt: None,
        seed: None,
    };

    let result = state
        .media_state
        .manager
        .generate(gen_req)
        .await
        .map_err(|e| format!("Image generation failed: {e}"))?;

    Ok(GenerateImageResult {
        provider: format!("{:?}", result.provider),
        model: result.model,
        images: result
            .images
            .into_iter()
            .map(|img| ImageResultItem {
                url: img.url,
                b64_json: img.b64_json,
                revised_prompt: img.revised_prompt,
            })
            .collect(),
    })
}

/// List available image providers.
#[tauri::command]
pub async fn media_providers(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let providers = state.media_state.manager.available_providers().await;
    Ok(providers
        .into_iter()
        .map(|p| format!("{p:?}").to_lowercase())
        .collect())
}

// ── Media Persistence (SQLite) ────────────────────────

use devpilot_store::MediaGenerationRecord;

/// Persist a media generation record to database.
#[tauri::command(rename_all = "camelCase")]
pub fn media_save(state: State<'_, AppState>, record: MediaGenerationRecord) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_media_generation(&record)
        .map_err(|e| e.to_string())
}

/// List all persisted media generations from database.
#[tauri::command]
pub fn media_list_saved(state: State<'_, AppState>) -> Result<Vec<MediaGenerationRecord>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.list_media_generations().map_err(|e| e.to_string())
}

/// Get a single media generation by ID.
#[tauri::command(rename_all = "camelCase")]
pub fn media_get(
    state: State<'_, AppState>,
    media_id: String,
) -> Result<MediaGenerationRecord, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.get_media_generation(&media_id)
        .map_err(|e| e.to_string())
}

/// Update media generation status and file path.
#[tauri::command(rename_all = "camelCase")]
pub fn media_update_status(
    state: State<'_, AppState>,
    media_id: String,
    status: String,
    file_path: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_media_generation(&media_id, &status, file_path.as_deref())
        .map_err(|e| e.to_string())
}

/// Update tags for a media generation.
#[tauri::command(rename_all = "camelCase")]
pub fn media_update_tags(
    state: State<'_, AppState>,
    media_id: String,
    tags: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.update_media_generation_tags(&media_id, &tags)
        .map_err(|e| e.to_string())
}

/// Delete a media generation from database.
#[tauri::command(rename_all = "camelCase")]
pub fn media_delete(state: State<'_, AppState>, media_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.delete_media_generation(&media_id)
        .map_err(|e| e.to_string())
}
