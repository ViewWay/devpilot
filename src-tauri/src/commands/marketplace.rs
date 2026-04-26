//! Tauri commands for the Skill Marketplace.
//!
//! Provides invoke handlers for browsing, searching, installing,
//! and uninstalling skills from remote marketplace sources.

use devpilot_tools::SkillLoader;
use serde::{Deserialize, Serialize};

// ── Types ─────────────────────────────────────────────

/// A skill listing from a remote marketplace source.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceSkill {
    /// Unique skill identifier in the marketplace.
    pub id: String,
    /// Human-readable skill name.
    pub name: String,
    /// Short description of the skill.
    pub description: String,
    /// Version string (e.g. "1.0.0").
    pub version: Option<String>,
    /// Author of the skill.
    pub author: Option<String>,
    /// Category (e.g. "coding", "analysis", "writing").
    pub category: Option<String>,
    /// Tags for search/discovery.
    pub tags: Option<Vec<String>>,
    /// The skill content (SKILL.md text), available after fetching.
    pub content: Option<String>,
    /// Source URL the skill was fetched from.
    pub source: Option<String>,
}

// ── Default Marketplace URL ───────────────────────────

const DEFAULT_MARKETPLACE_URL: &str = "https://skills.devpilot.dev/catalog.json";

// ── Commands ─────────────────────────────────────────

/// Fetch the full catalog of skills from a marketplace source.
///
/// If `source` is not provided, uses the default marketplace URL.
#[tauri::command]
pub async fn marketplace_fetch_catalog(
    source: Option<String>,
) -> Result<Vec<MarketplaceSkill>, String> {
    let url = source.as_deref().unwrap_or(DEFAULT_MARKETPLACE_URL);

    let response = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to fetch marketplace catalog: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Marketplace returned status {}", response.status()));
    }

    let catalog: Vec<MarketplaceSkill> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse marketplace catalog: {e}"))?;

    Ok(catalog)
}

/// Search marketplace skills by query string.
///
/// Matches against name, description, category, and tags.
#[tauri::command]
pub async fn marketplace_search_skills(
    query: String,
    source: Option<String>,
) -> Result<Vec<MarketplaceSkill>, String> {
    let catalog = marketplace_fetch_catalog(source).await?;

    let query_lower = query.to_lowercase();
    let results: Vec<MarketplaceSkill> = catalog
        .into_iter()
        .filter(|skill| {
            let name_match = skill.name.to_lowercase().contains(&query_lower);
            let desc_match = skill.description.to_lowercase().contains(&query_lower);
            let cat_match = skill
                .category
                .as_deref()
                .map(|c| c.to_lowercase().contains(&query_lower))
                .unwrap_or(false);
            let tag_match = skill
                .tags
                .as_ref()
                .map(|tags| tags.iter().any(|t| t.to_lowercase().contains(&query_lower)))
                .unwrap_or(false);
            name_match || desc_match || cat_match || tag_match
        })
        .collect();

    Ok(results)
}

/// Install a skill from the marketplace by its ID.
///
/// Fetches the skill content from the marketplace source and installs it
/// using the local SkillLoader.
#[tauri::command]
pub async fn marketplace_install_skill(
    skill_id: String,
    source: Option<String>,
) -> Result<(), String> {
    let catalog = marketplace_fetch_catalog(source.clone()).await?;

    let skill = catalog
        .into_iter()
        .find(|s| s.id == skill_id)
        .ok_or_else(|| format!("Skill '{}' not found in marketplace", skill_id))?;

    let content = skill
        .content
        .ok_or_else(|| format!("Skill '{}' has no downloadable content", skill_id))?;

    let loader = SkillLoader::new();
    loader
        .install_skill(&skill.name, &content)
        .await
        .map_err(|e| format!("Failed to install skill '{}': {e}", skill.name))
}

/// Uninstall a locally installed skill by name.
#[tauri::command]
pub async fn marketplace_uninstall_skill(name: String) -> Result<(), String> {
    let loader = SkillLoader::new();
    loader
        .uninstall_skill(&name)
        .await
        .map_err(|e| format!("Failed to uninstall skill '{}': {e}", name))
}
