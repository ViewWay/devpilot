//! Content search — regex-based line matching.

use crate::error::SearchError;
use crate::query::SearchMatch;
use regex::Regex;
use std::path::Path;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Search a single file's contents for lines matching the regex.
/// Returns matches sorted by line number.
pub async fn search_file(
    path: &Path,
    display_path: &str,
    re: &Regex,
    max_matches: usize,
) -> Result<Vec<SearchMatch>, SearchError> {
    let file = match tokio::fs::File::open(path).await {
        Ok(f) => f,
        Err(e) => {
            // Skip files we can't read (binary, permissions, etc.)
            tracing::debug!("skipping {}: {e}", display_path);
            return Ok(vec![]);
        }
    };

    let reader = BufReader::new(file);
    let mut lines = reader.lines();
    let mut matches = Vec::new();
    let mut line_num = 0usize;

    while let Ok(Some(line)) = lines.next_line().await {
        line_num += 1;
        if re.is_match(&line) {
            matches.push(SearchMatch {
                path: display_path.to_string(),
                line_number: Some(line_num),
                line_text: Some(line),
                score: None,
            });
            if matches.len() >= max_matches {
                break;
            }
        }
    }

    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn make_file(content: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        write!(f, "{content}").unwrap();
        f.flush().unwrap();
        f
    }

    #[tokio::test]
    async fn search_finds_matching_lines() {
        let f = make_file("line 1\nfn main() {}\nline 3\n");
        let re = Regex::new("fn main").unwrap();
        let results = search_file(f.path(), "test.rs", &re, 100).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].line_number, Some(2));
        assert_eq!(results[0].path, "test.rs");
    }

    #[tokio::test]
    async fn search_respects_max_matches() {
        let f = make_file("aaa\nbbb\naaa\nbbb\naaa\n");
        let re = Regex::new("aaa").unwrap();
        let results = search_file(f.path(), "test.txt", &re, 2).await.unwrap();
        assert_eq!(results.len(), 2);
    }

    #[tokio::test]
    async fn search_no_match() {
        let f = make_file("hello\nworld\n");
        let re = Regex::new("xyz").unwrap();
        let results = search_file(f.path(), "test.txt", &re, 100).await.unwrap();
        assert!(results.is_empty());
    }
}
