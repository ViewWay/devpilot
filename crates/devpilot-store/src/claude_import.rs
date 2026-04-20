//! Claude Code session import — parses `.jsonl` thread files from Claude Code.
//!
//! Claude Code stores conversation threads as JSONL files (one JSON object per line).
//! Each line represents a message with fields like `type`, `role`, `content`, `model`, etc.
//!
//! This module provides:
//! - `ClaudeThreadMessage` — parsed message from a JSONL line
//! - `parse_claude_thread` — parse a full `.jsonl` file into a list of messages
//! - `import_claude_thread` — import a parsed thread into the DevPilot store

use crate::types::*;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{info, warn};

// ── Claude Code JSONL types ────────────────────────────

/// A single message entry from a Claude Code JSONL thread file.
///
/// Claude Code uses a variety of message types. We handle the most common ones:
/// - `human` / `user` — user messages
/// - `assistant` — Claude's responses (may contain tool_use blocks)
/// - `tool_result` — tool execution results
/// - `system` — system messages (usually filtered during import)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ClaudeThreadMessage {
    /// Message type: "human", "assistant", "tool_result", "system", etc.
    #[serde(default)]
    pub message_type: Option<String>,

    /// Role field (alternative to type): "user", "assistant", "tool", "system"
    #[serde(default)]
    pub role: Option<String>,

    /// Text content of the message. May be a plain string or a structured content block.
    #[serde(default)]
    pub content: Option<serde_json::Value>,

    /// Model name (e.g., "claude-sonnet-4-20250514")
    #[serde(default)]
    pub model: Option<String>,

    /// Tool use blocks (for assistant messages that invoke tools)
    #[serde(default)]
    pub tool_use: Option<Vec<ToolUseBlock>>,

    /// Tool result ID (for tool result messages)
    #[serde(default)]
    pub tool_use_id: Option<String>,

    /// Timestamp (ISO 8601 or Unix epoch)
    #[serde(default)]
    pub timestamp: Option<String>,

    /// Token usage information
    #[serde(default)]
    pub usage: Option<ClaudeUsage>,
}

/// A tool use block from an assistant message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ToolUseBlock {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub input: Option<serde_json::Value>,
}

/// Token usage from a Claude message.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct ClaudeUsage {
    #[serde(default)]
    pub input_tokens: Option<i64>,
    #[serde(default)]
    pub output_tokens: Option<i64>,
    #[serde(default)]
    pub cache_creation_input_tokens: Option<i64>,
    #[serde(default)]
    pub cache_read_input_tokens: Option<i64>,
}

/// Result of importing a Claude Code thread.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeImportResult {
    /// Number of sessions imported.
    pub sessions_imported: usize,
    /// Total messages imported across all sessions.
    pub messages_imported: usize,
    /// Number of messages skipped (system, empty, etc.).
    pub messages_skipped: usize,
    /// Any warnings encountered during import.
    pub warnings: Vec<String>,
}

/// Metadata about a discovered Claude Code thread file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeThreadInfo {
    /// File path of the .jsonl thread.
    pub path: String,
    /// File name without extension (used as a fallback title).
    pub filename: String,
    /// Number of messages in the thread (approximate).
    pub message_count: usize,
    /// Estimated first user message (for session title).
    pub preview: String,
    /// File size in bytes.
    pub size_bytes: u64,
    /// Last modified timestamp.
    pub modified: String,
}

// ── Parsing ────────────────────────────────────────────

/// Parse a Claude Code `.jsonl` thread file into a list of messages.
pub fn parse_claude_thread(path: &Path) -> Result<Vec<ClaudeThreadMessage>> {
    let content =
        std::fs::read_to_string(path).with_context(|| format!("Cannot read {:?}", path))?;
    parse_claude_thread_str(&content)
}

/// Parse a Claude Code JSONL string into messages.
pub fn parse_claude_thread_str(content: &str) -> Result<Vec<ClaudeThreadMessage>> {
    let mut messages = Vec::new();
    for (i, line) in content.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<ClaudeThreadMessage>(line) {
            Ok(msg) => messages.push(msg),
            Err(e) => {
                // Skip malformed lines but log a warning
                warn!("Skipping malformed line {} in JSONL: {}", i + 1, e);
            }
        }
    }
    Ok(messages)
}

/// Determine the effective role of a Claude message for DevPilot mapping.
fn effective_role(msg: &ClaudeThreadMessage) -> Option<&str> {
    // Prefer explicit role field, fall back to message_type
    if let Some(ref role) = msg.role {
        match role.as_str() {
            "user" | "human" => return Some("user"),
            "assistant" => return Some("assistant"),
            "tool" | "tool_result" => return Some("tool"),
            "system" => return Some("system"),
            _ => {}
        }
    }
    if let Some(ref mt) = msg.message_type {
        match mt.as_str() {
            "human" | "user" => return Some("user"),
            "assistant" => return Some("assistant"),
            "tool_result" => return Some("tool"),
            "system" => return Some("system"),
            _ => {}
        }
    }
    None
}

/// Extract text content from a Claude message's content field.
/// The content can be a plain string, an array of content blocks, or null.
fn extract_text(content: &Option<serde_json::Value>) -> String {
    match content {
        None => String::new(),
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Array(blocks)) => {
            let mut parts = Vec::new();
            for block in blocks {
                if let Some(obj) = block.as_object() {
                    match obj.get("type").and_then(|t| t.as_str()) {
                        Some("text") => {
                            if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                                parts.push(text.to_string());
                            }
                        }
                        Some("tool_use") => {
                            // Extract tool use info as readable text
                            let name = obj
                                .get("name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("unknown");
                            let input = obj.get("input").map(|i| i.to_string()).unwrap_or_default();
                            parts.push(format!("[Tool: {}] {}", name, input));
                        }
                        Some("tool_result") => {
                            if let Some(text) = obj.get("content").and_then(|c| c.as_str()) {
                                parts.push(text.to_string());
                            } else if let Some(arr) = obj.get("content").and_then(|c| c.as_array())
                            {
                                for item in arr {
                                    if let Some(t) = item
                                        .as_object()
                                        .and_then(|o| o.get("text").and_then(|t| t.as_str()))
                                    {
                                        parts.push(t.to_string());
                                    }
                                }
                            }
                        }
                        Some("thinking") => {
                            if let Some(text) = obj.get("thinking").and_then(|t| t.as_str()) {
                                parts.push(format!("[Thinking]\n{}", text));
                            }
                        }
                        _ => {
                            // Unknown block type, try to extract text
                            if let Some(text) = obj.get("text").and_then(|t| t.as_str()) {
                                parts.push(text.to_string());
                            }
                        }
                    }
                } else if let Some(s) = block.as_str() {
                    parts.push(s.to_string());
                }
            }
            parts.join("\n")
        }
        Some(other) => other.to_string(),
    }
}

/// Extract tool calls from an assistant message (from both top-level and content blocks).
fn extract_tool_calls(msg: &ClaudeThreadMessage) -> Option<String> {
    let mut tool_calls = Vec::new();

    // From top-level tool_use field
    if let Some(ref blocks) = msg.tool_use {
        for block in blocks {
            tool_calls.push(serde_json::json!({
                "id": block.id,
                "name": block.name,
                "input": block.input
            }));
        }
    }

    // From content array blocks
    if let Some(serde_json::Value::Array(blocks)) = &msg.content {
        for block in blocks {
            if let Some(obj) = block.as_object()
                && obj.get("type").and_then(|t| t.as_str()) == Some("tool_use")
            {
                let id = obj.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
                let name = obj
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let input = obj.get("input").cloned().unwrap_or(serde_json::Value::Null);
                tool_calls.push(serde_json::json!({
                    "id": id,
                    "name": name,
                    "input": input
                }));
            }
        }
    }

    if tool_calls.is_empty() {
        None
    } else {
        serde_json::to_string(&tool_calls).ok()
    }
}

/// Extract tool_call_id from a tool result message.
fn extract_tool_call_id(msg: &ClaudeThreadMessage) -> Option<String> {
    // From top-level field
    if msg.tool_use_id.is_some() {
        return msg.tool_use_id.clone();
    }
    // From content array
    if let Some(serde_json::Value::Array(blocks)) = &msg.content {
        for block in blocks {
            if let Some(obj) = block.as_object()
                && obj.get("type").and_then(|t| t.as_str()) == Some("tool_result")
                && let Some(id) = obj.get("tool_use_id").and_then(|v| v.as_str())
            {
                return Some(id.to_string());
            }
        }
    }
    None
}

/// Extract a session title from the first user message in the thread.
fn extract_title(messages: &[ClaudeThreadMessage]) -> String {
    for msg in messages {
        if effective_role(msg) == Some("user") {
            let text = extract_text(&msg.content);
            let title = text.lines().next().unwrap_or("").trim();
            if !title.is_empty() {
                // Truncate to a reasonable title length
                if title.len() > 80 {
                    return format!("{}...", &title[..77]);
                }
                return title.to_string();
            }
        }
    }
    "Claude Code Import".to_string()
}

/// Extract the model name from the first assistant message.
fn extract_model(messages: &[ClaudeThreadMessage]) -> String {
    for msg in messages {
        if effective_role(msg) == Some("assistant")
            && let Some(ref model) = msg.model
            && !model.is_empty()
        {
            return model.clone();
        }
    }
    "claude-sonnet-4-20250514".to_string()
}

// ── Store integration ──────────────────────────────────

impl crate::Store {
    /// Import a Claude Code JSONL thread file as a new DevPilot session.
    ///
    /// Returns the session info and count of imported messages.
    pub fn import_claude_thread(&self, jsonl_path: &Path) -> Result<(SessionInfo, usize)> {
        let messages = parse_claude_thread(jsonl_path)?;
        let title = extract_title(&messages);
        let model = extract_model(&messages);

        // Create a new session for this thread
        let session = self.create_session(&title, &model, "anthropic")?;

        let mut imported = 0usize;
        for msg in &messages {
            let role = match effective_role(msg) {
                Some(r) => r,
                None => continue, // Skip messages with no recognizable role
            };

            // Skip system messages (not useful in imported threads)
            if role == "system" {
                continue;
            }

            let text = extract_text(&msg.content);
            if text.is_empty() && role != "tool" {
                // Skip empty non-tool messages
                continue;
            }

            let model_ref = if role == "assistant" {
                Some(model.as_str())
            } else {
                None
            };

            let tool_calls = if role == "assistant" {
                extract_tool_calls(msg)
            } else {
                None
            };

            let tool_call_id = if role == "tool" {
                extract_tool_call_id(msg)
            } else {
                None
            };

            match self.add_message(
                &session.id,
                role,
                &text,
                model_ref,
                tool_calls.as_deref(),
                tool_call_id.as_deref(),
            ) {
                Ok(_) => imported += 1,
                Err(e) => {
                    warn!("Failed to import message: {}", e);
                }
            }
        }

        info!(
            "Imported Claude thread: {} messages from {:?}",
            imported, jsonl_path
        );
        Ok((session, imported))
    }

    /// Import multiple Claude Code JSONL thread files.
    pub fn import_claude_threads_batch(&self, paths: &[&Path]) -> Result<ClaudeImportResult> {
        let mut result = ClaudeImportResult {
            sessions_imported: 0,
            messages_imported: 0,
            messages_skipped: 0,
            warnings: Vec::new(),
        };

        for path in paths {
            match self.import_claude_thread(path) {
                Ok((_, count)) => {
                    result.sessions_imported += 1;
                    result.messages_imported += count;
                }
                Err(e) => {
                    result
                        .warnings
                        .push(format!("Failed to import {:?}: {}", path, e));
                }
            }
        }

        Ok(result)
    }
}

// ── Thread discovery ───────────────────────────────────

/// Scan a directory for Claude Code thread files.
///
/// Claude Code typically stores threads in `~/.claude/threads/` or `~/.claude/projects/`.
/// Each thread is a `.jsonl` file.
pub fn scan_claude_threads(directory: &Path) -> Result<Vec<ClaudeThreadInfo>> {
    let mut threads = Vec::new();

    if !directory.exists() {
        return Ok(threads);
    }

    let entries = std::fs::read_dir(directory)
        .with_context(|| format!("Cannot read Claude threads directory: {:?}", directory))?;

    for entry in entries {
        let entry = entry.context("Failed to read directory entry")?;
        let path = entry.path();

        // Only process .jsonl files
        if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                warn!("Cannot read metadata for {:?}: {}", path, e);
                continue;
            }
        };

        let filename = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let modified = metadata
            .modified()
            .ok()
            .map(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                dt.to_rfc3339()
            })
            .unwrap_or_default();

        // Parse to count messages and get preview
        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let messages = match parse_claude_thread_str(&content) {
            Ok(m) => m,
            Err(_) => continue,
        };

        let user_msgs: Vec<&ClaudeThreadMessage> = messages
            .iter()
            .filter(|m| effective_role(m) == Some("user"))
            .collect();

        let preview = user_msgs
            .first()
            .map(|m| {
                let text = extract_text(&m.content);
                let line = text.lines().next().unwrap_or("");
                if line.len() > 100 {
                    format!("{}...", &line[..97])
                } else {
                    line.to_string()
                }
            })
            .unwrap_or_else(|| filename.clone());

        threads.push(ClaudeThreadInfo {
            path: path.to_string_lossy().to_string(),
            filename,
            message_count: messages.len(),
            preview,
            size_bytes: metadata.len(),
            modified,
        });
    }

    // Sort by modification time (newest first)
    threads.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(threads)
}

/// Try to find the default Claude Code threads directory.
pub fn find_claude_threads_dir() -> Option<std::path::PathBuf> {
    let home = dirs::home_dir()?;

    // Try ~/.claude/threads/ first (most common)
    let threads_dir = home.join(".claude").join("threads");
    if threads_dir.exists() {
        return Some(threads_dir);
    }

    // Try ~/.claude/projects/ (alternative layout)
    let projects_dir = home.join(".claude").join("projects");
    if projects_dir.exists() {
        return Some(projects_dir);
    }

    None
}
