use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

pub mod commands;

/// Run the Tauri application.
pub fn run() {
    let state = AppState::new().expect("Failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::list_sessions,
            commands::create_session,
            commands::get_setting,
            commands::set_setting,
            commands::list_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Global application state shared across all Tauri commands.
pub struct AppState {
    pub db: Arc<Mutex<Database>>,
}

impl AppState {
    pub fn new() -> anyhow::Result<Self> {
        let db = Database::new()?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
        })
    }
}

/// SQLite database wrapper.
pub struct Database {
    pub conn: rusqlite::Connection,
}

impl Database {
    pub fn new() -> anyhow::Result<Self> {
        let conn = rusqlite::Connection::open_in_memory()?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;
        let db = Self { conn };
        db.run_migrations()?;
        Ok(db)
    }

    fn run_migrations(&self) -> anyhow::Result<()> {
        self.conn.execute_batch(
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
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                token_input INTEGER DEFAULT 0,
                token_output INTEGER DEFAULT 0,
                cost_usd REAL DEFAULT 0.0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS providers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                base_url TEXT NOT NULL,
                api_key_encrypted TEXT,
                models TEXT,
                enabled INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
        )?;
        Ok(())
    }
}

/// Ping response.
#[derive(Serialize, Deserialize)]
pub struct PingResponse {
    pub message: String,
    pub version: String,
    pub timestamp: String,
}

/// Session info.
#[derive(Serialize, Deserialize, Clone)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub model: String,
    pub provider: String,
    pub working_dir: Option<String>,
    pub mode: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Settings key-value pair.
#[derive(Serialize, Deserialize)]
pub struct SettingEntry {
    pub key: String,
    pub value: String,
}
