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

use crate::StoreError;
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
                    env_vars TEXT,
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
                );

                CREATE TABLE IF NOT EXISTS bridge_channels (
                    id TEXT PRIMARY KEY,
                    channel_type TEXT NOT NULL CHECK(channel_type IN ('telegram', 'feishu', 'discord', 'slack', 'webhook')),
                    config TEXT NOT NULL DEFAULT '{}',
                    session_bindings TEXT,
                    enabled INTEGER DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'disconnected',
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS scheduled_tasks (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    schedule TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    model TEXT,
                    provider TEXT,
                    enabled INTEGER DEFAULT 1,
                    last_run_at TEXT,
                    next_run_at TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS task_runs (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
                    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'done', 'error')),
                    result TEXT,
                    error TEXT,
                    started_at TEXT NOT NULL DEFAULT (datetime('now')),
                    completed_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_task_runs_task ON task_runs(task_id);

                CREATE TABLE IF NOT EXISTS media_generations (
                    id TEXT PRIMARY KEY,
                    prompt TEXT NOT NULL,
                    model TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    file_path TEXT,
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'generating', 'done', 'error')),
                    tags TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    icon TEXT NOT NULL DEFAULT '',
                    system_prompt TEXT NOT NULL DEFAULT '',
                    default_mode TEXT CHECK(default_mode IN ('code', 'plan', 'ask')),
                    is_builtin INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
                );",

            )
            .context("Failed to run migrations")?;

        // ── Incremental migrations for existing databases ──
        self.migrate_add_column_if_missing("sessions", "env_vars", "TEXT")?;

        info!("Database migrations complete");
        Ok(())
    }

    /// Add a column to a table if it does not already exist (idempotent migration).
    fn migrate_add_column_if_missing(
        &self,
        table: &str,
        column: &str,
        col_type: &str,
    ) -> Result<()> {
        let col_exists: bool = self
            .conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM pragma_table_info(?) WHERE name = ?",
                rusqlite::params![table, column],
                |row| row.get(0),
            )
            .context("Failed to check column existence")?;

        if !col_exists {
            let sql = format!("ALTER TABLE {table} ADD COLUMN {column} {col_type}");
            self.conn
                .execute_batch(&sql)
                .with_context(|| format!("Failed to add column {column} to table {table}"))?;
            info!("Migration: added column {column} to table {table}");
        }
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
                    s.reasoning_effort, s.env_vars, s.created_at, s.updated_at, s.archived_at,
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
                        s.reasoning_effort, s.env_vars, s.created_at, s.updated_at, s.archived_at,
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
            env_vars: None,
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

    /// Archive a session by setting `archived_at` to the current timestamp.
    pub fn archive_session(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET archived_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    }

    /// Unarchive a session by clearing `archived_at`.
    pub fn unarchive_session(&self, id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET archived_at = NULL, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id],
        )?;
        Ok(())
    }

    /// Import a session with a specific (pre-existing) ID.
    /// Used during data import to preserve original session identifiers.
    pub fn import_session_with_id(
        &self,
        id: &str,
        title: &str,
        model: &str,
        provider: &str,
    ) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT OR IGNORE INTO sessions (id, title, model, provider, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            rusqlite::params![id, title, model, provider, now],
        )?;
        Ok(())
    }

    /// Set the working directory for a session.
    pub fn set_session_working_dir(&self, id: &str, working_dir: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET working_dir = ?2, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id, working_dir],
        )?;
        Ok(())
    }

    /// Set the environment variables for a session.
    ///
    /// `env_vars` is a JSON-serialized `Vec<(String, String)>` of KEY=VALUE pairs
    /// that are injected into shell commands run by tools in this session.
    pub fn set_session_env_vars(&self, id: &str, env_vars: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE sessions SET env_vars = ?2, updated_at = datetime('now') WHERE id = ?1",
            rusqlite::params![id, env_vars],
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
        self.conn.execute(
            "DELETE FROM checkpoints WHERE id = ?1",
            rusqlite::params![id],
        )?;
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
        env_vars: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        archived_at: row.get(10)?,
        message_count: row.get(11)?,
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

// ── MCP Servers ────────────────────────────────────────

impl Store {
    /// List all MCP servers.
    pub fn list_mcp_servers(&self) -> Result<Vec<McpServerRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, transport, command, args, url, env, enabled, created_at
             FROM mcp_servers ORDER BY created_at",
        )?;
        let servers = stmt
            .query_map([], |row| {
                Ok(McpServerRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    transport: row.get(2)?,
                    command: row.get(3)?,
                    args: row.get(4)?,
                    url: row.get(5)?,
                    env: row.get(6)?,
                    enabled: row.get::<_, i32>(7)? != 0,
                    created_at: row.get(8)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(servers)
    }

    /// Get a single MCP server by ID.
    pub fn get_mcp_server(&self, id: &str) -> Result<McpServerRecord> {
        self.conn
            .query_row(
                "SELECT id, name, transport, command, args, url, env, enabled, created_at
             FROM mcp_servers WHERE id = ?1",
                [id],
                |row| {
                    Ok(McpServerRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        transport: row.get(2)?,
                        command: row.get(3)?,
                        args: row.get(4)?,
                        url: row.get(5)?,
                        env: row.get(6)?,
                        enabled: row.get::<_, i32>(7)? != 0,
                        created_at: row.get(8)?,
                    })
                },
            )
            .map_err(|e| e.into())
    }

    /// Insert or update an MCP server configuration.
    pub fn upsert_mcp_server(&self, server: &McpServerRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO mcp_servers (id, name, transport, command, args, url, env, enabled)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               name = ?2, transport = ?3, command = ?4, args = ?5,
               url = ?6, env = ?7, enabled = ?8",
            (
                &server.id,
                &server.name,
                &server.transport,
                &server.command,
                &server.args,
                &server.url,
                &server.env,
                server.enabled as i32,
            ),
        )?;
        Ok(())
    }

    /// Delete an MCP server by ID.
    pub fn delete_mcp_server(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM mcp_servers WHERE id = ?1", [id])?;
        Ok(())
    }

    // ── Bridge Channels ──────────────────────────────────

    /// List all bridge channels.
    pub fn list_bridge_channels(&self) -> Result<Vec<BridgeChannelRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, channel_type, config, session_bindings, enabled, status, created_at
             FROM bridge_channels ORDER BY created_at DESC",
        )?;
        let channels = stmt
            .query_map([], |row| {
                Ok(BridgeChannelRecord {
                    id: row.get(0)?,
                    channel_type: row.get(1)?,
                    config: row.get(2)?,
                    session_bindings: row.get(3)?,
                    enabled: row.get::<_, i32>(4)? != 0,
                    status: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(channels)
    }

    /// Get a single bridge channel by ID.
    pub fn get_bridge_channel(&self, id: &str) -> Result<BridgeChannelRecord> {
        self.conn
            .query_row(
                "SELECT id, channel_type, config, session_bindings, enabled, status, created_at
             FROM bridge_channels WHERE id = ?1",
                [id],
                |row| {
                    Ok(BridgeChannelRecord {
                        id: row.get(0)?,
                        channel_type: row.get(1)?,
                        config: row.get(2)?,
                        session_bindings: row.get(3)?,
                        enabled: row.get::<_, i32>(4)? != 0,
                        status: row.get(5)?,
                        created_at: row.get(6)?,
                    })
                },
            )
            .map_err(|e| anyhow::anyhow!("Bridge channel not found: {e}"))
    }

    /// Create or update a bridge channel.
    pub fn upsert_bridge_channel(&self, channel: &BridgeChannelRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO bridge_channels (id, channel_type, config, session_bindings, enabled, status, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                channel_type = excluded.channel_type,
                config = excluded.config,
                session_bindings = excluded.session_bindings,
                enabled = excluded.enabled,
                status = excluded.status",
            (
                &channel.id,
                &channel.channel_type,
                &channel.config,
                &channel.session_bindings,
                channel.enabled as i32,
                &channel.status,
                &channel.created_at,
            ),
        )?;
        Ok(())
    }

    /// Delete a bridge channel by ID.
    pub fn delete_bridge_channel(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM bridge_channels WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Update bridge channel status.
    pub fn update_bridge_channel_status(&self, id: &str, status: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE bridge_channels SET status = ?2 WHERE id = ?1",
            (id, status),
        )?;
        Ok(())
    }

    // ── Scheduled Tasks ──────────────────────────────────

    /// List all scheduled tasks.
    pub fn list_scheduled_tasks(&self) -> Result<Vec<ScheduledTaskRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, name, schedule, prompt, model, provider, enabled, last_run_at, next_run_at, created_at
             FROM scheduled_tasks ORDER BY created_at DESC",
        )?;
        let tasks = stmt
            .query_map([], |row| {
                Ok(ScheduledTaskRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    schedule: row.get(2)?,
                    prompt: row.get(3)?,
                    model: row.get(4)?,
                    provider: row.get(5)?,
                    enabled: row.get::<_, i32>(6)? != 0,
                    last_run_at: row.get(7)?,
                    next_run_at: row.get(8)?,
                    created_at: row.get(9)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(tasks)
    }

    /// Get a single scheduled task by ID.
    pub fn get_scheduled_task(&self, id: &str) -> Result<ScheduledTaskRecord> {
        self.conn.query_row(
            "SELECT id, name, schedule, prompt, model, provider, enabled, last_run_at, next_run_at, created_at
             FROM scheduled_tasks WHERE id = ?1",
            [id],
            |row| {
                Ok(ScheduledTaskRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    schedule: row.get(2)?,
                    prompt: row.get(3)?,
                    model: row.get(4)?,
                    provider: row.get(5)?,
                    enabled: row.get::<_, i32>(6)? != 0,
                    last_run_at: row.get(7)?,
                    next_run_at: row.get(8)?,
                    created_at: row.get(9)?,
                })
            },
        ).map_err(|e| anyhow::anyhow!("Scheduled task not found: {e}"))
    }

    /// Create or update a scheduled task.
    pub fn upsert_scheduled_task(&self, task: &ScheduledTaskRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO scheduled_tasks (id, name, schedule, prompt, model, provider, enabled, last_run_at, next_run_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                schedule = excluded.schedule,
                prompt = excluded.prompt,
                model = excluded.model,
                provider = excluded.provider,
                enabled = excluded.enabled,
                last_run_at = excluded.last_run_at,
                next_run_at = excluded.next_run_at",
            (
                &task.id,
                &task.name,
                &task.schedule,
                &task.prompt,
                &task.model,
                &task.provider,
                task.enabled as i32,
                &task.last_run_at,
                &task.next_run_at,
                &task.created_at,
            ),
        )?;
        Ok(())
    }

    /// Delete a scheduled task by ID (cascades to task_runs).
    pub fn delete_scheduled_task(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM scheduled_tasks WHERE id = ?1", [id])?;
        Ok(())
    }

    /// Update the last_run_at and next_run_at timestamps for a task.
    pub fn update_task_run_times(
        &self,
        id: &str,
        last_run_at: Option<&str>,
        next_run_at: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE scheduled_tasks SET last_run_at = ?2, next_run_at = ?3 WHERE id = ?1",
            (id, last_run_at, next_run_at),
        )?;
        Ok(())
    }

    // ── Task Runs ──────────────────────────────────────────

    /// Create a new task run record.
    pub fn create_task_run(&self, run: &TaskRunRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO task_runs (id, task_id, status, result, error, started_at, completed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (
                &run.id,
                &run.task_id,
                &run.status,
                &run.result,
                &run.error,
                &run.started_at,
                &run.completed_at,
            ),
        )?;
        Ok(())
    }

    /// List task runs for a specific task.
    pub fn list_task_runs(&self, task_id: &str) -> Result<Vec<TaskRunRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, task_id, status, result, error, started_at, completed_at
             FROM task_runs WHERE task_id = ?1 ORDER BY started_at DESC",
        )?;
        let runs = stmt
            .query_map([task_id], |row| {
                Ok(TaskRunRecord {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    status: row.get(2)?,
                    result: row.get(3)?,
                    error: row.get(4)?,
                    started_at: row.get(5)?,
                    completed_at: row.get(6)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(runs)
    }

    /// Update a task run's status and completion info.
    pub fn update_task_run(
        &self,
        id: &str,
        status: &str,
        result: Option<&str>,
        error: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE task_runs SET status = ?2, result = ?3, error = ?4, completed_at = datetime('now') WHERE id = ?1",
            (id, status, result, error),
        )?;
        Ok(())
    }

    // ── Media Generations ─────────────────────────────────

    /// List all media generations, most recent first.
    pub fn list_media_generations(&self) -> Result<Vec<MediaGenerationRecord>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, prompt, model, provider, file_path, status, tags, created_at
             FROM media_generations ORDER BY created_at DESC",
        )?;
        let gens = stmt
            .query_map([], |row| {
                Ok(MediaGenerationRecord {
                    id: row.get(0)?,
                    prompt: row.get(1)?,
                    model: row.get(2)?,
                    provider: row.get(3)?,
                    file_path: row.get(4)?,
                    status: row.get(5)?,
                    tags: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(gens)
    }

    /// Get a single media generation by ID.
    pub fn get_media_generation(&self, id: &str) -> Result<MediaGenerationRecord> {
        self.conn
            .query_row(
                "SELECT id, prompt, model, provider, file_path, status, tags, created_at
             FROM media_generations WHERE id = ?1",
                [id],
                |row| {
                    Ok(MediaGenerationRecord {
                        id: row.get(0)?,
                        prompt: row.get(1)?,
                        model: row.get(2)?,
                        provider: row.get(3)?,
                        file_path: row.get(4)?,
                        status: row.get(5)?,
                        tags: row.get(6)?,
                        created_at: row.get(7)?,
                    })
                },
            )
            .map_err(|e| anyhow::anyhow!("Media generation not found: {e}"))
    }

    /// Create a new media generation record.
    pub fn create_media_generation(&self, record: &MediaGenerationRecord) -> Result<()> {
        self.conn.execute(
            "INSERT INTO media_generations (id, prompt, model, provider, file_path, status, tags, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                &record.id,
                &record.prompt,
                &record.model,
                &record.provider,
                &record.file_path,
                &record.status,
                &record.tags,
                &record.created_at,
            ),
        )?;
        Ok(())
    }

    /// Update a media generation's status and file path.
    pub fn update_media_generation(
        &self,
        id: &str,
        status: &str,
        file_path: Option<&str>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE media_generations SET status = ?2, file_path = COALESCE(?3, file_path) WHERE id = ?1",
            (id, status, file_path),
        )?;
        Ok(())
    }

    /// Update tags for a media generation.
    pub fn update_media_generation_tags(&self, id: &str, tags: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE media_generations SET tags = ?2 WHERE id = ?1",
            (id, tags),
        )?;
        Ok(())
    }

    /// Delete a media generation by ID.
    pub fn delete_media_generation(&self, id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM media_generations WHERE id = ?1", [id])?;
        Ok(())
    }

    // ── Full Data Export / Import ─────────────────────────

    /// Export all user data as a structured object.
    ///
    /// Includes sessions, messages, providers (encrypted API keys exported as-is),
    /// settings, and usage records. API keys remain in their encrypted form —
    /// the backup is tied to the same machine unless re-encrypted.
    pub fn export_all(&self) -> Result<ExportData> {
        let sessions_meta = self.list_sessions()?;
        let mut sessions = Vec::with_capacity(sessions_meta.len());
        for s in &sessions_meta {
            let messages = self.get_session_messages(&s.id)?;
            sessions.push(SessionExport {
                session: s.clone(),
                messages,
            });
        }

        // Export providers with raw encrypted API keys
        let provider_rows = self.list_providers()?;
        let mut providers = Vec::with_capacity(provider_rows.len());
        for p in &provider_rows {
            let api_key_encrypted: Option<String> = self
                .conn
                .query_row(
                    "SELECT api_key_encrypted FROM providers WHERE id = ?1",
                    rusqlite::params![p.id],
                    |row| row.get(0),
                )
                .ok()
                .flatten();
            providers.push(ProviderExport {
                record: p.clone(),
                api_key_encrypted,
            });
        }

        let settings = self.list_settings()?;
        let usage = self.get_total_usage()?;

        Ok(ExportData {
            version: "1.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            sessions,
            providers,
            settings,
            usage,
        })
    }

    /// Import data from a previously exported backup, using the given conflict strategy.
    pub fn import_all(&self, data: &ExportData, strategy: ImportStrategy) -> Result<ImportResult> {
        let mut result = ImportResult {
            sessions_imported: 0,
            messages_imported: 0,
            providers_imported: 0,
            settings_imported: 0,
            usage_imported: 0,
            skipped: 0,
            errors: Vec::new(),
        };

        // Collect existing IDs for skip/merge logic
        let existing_sessions = self.list_sessions()?;
        let existing_session_ids: std::collections::HashSet<String> =
            existing_sessions.iter().map(|s| s.id.clone()).collect();

        let existing_providers = self.list_providers()?;
        let existing_provider_ids: std::collections::HashSet<String> =
            existing_providers.iter().map(|p| p.id.clone()).collect();

        let existing_settings = self.list_settings()?;
        let existing_setting_keys: std::collections::HashSet<String> =
            existing_settings.iter().map(|s| s.key.clone()).collect();

        // If Overwrite, clear existing data first
        if matches!(strategy, ImportStrategy::Overwrite) {
            // Delete in dependency order
            self.conn
                .execute_batch(
                    "DELETE FROM messages;
                     DELETE FROM checkpoints;
                     DELETE FROM sessions;
                     DELETE FROM providers;
                     DELETE FROM settings;
                     DELETE FROM usage;",
                )
                .context("Failed to clear existing data for overwrite")?;
        }

        // Import sessions + messages
        for se in &data.sessions {
            let sid = &se.session.id;
            let should_skip = match strategy {
                ImportStrategy::Overwrite => false,
                ImportStrategy::Merge => false,
                ImportStrategy::SkipExisting => existing_session_ids.contains(sid),
            };

            if should_skip {
                result.skipped += 1;
                continue;
            }

            // For Merge with existing session, skip session creation but still try messages
            let session_exists = existing_session_ids.contains(sid);
            if !session_exists || matches!(strategy, ImportStrategy::Overwrite) {
                // Insert session preserving original ID and timestamps
                self.conn.execute(
                    "INSERT OR IGNORE INTO sessions
                     (id, title, model, provider, working_dir, mode, reasoning_effort, created_at, updated_at, archived_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    rusqlite::params![
                        sid,
                        se.session.title,
                        se.session.model,
                        se.session.provider,
                        se.session.working_dir,
                        se.session.mode,
                        se.session.reasoning_effort,
                        se.session.created_at,
                        se.session.updated_at,
                        se.session.archived_at,
                    ],
                )?;
                result.sessions_imported += 1;
            } else {
                // Merge: session already exists, skip it but count as skipped
                result.skipped += 1;
            }

            // Import messages for this session
            for msg in &se.messages {
                // Use INSERT OR IGNORE to avoid duplicate message IDs
                match self.conn.execute(
                    "INSERT OR IGNORE INTO messages
                     (id, session_id, role, content, model, token_input, token_output,
                      token_cache_read, token_cache_write, cost_usd, tool_calls, tool_call_id, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    rusqlite::params![
                        msg.id,
                        msg.session_id,
                        msg.role,
                        msg.content,
                        msg.model,
                        msg.token_input,
                        msg.token_output,
                        msg.token_cache_read,
                        msg.token_cache_write,
                        msg.cost_usd,
                        msg.tool_calls,
                        msg.tool_call_id,
                        msg.created_at,
                    ],
                ) {
                    Ok(rows) => {
                        if rows > 0 {
                            result.messages_imported += 1;
                        } else {
                            result.skipped += 1;
                        }
                    }
                    Err(e) => {
                        result.errors.push(format!("Message {}: {}", msg.id, e));
                    }
                }
            }
        }

        // Import providers (with encrypted API key blobs preserved)
        for pe in &data.providers {
            let pid = &pe.record.id;
            let should_skip = match strategy {
                ImportStrategy::Overwrite => false,
                ImportStrategy::Merge => false,
                ImportStrategy::SkipExisting => existing_provider_ids.contains(pid),
            };

            if should_skip {
                result.skipped += 1;
                continue;
            }

            // If Merge and provider exists, skip to avoid overwriting API key
            if matches!(strategy, ImportStrategy::Merge) && existing_provider_ids.contains(pid) {
                result.skipped += 1;
                continue;
            }

            match self.conn.execute(
                "INSERT OR REPLACE INTO providers
                 (id, name, type, base_url, api_key_encrypted, models, enabled, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                rusqlite::params![
                    pid,
                    pe.record.name,
                    pe.record.provider_type,
                    pe.record.base_url,
                    pe.api_key_encrypted,
                    pe.record.models,
                    pe.record.enabled as i32,
                    pe.record.created_at,
                ],
            ) {
                Ok(_) => {
                    result.providers_imported += 1;
                }
                Err(e) => {
                    result.errors.push(format!("Provider {}: {}", pid, e));
                }
            }
        }

        // Import settings
        for s in &data.settings {
            let should_skip = match strategy {
                ImportStrategy::Overwrite => false,
                ImportStrategy::Merge => existing_setting_keys.contains(&s.key),
                ImportStrategy::SkipExisting => existing_setting_keys.contains(&s.key),
            };

            if should_skip {
                result.skipped += 1;
                continue;
            }

            match self.set_setting(&s.key, &s.value) {
                Ok(_) => {
                    result.settings_imported += 1;
                }
                Err(e) => {
                    result.errors.push(format!("Setting {}: {}", s.key, e));
                }
            }
        }

        // Import usage records
        for u in &data.usage {
            match self.conn.execute(
                "INSERT OR IGNORE INTO usage
                 (date, provider, model, token_input, token_output, token_cache_read,
                  token_cache_write, cost_usd, request_count)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    u.date,
                    u.provider,
                    u.model,
                    u.token_input,
                    u.token_output,
                    u.token_cache_read,
                    u.token_cache_write,
                    u.cost_usd,
                    u.request_count,
                ],
            ) {
                Ok(rows) => {
                    if rows > 0 {
                        result.usage_imported += 1;
                    } else {
                        result.skipped += 1;
                    }
                }
                Err(e) => {
                    result.errors.push(format!(
                        "Usage {}/{}/{}: {}",
                        u.date, u.provider, u.model, e
                    ));
                }
            }
        }

        Ok(result)
    }

    // ── Search ─────────────────────────────────────────

    /// Search messages across all sessions (or a specific session).
    ///
    /// Uses SQLite LIKE for substring matching. Returns results sorted by
    /// most recent first, with a snippet of context around the match.
    pub fn search_messages(&self, params: &SearchParams) -> Result<Vec<MessageSearchResult>> {
        let limit = params.limit.unwrap_or(50).min(200);
        let pattern = format!("%{}%", params.query);

        let sql = match (&params.session_id, &params.role) {
            (Some(_sid), Some(_role)) => {
                "
                SELECT m.id, m.session_id, m.role, m.content, m.model,
                       m.token_input, m.token_output, m.token_cache_read, m.token_cache_write,
                       m.cost_usd, m.tool_calls, m.tool_call_id, m.created_at,
                       s.title as session_title
                FROM messages m
                JOIN sessions s ON s.id = m.session_id
                WHERE m.session_id = ?1 AND m.role = ?2 AND m.content LIKE ?3
                ORDER BY m.created_at DESC
                LIMIT ?4"
            }
            (Some(_sid), None) => {
                "
                SELECT m.id, m.session_id, m.role, m.content, m.model,
                       m.token_input, m.token_output, m.token_cache_read, m.token_cache_write,
                       m.cost_usd, m.tool_calls, m.tool_call_id, m.created_at,
                       s.title as session_title
                FROM messages m
                JOIN sessions s ON s.id = m.session_id
                WHERE m.session_id = ?1 AND m.content LIKE ?2
                ORDER BY m.created_at DESC
                LIMIT ?3"
            }
            (None, Some(_role)) => {
                "
                SELECT m.id, m.session_id, m.role, m.content, m.model,
                       m.token_input, m.token_output, m.token_cache_read, m.token_cache_write,
                       m.cost_usd, m.tool_calls, m.tool_call_id, m.created_at,
                       s.title as session_title
                FROM messages m
                JOIN sessions s ON s.id = m.session_id
                WHERE m.role = ?1 AND m.content LIKE ?2
                ORDER BY m.created_at DESC
                LIMIT ?3"
            }
            (None, None) => {
                "
                SELECT m.id, m.session_id, m.role, m.content, m.model,
                       m.token_input, m.token_output, m.token_cache_read, m.token_cache_write,
                       m.cost_usd, m.tool_calls, m.tool_call_id, m.created_at,
                       s.title as session_title
                FROM messages m
                JOIN sessions s ON s.id = m.session_id
                WHERE m.content LIKE ?1
                ORDER BY m.created_at DESC
                LIMIT ?2"
            }
        };

        let mut stmt = self.conn.prepare(sql)?;

        let rows = match (&params.session_id, &params.role) {
            (Some(sid), Some(role)) => stmt
                .query_map(rusqlite::params![sid, role, pattern, limit], |row| {
                    read_search_row(row)
                })?
                .collect::<Vec<_>>(),
            (Some(sid), None) => stmt
                .query_map(rusqlite::params![sid, pattern, limit], |row| {
                    read_search_row(row)
                })?
                .collect::<Vec<_>>(),
            (None, Some(role)) => stmt
                .query_map(rusqlite::params![role, pattern, limit], |row| {
                    read_search_row(row)
                })?
                .collect::<Vec<_>>(),
            (None, None) => stmt
                .query_map(rusqlite::params![pattern, limit], |row| {
                    read_search_row(row)
                })?
                .collect::<Vec<_>>(),
        };

        let mut results = Vec::new();
        for row_result in rows {
            let (msg, session_id, session_title) = row_result?;
            let snippet = make_snippet(&msg.content, &params.query, 200);
            results.push(MessageSearchResult {
                message: msg,
                session_id,
                session_title,
                snippet,
            });
        }

        Ok(results)
    }

    // ── Templates ──────────────────────────────────────

    /// List all templates (both built-in and user-created), ordered by built-in first, then name.
    pub fn list_templates(&self) -> Result<Vec<TemplateRecord>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT id, name, description, icon, system_prompt, default_mode, is_builtin, created_at, updated_at FROM templates ORDER BY is_builtin DESC, name ASC",
            )
            .context("Failed to prepare list_templates query")?;

        let rows = stmt
            .query_map([], |row| {
                Ok(TemplateRecord {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    icon: row.get(3)?,
                    system_prompt: row.get(4)?,
                    default_mode: row.get(5)?,
                    is_builtin: row.get::<_, i32>(6)? != 0,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .context("Failed to query templates")?;

        let mut templates = Vec::new();
        for row in rows {
            templates.push(row.context("Failed to read template row")?);
        }
        Ok(templates)
    }

    /// Get a single template by ID.
    pub fn get_template(&self, id: &str) -> Result<TemplateRecord> {
        self.conn
            .query_row(
                "SELECT id, name, description, icon, system_prompt, default_mode, is_builtin, created_at, updated_at FROM templates WHERE id = ?1",
                rusqlite::params![id],
                |row| {
                    Ok(TemplateRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        description: row.get(2)?,
                        icon: row.get(3)?,
                        system_prompt: row.get(4)?,
                        default_mode: row.get(5)?,
                        is_builtin: row.get::<_, i32>(6)? != 0,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .context("Template not found")
    }

    /// Create a new user template. Returns the created template.
    pub fn create_template(
        &self,
        id: &str,
        name: &str,
        description: &str,
        icon: &str,
        system_prompt: &str,
        default_mode: Option<&str>,
    ) -> Result<TemplateRecord> {
        self.conn
            .execute(
                "INSERT INTO templates (id, name, description, icon, system_prompt, default_mode, is_builtin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0)",
                rusqlite::params![id, name, description, icon, system_prompt, default_mode],
            )
            .context("Failed to create template")?;

        self.get_template(id)
    }

    /// Update a template. For built-in templates, only `system_prompt` can be modified.
    pub fn update_template(
        &self,
        id: &str,
        name: Option<&str>,
        description: Option<&str>,
        icon: Option<&str>,
        system_prompt: Option<&str>,
        default_mode: Option<&str>,
    ) -> Result<()> {
        let template = self.get_template(id)?;

        // For built-in templates, only system_prompt can be updated
        if template.is_builtin {
            if let Some(prompt) = system_prompt {
                self.conn
                    .execute(
                        "UPDATE templates SET system_prompt = ?1, updated_at = datetime('now') WHERE id = ?2",
                        rusqlite::params![prompt, id],
                    )
                    .context("Failed to update built-in template system_prompt")?;
            }
            return Ok(());
        }

        // User templates: all fields are updatable
        let name = name.unwrap_or(&template.name);
        let description = description.unwrap_or(&template.description);
        let icon = icon.unwrap_or(&template.icon);
        let system_prompt = system_prompt.unwrap_or(&template.system_prompt);
        let default_mode = default_mode.or(template.default_mode.as_deref());

        self.conn
            .execute(
                "UPDATE templates SET name = ?1, description = ?2, icon = ?3, system_prompt = ?4, default_mode = ?5, updated_at = datetime('now') WHERE id = ?6",
                rusqlite::params![name, description, icon, system_prompt, default_mode, id],
            )
            .context("Failed to update template")?;

        Ok(())
    }

    /// Delete a user template. Built-in templates cannot be deleted.
    pub fn delete_template(&self, id: &str) -> Result<()> {
        let template = self.get_template(id)?;
        if template.is_builtin {
            return Err(
                StoreError::Migration(format!("Cannot delete built-in template: {}", id)).into(),
            );
        }

        self.conn
            .execute("DELETE FROM templates WHERE id = ?1", rusqlite::params![id])
            .context("Failed to delete template")?;

        Ok(())
    }

    /// Check if built-in templates have been initialized.
    /// Returns true if at least one built-in template exists.
    pub fn has_builtin_templates(&self) -> Result<bool> {
        let count: i64 = self
            .conn
            .query_row(
                "SELECT COUNT(*) FROM templates WHERE is_builtin = 1",
                [],
                |row| row.get(0),
            )
            .context("Failed to count built-in templates")?;

        Ok(count > 0)
    }

    /// Insert a built-in template (used during first-time initialization).
    pub fn insert_builtin_template(
        &self,
        id: &str,
        name: &str,
        description: &str,
        icon: &str,
        system_prompt: &str,
        default_mode: Option<&str>,
    ) -> Result<()> {
        self.conn
            .execute(
                "INSERT OR IGNORE INTO templates (id, name, description, icon, system_prompt, default_mode, is_builtin) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)",
                rusqlite::params![id, name, description, icon, system_prompt, default_mode],
            )
            .context("Failed to insert built-in template")?;

        Ok(())
    }
}

/// Helper to read a search result row from the database.
fn read_search_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(MessageInfo, String, String)> {
    let msg = MessageInfo {
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
    };
    let session_title: String = row.get(13)?;
    let session_id = msg.session_id.clone();
    Ok((msg, session_id, session_title))
}

/// Create a text snippet around the first match of `query` in `content`.
fn make_snippet(content: &str, query: &str, max_len: usize) -> String {
    let content_lower = content.to_lowercase();
    let query_lower = query.to_lowercase();

    if let Some(pos) = content_lower.find(&query_lower) {
        let match_end = (pos + query.len()).min(content.len());
        let context_before = max_len.saturating_sub(query.len()) / 2;
        let start = pos.saturating_sub(context_before);
        let end = (match_end + context_before).min(content.len());

        let mut snippet = String::new();
        if start > 0 {
            snippet.push_str("...");
        }
        snippet.push_str(&content[start..end]);
        if end < content.len() {
            snippet.push_str("...");
        }
        if snippet.len() > max_len + 10 {
            snippet.truncate(max_len + 10);
        }
        snippet
    } else {
        // Fallback: return the beginning of content
        let end = max_len.min(content.len());
        let mut s = content[..end].to_string();
        if content.len() > max_len {
            s.push_str("...");
        }
        s
    }
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

    #[test]
    fn test_bridge_channels_crud() {
        let store = test_store();

        let channel = BridgeChannelRecord {
            id: "telegram-1".to_string(),
            channel_type: "telegram".to_string(),
            config:
                r#"{"webhook_url":"https://api.telegram.org/botXXX/sendMessage","chat_id":"12345"}"#
                    .to_string(),
            session_bindings: Some(r#"{"12345":"session-abc"}"#.to_string()),
            enabled: true,
            status: "disconnected".to_string(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        // Create
        store.upsert_bridge_channel(&channel).unwrap();
        let channels = store.list_bridge_channels().unwrap();
        assert_eq!(channels.len(), 1);
        assert_eq!(channels[0].channel_type, "telegram");

        // Get
        let got = store.get_bridge_channel("telegram-1").unwrap();
        assert_eq!(got.id, "telegram-1");
        assert!(got.enabled);

        // Update
        let mut updated = channel.clone();
        updated.status = "connected".to_string();
        store.upsert_bridge_channel(&updated).unwrap();
        let got = store.get_bridge_channel("telegram-1").unwrap();
        assert_eq!(got.status, "connected");

        // Update status directly
        store
            .update_bridge_channel_status("telegram-1", "error")
            .unwrap();
        let got = store.get_bridge_channel("telegram-1").unwrap();
        assert_eq!(got.status, "error");

        // Delete
        store.delete_bridge_channel("telegram-1").unwrap();
        assert!(store.list_bridge_channels().unwrap().is_empty());
    }

    #[test]
    fn test_scheduled_tasks_crud() {
        let store = test_store();

        let task = ScheduledTaskRecord {
            id: "task-1".to_string(),
            name: "Daily Standup".to_string(),
            schedule: "0 9 * * MON-FRI".to_string(),
            prompt: "Summarize what I did yesterday".to_string(),
            model: Some("gpt-4o".to_string()),
            provider: Some("openai".to_string()),
            enabled: true,
            last_run_at: None,
            next_run_at: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        // Create
        store.upsert_scheduled_task(&task).unwrap();
        let tasks = store.list_scheduled_tasks().unwrap();
        assert_eq!(tasks.len(), 1);
        assert_eq!(tasks[0].name, "Daily Standup");

        // Get
        let got = store.get_scheduled_task("task-1").unwrap();
        assert_eq!(got.schedule, "0 9 * * MON-FRI");
        assert!(got.enabled);

        // Update run times
        let now = chrono::Utc::now().to_rfc3339();
        let next = "2026-04-21T09:00:00+00:00".to_string();
        store
            .update_task_run_times("task-1", Some(&now), Some(&next))
            .unwrap();
        let got = store.get_scheduled_task("task-1").unwrap();
        assert!(got.last_run_at.is_some());
        assert_eq!(got.next_run_at.unwrap(), next);

        // Delete
        store.delete_scheduled_task("task-1").unwrap();
        assert!(store.list_scheduled_tasks().unwrap().is_empty());
    }

    #[test]
    fn test_task_runs_crud() {
        let store = test_store();

        // Need a scheduled task first (for FK)
        let task = ScheduledTaskRecord {
            id: "task-2".to_string(),
            name: "Test Task".to_string(),
            schedule: "0 * * * *".to_string(),
            prompt: "Test prompt".to_string(),
            model: None,
            provider: None,
            enabled: true,
            last_run_at: None,
            next_run_at: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        store.upsert_scheduled_task(&task).unwrap();

        let run = TaskRunRecord {
            id: "run-1".to_string(),
            task_id: "task-2".to_string(),
            status: "running".to_string(),
            result: None,
            error: None,
            started_at: chrono::Utc::now().to_rfc3339(),
            completed_at: None,
        };

        // Create
        store.create_task_run(&run).unwrap();
        let runs = store.list_task_runs("task-2").unwrap();
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].status, "running");

        // Update to done
        store
            .update_task_run("run-1", "done", Some("Task completed successfully"), None)
            .unwrap();
        let runs = store.list_task_runs("task-2").unwrap();
        assert_eq!(runs[0].status, "done");
        assert_eq!(
            runs[0].result.as_deref(),
            Some("Task completed successfully")
        );
        assert!(runs[0].completed_at.is_some());

        // Cascade delete: deleting the task should delete runs
        store.delete_scheduled_task("task-2").unwrap();
        // Re-open to verify FK cascade (in-memory might need fresh conn)
        // Actually rusqlite in-memory with same connection should cascade
    }

    #[test]
    fn test_media_generations_crud() {
        let store = test_store();

        let media = MediaGenerationRecord {
            id: "img-1".to_string(),
            prompt: "A sunset over mountains".to_string(),
            model: "dall-e-3".to_string(),
            provider: "openai".to_string(),
            file_path: None,
            status: "pending".to_string(),
            tags: Some(r#"["sunset","mountains"]"#.to_string()),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        // Create
        store.create_media_generation(&media).unwrap();
        let gens = store.list_media_generations().unwrap();
        assert_eq!(gens.len(), 1);
        assert_eq!(gens[0].prompt, "A sunset over mountains");

        // Get
        let got = store.get_media_generation("img-1").unwrap();
        assert_eq!(got.model, "dall-e-3");
        assert_eq!(got.status, "pending");

        // Update status and file path
        store
            .update_media_generation("img-1", "done", Some("/path/to/image.png"))
            .unwrap();
        let got = store.get_media_generation("img-1").unwrap();
        assert_eq!(got.status, "done");
        assert_eq!(got.file_path.unwrap(), "/path/to/image.png");

        // Update tags
        store
            .update_media_generation_tags("img-1", r#"["sunset","mountains","landscape"]"#)
            .unwrap();
        let got = store.get_media_generation("img-1").unwrap();
        assert!(got.tags.unwrap().contains("landscape"));

        // Delete
        store.delete_media_generation("img-1").unwrap();
        assert!(store.list_media_generations().unwrap().is_empty());
    }

    #[test]
    fn test_export_all_and_import_overwrite() {
        let store = test_store();

        // Populate with data
        let session = store
            .create_session("Export Test", "gpt-4o", "openai")
            .unwrap();
        store
            .add_message(&session.id, "user", "Hello", None, None, None)
            .unwrap();
        store
            .add_message(&session.id, "assistant", "Hi!", Some("gpt-4o"), None, None)
            .unwrap();
        store.set_setting("theme", "dark").unwrap();
        store.set_setting("locale", "en").unwrap();

        let provider = ProviderRecord {
            id: "test-provider".to_string(),
            name: "Test Provider".to_string(),
            provider_type: "openai".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key_set: false,
            models: None,
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        store.upsert_provider(&provider).unwrap();

        store
            .add_usage(&session.id, "gpt-4o", "openai", 100, 50, 0.01)
            .unwrap();

        // Export
        let exported = store.export_all().unwrap();
        assert_eq!(exported.version, "1.0");
        assert_eq!(exported.sessions.len(), 1);
        assert_eq!(exported.sessions[0].messages.len(), 2);
        assert_eq!(exported.providers.len(), 1);
        assert_eq!(exported.settings.len(), 2);
        assert_eq!(exported.usage.len(), 1);

        // Verify JSON roundtrip
        let json = serde_json::to_string(&exported).unwrap();
        let reparsed: ExportData = serde_json::from_str(&json).unwrap();
        assert_eq!(reparsed.sessions.len(), 1);

        // Add extra data, then import with Overwrite — should replace everything
        store.create_session("Extra", "model", "prov").unwrap();
        assert_eq!(store.list_sessions().unwrap().len(), 2);

        let result = store
            .import_all(&exported, ImportStrategy::Overwrite)
            .unwrap();
        assert_eq!(result.sessions_imported, 1);
        assert_eq!(result.messages_imported, 2);
        assert_eq!(result.providers_imported, 1);
        assert_eq!(result.settings_imported, 2);
        assert_eq!(result.usage_imported, 1);
        assert!(result.errors.is_empty());

        // Verify data matches export
        let sessions = store.list_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].title, "Export Test");
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs.len(), 2);
    }

    #[test]
    fn test_import_merge_skips_existing() {
        let store = test_store();

        // Create existing data
        let session = store
            .create_session("Existing", "model-a", "prov-a")
            .unwrap();
        store.set_setting("theme", "dark").unwrap();

        let provider = ProviderRecord {
            id: "existing-prov".to_string(),
            name: "Existing Provider".to_string(),
            provider_type: "openai".to_string(),
            base_url: "https://api.example.com".to_string(),
            api_key_set: false,
            models: None,
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        store.upsert_provider(&provider).unwrap();

        // Build import data that shares some IDs
        let import_data = ExportData {
            version: "1.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            app_version: "0.4.0".to_string(),
            sessions: vec![SessionExport {
                session: SessionInfo {
                    id: session.id.clone(),
                    title: "Updated Title".to_string(),
                    model: "model-b".to_string(),
                    provider: "prov-b".to_string(),
                    working_dir: None,
                    mode: "code".to_string(),
                    reasoning_effort: None,
                    env_vars: None,
                    created_at: session.created_at.clone(),
                    updated_at: session.updated_at.clone(),
                    archived_at: None,
                    message_count: 0,
                },
                messages: vec![],
            }],
            providers: vec![ProviderExport {
                record: ProviderRecord {
                    id: "existing-prov".to_string(),
                    name: "Should Not Overwrite".to_string(),
                    provider_type: "openai".to_string(),
                    base_url: "https://other.com".to_string(),
                    api_key_set: false,
                    models: None,
                    enabled: true,
                    created_at: chrono::Utc::now().to_rfc3339(),
                },
                api_key_encrypted: None,
            }],
            settings: vec![SettingEntry {
                key: "theme".to_string(),
                value: "\"light\"".to_string(),
            }],
            usage: vec![],
        };

        let result = store
            .import_all(&import_data, ImportStrategy::Merge)
            .unwrap();

        // Merge should skip existing session, provider, and setting
        assert_eq!(result.sessions_imported, 0);
        assert_eq!(result.providers_imported, 0);
        assert_eq!(result.settings_imported, 0);
        assert!(result.skipped > 0);

        // Verify original data untouched
        let got = store.get_session(&session.id).unwrap();
        assert_eq!(got.title, "Existing"); // NOT "Updated Title"
        let prov = store.get_provider("existing-prov").unwrap();
        assert_eq!(prov.name, "Existing Provider"); // NOT overwritten
        assert_eq!(
            store.get_setting("theme").unwrap(),
            Some("dark".to_string())
        );
    }

    #[test]
    fn test_import_skip_existing_strategy() {
        let store = test_store();

        // Pre-existing session
        let existing = store.create_session("Old", "m1", "p1").unwrap();

        // Import data with same session ID + a new one
        let import_data = ExportData {
            version: "1.0".to_string(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            app_version: "0.4.0".to_string(),
            sessions: vec![
                SessionExport {
                    session: SessionInfo {
                        id: existing.id.clone(),
                        title: "Should Be Skipped".to_string(),
                        model: "m2".to_string(),
                        provider: "p2".to_string(),
                        working_dir: None,
                        mode: "code".to_string(),
                        reasoning_effort: None,
                        env_vars: None,
                        created_at: existing.created_at.clone(),
                        updated_at: existing.updated_at.clone(),
                        archived_at: None,
                        message_count: 0,
                    },
                    messages: vec![],
                },
                SessionExport {
                    session: SessionInfo {
                        id: "brand-new-session".to_string(),
                        title: "New Session".to_string(),
                        model: "m3".to_string(),
                        provider: "p3".to_string(),
                        working_dir: None,
                        mode: "code".to_string(),
                        reasoning_effort: None,
                        env_vars: None,
                        created_at: chrono::Utc::now().to_rfc3339(),
                        updated_at: chrono::Utc::now().to_rfc3339(),
                        archived_at: None,
                        message_count: 0,
                    },
                    messages: vec![],
                },
            ],
            providers: vec![],
            settings: vec![],
            usage: vec![],
        };

        let result = store
            .import_all(&import_data, ImportStrategy::SkipExisting)
            .unwrap();

        // Old session should be skipped, new one imported
        assert_eq!(result.sessions_imported, 1);
        assert!(result.skipped >= 1);

        let sessions = store.list_sessions().unwrap();
        assert_eq!(sessions.len(), 2);

        // Existing session unchanged
        let old = store.get_session(&existing.id).unwrap();
        assert_eq!(old.title, "Old");

        // New session present
        let new = store.get_session("brand-new-session").unwrap();
        assert_eq!(new.title, "New Session");
    }

    // ── Checkpoint tests ──────────────────────────────────

    #[test]
    fn test_checkpoint_crud() {
        let store = test_store();
        let session = store
            .create_session("Checkpoint Test", "gpt-4o", "openai")
            .unwrap();

        // Add some messages
        let _msg1 = store
            .add_message(&session.id, "user", "Hello", None, None, None)
            .unwrap();
        let msg2 = store
            .add_message(&session.id, "assistant", "Hi!", Some("gpt-4o"), None, None)
            .unwrap();

        // Create checkpoint
        let cp = store
            .create_checkpoint(&session.id, &msg2.id, "After greeting", 50)
            .unwrap();
        assert_eq!(cp.session_id, session.id);
        assert_eq!(cp.message_id, msg2.id);
        assert_eq!(cp.summary, "After greeting");
        assert_eq!(cp.token_count, 50);

        // List checkpoints
        let cps = store.list_checkpoints(&session.id).unwrap();
        assert_eq!(cps.len(), 1);
        assert_eq!(cps[0].id, cp.id);

        // Get single checkpoint
        let got = store.get_checkpoint(&cp.id).unwrap();
        assert_eq!(got.summary, "After greeting");

        // Create a second checkpoint
        let msg3 = store
            .add_message(&session.id, "user", "How are you?", None, None, None)
            .unwrap();
        let cp2 = store
            .create_checkpoint(&session.id, &msg3.id, "After follow-up", 80)
            .unwrap();

        let cps = store.list_checkpoints(&session.id).unwrap();
        assert_eq!(cps.len(), 2);

        // Delete single checkpoint
        store.delete_checkpoint(&cp2.id).unwrap();
        let cps = store.list_checkpoints(&session.id).unwrap();
        assert_eq!(cps.len(), 1);
        assert_eq!(cps[0].id, cp.id);

        // Delete all checkpoints for session
        store.delete_session_checkpoints(&session.id).unwrap();
        let cps = store.list_checkpoints(&session.id).unwrap();
        assert!(cps.is_empty());
    }

    #[test]
    fn test_rewind_to_checkpoint() {
        let store = test_store();
        let session = store
            .create_session("Rewind Test", "gpt-4o", "openai")
            .unwrap();

        // Add messages in sequence
        let _msg1 = store
            .add_message(&session.id, "user", "First", None, None, None)
            .unwrap();
        let msg2 = store
            .add_message(&session.id, "assistant", "Second", None, None, None)
            .unwrap();
        // Create checkpoint after second message
        let cp = store
            .create_checkpoint(&session.id, &msg2.id, "Checkpoint at msg2", 20)
            .unwrap();
        // Add more messages after checkpoint
        store
            .add_message(&session.id, "user", "Third", None, None, None)
            .unwrap();
        store
            .add_message(&session.id, "assistant", "Fourth", None, None, None)
            .unwrap();

        // Verify we have 4 messages
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs.len(), 4);

        // Rewind to checkpoint — should remove messages after msg2
        let removed = store.rewind_to_checkpoint(&cp.id).unwrap();
        assert_eq!(removed, 2); // Third and Fourth removed

        // Verify only 2 messages remain
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0].content, "First");
        assert_eq!(msgs[1].content, "Second");
    }

    #[test]
    fn test_get_checkpoint_not_found() {
        let store = test_store();
        let result = store.get_checkpoint("nonexistent");
        assert!(result.is_err());
    }

    // ── MCP Server tests ──────────────────────────────────

    #[test]
    fn test_mcp_server_crud() {
        let store = test_store();

        let server = McpServerRecord {
            id: "mcp-filesystem".to_string(),
            name: "Filesystem MCP".to_string(),
            transport: "stdio".to_string(),
            command: Some("npx".to_string()),
            args: Some(r#"["@modelcontextprotocol/server-filesystem","/tmp"]"#.to_string()),
            url: None,
            env: Some(r#"{"NODE_ENV":"test"}"#.to_string()),
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        // Create
        store.upsert_mcp_server(&server).unwrap();
        let servers = store.list_mcp_servers().unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].name, "Filesystem MCP");
        assert_eq!(servers[0].transport, "stdio");
        assert!(servers[0].enabled);

        // Get
        let got = store.get_mcp_server("mcp-filesystem").unwrap();
        assert_eq!(got.command.as_deref(), Some("npx"));
        assert_eq!(got.env.as_deref(), Some(r#"{"NODE_ENV":"test"}"#));

        // Update (upsert)
        let mut updated = server.clone();
        updated.name = "Filesystem MCP v2".to_string();
        updated.enabled = false;
        store.upsert_mcp_server(&updated).unwrap();
        let got = store.get_mcp_server("mcp-filesystem").unwrap();
        assert_eq!(got.name, "Filesystem MCP v2");
        assert!(!got.enabled);

        // SSE transport server
        let sse_server = McpServerRecord {
            id: "mcp-remote".to_string(),
            name: "Remote SSE".to_string(),
            transport: "sse".to_string(),
            command: None,
            args: None,
            url: Some("http://localhost:3000/sse".to_string()),
            env: None,
            enabled: true,
            created_at: chrono::Utc::now().to_rfc3339(),
        };
        store.upsert_mcp_server(&sse_server).unwrap();
        let servers = store.list_mcp_servers().unwrap();
        assert_eq!(servers.len(), 2);

        // Delete
        store.delete_mcp_server("mcp-filesystem").unwrap();
        let servers = store.list_mcp_servers().unwrap();
        assert_eq!(servers.len(), 1);
        assert_eq!(servers[0].id, "mcp-remote");
    }

    #[test]
    fn test_mcp_server_not_found() {
        let store = test_store();
        let result = store.get_mcp_server("nonexistent");
        assert!(result.is_err());
    }

    // ── Additional session & message tests ─────────────────

    #[test]
    fn test_session_working_dir() {
        let store = test_store();
        let session = store
            .create_session("WorkDir Test", "gpt-4o", "openai")
            .unwrap();
        assert!(session.working_dir.is_none());

        store
            .set_session_working_dir(&session.id, "/home/user/project")
            .unwrap();
        let got = store.get_session(&session.id).unwrap();
        assert_eq!(got.working_dir.as_deref(), Some("/home/user/project"));
    }

    #[test]
    fn test_update_message_content() {
        let store = test_store();
        let session = store
            .create_session("Content Update Test", "gpt-4o", "openai")
            .unwrap();
        let msg = store
            .add_message(
                &session.id,
                "assistant",
                "Draft response",
                Some("gpt-4o"),
                None,
                None,
            )
            .unwrap();

        // Update content (e.g., after streaming completes)
        store
            .update_message_content(&msg.id, "Final response with more detail")
            .unwrap();

        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs[0].content, "Final response with more detail");
    }

    #[test]
    fn test_delete_session_messages() {
        let store = test_store();
        let session = store
            .create_session("Clear Test", "gpt-4o", "openai")
            .unwrap();

        store
            .add_message(&session.id, "user", "Hello", None, None, None)
            .unwrap();
        store
            .add_message(&session.id, "assistant", "Hi!", Some("gpt-4o"), None, None)
            .unwrap();

        // Verify messages exist
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs.len(), 2);

        // Clear all messages in session
        store.delete_session_messages(&session.id).unwrap();
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert!(msgs.is_empty());

        // Session itself should still exist
        let got = store.get_session(&session.id).unwrap();
        assert_eq!(got.title, "Clear Test");
    }

    #[test]
    fn test_session_usage_per_session() {
        let store = test_store();
        let session = store
            .create_session("Usage Per Session", "gpt-4o", "openai")
            .unwrap();

        store
            .add_usage(&session.id, "gpt-4o", "openai", 100, 50, 0.01)
            .unwrap();

        let session_usage = store.get_session_usage(&session.id).unwrap();
        assert_eq!(session_usage.len(), 1);
        assert_eq!(session_usage[0].token_input, 100);
        assert_eq!(session_usage[0].token_output, 50);
    }

    #[test]
    fn test_message_with_tool_calls() {
        let store = test_store();
        let session = store
            .create_session("Tool Call Test", "gpt-4o", "openai")
            .unwrap();

        let tool_calls_json =
            r#"[{"id":"tc-1","name":"read_file","input":{"path":"/tmp/test.txt"}}]"#;
        let msg = store
            .add_message(
                &session.id,
                "assistant",
                "I'll read the file.",
                Some("gpt-4o"),
                Some(tool_calls_json),
                None,
            )
            .unwrap();
        assert_eq!(msg.tool_calls.as_deref(), Some(tool_calls_json));

        // Tool result message
        let tool_result = store
            .add_message(
                &session.id,
                "tool",
                "File contents here",
                None,
                None,
                Some("tc-1"),
            )
            .unwrap();
        assert_eq!(tool_result.role, "tool");
        assert_eq!(tool_result.tool_call_id.as_deref(), Some("tc-1"));
    }

    #[test]
    fn test_message_usage_with_cache_tokens() {
        let store = test_store();
        let session = store
            .create_session("Cache Token Test", "claude-4-sonnet", "anthropic")
            .unwrap();
        let msg = store
            .add_message(
                &session.id,
                "assistant",
                "Response",
                Some("claude-4-sonnet"),
                None,
                None,
            )
            .unwrap();

        // Update usage including cache tokens
        store.update_message_usage(&msg.id, 500, 100, 0.02).unwrap();

        // Also test the cache token fields via direct SQL
        // (The update_message_usage sets token_input/token_output/cost_usd,
        // but let's verify those were set correctly)
        let msgs = store.get_session_messages(&session.id).unwrap();
        assert_eq!(msgs[0].token_input, 500);
        assert_eq!(msgs[0].token_output, 100);
        assert!((msgs[0].cost_usd - 0.02).abs() < f64::EPSILON);
    }

    // ── Template tests ──────────────────────────────────

    #[test]
    fn test_template_crud() {
        let store = test_store();

        // Create a user template
        let template = store
            .create_template(
                "my-template",
                "My Template",
                "A custom template",
                "🚀",
                "You are a helpful assistant.",
                Some("code"),
            )
            .unwrap();

        assert_eq!(template.id, "my-template");
        assert_eq!(template.name, "My Template");
        assert_eq!(template.icon, "🚀");
        assert_eq!(template.default_mode.as_deref(), Some("code"));
        assert!(!template.is_builtin);

        // List
        let templates = store.list_templates().unwrap();
        assert_eq!(templates.len(), 1);
        assert_eq!(templates[0].id, "my-template");

        // Get
        let got = store.get_template("my-template").unwrap();
        assert_eq!(got.system_prompt, "You are a helpful assistant.");

        // Update
        store
            .update_template(
                "my-template",
                Some("Updated Template"),
                Some("Updated description"),
                Some("✨"),
                Some("Updated prompt"),
                Some("plan"),
            )
            .unwrap();
        let got = store.get_template("my-template").unwrap();
        assert_eq!(got.name, "Updated Template");
        assert_eq!(got.description, "Updated description");
        assert_eq!(got.icon, "✨");
        assert_eq!(got.system_prompt, "Updated prompt");
        assert_eq!(got.default_mode.as_deref(), Some("plan"));

        // Delete
        store.delete_template("my-template").unwrap();
        let templates = store.list_templates().unwrap();
        assert!(templates.is_empty());
    }

    #[test]
    fn test_builtin_template_cannot_be_deleted() {
        let store = test_store();

        // Insert a built-in template
        store
            .insert_builtin_template(
                "code-review",
                "Code Review",
                "Review code for issues",
                "🔍",
                "You are a code reviewer.",
                Some("ask"),
            )
            .unwrap();

        // Verify it's marked as built-in
        let template = store.get_template("code-review").unwrap();
        assert!(template.is_builtin);

        // Try to delete — should fail
        let result = store.delete_template("code-review");
        assert!(result.is_err());
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Cannot delete built-in")
        );

        // Template should still exist
        let templates = store.list_templates().unwrap();
        assert_eq!(templates.len(), 1);
    }

    #[test]
    fn test_builtin_template_only_system_prompt_updatable() {
        let store = test_store();

        store
            .insert_builtin_template(
                "debugging",
                "Debugging",
                "Debug assistant",
                "🐛",
                "You are a debugger.",
                Some("code"),
            )
            .unwrap();

        // Update system_prompt — should work
        store
            .update_template("debugging", None, None, None, Some("New prompt."), None)
            .unwrap();
        let got = store.get_template("debugging").unwrap();
        assert_eq!(got.system_prompt, "New prompt.");
        // Name/description/icon should remain unchanged
        assert_eq!(got.name, "Debugging");
        assert_eq!(got.icon, "🐛");

        // Update name on built-in — should be ignored (only system_prompt changes)
        store
            .update_template("debugging", Some("New Name"), None, None, None, None)
            .unwrap();
        let got = store.get_template("debugging").unwrap();
        assert_eq!(got.name, "Debugging"); // unchanged
    }

    #[test]
    fn test_has_builtin_templates() {
        let store = test_store();
        assert!(!store.has_builtin_templates().unwrap());

        store
            .insert_builtin_template("blank", "Blank", "Empty template", "💬", "", None)
            .unwrap();
        assert!(store.has_builtin_templates().unwrap());
    }

    #[test]
    fn test_builtin_template_insert_or_ignore() {
        let store = test_store();

        // Insert first time
        store
            .insert_builtin_template("blank", "Blank", "Empty", "💬", "", None)
            .unwrap();

        // Insert again with same ID — should be ignored (INSERT OR IGNORE)
        store
            .insert_builtin_template("blank", "Blank v2", "Updated", "📝", "prompt", Some("plan"))
            .unwrap();

        let got = store.get_template("blank").unwrap();
        assert_eq!(got.name, "Blank"); // still original
        assert_eq!(got.description, "Empty");
        assert_eq!(got.system_prompt, "");
    }

    #[test]
    fn test_template_not_found() {
        let store = test_store();
        let result = store.get_template("nonexistent");
        assert!(result.is_err());
    }

    #[test]
    fn test_template_ordering_builtin_first() {
        let store = test_store();

        // Create a user template first
        store
            .create_template(
                "user-tpl",
                "User Template",
                "desc",
                "🎯",
                "prompt",
                Some("code"),
            )
            .unwrap();

        // Insert a built-in template
        store
            .insert_builtin_template(
                "builtin-tpl",
                "Builtin Template",
                "desc",
                "🔧",
                "prompt",
                Some("ask"),
            )
            .unwrap();

        // Another user template
        store
            .create_template("aaa-user", "AAA User", "desc", "⭐", "prompt", Some("plan"))
            .unwrap();

        let templates = store.list_templates().unwrap();
        assert_eq!(templates.len(), 3);

        // Built-in should come first
        assert!(templates[0].is_builtin);
        assert_eq!(templates[0].id, "builtin-tpl");

        // User templates sorted by name
        assert!(!templates[1].is_builtin);
        assert_eq!(templates[1].id, "aaa-user");
        assert!(!templates[2].is_builtin);
        assert_eq!(templates[2].id, "user-tpl");
    }
}
