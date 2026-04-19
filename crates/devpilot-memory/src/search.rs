//! Simple text search across persona files and daily memory entries.

use crate::PersonaFiles;
use crate::daily::DailyEntry;

/// A single search match.
#[derive(Debug, Clone)]
pub struct MemorySearchHit {
    /// Which source the match came from, e.g. `"SOUL.md"` or `"2026-04-20"`.
    pub source: String,
    /// A short snippet around the first match (up to 200 chars).
    pub snippet: String,
}

/// Search persona files and daily memory entries for a query string (case-insensitive).
///
/// Returns hits in no guaranteed order. The search is intentionally simple —
/// just case-insensitive substring matching.
pub fn search_memory(
    persona: &PersonaFiles,
    daily_entries: &[DailyEntry],
    query: &str,
) -> Vec<MemorySearchHit> {
    let query_lower = query.to_lowercase();
    let mut hits = Vec::new();

    // Search persona files.
    let persona_sources = [
        ("SOUL.md", &persona.soul_md),
        ("USER.md", &persona.user_md),
        ("MEMORY.md", &persona.memory_md),
        ("AGENTS.md", &persona.agents_md),
    ];

    for (name, content_opt) in &persona_sources {
        if let Some(content) = content_opt
            && content.to_lowercase().contains(&query_lower)
        {
            hits.push(MemorySearchHit {
                source: (*name).to_owned(),
                snippet: snippet(content, &query_lower),
            });
        }
    }

    // Search daily entries.
    for entry in daily_entries {
        if entry.content.to_lowercase().contains(&query_lower) {
            hits.push(MemorySearchHit {
                source: entry.date.clone(),
                snippet: snippet(&entry.content, &query_lower),
            });
        }
    }

    hits
}

/// Extract a short snippet around the first occurrence of `query_lower` in
/// `content`. The `content` is expected to be the original (mixed-case) text,
/// while `query_lower` is the already-lowered search term.
fn snippet(content: &str, query_lower: &str) -> String {
    let content_lower = content.to_lowercase();
    let start = match content_lower.find(query_lower) {
        Some(i) => i,
        None => return String::new(),
    };

    let context_chars = 60;
    let snippet_start = start.saturating_sub(context_chars);
    let snippet_end = (start + query_lower.len() + context_chars).min(content.len());

    let mut s = String::with_capacity(snippet_end - snippet_start + 6);
    if snippet_start > 0 {
        s.push_str("...");
    }
    s.push_str(&content[snippet_start..snippet_end]);
    if snippet_end < content.len() {
        s.push_str("...");
    }

    // Cap at 200 chars.
    if s.len() > 200 {
        s.truncate(197);
        s.push_str("...");
    }

    s
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_persona() -> PersonaFiles {
        PersonaFiles {
            soul_md: Some("I am a helpful Rust assistant.".into()),
            user_md: Some("Alice likes functional programming.".into()),
            memory_md: Some("Project uses Tauri 2 and React.".into()),
            agents_md: None,
        }
    }

    fn sample_daily() -> Vec<DailyEntry> {
        vec![
            DailyEntry {
                date: "2026-04-19".into(),
                content: "Refactored the LLM client module.".into(),
            },
            DailyEntry {
                date: "2026-04-20".into(),
                content: "Added memory crate with search support.".into(),
            },
        ]
    }

    #[test]
    fn search_finds_persona_hit() {
        let hits = search_memory(&sample_persona(), &[], "rust");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].source, "SOUL.md");
        assert!(hits[0].snippet.to_lowercase().contains("rust"));
    }

    #[test]
    fn search_finds_daily_hit() {
        let hits = search_memory(&PersonaFiles::default(), &sample_daily(), "memory crate");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].source, "2026-04-20");
    }

    #[test]
    fn search_case_insensitive() {
        let hits = search_memory(&sample_persona(), &[], "ALICE");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].source, "USER.md");
    }

    #[test]
    fn search_no_match() {
        let hits = search_memory(&sample_persona(), &sample_daily(), "zigzag");
        assert!(hits.is_empty());
    }

    #[test]
    fn search_multiple_hits() {
        let hits = search_memory(&sample_persona(), &sample_daily(), "module");
        // "module" appears in the daily entry for 2026-04-19
        assert!(!hits.is_empty());
    }

    #[test]
    fn snippet_basic() {
        let s = snippet("hello world of rust programming", "rust");
        assert!(s.to_lowercase().contains("rust"));
    }

    #[test]
    fn snippet_truncates_long_content() {
        let long = "a".repeat(500);
        let s = snippet(&long, "a");
        assert!(s.len() <= 203); // 200 + "..."
    }

    #[test]
    fn snippet_with_ellipsis() {
        let content = "x".repeat(200) + "FINDME" + &"y".repeat(200);
        let s = snippet(&content, "findme");
        assert!(s.starts_with("..."));
        assert!(s.ends_with("..."));
        assert!(s.to_lowercase().contains("findme"));
    }
}
