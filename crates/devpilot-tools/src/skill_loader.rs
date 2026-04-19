//! Skill loader — manages skills stored as markdown files with YAML frontmatter.
//!
//! Skills live at `~/.devpilot/skills/{skill-name}/SKILL.md`. Each file has an
//! optional YAML frontmatter block delimited by `---` and a markdown body with
//! the skill instructions.

use std::path::PathBuf;

use chrono::Utc;
use devpilot_protocol::SkillInfo;
use serde::Deserialize;
use tokio::fs;
use tracing::{debug, warn};

// ── Frontmatter schema ────────────────────────────────

/// YAML frontmatter fields extracted from a SKILL.md file.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(default)]
struct SkillFrontmatter {
    name: Option<String>,
    description: Option<String>,
    version: Option<String>,
    author: Option<String>,
    category: Option<String>,
    tags: Vec<String>,
    trigger: Option<String>,
}

// ── Skill loader ──────────────────────────────────────

/// Manages loading, listing, installing, and uninstalling skills from
/// the `~/.devpilot/skills/` directory.
#[derive(Debug, Clone, Default)]
pub struct SkillLoader {
    skills_dir: PathBuf,
}

impl SkillLoader {
    /// Create a new `SkillLoader` that reads from `~/.devpilot/skills/`.
    pub fn new() -> Self {
        let skills_dir = dirs::home_dir()
            .expect("could not determine home directory")
            .join(".devpilot")
            .join("skills");
        Self { skills_dir }
    }

    /// Create a `SkillLoader` pointing at an arbitrary directory (useful for
    /// tests).
    pub fn with_dir(dir: PathBuf) -> Self {
        Self { skills_dir: dir }
    }

    /// Ensure the skills directory exists, creating it (and parents) if
    /// necessary.
    async fn ensure_dir(&self) -> Result<(), SkillLoaderError> {
        fs::create_dir_all(&self.skills_dir)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;
        Ok(())
    }

    /// Return the path to a skill's directory.
    fn skill_dir(&self, name: &str) -> PathBuf {
        self.skills_dir.join(name)
    }

    /// Return the path to a skill's SKILL.md file.
    fn skill_file(&self, name: &str) -> PathBuf {
        self.skill_dir(name).join("SKILL.md")
    }

    // ── Core operations ────────────────────────────────

    /// Load a single skill by name.
    pub async fn load_skill(&self, name: &str) -> Result<SkillInfo, SkillLoaderError> {
        let path = self.skill_file(name);
        let raw = fs::read_to_string(&path)
            .await
            .map_err(|e| SkillLoaderError::NotFound(format!("skill '{name}': {e}")))?;
        let mut skill = parse_skill_md(name, &raw)?;
        // Read persisted enabled/state metadata from a sidecar .state file.
        let state_path = self.skill_dir(name).join(".state");
        if let Ok(state_raw) = fs::read_to_string(&state_path).await
            && let Ok(state) = serde_json::from_str::<SkillStateFile>(&state_raw)
        {
            skill.enabled = state.enabled;
            skill.installed_at = state.installed_at;
            skill.updated_at = state.updated_at;
        }
        Ok(skill)
    }

    /// List all installed skills.
    pub async fn list_skills(&self) -> Result<Vec<SkillInfo>, SkillLoaderError> {
        self.ensure_dir().await?;
        let mut entries = fs::read_dir(&self.skills_dir)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;
        let mut skills = Vec::new();
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?
        {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let md_path = path.join("SKILL.md");
            if !md_path.exists() {
                debug!("skipping directory without SKILL.md: {}", path.display());
                continue;
            }
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            match self.load_skill(&name).await {
                Ok(skill) => skills.push(skill),
                Err(e) => warn!("failed to load skill '{name}': {e}"),
            }
        }
        skills.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(skills)
    }

    /// Install (or overwrite) a skill by writing its SKILL.md content.
    ///
    /// `content` should be the full file content including frontmatter and
    /// markdown body.
    pub async fn install_skill(&self, name: &str, content: &str) -> Result<(), SkillLoaderError> {
        self.ensure_dir().await?;
        let dir = self.skill_dir(name);
        fs::create_dir_all(&dir)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;

        // Write the SKILL.md
        fs::write(self.skill_file(name), content)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;

        // Write or update the state file.
        let state_path = dir.join(".state");
        let now = Utc::now().to_rfc3339();
        let mut state = if let Ok(existing) = fs::read_to_string(&state_path).await {
            serde_json::from_str::<SkillStateFile>(&existing).unwrap_or_default()
        } else {
            SkillStateFile {
                enabled: true,
                installed_at: Some(now.clone()),
                updated_at: None,
            }
        };
        state.updated_at = Some(now);
        let state_json = serde_json::to_string_pretty(&state)
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;
        fs::write(state_path, state_json)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;

        Ok(())
    }

    /// Uninstall a skill by removing its directory.
    pub async fn uninstall_skill(&self, name: &str) -> Result<(), SkillLoaderError> {
        let dir = self.skill_dir(name);
        if !dir.exists() {
            return Err(SkillLoaderError::NotFound(format!(
                "skill '{name}' not found"
            )));
        }
        fs::remove_dir_all(&dir)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;
        Ok(())
    }

    /// Enable or disable a skill by updating its `.state` file.
    pub async fn toggle_skill(&self, name: &str, enabled: bool) -> Result<(), SkillLoaderError> {
        let dir = self.skill_dir(name);
        if !dir.exists() {
            return Err(SkillLoaderError::NotFound(format!(
                "skill '{name}' not found"
            )));
        }
        let state_path = dir.join(".state");
        let mut state = if let Ok(raw) = fs::read_to_string(&state_path).await {
            serde_json::from_str::<SkillStateFile>(&raw).unwrap_or_default()
        } else {
            let now = Utc::now().to_rfc3339();
            SkillStateFile {
                enabled: true,
                installed_at: Some(now),
                updated_at: None,
            }
        };
        state.enabled = enabled;
        let json = serde_json::to_string_pretty(&state)
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;
        fs::write(state_path, json)
            .await
            .map_err(|e| SkillLoaderError::Io(e.to_string()))?;
        Ok(())
    }

    /// Search installed skills by matching the query against name,
    /// description, tags, and category (case-insensitive).
    pub async fn search_skills(&self, query: &str) -> Result<Vec<SkillInfo>, SkillLoaderError> {
        let all = self.list_skills().await?;
        let q = query.to_lowercase();
        let results: Vec<SkillInfo> = all
            .into_iter()
            .filter(|s| {
                let haystack = format!(
                    "{} {} {} {} {}",
                    s.name,
                    s.description,
                    s.category.as_deref().unwrap_or(""),
                    s.trigger.as_deref().unwrap_or(""),
                    s.tags.join(" ")
                )
                .to_lowercase();
                haystack.contains(&q)
            })
            .collect();
        Ok(results)
    }

    /// Build a formatted prompt section from a list of active skills.
    ///
    /// This is designed to be injected into the system prompt so the LLM knows
    /// which skills are available and when to use them.
    pub fn build_skill_context(skills: &[SkillInfo]) -> String {
        if skills.is_empty() {
            return String::new();
        }

        let mut parts = vec![
            "# Active Skills\n".to_string(),
            "The following skills are currently active and should be applied when relevant:\n"
                .to_string(),
        ];

        for skill in skills {
            parts.push(format!("## {}\n", skill.name));
            if !skill.description.is_empty() {
                parts.push(format!("**Description:** {}\n\n", skill.description));
            }
            if let Some(ref trigger) = skill.trigger
                && !trigger.is_empty()
            {
                parts.push(format!("**When to use:** {trigger}\n\n"));
            }
            parts.push(format!("{}\n", skill.content.trim()));
            parts.push("\n---\n\n".to_string());
        }

        parts.join("")
    }
}

// ── Parsing helpers ───────────────────────────────────

/// Internal state persisted alongside each skill.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillStateFile {
    enabled: bool,
    installed_at: Option<String>,
    updated_at: Option<String>,
}

impl Default for SkillStateFile {
    fn default() -> Self {
        Self {
            enabled: true,
            installed_at: None,
            updated_at: None,
        }
    }
}

/// Parse a SKILL.md string into a [`SkillInfo`].
///
/// Expected format:
/// ```markdown
/// ---
/// name: my-skill
/// description: Does something useful
/// tags: [foo, bar]
/// ---
/// # Instructions go here
/// ```
fn parse_skill_md(name: &str, raw: &str) -> Result<SkillInfo, SkillLoaderError> {
    let trimmed = raw.trim_start();

    // Extract frontmatter if present.
    let (fm, body) = if let Some(rest) = trimmed.strip_prefix("---") {
        // Find the closing ---.
        if let Some(end) = rest.find("---") {
            let fm_str = &rest[..end];
            let body_str = &rest[end + 3..];
            (Some(fm_str.to_string()), body_str.trim_start().to_string())
        } else {
            (None, rest.trim_start().to_string())
        }
    } else {
        (None, raw.to_string())
    };

    let frontmatter: SkillFrontmatter = match fm {
        Some(ref s) if !s.trim().is_empty() => serde_yaml::from_str(s).map_err(|e| {
            SkillLoaderError::Parse(format!("invalid frontmatter in skill '{name}': {e}"))
        })?,
        _ => SkillFrontmatter::default(),
    };

    Ok(SkillInfo {
        name: frontmatter.name.unwrap_or_else(|| name.to_string()),
        description: frontmatter.description.unwrap_or_default(),
        version: frontmatter.version,
        author: frontmatter.author,
        category: frontmatter.category,
        tags: frontmatter.tags,
        trigger: frontmatter.trigger,
        content: body,
        enabled: true,
        installed_at: None,
        updated_at: None,
    })
}

// ── Error type ────────────────────────────────────────

/// Errors that can occur when loading/managing skills.
#[derive(Debug, thiserror::Error)]
pub enum SkillLoaderError {
    /// The skill was not found.
    #[error("not found: {0}")]
    NotFound(String),
    /// YAML frontmatter parse error.
    #[error("parse error: {0}")]
    Parse(String),
    /// I/O or serialization error.
    #[error("I/O error: {0}")]
    Io(String),
}

// ── Tests ──────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: create a temp dir, return (SkillLoader, temp_dir_path).
    /// The temp_dir_path must be kept alive for the duration of the test.
    fn temp_loader() -> (SkillLoader, tempfile::TempDir) {
        let dir = tempfile::tempdir().expect("create temp dir");
        let loader = SkillLoader::with_dir(dir.path().to_path_buf());
        (loader, dir)
    }

    #[tokio::test]
    async fn test_parse_skill_with_frontmatter() {
        let raw = "\
---
name: code-review
description: Expert code review
version: 1.0.0
author: DevPilot
category: development
tags: [code-review, quality]
trigger: when user asks for code review
---

# Code Review

You are an expert code reviewer.
";
        let info = parse_skill_md("code-review", raw).unwrap();
        assert_eq!(info.name, "code-review");
        assert_eq!(info.description, "Expert code review");
        assert_eq!(info.version.as_deref(), Some("1.0.0"));
        assert_eq!(info.author.as_deref(), Some("DevPilot"));
        assert_eq!(info.category.as_deref(), Some("development"));
        assert_eq!(info.tags, vec!["code-review", "quality"]);
        assert_eq!(
            info.trigger.as_deref(),
            Some("when user asks for code review")
        );
        assert!(info.content.contains("expert code reviewer"));
        assert!(info.enabled);
    }

    #[tokio::test]
    async fn test_parse_skill_without_frontmatter() {
        let raw = "# Plain Skill\n\nNo frontmatter here.";
        let info = parse_skill_md("plain", raw).unwrap();
        assert_eq!(info.name, "plain");
        assert_eq!(info.description, "");
        assert!(info.version.is_none());
        assert!(info.content.contains("No frontmatter here."));
    }

    #[tokio::test]
    async fn test_install_and_load() {
        let (loader, _dir) = temp_loader();
        let content = "\
---
name: test-skill
description: A test skill
tags: [test]
---

# Test

Hello from the test skill.
";
        loader.install_skill("test-skill", content).await.unwrap();

        let skill = loader.load_skill("test-skill").await.unwrap();
        assert_eq!(skill.name, "test-skill");
        assert_eq!(skill.description, "A test skill");
        assert!(skill.content.contains("Hello from the test skill"));
        assert!(skill.installed_at.is_some());
    }

    #[tokio::test]
    async fn test_list_skills() {
        let (loader, _dir) = temp_loader();

        loader
            .install_skill(
                "alpha",
                "---\nname: alpha\ndescription: First\n---\n# Alpha",
            )
            .await
            .unwrap();
        loader
            .install_skill("beta", "---\nname: beta\ndescription: Second\n---\n# Beta")
            .await
            .unwrap();

        let skills = loader.list_skills().await.unwrap();
        assert_eq!(skills.len(), 2);
        // Sorted by name
        assert_eq!(skills[0].name, "alpha");
        assert_eq!(skills[1].name, "beta");
    }

    #[tokio::test]
    async fn test_uninstall_skill() {
        let (loader, _dir) = temp_loader();
        loader
            .install_skill("temp", "---\n---\n# Temp")
            .await
            .unwrap();
        assert!(loader.load_skill("temp").await.is_ok());
        loader.uninstall_skill("temp").await.unwrap();
        assert!(loader.load_skill("temp").await.is_err());
    }

    #[tokio::test]
    async fn test_toggle_skill() {
        let (loader, _dir) = temp_loader();
        loader
            .install_skill("toggle-me", "---\n---\n# Toggle")
            .await
            .unwrap();

        loader.toggle_skill("toggle-me", false).await.unwrap();
        let skill = loader.load_skill("toggle-me").await.unwrap();
        assert!(!skill.enabled);

        loader.toggle_skill("toggle-me", true).await.unwrap();
        let skill = loader.load_skill("toggle-me").await.unwrap();
        assert!(skill.enabled);
    }

    #[tokio::test]
    async fn test_search_skills() {
        let (loader, _dir) = temp_loader();
        loader
            .install_skill(
                "code-review",
                "---\nname: code-review\ndescription: Reviews code quality\ntags: [review]\n---\n# Review",
            )
            .await
            .unwrap();
        loader
            .install_skill(
                "unit-test",
                "---\nname: unit-test\ndescription: Generates unit tests\ntags: [testing]\n---\n# Test",
            )
            .await
            .unwrap();
        loader
            .install_skill(
                "docs-writer",
                "---\nname: docs-writer\ndescription: Writes documentation\ncategory: writing\n---\n# Docs",
            )
            .await
            .unwrap();

        let results = loader.search_skills("test").await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "unit-test");

        // "docs" matches docs-writer's description and name
        let results = loader.search_skills("docs").await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "docs-writer");

        let results = loader.search_skills("review").await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].name, "code-review");
    }

    #[test]
    fn test_build_skill_context() {
        let skills = vec![
            SkillInfo {
                name: "code-review".into(),
                description: "Expert code review".into(),
                version: None,
                author: None,
                category: None,
                tags: vec![],
                trigger: Some("when user asks for code review".into()),
                content: "# Code Review\nYou review code.".into(),
                enabled: true,
                installed_at: None,
                updated_at: None,
            },
            SkillInfo {
                name: "refactor".into(),
                description: "Refactoring assistant".into(),
                version: None,
                author: None,
                category: None,
                tags: vec![],
                trigger: None,
                content: "# Refactor\nSuggest improvements.".into(),
                enabled: true,
                installed_at: None,
                updated_at: None,
            },
        ];
        let ctx = SkillLoader::build_skill_context(&skills);
        assert!(ctx.contains("# Active Skills"));
        assert!(ctx.contains("## code-review"));
        assert!(ctx.contains("## refactor"));
        assert!(ctx.contains("when user asks for code review"));
        assert!(ctx.contains("Suggest improvements."));
    }

    #[test]
    fn test_build_skill_context_empty() {
        let ctx = SkillLoader::build_skill_context(&[]);
        assert!(ctx.is_empty());
    }
}
