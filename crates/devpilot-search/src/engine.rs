//! Search engine — main entry point.

use crate::content;
use crate::error::{SearchError, SearchResult};
use crate::fuzzy;
use crate::query::{SearchMatch, SearchMode, SearchQuery};
use regex::Regex;
use std::path::Path;
use walkdir::WalkDir;

/// File search engine.
///
/// Stateless — cheap to create. All configuration is per-query.
pub struct SearchEngine {
    /// Maximum directory depth to traverse.
    pub max_depth: usize,
    /// Number of files to process concurrently (content mode).
    pub concurrency: usize,
}

impl Default for SearchEngine {
    fn default() -> Self {
        Self {
            max_depth: 20,
            concurrency: 32,
        }
    }
}

impl SearchEngine {
    /// Create a new search engine with default settings.
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the maximum directory depth.
    pub fn with_max_depth(mut self, depth: usize) -> Self {
        self.max_depth = depth;
        self
    }

    /// Execute a search query.
    pub async fn search(&self, query: SearchQuery) -> SearchResult<Vec<SearchMatch>> {
        let root = Path::new(&query.path);
        if !root.exists() {
            return Err(SearchError::PathNotFound(query.path.clone()));
        }

        match query.mode {
            SearchMode::Files => self.search_files(&query).await,
            SearchMode::Content => self.search_content(&query).await,
        }
    }

    /// Fuzzy filename search.
    async fn search_files(&self, query: &SearchQuery) -> SearchResult<Vec<SearchMatch>> {
        let glob_re = query.file_glob.as_deref().map(glob_to_regex).transpose()?;

        let mut results: Vec<SearchMatch> = WalkDir::new(&query.path)
            .max_depth(self.max_depth)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|e| {
                let path_str = e.path().to_string_lossy().to_string();
                let file_name = e.file_name().to_string_lossy();

                // Apply glob filter
                if let Some(ref re) = glob_re
                    && !re.is_match(&file_name)
                {
                    return None;
                }

                // Fuzzy match
                let score = fuzzy::fuzzy_match(&query.pattern, &file_name)?;
                Some(SearchMatch {
                    path: path_str,
                    line_number: None,
                    line_text: None,
                    score: Some(score),
                })
            })
            .collect();

        // Sort by score descending
        results.sort_by(|a, b| {
            b.score
                .partial_cmp(&a.score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        results.truncate(query.max_results);
        Ok(results)
    }

    /// Regex content search.
    async fn search_content(&self, query: &SearchQuery) -> SearchResult<Vec<SearchMatch>> {
        let re =
            Regex::new(&query.pattern).map_err(|e| SearchError::InvalidPattern(e.to_string()))?;

        let glob_re = query.file_glob.as_deref().map(glob_to_regex).transpose()?;

        let files: Vec<(std::path::PathBuf, String)> = WalkDir::new(&query.path)
            .max_depth(self.max_depth)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter(|e| {
                let name = e.file_name().to_string_lossy();
                if let Some(ref re) = glob_re {
                    re.is_match(&name)
                } else {
                    true
                }
            })
            .map(|e| {
                let path = e.into_path();
                let display = path.to_string_lossy().to_string();
                (path, display)
            })
            .collect();

        // Search files concurrently with a semaphore
        let semaphore = std::sync::Arc::new(tokio::sync::Semaphore::new(self.concurrency));
        let remaining = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(query.max_results));
        let re = std::sync::Arc::new(re);

        let mut handles = Vec::new();

        for (path, display) in files {
            let sem = semaphore.clone();
            let rem = remaining.clone();
            let re = re.clone();
            let max_per_file = query.max_results;

            handles.push(tokio::spawn(async move {
                let _permit = sem.acquire().await.unwrap();
                if rem.load(std::sync::atomic::Ordering::Relaxed) == 0 {
                    return Vec::<SearchMatch>::new();
                }
                let results = content::search_file(&path, &display, &re, max_per_file)
                    .await
                    .unwrap_or_default();
                rem.fetch_sub(results.len(), std::sync::atomic::Ordering::Relaxed);
                results
            }));
        }

        let mut all_matches = Vec::new();
        for handle in handles {
            let matches = handle.await.unwrap_or_default();
            all_matches.extend(matches);
        }

        // Sort by path, then line number
        all_matches.sort_by(|a, b| {
            a.path
                .cmp(&b.path)
                .then_with(|| a.line_number.cmp(&b.line_number))
        });

        all_matches.truncate(query.max_results);
        Ok(all_matches)
    }
}

/// Convert a simple glob pattern (e.g. `*.rs`) to a regex.
fn glob_to_regex(glob: &str) -> SearchResult<Regex> {
    let mut regex_str = String::from("^");
    for ch in glob.chars() {
        match ch {
            '*' => regex_str.push_str(".*"),
            '?' => regex_str.push('.'),
            '.' => regex_str.push_str("\\."),
            '+' | '(' | ')' | '[' | ']' | '{' | '}' | '^' | '$' | '|' | '\\' => {
                regex_str.push('\\');
                regex_str.push(ch);
            }
            _ => regex_str.push(ch),
        }
    }
    regex_str.push('$');
    Regex::new(&regex_str).map_err(|e| SearchError::InvalidPattern(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn glob_to_regex_star() {
        let re = glob_to_regex("*.rs").unwrap();
        assert!(re.is_match("main.rs"));
        assert!(re.is_match("lib.rs"));
        assert!(!re.is_match("main.ts"));
    }

    #[test]
    fn glob_to_regex_complex() {
        let re = glob_to_regex("test_*.txt").unwrap();
        assert!(re.is_match("test_foo.txt"));
        assert!(!re.is_match("foo_test.txt"));
    }

    fn search_root() -> String {
        let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        // manifest = workspace/crates/devpilot-search → parent = workspace/crates → parent = workspace
        std::path::PathBuf::from(manifest)
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_string_lossy()
            .to_string()
    }

    #[tokio::test]
    async fn search_files_fuzzy() {
        let engine = SearchEngine::new();
        let results = engine
            .search(SearchQuery {
                pattern: "lib".into(),
                path: format!("{}/crates/devpilot-search", search_root()),
                mode: SearchMode::Files,
                max_results: 10,
                file_glob: Some("*.rs".into()),
            })
            .await
            .unwrap();

        assert!(!results.is_empty());
        assert!(results.iter().any(|m| m.path.contains("lib.rs")));
    }

    #[tokio::test]
    async fn search_content_regex() {
        let engine = SearchEngine::new();
        let results = engine
            .search(SearchQuery {
                pattern: "pub fn".into(),
                path: format!("{}/crates/devpilot-search/src", search_root()),
                mode: SearchMode::Content,
                max_results: 20,
                file_glob: Some("*.rs".into()),
            })
            .await
            .unwrap();

        assert!(!results.is_empty());
        // All results should have line numbers
        assert!(results.iter().all(|m| m.line_number.is_some()));
    }

    #[tokio::test]
    async fn search_nonexistent_path() {
        let engine = SearchEngine::new();
        let result = engine
            .search(SearchQuery {
                pattern: "test".into(),
                path: "/nonexistent/path/xyz".into(),
                mode: SearchMode::Files,
                max_results: 10,
                file_glob: None,
            })
            .await;

        assert!(result.is_err());
    }
}
