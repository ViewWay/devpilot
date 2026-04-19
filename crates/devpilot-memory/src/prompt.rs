//! Build the persona / memory section that is injected into the system prompt.

use crate::PersonaFiles;
use crate::daily::DailyEntry;

/// Construct a formatted text block describing the assistant's persona and
/// recent daily memories, ready to be included in a system prompt.
///
/// Only sections with actual content are included.
pub fn build_persona_prompt(persona: &PersonaFiles, daily_entries: &[DailyEntry]) -> String {
    let mut sections = Vec::new();

    if let Some(ref soul) = persona.soul_md {
        sections.push(format!("## Soul (SOUL.md)\n{soul}"));
    }

    if let Some(ref user) = persona.user_md {
        sections.push(format!("## User Profile (USER.md)\n{user}"));
    }

    if let Some(ref memory) = persona.memory_md {
        sections.push(format!("## Persistent Memory (MEMORY.md)\n{memory}"));
    }

    if let Some(ref agents) = persona.agents_md {
        sections.push(format!("## Agents (AGENTS.md)\n{agents}"));
    }

    if !daily_entries.is_empty() {
        let mut daily_section = String::from("## Recent Daily Memories\n");
        for entry in daily_entries {
            daily_section.push_str(&format!("### {}\n{}\n\n", entry.date, entry.content));
        }
        sections.push(daily_section.trim_end().to_owned());
    }

    if sections.is_empty() {
        return String::new();
    }

    format!("# DevPilot Persona & Memory\n\n{}", sections.join("\n\n"))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_persona_and_no_daily() {
        let prompt = build_persona_prompt(&PersonaFiles::default(), &[]);
        assert!(prompt.is_empty());
    }

    #[test]
    fn full_persona_no_daily() {
        let persona = PersonaFiles {
            soul_md: Some("Be helpful.".into()),
            user_md: Some("Alice".into()),
            memory_md: Some("Uses Rust.".into()),
            agents_md: Some("Bob is backend.".into()),
        };
        let prompt = build_persona_prompt(&persona, &[]);
        assert!(prompt.contains("Be helpful."));
        assert!(prompt.contains("Alice"));
        assert!(prompt.contains("Uses Rust."));
        assert!(prompt.contains("Bob is backend."));
        assert!(prompt.starts_with("# DevPilot Persona & Memory"));
    }

    #[test]
    fn includes_daily_entries() {
        let persona = PersonaFiles {
            soul_md: Some("Be helpful.".into()),
            ..Default::default()
        };
        let daily = vec![
            DailyEntry {
                date: "2026-04-19".into(),
                content: "Refactored LLM client.".into(),
            },
            DailyEntry {
                date: "2026-04-20".into(),
                content: "Added memory crate.".into(),
            },
        ];
        let prompt = build_persona_prompt(&persona, &daily);
        assert!(prompt.contains("2026-04-19"));
        assert!(prompt.contains("Refactored LLM client."));
        assert!(prompt.contains("2026-04-20"));
        assert!(prompt.contains("Added memory crate."));
    }

    #[test]
    fn only_daily_no_persona() {
        let daily = vec![DailyEntry {
            date: "2026-04-20".into(),
            content: "Just a note.".into(),
        }];
        let prompt = build_persona_prompt(&PersonaFiles::default(), &daily);
        assert!(prompt.contains("Recent Daily Memories"));
        assert!(prompt.contains("Just a note."));
        assert!(!prompt.contains("Soul"));
    }

    #[test]
    fn partial_persona() {
        let persona = PersonaFiles {
            soul_md: None,
            user_md: Some("Bob".into()),
            memory_md: None,
            agents_md: None,
        };
        let prompt = build_persona_prompt(&persona, &[]);
        assert!(!prompt.contains("Soul"));
        assert!(prompt.contains("Bob"));
        assert!(!prompt.contains("Persistent Memory"));
    }
}
