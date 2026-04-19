//! Fuzzy matching for file names.
//!
//! Simple character-sequence matching with scoring based on:
//! - Consecutive character bonus
//! - Word boundary bonus (after `_`, `-`, `.`, `/`)
//! - Length penalty (shorter paths score higher)

/// Fuzzy match `pattern` against `text`. Returns a score (0.0–1.0) if it
/// matches, or `None` if it doesn't.
pub fn fuzzy_match(pattern: &str, text: &str) -> Option<f64> {
    if pattern.is_empty() {
        return Some(1.0);
    }

    let pattern_lower: Vec<char> = pattern.to_lowercase().chars().collect();
    let text_lower: String = text.to_lowercase();
    let text_chars: Vec<char> = text_lower.chars().collect();

    if pattern_lower.len() > text_chars.len() {
        return None;
    }

    // Find positions of each pattern char in text
    let mut positions = Vec::with_capacity(pattern_lower.len());
    let mut ti = 0;
    for &pc in &pattern_lower {
        let mut found = false;
        while ti < text_chars.len() {
            if text_chars[ti] == pc {
                positions.push(ti);
                ti += 1;
                found = true;
                break;
            }
            ti += 1;
        }
        if !found {
            return None;
        }
    }

    // Calculate score
    let mut score = 0.0_f64;

    // Consecutive bonus
    let mut consecutive = 0;
    for i in 1..positions.len() {
        if positions[i] == positions[i - 1] + 1 {
            consecutive += 1;
        }
    }
    score += consecutive as f64 * 0.1;

    // Word boundary bonus
    for &pos in &positions {
        if pos == 0 {
            score += 0.15;
        } else {
            let prev = text_chars[pos - 1];
            if prev == '_' || prev == '-' || prev == '.' || prev == '/' || prev == '\\' {
                score += 0.1;
            }
        }
    }

    // Coverage bonus (pattern covers more of text → higher score)
    score += pattern_lower.len() as f64 / text_chars.len().max(1) as f64 * 0.3;

    // Length penalty (prefer shorter filenames)
    score += 1.0 / (text.len() as f64).max(1.0) * 0.2;

    // Clamp to [0, 1]
    Some(score.clamp(0.0, 1.0))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_match() {
        let score = fuzzy_match("main", "main.rs").unwrap();
        assert!(score > 0.5);
    }

    #[test]
    fn fuzzy_match_works() {
        assert!(fuzzy_match("mr", "main.rs").is_some());
        assert!(fuzzy_match("mrs", "main.rs").is_some());
        assert!(fuzzy_match("xyz", "main.rs").is_none());
    }

    #[test]
    fn empty_pattern() {
        assert_eq!(fuzzy_match("", "anything").unwrap(), 1.0);
    }

    #[test]
    fn case_insensitive() {
        assert!(fuzzy_match("MAIN", "main.rs").is_some());
        assert!(fuzzy_match("main", "MAIN.RS").is_some());
    }

    #[test]
    fn word_boundary_bonus() {
        let with_boundary = fuzzy_match("r", "main.rs").unwrap();
        let no_boundary = fuzzy_match("r", "parser").unwrap();
        // 'r' after '.' gets a boundary bonus vs 'r' inside a word
        assert!(with_boundary > no_boundary);
    }

    #[test]
    fn shorter_paths_score_higher() {
        let short = fuzzy_match("main", "main.rs").unwrap();
        let long = fuzzy_match("main", "some/deep/path/main.rs").unwrap();
        assert!(short > long);
    }
}
