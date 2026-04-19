//! Daily memory files — creation, listing, and retrieval.
//!
//! Daily entries are stored under `<data_dir>/memory/YYYY-MM-DD.md`.

use std::path::{Path, PathBuf};

use anyhow::Context;
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use tokio::fs;

/// A single daily memory entry backed by a markdown file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyEntry {
    /// ISO date string (`YYYY-MM-DD`).
    pub date: String,
    /// The markdown content of the entry.
    pub content: String,
}

/// High-level operations on daily memory files.
pub struct DailyMemory;

impl DailyMemory {
    /// Create (or append to) a daily memory file.
    ///
    /// The file is stored at `<data_dir>/memory/<date>.md`. If the file
    /// already exists the new `content` is appended separated by a blank line.
    #[tracing::instrument(skip_all)]
    pub async fn create_entry(data_dir: &Path, date: &str, content: &str) -> anyhow::Result<()> {
        // Validate the date format.
        NaiveDate::parse_from_str(date, "%Y-%m-%d")
            .with_context(|| format!("Invalid date format: {date}. Expected YYYY-MM-DD"))?;

        let dir = data_dir.join("memory");
        fs::create_dir_all(&dir)
            .await
            .context("Failed to create memory directory")?;

        let path = dir.join(format!("{date}.md"));

        if path.exists() {
            let existing = fs::read_to_string(&path).await.unwrap_or_default();
            let updated = format!("{existing}\n\n{content}");
            fs::write(&path, updated)
                .await
                .context("Failed to append to daily memory file")?;
        } else {
            fs::write(&path, content)
                .await
                .context("Failed to write daily memory file")?;
        }

        tracing::info!(date, "Created daily memory entry");
        Ok(())
    }

    /// List the most recent daily entries, ordered newest-first.
    ///
    /// `limit` caps the number of entries returned. Pass `0` for unlimited.
    #[tracing::instrument(skip_all)]
    pub async fn list_entries(data_dir: &Path, limit: usize) -> anyhow::Result<Vec<DailyEntry>> {
        let dir = data_dir.join("memory");
        if !dir.is_dir() {
            return Ok(Vec::new());
        }

        let mut entries: Vec<DailyEntry> = Vec::new();
        let mut read_dir = fs::read_dir(&dir)
            .await
            .context("Failed to read memory directory")?;

        while let Some(entry) = read_dir
            .next_entry()
            .await
            .context("Failed to read directory entry")?
        {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("md") {
                continue;
            }

            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_owned();

            // Only include files that match YYYY-MM-DD.
            if NaiveDate::parse_from_str(&stem, "%Y-%m-%d").is_err() {
                continue;
            }

            let content = fs::read_to_string(&path)
                .await
                .unwrap_or_default()
                .trim()
                .to_owned();

            entries.push(DailyEntry {
                date: stem,
                content,
            });
        }

        // Sort newest first.
        entries.sort_by(|a, b| b.date.cmp(&a.date));

        if limit > 0 {
            entries.truncate(limit);
        }

        Ok(entries)
    }

    /// Retrieve a single daily entry by date.
    ///
    /// Returns `None` if no entry exists for that date.
    pub async fn get_entry(data_dir: &Path, date: &str) -> anyhow::Result<Option<DailyEntry>> {
        let path = Self::entry_path(data_dir, date);
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(&path)
            .await
            .context("Failed to read daily memory file")?
            .trim()
            .to_owned();

        Ok(Some(DailyEntry {
            date: date.to_owned(),
            content,
        }))
    }

    /// Return the filesystem path for a given daily entry.
    pub fn entry_path(data_dir: &Path, date: &str) -> PathBuf {
        data_dir.join("memory").join(format!("{date}.md"))
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn create_and_read_entry() {
        let dir = TempDir::new().unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-20", "Hello world")
            .await
            .unwrap();

        let entry = DailyMemory::get_entry(dir.path(), "2026-04-20")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(entry.date, "2026-04-20");
        assert_eq!(entry.content, "Hello world");
    }

    #[tokio::test]
    async fn create_appends_to_existing() {
        let dir = TempDir::new().unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-20", "First")
            .await
            .unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-20", "Second")
            .await
            .unwrap();

        let entry = DailyMemory::get_entry(dir.path(), "2026-04-20")
            .await
            .unwrap()
            .unwrap();
        assert!(entry.content.contains("First"));
        assert!(entry.content.contains("Second"));
    }

    #[tokio::test]
    async fn invalid_date_rejected() {
        let dir = TempDir::new().unwrap();
        let res = DailyMemory::create_entry(dir.path(), "not-a-date", "text").await;
        assert!(res.is_err());
    }

    #[tokio::test]
    async fn list_entries_sorted_newest_first() {
        let dir = TempDir::new().unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-18", "Day 1")
            .await
            .unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-20", "Day 3")
            .await
            .unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-19", "Day 2")
            .await
            .unwrap();

        let entries = DailyMemory::list_entries(dir.path(), 0).await.unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].date, "2026-04-20");
        assert_eq!(entries[1].date, "2026-04-19");
        assert_eq!(entries[2].date, "2026-04-18");
    }

    #[tokio::test]
    async fn list_entries_with_limit() {
        let dir = TempDir::new().unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-18", "A")
            .await
            .unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-19", "B")
            .await
            .unwrap();
        DailyMemory::create_entry(dir.path(), "2026-04-20", "C")
            .await
            .unwrap();

        let entries = DailyMemory::list_entries(dir.path(), 2).await.unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].date, "2026-04-20");
    }

    #[tokio::test]
    async fn list_empty_dir() {
        let dir = TempDir::new().unwrap();
        let entries = DailyMemory::list_entries(dir.path(), 0).await.unwrap();
        assert!(entries.is_empty());
    }

    #[tokio::test]
    async fn list_ignores_non_date_files() {
        let dir = TempDir::new().unwrap();
        let mem_dir = dir.path().join("memory");
        fs::create_dir_all(&mem_dir).await.unwrap();
        fs::write(mem_dir.join("notes.md"), "random").await.unwrap();

        let entries = DailyMemory::list_entries(dir.path(), 0).await.unwrap();
        assert!(entries.is_empty());
    }

    #[tokio::test]
    async fn get_nonexistent_entry() {
        let dir = TempDir::new().unwrap();
        let result = DailyMemory::get_entry(dir.path(), "2026-01-01")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn entry_path_format() {
        let path = DailyMemory::entry_path(Path::new("/data"), "2026-04-20");
        assert_eq!(path, PathBuf::from("/data/memory/2026-04-20.md"));
    }
}
