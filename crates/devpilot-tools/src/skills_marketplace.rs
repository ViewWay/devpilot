//! Skills Marketplace — browse and install skills from GitHub repositories.
//!
//! This module extends the local skill system (`skill_loader`) with the ability
//! to fetch a catalog of community skills from a remote JSON index, search them,
//! and install/uninstall them into the local `~/.devpilot/skills/` directory.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

// ── Data model ───────────────────────────────────────

/// A skill listing from the remote marketplace catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketplaceSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub repo_url: String,
    /// Path to the skill directory within the repository.
    pub path: String,
    pub stars: u32,
    pub downloads: u32,
    pub tags: Vec<String>,
    /// Populated only when fetching detail (not in the light catalog).
    #[serde(default)]
    pub readme_content: Option<String>,
}

/// Default remote catalog URL.
#[allow(dead_code)]
pub const DEFAULT_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/anthropics/skills/main/catalog.json";

// ── Marketplace client ───────────────────────────────

/// HTTP client for browsing and installing skills from remote repositories.
pub struct SkillsMarketplace {
    client: Client,
}

impl SkillsMarketplace {
    /// Create a new marketplace client.
    pub fn new() -> Self {
        let client = Client::builder()
            .user_agent("devpilot-skills-marketplace/1.0")
            .build()
            .expect("failed to build reqwest client");
        Self { client }
    }

    // ── Catalog operations ────────────────────────────

    /// Fetch the skill catalog from a remote JSON index.
    ///
    /// Falls back to a built-in catalog if the remote fetch fails.
    pub async fn fetch_catalog(&self, source: &str) -> Result<Vec<MarketplaceSkill>> {
        debug!("fetching skills catalog from {source}");

        let resp = self.client.get(source).send().await;

        match resp {
            Ok(r) if r.status().is_success() => {
                let body = r.text().await.context("reading catalog response body")?;
                let skills: Vec<MarketplaceSkill> =
                    serde_json::from_str(&body).context("parsing catalog JSON")?;
                debug!("fetched {} skills from remote catalog", skills.len());
                Ok(skills)
            }
            Ok(r) => {
                warn!(
                    "catalog fetch returned status {}, using built-in fallback",
                    r.status()
                );
                Ok(builtin_catalog())
            }
            Err(e) => {
                warn!("catalog fetch failed ({e}), using built-in fallback");
                Ok(builtin_catalog())
            }
        }
    }

    /// Fetch detailed information for a single skill, including its README content.
    pub async fn fetch_skill_detail(&self, id: &str, source: &str) -> Result<MarketplaceSkill> {
        let skills = self.fetch_catalog(source).await?;
        let mut skill = skills
            .into_iter()
            .find(|s| s.id == id)
            .context(format!("skill '{id}' not found in catalog"))?;

        // Try to fetch the README / SKILL.md content from the repo.
        if let Some(raw_url) = skill_raw_url(&skill, "SKILL.md") {
            match self.client.get(&raw_url).send().await {
                Ok(r) if r.status().is_success() => {
                    if let Ok(text) = r.text().await {
                        skill.readme_content = Some(text);
                    }
                }
                _ => {
                    // Try README.md as a fallback.
                    if let Some(alt_url) = skill_raw_url(&skill, "README.md")
                        && let Ok(r) = self.client.get(&alt_url).send().await
                        && r.status().is_success()
                        && let Ok(text) = r.text().await
                    {
                        skill.readme_content = Some(text);
                    }
                }
            }
        }

        Ok(skill)
    }

    // ── Install / Uninstall ───────────────────────────

    /// Download SKILL.md (and optional assets) from the remote repo into
    /// `install_dir/{skill-name}/`.
    pub async fn install_skill(&self, skill: &MarketplaceSkill, install_dir: &str) -> Result<()> {
        let dest = PathBuf::from(install_dir).join(&skill.name);
        tokio::fs::create_dir_all(&dest)
            .await
            .context("creating skill install directory")?;

        // Fetch SKILL.md from the raw GitHub URL.
        let skill_md_url =
            skill_raw_url(skill, "SKILL.md").context("could not build raw URL for SKILL.md")?;

        let resp = self
            .client
            .get(&skill_md_url)
            .send()
            .await
            .context("fetching SKILL.md")?;

        if !resp.status().is_success() {
            anyhow::bail!("failed to download SKILL.md (status {})", resp.status());
        }

        let content = resp.text().await.context("reading SKILL.md body")?;
        let skill_file = dest.join("SKILL.md");
        tokio::fs::write(&skill_file, &content)
            .await
            .context("writing SKILL.md")?;

        debug!("installed skill '{}' to {}", skill.name, dest.display());

        // Best-effort: also fetch README.md if it exists alongside SKILL.md.
        if let Some(readme_url) = skill_raw_url(skill, "README.md")
            && let Ok(r) = self.client.get(&readme_url).send().await
            && r.status().is_success()
            && let Ok(text) = r.text().await
        {
            let readme_path = dest.join("README.md");
            let _ = tokio::fs::write(readme_path, text).await;
        }

        // Write a marketplace metadata sidecar so we can trace origin.
        let meta = MarketplaceMeta {
            id: skill.id.clone(),
            repo_url: skill.repo_url.clone(),
            author: skill.author.clone(),
            installed_from: "marketplace".to_string(),
        };
        let meta_json = serde_json::to_string_pretty(&meta)?;
        tokio::fs::write(dest.join(".marketplace.json"), meta_json).await?;

        Ok(())
    }

    /// Remove a previously installed skill directory.
    pub async fn uninstall_skill(&self, name: &str, install_dir: &str) -> Result<()> {
        let dir = Path::new(install_dir).join(name);
        if !dir.exists() {
            anyhow::bail!("skill '{name}' is not installed");
        }
        tokio::fs::remove_dir_all(&dir)
            .await
            .context("removing skill directory")?;
        debug!("uninstalled skill '{name}'");
        Ok(())
    }

    // ── Search ────────────────────────────────────────

    /// Fuzzy-search a list of marketplace skills by matching the query
    /// against the name, description, and tags (case-insensitive).
    pub fn search_skills(&self, query: &str, skills: &[MarketplaceSkill]) -> Vec<MarketplaceSkill> {
        let q = query.to_lowercase();
        let terms: Vec<&str> = q.split_whitespace().collect();
        if terms.is_empty() {
            return skills.to_vec();
        }

        let mut scored: Vec<(i64, MarketplaceSkill)> = skills
            .iter()
            .filter_map(|s| {
                let name_lower = s.name.to_lowercase();
                let desc_lower = s.description.to_lowercase();
                let tags_joined = s.tags.join(" ").to_lowercase();
                let haystack = format!("{name_lower} {desc_lower} {tags_joined}");

                let mut score: i64 = 0;
                let mut all_match = true;
                for term in &terms {
                    if haystack.contains(term) {
                        // Boost exact name matches.
                        if name_lower.contains(term) {
                            score += 10;
                        }
                        // Boost tag matches.
                        if tags_joined.contains(term) {
                            score += 5;
                        }
                        score += 1;
                    } else {
                        all_match = false;
                    }
                }

                if all_match {
                    Some((score, s.clone()))
                } else {
                    None
                }
            })
            .collect();

        scored.sort_by_key(|b| std::cmp::Reverse(b.0));
        scored.into_iter().map(|(_, s)| s).collect()
    }
}

impl Default for SkillsMarketplace {
    fn default() -> Self {
        Self::new()
    }
}

// ── Marketplace metadata sidecar ─────────────────────

/// Persisted alongside an installed skill to record its marketplace origin.
#[derive(Debug, Serialize, Deserialize)]
struct MarketplaceMeta {
    id: String,
    repo_url: String,
    author: String,
    installed_from: String,
}

// ── URL helpers ──────────────────────────────────────

/// Build a raw.githubusercontent.com URL for a file within a skill's repo.
///
/// Parses `repo_url` of the form `https://github.com/{owner}/{repo}` and
/// appends `/main/{skill.path}/{filename}`.
fn skill_raw_url(skill: &MarketplaceSkill, filename: &str) -> Option<String> {
    // Normalize: strip trailing slash.
    let repo = skill.repo_url.trim_end_matches('/');

    // Handle both https://github.com/... and git@github.com:... forms.
    let path_part = if let Some(rest) = repo.strip_prefix("https://github.com/") {
        rest.to_string()
    } else if let Some(rest) = repo.strip_prefix("git@github.com:") {
        rest.trim_end_matches(".git").to_string()
    } else {
        return None;
    };

    // path_part should be "owner/repo"
    let skill_path = skill.path.trim_end_matches('/');
    let file_path = if skill_path.is_empty() {
        filename.to_string()
    } else {
        format!("{skill_path}/{filename}")
    };

    Some(format!(
        "https://raw.githubusercontent.com/{path_part}/main/{file_path}"
    ))
}

// ── Built-in fallback catalog ────────────────────────

/// Return a static list of common skills used when the remote catalog is
/// unreachable.
fn builtin_catalog() -> Vec<MarketplaceSkill> {
    vec![
        MarketplaceSkill {
            id: "skill-creator".into(),
            name: "skill-creator".into(),
            description: "Creates new DevPilot skills by scaffolding SKILL.md files with proper frontmatter and instructions.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/skill-creator".into(),
            stars: 42,
            downloads: 1_240,
            tags: vec!["meta".into(), "scaffold".into(), "skill".into()],
            readme_content: None,
        },
        MarketplaceSkill {
            id: "code-reviewer".into(),
            name: "code-reviewer".into(),
            description: "Performs thorough code reviews focusing on correctness, readability, performance, and security.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/code-reviewer".into(),
            stars: 87,
            downloads: 3_412,
            tags: vec!["review".into(), "quality".into(), "code".into()],
            readme_content: None,
        },
        MarketplaceSkill {
            id: "tdd-guide".into(),
            name: "tdd-guide".into(),
            description: "Guides test-driven development: write failing test, implement, refactor, repeat.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/tdd-guide".into(),
            stars: 35,
            downloads: 980,
            tags: vec!["testing".into(), "tdd".into(), "methodology".into()],
            readme_content: None,
        },
        MarketplaceSkill {
            id: "security-reviewer".into(),
            name: "security-reviewer".into(),
            description: "Scans code for common vulnerability patterns: injection, XSS, auth issues, secrets in code, and more.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/security-reviewer".into(),
            stars: 63,
            downloads: 2_100,
            tags: vec!["security".into(), "audit".into(), "vulnerability".into()],
            readme_content: None,
        },
        MarketplaceSkill {
            id: "refactor-cleaner".into(),
            name: "refactor-cleaner".into(),
            description: "Suggests and applies refactorings to improve code structure: extract functions, reduce duplication, simplify conditionals.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/refactor-cleaner".into(),
            stars: 29,
            downloads: 870,
            tags: vec!["refactor".into(), "clean-code".into(), "quality".into()],
            readme_content: None,
        },
        MarketplaceSkill {
            id: "doc-updater".into(),
            name: "doc-updater".into(),
            description: "Updates documentation (README, API docs, inline comments) to stay in sync with code changes.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/doc-updater".into(),
            stars: 18,
            downloads: 520,
            tags: vec!["docs".into(), "documentation".into(), "maintenance".into()],
            readme_content: None,
        },
        MarketplaceSkill {
            id: "test-runner".into(),
            name: "test-runner".into(),
            description: "Discovers and runs project tests, analyses failures, and suggests fixes.".into(),
            author: "DevPilot".into(),
            repo_url: "https://github.com/devpilot-official/skills".into(),
            path: "skills/test-runner".into(),
            stars: 41,
            downloads: 1_350,
            tags: vec!["testing".into(), "ci".into(), "automation".into()],
            readme_content: None,
        },
    ]
}

// ── Tests ────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builtin_catalog_has_seven_skills() {
        let cat = builtin_catalog();
        assert_eq!(cat.len(), 7);
        let ids: Vec<&str> = cat.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"skill-creator"));
        assert!(ids.contains(&"code-reviewer"));
        assert!(ids.contains(&"tdd-guide"));
        assert!(ids.contains(&"security-reviewer"));
        assert!(ids.contains(&"refactor-cleaner"));
        assert!(ids.contains(&"doc-updater"));
        assert!(ids.contains(&"test-runner"));
    }

    #[test]
    fn test_search_skills_fuzzy() {
        let mp = SkillsMarketplace::new();
        let skills = builtin_catalog();

        let results = mp.search_skills("review", &skills);
        assert!(!results.is_empty());
        // code-reviewer and security-reviewer should both match.
        let names: Vec<&str> = results.iter().map(|s| s.name.as_str()).collect();
        assert!(names.contains(&"code-reviewer"));
        assert!(names.contains(&"security-reviewer"));

        // Single-term tag match.
        let results = mp.search_skills("security", &skills);
        assert!(results.iter().any(|s| s.name == "security-reviewer"));

        // Empty query returns everything.
        let results = mp.search_skills("", &skills);
        assert_eq!(results.len(), skills.len());
    }

    #[test]
    fn test_search_skills_name_boost() {
        let mp = SkillsMarketplace::new();
        let skills = builtin_catalog();

        // "code" appears in code-reviewer name + description and also in
        // refactor-cleaner tags ("clean-code"). Name match should rank higher.
        let results = mp.search_skills("code", &skills);
        assert!(!results.is_empty());
        assert_eq!(results[0].name, "code-reviewer");
    }

    #[test]
    fn test_skill_raw_url() {
        let skill = MarketplaceSkill {
            id: "test".into(),
            name: "test".into(),
            description: String::new(),
            author: String::new(),
            repo_url: "https://github.com/owner/repo".into(),
            path: "skills/test".into(),
            stars: 0,
            downloads: 0,
            tags: vec![],
            readme_content: None,
        };
        let url = skill_raw_url(&skill, "SKILL.md").unwrap();
        assert_eq!(
            url,
            "https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md"
        );
    }

    #[test]
    fn test_skill_raw_url_git_form() {
        let skill = MarketplaceSkill {
            id: "test".into(),
            name: "test".into(),
            description: String::new(),
            author: String::new(),
            repo_url: "git@github.com:owner/repo.git".into(),
            path: "skills/test".into(),
            stars: 0,
            downloads: 0,
            tags: vec![],
            readme_content: None,
        };
        let url = skill_raw_url(&skill, "SKILL.md").unwrap();
        assert_eq!(
            url,
            "https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md"
        );
    }

    #[tokio::test]
    async fn test_uninstall_skill_missing() {
        let dir = tempfile::tempdir().unwrap();
        let mp = SkillsMarketplace::new();
        let result = mp
            .uninstall_skill("nonexistent", dir.path().to_str().unwrap())
            .await;
        assert!(result.is_err());
    }
}
