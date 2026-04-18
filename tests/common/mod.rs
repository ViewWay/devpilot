//! Common test utilities for DevPilot integration tests.
//!
//! This module provides shared fixtures and helpers for integration tests.

/// Test helper to create a temporary database for testing.
pub fn create_test_db() -> Result<rusqlite::Connection, String> {
    rusqlite::Connection::open_in_memory()
        .map_err(|e| format!("Failed to create test db: {}", e))
}

/// Test helper to run database migrations.
pub fn run_test_migrations(conn: &mut rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )
    .map_err(|e| format!("Failed to set pragmas: {}", e))?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL DEFAULT 'New Chat',
            model TEXT NOT NULL DEFAULT '',
            provider TEXT NOT NULL DEFAULT '',
            working_dir TEXT,
            mode TEXT NOT NULL DEFAULT 'code',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
            cost_usd REAL DEFAULT 0.0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);",
    )
    .map_err(|e| format!("Failed to create tables: {}", e))?;

    Ok(())
}
