//! Persona file management — loading and saving SOUL.md, USER.md, MEMORY.md,
//! AGENTS.md from a workspace root directory.

use std::path::Path;

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tokio::fs;

/// The four persona files that live at the root of a workspace.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PersonaFiles {
    /// `SOUL.md` — describes the AI assistant's personality / behaviour.
    pub soul_md: Option<String>,
    /// `USER.md` — describes the current user and their preferences.
    pub user_md: Option<String>,
    /// `MEMORY.md` — long-term notes the assistant keeps across sessions.
    pub memory_md: Option<String>,
    /// `AGENTS.md` — describes other agents or team members.
    pub agents_md: Option<String>,
}

/// Well-known persona filenames looked up in the workspace root.
const PERSONA_FILENAMES: &[&str] = &["SOUL.md", "USER.md", "MEMORY.md", "AGENTS.md"];

impl PersonaFiles {
    /// Load all four persona files from `workspace_dir`.
    ///
    /// Missing files are silently recorded as `None`.
    #[tracing::instrument(skip_all)]
    pub async fn load(workspace_dir: &Path) -> anyhow::Result<Self> {
        let soul_md = read_optional(workspace_dir, "SOUL.md").await?;
        let user_md = read_optional(workspace_dir, "USER.md").await?;
        let memory_md = read_optional(workspace_dir, "MEMORY.md").await?;
        let agents_md = read_optional(workspace_dir, "AGENTS.md").await?;

        tracing::debug!(
            soul = soul_md.is_some(),
            user = user_md.is_some(),
            memory = memory_md.is_some(),
            agents = agents_md.is_some(),
            "Loaded persona files"
        );

        Ok(Self {
            soul_md,
            user_md,
            memory_md,
            agents_md,
        })
    }

    /// Save all non-empty persona files back to `workspace_dir`.
    #[tracing::instrument(skip_all)]
    pub async fn save(&self, workspace_dir: &Path) -> anyhow::Result<()> {
        fs::create_dir_all(workspace_dir)
            .await
            .context("Failed to create workspace directory")?;

        save_optional(workspace_dir, "SOUL.md", self.soul_md.as_deref()).await?;
        save_optional(workspace_dir, "USER.md", self.user_md.as_deref()).await?;
        save_optional(workspace_dir, "MEMORY.md", self.memory_md.as_deref()).await?;
        save_optional(workspace_dir, "AGENTS.md", self.agents_md.as_deref()).await?;

        tracing::debug!("Saved persona files");
        Ok(())
    }

    /// Return a list of filenames (within the workspace root) that exist on
    /// disk. Useful for quick discovery without reading full contents.
    pub async fn discover(workspace_dir: &Path) -> anyhow::Result<Vec<String>> {
        let mut found = Vec::with_capacity(PERSONA_FILENAMES.len());
        for name in PERSONA_FILENAMES {
            if workspace_dir.join(name).is_file() {
                found.push((*name).to_owned());
            }
        }
        Ok(found)
    }

    /// Returns `true` if every field is `None`.
    pub fn is_empty(&self) -> bool {
        self.soul_md.is_none()
            && self.user_md.is_none()
            && self.memory_md.is_none()
            && self.agents_md.is_none()
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Read a file to a `String`, returning `None` if the file does not exist.
async fn read_optional(dir: &Path, filename: &str) -> anyhow::Result<Option<String>> {
    let path = dir.join(filename);
    match fs::read_to_string(&path).await {
        Ok(content) => {
            let trimmed = content.trim().to_owned();
            if trimmed.is_empty() {
                Ok(None)
            } else {
                Ok(Some(trimmed))
            }
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e).with_context(|| format!("Failed to read {filename}")),
    }
}

/// Write `content` to `dir/filename`. If `content` is `None` or empty, the
/// file is deleted (if it existed).
async fn save_optional(dir: &Path, filename: &str, content: Option<&str>) -> anyhow::Result<()> {
    let path = dir.join(filename);
    match content {
        Some(c) if !c.is_empty() => {
            fs::write(&path, c)
                .await
                .with_context(|| format!("Failed to write {filename}"))?;
        }
        _ => {
            // Best-effort removal — ignore NotFound.
            let _ = fs::remove_file(&path).await;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn load_empty_dir() {
        let dir = TempDir::new().unwrap();
        let pf = PersonaFiles::load(dir.path()).await.unwrap();
        assert!(pf.is_empty());
    }

    #[tokio::test]
    async fn load_with_files() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("SOUL.md"), "I am a helpful assistant.")
            .await
            .unwrap();
        fs::write(dir.path().join("USER.md"), "Alice prefers concise answers.")
            .await
            .unwrap();

        let pf = PersonaFiles::load(dir.path()).await.unwrap();
        assert_eq!(pf.soul_md.as_deref(), Some("I am a helpful assistant."));
        assert_eq!(
            pf.user_md.as_deref(),
            Some("Alice prefers concise answers.")
        );
        assert!(pf.memory_md.is_none());
        assert!(pf.agents_md.is_none());
        assert!(!pf.is_empty());
    }

    #[tokio::test]
    async fn load_trims_whitespace() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("MEMORY.md"), "  padded  \n")
            .await
            .unwrap();

        let pf = PersonaFiles::load(dir.path()).await.unwrap();
        assert_eq!(pf.memory_md.as_deref(), Some("padded"));
    }

    #[tokio::test]
    async fn load_empty_file_treated_as_none() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("SOUL.md"), "").await.unwrap();

        let pf = PersonaFiles::load(dir.path()).await.unwrap();
        assert!(pf.soul_md.is_none());
    }

    #[tokio::test]
    async fn save_and_reload() {
        let dir = TempDir::new().unwrap();
        let pf = PersonaFiles {
            soul_md: Some("soul content".into()),
            user_md: None,
            memory_md: Some("memory content".into()),
            agents_md: None,
        };
        pf.save(dir.path()).await.unwrap();

        let loaded = PersonaFiles::load(dir.path()).await.unwrap();
        assert_eq!(loaded.soul_md.as_deref(), Some("soul content"));
        assert_eq!(loaded.memory_md.as_deref(), Some("memory content"));
        assert!(loaded.user_md.is_none());
        assert!(loaded.agents_md.is_none());
    }

    #[tokio::test]
    async fn save_clears_file_when_none() {
        let dir = TempDir::new().unwrap();
        // Pre-create file
        fs::write(dir.path().join("SOUL.md"), "old content")
            .await
            .unwrap();

        let pf = PersonaFiles {
            soul_md: None,
            ..Default::default()
        };
        pf.save(dir.path()).await.unwrap();

        assert!(!dir.path().join("SOUL.md").exists());
    }

    #[tokio::test]
    async fn discover_finds_existing_files() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("SOUL.md"), "x").await.unwrap();
        fs::write(dir.path().join("AGENTS.md"), "y").await.unwrap();

        let found = PersonaFiles::discover(dir.path()).await.unwrap();
        assert_eq!(found, vec!["SOUL.md", "AGENTS.md"]);
    }

    #[tokio::test]
    async fn discover_empty_dir() {
        let dir = TempDir::new().unwrap();
        let found = PersonaFiles::discover(dir.path()).await.unwrap();
        assert!(found.is_empty());
    }

    #[tokio::test]
    async fn roundtrip_all_fields() {
        let dir = TempDir::new().unwrap();
        let pf = PersonaFiles {
            soul_md: Some("s".into()),
            user_md: Some("u".into()),
            memory_md: Some("m".into()),
            agents_md: Some("a".into()),
        };
        pf.save(dir.path()).await.unwrap();
        let loaded = PersonaFiles::load(dir.path()).await.unwrap();
        assert_eq!(loaded.soul_md.as_deref(), Some("s"));
        assert_eq!(loaded.user_md.as_deref(), Some("u"));
        assert_eq!(loaded.memory_md.as_deref(), Some("m"));
        assert_eq!(loaded.agents_md.as_deref(), Some("a"));
    }
}
