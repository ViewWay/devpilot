//! SQLite persistence layer with file-based storage and migrations.
//!
//! # Example
//! ```no_run
//! use devpilot_store::Store;
//! use std::path::Path;
//!
//! # fn main() -> anyhow::Result<()> {
//! // Open persistent database at default location
//! let store = Store::open_default()?;
//!
//! // Or specify a path
//! let store = Store::open(Path::new("/path/to/devpilot.db"))?;
//!
//! // Or in-memory (for tests)
//! let store = Store::open_in_memory()?;
//! # Ok(())
//! # }
//! ```

use crate::types::*;
use anyhow::{Context, Result};
use rusqlite::Connection;
use std::path::Path;
use tracing::info;

/// Default database directory name.
const APP_DIR: &str = "devpilot";
/// Default database file name.
const DB_NAME: &str = "devpilot.db";

/// Persistent SQLite store with all CRUD operations.
pub struct Store {
    conn: Connection,
}

impl Store {
    // ── Constructors ──────────────────────────────────

    /// Open database at default platform-specific location.
    ///
    /// - macOS: `~/Library/Application Support/devpilot/devpilot.db`
    /// - Linux: `~/.local/share/devpilot/devpilot.db`
    /// - Windows: `%APPDATA%/devpilot/devpilot.db`
    pub fn open_default() -> Result<Self> {
        let base = dirs::data_dir().context("Cannot determine platform data directory")?;
        let dir = base.join(APP_DIR);
        std::fs::create_dir_all(&dir).context("Cannot create database directory")?;
        let path = dir.join(DB_NAME);
        info!("Opening database at {}", path.display());
        Self::open(&path)
    }

    /// Open database at a specific file path.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path).context("Cannot open database file")?;
        let store = Self { conn };
        store.configure_pragmas()?;
        store.run_migrations()?;
        Ok(store)
    }

    /// Open an in-memory database (for testing).
    pub fn open_in_memory() -> Result<Self> {
        let conn = Connection::open_in_memory().context("Cannot create in-memory database")?;
        let store = Self { conn };
        store.configure_pragmas()?;
        store.run_migrations()?;
        Ok(store)
    }

    /// Configure SQLite pragmas for performance and safety.
    fn configure_pragmas(&self) -> Result<()> {
        self.conn
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = ON;
                 PRAGMA busy_timeout = 5000;
                 PRAGMA synchronous = NORMAL;
                 PRAGMA cache_size = -64000;",
            )
            .context("Failed to set pragmas")?;
        Ok(())
    }

    /// Run database migrations. Idempotent — uses CREATE IF NOT EXISTS.
    fn run_migrations(&self) -> Result<()> {
        self.conn
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL DEFAULT 'New Chat',
                    model TEXT NOT NULL DEFAULT '',
                    provider TEXT NOT NULL DEFAULT '',
                    working_dir TEXT,
                    mode TEXT NOT NULL DEFAULT 'code',
                    reasoning_effort TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    archived_at TEXT
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
                    content TEXT NOT NULL DEFAULT '',
                    model TEXT,
                    tool_calls TEXT,
                    tool_call_id TEXT,
                    token_input INTEGER DEFAULT 0,
                    token_output INTEGER DEFAULT 0,
                    token_cache_read INTEGER DEFAULT 0,
                    token_cache_write INTEGER DEFAULT 0,
                    cost_usd REAL DEFAULT 0.0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

                CREATE TABLE IF NOT EXISTS providers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    api_key_encrypted TEXT,
                    models TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    model TEXT NOT NULL,
                    token_input INTEGER DEFAULT 0,
                    token_output INTEGER DEFAULT 0,
                    token_cache_read INTEGER DEFAULT 0,
                    token_cache_write INTEGER DEFAULT 0,
                    cost_usd REAL DEFAULT 0.0,
                    request_count INTEGER DEFAULT 1
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_date_model ON usage(date, provider, model);

                CREATE TABLE IF NOT EXISTS checkpoints (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
                    message_id TEXT NOT NULL REFERENCES messages(id),
                    summary TEXT NOT NULL,
                    token_count INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );
                CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);

                CREATE TABLE IF NOT EXISTS mcp_servers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    transport TEXT NOT NULL CHECK(transport IN ('stdio', 'sse')),
                    command TEXT,
                    args TEXT,
                    url TEXT,
                    env TEXT,
                    enabled INTEGER DEFAULT 1,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );",
            )
            .context("Failed to run migrations")?;
        info!("Database migrations complete");
        Ok(())
    }

    /// Get a raw connection reference for advanced queries.
    pub fn conn(&self) -> &Connection {
        &self.conn
    }

    // ── Sessions ──────────────────────────────────────

    /// List all sessions, ordered by most recently updated.
    pub fn list_sessions(&self) -> Result<Vec<SessionInfo>> {
        let mut stmt = self.conn.prepare(
            "SELECT s.id, s.title, s.model, s.provider, s.working_dir, s.mode,
                    s.reasoning_effort, s.created_at, s.updated_at, s.archived_at,
                    (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
             FROM sessions s ORDER BY s.updated_at DESC",
        )?;
        let sessions = stmt
            .query_map([], row_to_session)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(sessions)
    }

    /// Get a single session by ID.
    pub fn get_session(&self, id: &str) -> Result<SessionInfo> {
        self.conn
            .query_row(
                "SELECT s.id, s.title, s.model, s.provider, s.working_dir, s.mode,
                        s.reasoning_effort, s.created_at, s.updated_at, s.archived_at,
                        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
                 FROM sessions s WHERE s.id = ?1",
                rusqlite::params![id],
                row_to_session,
            )
            .map_err(|e| anyhow::anyhow!("Session not found: {}", e))
    }

    /// Create a new session.
    pub fn create_session(&self, title: &str, model: &str, provider: &str) -> Result<SessionInfo> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO sessions (id, title, model, provider, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            rusqlite::params![id, title, model, provider, now],
        )?;
        Ok(SessionInfo {
            id,
            title: title.to_string(),
            model: model.to_string(),
            provider: provider.to_string(),
            working_dir: None,
            mode: "code".to_string(),
            reasoning_effort: None,
            created_at: now.clone(),
            updated_at: now,
            archived_at: None,
            message_count: 0,
        })
    }

    /// Delete a session and all its messages/usage (CASCADE).
    pub fn delete_session(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    /// Update session title.
    pub fn update_session_title(&self, id: &str, title: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET title = ?2, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id, title],
        )?;
        Ok(())
    }

    // ── Messages ──────────────────────────────────────

    /// Get all messages for a session, ordered chronologically.
    pub fn get_session_messages(&self, session_id: &str) -> Result<Vec<MessageInfo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, role, content, model, token_input, token_output,
                    token_cache_read, token_cache_write, cost_usd, tool_calls, tool_call_id, created_at
             FROM messages WHERE session_id = ?1 ORDER BY created_at ASC",
        )?;
        let messages = stmt
            .query_map(rusqlite::params![session_id], row_to_message)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(messages)
    }

    /// Add a message to a session. Updates session's updated_at timestamp.
    pub fn add_message(
        &self,
        session_id: &str,
        role: &str,
        content: &str,
        model: Option<&str>,
        tool_calls: Option<&str>,
        tool_call_id: Option<&str>,
    ) -> Result<MessageInfo> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO messages (id, session_id, role, content, model, tool_calls, tool_call_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![id, session_id, role, content, model, tool_calls, tool_call_id, now],
        )?;
        // Touch session timestamp
        self.conn.execute(
            "UPDATE sessions SET updated_at = ?2 WHERE id = ?1",
            rusqlite::params![session_id, now],
        )?;
        Ok(MessageInfo {
            id,
            session_id: session_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            model: model.map(String::from),
            token_input: 0,
            token_output: 0,
            token_cache_read: 0,
            token_cache_write: 0,
            cost_usd: 0.0,
            tool_calls: tool_calls.map(String::from),
            tool_call_id: tool_call_id.map(String::from),
            created_at: now,
        })
    }

    /// Delete all messages for a session (used during context compaction).
    pub fn delete_session_messages(&self, session_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            rusqlite::params![session_id],
        )?;
        Ok(())
    }

    /// Update a message's token usage and cost (after LLM response).
    pub fn update_message_usage(
        &self,
        id: &str,
        token_input: i64,
        token_output: i64,
        cost_usd: f64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET token_input = ?2, token_output = ?3, cost_usd = ?4 WHERE id = ?1",
            rusqlite::params![id, token_input, token_output, cost_usd],
        )?;
        Ok(())
    }

    /// Update a message's content (used during streaming to persist final content).
    pub fn update_message_content(&self, id: &str, content: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE messages SET content = ?2 WHERE id = ?1",
            rusqlite::params![id, content],
        )?;
        Ok(())
    }

    // ── Settings ──────────────────────────────────────

    /// Get a setting value by key.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let result = self
            .conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                rusqlite::params![key],
                |row| row.get::<_, String>(0),
            )
            .ok();
        Ok(result)
    }

    /// Set a setting value (upsert).
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        )?;
        Ok(())
    }

    /// List all settings.
    pub fn list_settings(&self) -> Result<Vec<SettingEntry>> {
        let mut stmt = self
            .conn
            .prepare("SELECT key, value FROM settings ORDER BY key")?;
        let settings = stmt
            .query_map([], |row| {
                Ok(SettingEntry {
                    key: row.get(0)?,
                    value: row.get(1)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(settings)
    }

    // ── Usage ─────────────────────────────────────────

    /// Record a usage entry (upserts by date + provider + model).
    pub fn add_usage(
        &self,
        _session_id: &str,
        model: &str,
        provider: &str,
        token_input: i64,
        token_output: i64,
        cost_usd: f64,
    ) -> Result<()> {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        self.conn.execute(
            "INSERT INTO usage (date, provider, model, token_input, token_output, cost_usd, request_count)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
             ON CONFLICT(date, provider, model) DO UPDATE SET
                token_input = token_input + excluded.token_input,
                token_output = token_output + excluded.token_output,
                cost_usd = cost_usd + excluded.cost_usd,
                request_count = request_count + 1",
            rusqlite::params![today, provider, model, token_input, token_output, cost_usd],
        )?;
        Ok(())
    }

    /// Get all usage records (last 1000).
    pub fn get_total_usage(&self) -> Result<Vec<UsageRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, date, provider, model, token_input, token_output,
                    token_cache_read, token_cache_write, cost_usd, request_count
             FROM usage ORDER BY date DESC LIMIT 1000",
        )?;
        let records = stmt
            .query_map([], row_to_usage)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(records)
    }

    /// Get usage records for a session (returns all usage; per-session breakdown not yet implemented).
    pub fn get_session_usage(&self, session_id: &str) -> Result<Vec<UsageRecord>> {
        // Usage is tracked globally by date+provider+model, not per-session.
        // A per-session breakdown would require a messages → usage join.
        let _ = session_id;
        self.get_total_usage()
    }

    // ── Providers ─────────────────────────────────────

    /// List all providers.
    pub fn list_providers(&self) -> Result<Vec<ProviderRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, type, base_url, api_key_encrypted, models, enabled, created_at
             FROM providers ORDER BY name",
        )?;
        let providers = stmt
            .query_map([], row_to_provider)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(providers)
    }

    /// Get a provider by ID.
    pub fn get_provider(&self, id: &str) -> Result<ProviderRecord> {
        self.conn
            .query_row(
                "SELECT id, name, type, base_url, api_key_encrypted, models, enabled, created_at
             FROM providers WHERE id = ?1",
                rusqlite::params![id],
                row_to_provider,
            )
            .map_err(|e| anyhow::anyhow!("Provider not found: {}", e))
    }

    /// Add or update a provider.
    ///
    /// If `api_key` is provided in the provider record, it will be encrypted
    /// before storage. Use `upsert_provider_with_key` for the high-level API.
    pub fn upsert_provider(&self, provider: &ProviderRecord) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO providers (id, name, type, base_url, api_key_encrypted, models, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                provider.id,
                provider.name,
                provider.provider_type,
                provider.base_url,
                if provider.api_key_set { Some("set") } else { None },
                provider.models,
                provider.enabled as i32,
                provider.created_at,
            ],
        )?;
        Ok(())
    }

    /// Add or update a provider with an API key (encrypted at rest).
    pub fn upsert_provider_with_key(
        &self,
        provider: &ProviderRecord,
        api_key: Option<&str>,
    ) -> Result<()> {
        let encrypted = match api_key {
            Some(key) if !key.is_empty() => {
                Some(crate::crypto::encrypt(key).context("Failed to encrypt API key")?)
            }
            _ => None,
        };
        self.conn.execute(
            "INSERT OR REPLACE INTO providers (id, name, type, base_url, api_key_encrypted, models, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                provider.id,
                provider.name,
                provider.provider_type,
                provider.base_url,
                encrypted,
                provider.models,
                provider.enabled as i32,
                provider.created_at,
            ],
        )?;
        Ok(())
    }

    /// Get the decrypted API key for a provider.
    pub fn get_provider_api_key(&self, id: &str) -> Result<Option<String>> {
        let result: Option<String> = self
            .conn
            .query_row(
                "SELECT api_key_encrypted FROM providers WHERE id = ?1",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .ok()
            .flatten();

        match result {
            Some(encrypted) => {
                let decrypted =
                    crate::crypto::decrypt(&encrypted).context("Failed to decrypt API key")?;
                Ok(Some(decrypted))
            }
            None => Ok(None),
        }
    }

    /// Delete a provider.
    pub fn delete_provider(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM providers WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    // ── Checkpoints ────────────────────────────────────

    /// Create a new checkpoint for a session.
    pub fn create_checkpoint(
        &self,
        session_id: &str,
        message_id: &str,
        summary: &str,
        token_count: i64,
    ) -> Result<CheckpointInfo> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO checkpoints (id, session_id, message_id, summary, token_count, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![id, session_id, message_id, summary, token_count, now],
        )?;
        Ok(CheckpointInfo {
            id,
            session_id: session_id.to_string(),
            message_id: message_id.to_string(),
            summary: summary.to_string(),
            token_count,
            created_at: now,
        })
    }

    /// List all checkpoints for a session, ordered by creation time.
    pub fn list_checkpoints(&self, session_id: &str) -> Result<Vec<CheckpointInfo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, message_id, summary, token_count, created_at
             FROM checkpoints WHERE session_id = ?1 ORDER BY created_at DESC",
        )?;
        let checkpoints = stmt
            .query_map(rusqlite::params![session_id], |row| {
                Ok(CheckpointInfo {
                    id: row.get(0)?,
                    session_id: row.get(1)?,
                    message_id: row.get(2)?,
                    summary: row.get(3)?,
                    token_count: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(checkpoints)
    }

    /// Get a single checkpoint by ID.
    pub fn get_checkpoint(&self, id: &str) -> Result<CheckpointInfo> {
        self.conn
            .query_row(
                "SELECT id, session_id, message_id, summary, token_count, created_at
                 FROM checkpoints WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(CheckpointInfo {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        message_id: row.get(2)?,
                        summary: row.get(3)?,
                        token_count: row.get(4)?,
                        created_at: row.get(5)?,
                    })
                },
            )
            .map_err(|e| anyhow::anyhow!("Checkpoint not found: {}", e))
    }

    /// Delete a checkpoint by ID.
    pub fn delete_checkpoint(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM checkpoints WHERE id = ?1", rusqlite::params![id])?;
        Ok(())
    }

    /// Delete all checkpoints for a session.
    pub fn delete_session_checkpoints(&self, session_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM checkpoints WHERE session_id = ?1",
            rusqlite::params![session_id],
        )?;
        Ok(())
    }

    /// Rewind a session to a checkpoint — delete all messages after the checkpoint's message.
    /// Returns the number of messages removed.
    pub fn rewind_to_checkpoint(&self, checkpoint_id: &str) -> Result<usize> {
        let cp = self.get_checkpoint(checkpoint_id)?;
        // Find messages created after the checkpoint's message
        let removed: usize = self.conn.query_row(
            "SELECT COUNT(*) FROM messages
             WHERE session_id = ?1
             AND created_at > (SELECT created_at FROM messages WHERE id = ?2)",
            rusqlite::params![cp.session_id, cp.message_id],
            |row| row.get(0),
        )?;
        self.conn.execute(
            "DELETE FROM messages
             WHERE session_id = ?1
             AND created_at > (SELECT created_at FROM messages WHERE id = ?2)",
            rusqlite::params![cp.session_id, cp.message_id],
        )?;
        // Remove checkpoints created after this one too
        self.conn.execute(
            "DELETE FROM checkpoints
             WHERE session_id = ?1
             AND created_at > (SELECT created_at FROM checkpoints WHERE id = ?2)",
            rusqlite::params![cp.session_id, checkpoint_id],
        )?;
        Ok(removed)
    }
}

// ── Row mapping helpers ───────────────────────────────

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<SessionInfo> {
    Ok(SessionInfo {
        id: row.get(0)?,
        title: row.get(1)?,
        model: row.get(2)?,
        provider: row.get(3)?,
        working_dir: row.get(4)?,
        mode: row.get(5)?,
        reasoning_effort: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
        archived_at: row.get(9)?,
        message_count: row.get(10)?,
    })
}

fn row_to_message(row: &rusqlite::Row) -> rusqlite::Result<MessageInfo> {
    Ok(MessageInfo {
        id: row.get(0)?,
        session_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        model: row.get(4)?,
        token_input: row.get(5)?,
        token_output: row.get(6)?,
        token_cache_read: row.get(7)?,
        token_cache_write: row.get(8)?,
        cost_usd: row.get(9)?,
        tool_calls: row.get(10)?,
        tool_call_id: row.get(11)?,
        created_at: row.get(12)?,
    })
}

fn row_to_usage(row: &rusqlite::Row) -> rusqlite::Result<UsageRecord> {
    Ok(UsageRecord {
        id: row.get(0)?,
        date: row.get(1)?,
        provider: row.get(2)?,
        model: row.get(3)?,
        token_input: row.get(4)?,
        token_output: row.get(5)?,
        token_cache_read: row.get(6)?,
        token_cache_write: row.get(7)?,
        cost_usd: row.get(8)?,
        request_count: row.get(9)?,
    })
}

fn row_to_provider(row: &rusqlite::Row) -> rusqlite::Result<ProviderRecord> {
    let api_key_set: Option<String> = row.get(4)?;
    Ok(ProviderRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        provider_type: row.get(2)?,
        base_url: row.get(3)?,
        api_key_set: api_key_set.is_some(),
        models: row.get(5)?,
        enabled: row.get::<_, i32>(6)? != 0,
        created_at: row.get(7)?,
    })
}

// ── Tests ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn test_store() -> Store {
        Store::open_in_memory().unwrap()
    }

    #[test]
    fn test_session_crud() {
        let store = test_store();

        // Create
        let session = store
            .create_session("Test Chat", "gpt-4o", "openai")
            .unwrap();
        assert_eq!(session.title, "Test Chat");
        assert_eq!(session.model, "gpt-4o");
        assert!(session.reasoning_effort.is_none());
        assert!(session.archived_at.is_none());
        assert_eq!(session.message_count, 0);

        // List
        let sessions = store.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);

        // Get
        let got = store.get_session(&session.id).unwrap();
        assert_eq!(got.title, "Test Chat");

        // Update title
        store.update_session_title(&session.id, "Renamed").unwrap();
        let got = store.get_session(&session.id).unwrap();
        assert_eq!(got.title, "Renamed");

        // Delete
        store.delete_session(&session.id).unwrap();
        let sessions = store.list_sessions().unwrap();
        assert!(sessions.is_empty());
    }

    #[test]
    fn test_message_crud() {
        let store = test_store();
        let session = store
            .create_session("Msg Test", "gpt-4o", "openai")
            .unwrap();

        // Add user message
        let msg1 = store
            .add_message(&session.id, "user", "Hello", None, None, None)
            .unwrap();
        assert_eq!(msg1.role, "user");
        assert_eq!(msg1.token_cache_read, 0);
        assert_eq!(msg1.token_cache_write, 0);

        // Add assistant message
        let msg2 = store
            .add_message(
                &session.id,
                "assistant",
                "Hi there!",
                Some("gpt-4o"),
                None,
                None,
            )
            .unwrap();
        assert_eq!(msg2.model.as_deref(), Some("gpt-4o"));

        // List messages
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs.len(), 2);

        // Check message_count on session
        let got = store.get_session(&session.id).unwrap();
        assert_eq!(got.message_count, 2);

        // Update usage
        store
            .update_message_usage(&msg2.id, 100, 50, 0.005)
            .unwrap();
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs[1].token_input, 100);
        assert_eq!(msgs[1].token_output, 50);

        // Delete session cascades messages
        store.delete_session(&session.id).unwrap();
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert!(msgs.is_empty());
    }

    #[test]
    fn test_settings_crud() {
        let store = test_store();

        // Set
        store.set_setting("theme", "dark").unwrap();
        store.set_setting("locale", "en").unwrap();

        // Get
        assert_eq!(
            store.get_setting("theme").unwrap(),
            Some("dark".to_string())
        );
        assert_eq!(store.get_setting("nonexistent").unwrap(), None);

        // Upsert
        store.set_setting("theme", "light").unwrap();
        assert_eq!(
            store.get_setting("theme").unwrap(),
            Some("light".to_string())
        );

        // List
        let settings = store.list_settings().unwrap();
        assert_eq!(settings.len(), 2);
    }

    #[test]
    fn test_usage_tracking() {
        let store = test_store();
        let session = store
            .create_session("Usage Test", "gpt-4o", "openai")
            .unwrap();

        store
            .add_usage(&session.id, "gpt-4o", "openai", 1000, 500, 0.09)
            .unwrap();
        store
            .add_usage(&session.id, "gpt-4o", "openai", 500, 250, 0.045)
            .unwrap();

        let total = store.get_total_usage().unwrap();
        assert_eq!(total.len(), 1); // same day + model + provider aggregated
        assert_eq!(total[0].token_input, 1500);
        assert_eq!(total[0].token_output, 750);
        assert_eq!(total[0].request_count, 2);
    }

    #[test]
    fn test_provider_crud() {
        let store = test_store();

        let provider = ProviderRecord {
            id: "openai-main".to_string(),
            name: "OpenAI".to_string(),
            provider_type: "openai".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            api_key_set: false,
            models: Some(r#"[]"#.to_string()),
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        store.upsert_provider(&provider).unwrap();
        let providers = store.list_providers().unwrap();
        assert_eq!(providers.len(), 1);

        let got = store.get_provider("openai-main").unwrap();
        assert_eq!(got.name, "OpenAI");
        assert!(!got.api_key_set);

        // Update
        let mut updated = provider.clone();
        updated.name = "OpenAI Pro".to_string();
        updated.api_key_set = true;
        store.upsert_provider(&updated).unwrap();
        let got = store.get_provider("openai-main").unwrap();
        assert_eq!(got.name, "OpenAI Pro");
        assert!(got.api_key_set);

        // Delete
        store.delete_provider("openai-main").unwrap();
        let providers = store.list_providers().unwrap();
        assert!(providers.is_empty());
    }

    #[test]
    fn test_persistent_storage() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");

        // Write data
        {
            let store = Store::open(&db_path).unwrap();
            store
                .create_session("Persist Test", "gpt-4o", "openai")
                .unwrap();
            store.set_setting("key1", "value1").unwrap();
        }

        // Reopen and verify
        {
            let store = Store::open(&db_path).unwrap();
            let sessions = store.list_sessions().unwrap();
            assert_eq!(sessions.len(), 1);
            assert_eq!(sessions[0].title, "Persist Test");
            assert_eq!(
                store.get_setting("key1").unwrap(),
                Some("value1".to_string())
            );
        }
    }
}
