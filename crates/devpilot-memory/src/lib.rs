//! # devpilot-memory
//!
//! Persona file management (SOUL.md, USER.md, MEMORY.md, AGENTS.md) and daily
//! memory files for DevPilot.
//!
//! ## Quick Start
//!
//! ```ignore
//! use devpilot_memory::{PersonaFiles, DailyMemory, build_persona_prompt};
//!
//! // Load persona files from a workspace directory
//! let persona = PersonaFiles::load(&workspace_dir).await.unwrap();
//!
//! // Create a daily memory entry
//! DailyMemory::create_entry(&data_dir, "2026-04-20", "Worked on memory crate.").await.unwrap();
//!
//! // Build the persona section for the system prompt
//! let prompt = build_persona_prompt(&persona, &daily_entries);
//! ```

mod daily;
mod persona;
mod prompt;
mod search;

pub use daily::{DailyEntry, DailyMemory};
pub use persona::PersonaFiles;
pub use prompt::build_persona_prompt;
pub use search::{MemorySearchHit, search_memory};
