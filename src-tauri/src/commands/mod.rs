use crate::{AppState, PingResponse, SessionInfo, SettingEntry};
use tauri::State;

/// Health check / ping command.
#[tauri::command]
pub fn ping() -> PingResponse {
    PingResponse {
        message: "DevPilot is running!".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        timestamp: chrono::Utc::now().to_rfc3339(),
    }
}

/// List all sessions.
#[tauri::command]
pub fn list_sessions(state: State<'_, AppState>) -> Result<Vec<SessionInfo>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .conn
        .prepare("SELECT id, title, model, provider, working_dir, mode, created_at, updated_at FROM sessions ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;

    let sessions = stmt
        .query_map([], |row| {
            Ok(SessionInfo {
                id: row.get(0)?,
                title: row.get(1)?,
                model: row.get(2)?,
                provider: row.get(3)?,
                working_dir: row.get(4)?,
                mode: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(sessions)
}

/// Create a new session.
#[tauri::command]
pub fn create_session(
    state: State<'_, AppState>,
    title: String,
    model: String,
    provider: String,
) -> Result<SessionInfo, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        db.conn
            .execute(
                "INSERT INTO sessions (id, title, model, provider, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                rusqlite::params![id, title, model, provider, now],
            )
            .map_err(|e| e.to_string())?;
    }

    Ok(SessionInfo {
        id,
        title,
        model,
        provider,
        working_dir: None,
        mode: "code".to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Get a setting value.
#[tauri::command]
pub fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .conn
        .prepare("SELECT value FROM settings WHERE key = ?1")
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row(rusqlite::params![key], |row| row.get::<_, String>(0))
        .ok();

    Ok(result)
}

/// Set a setting value.
#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.conn
        .execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            rusqlite::params![key, value],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// List all settings.
#[tauri::command]
pub fn list_settings(state: State<'_, AppState>) -> Result<Vec<SettingEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .conn
        .prepare("SELECT key, value FROM settings ORDER BY key")
        .map_err(|e| e.to_string())?;

    let settings = stmt
        .query_map([], |row| {
            Ok(SettingEntry {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(settings)
}
