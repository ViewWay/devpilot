//! Tauri commands for the Hook system.
//!
//! Provides invoke handlers for managing and testing hooks.

use crate::AppState;
use devpilot_tools::{Hook, HookContext, HookEvent, HookManager, HookResult};
use tauri::State;
use tracing::info;

// ── Types for IPC ──────────────────────────────────────────────────────

/// Information about a hook returned to the frontend.
#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HookInfo {
    pub id: String,
    pub name: String,
    pub event: String,
    pub command: String,
    pub timeout_secs: u64,
    pub enabled: bool,
}

impl From<&Hook> for HookInfo {
    fn from(h: &Hook) -> Self {
        Self {
            id: h.id.clone(),
            name: h.name.clone(),
            event: serde_json::to_string(&h.event)
                .unwrap_or_default()
                .trim_matches('"')
                .to_string(),
            command: h.command.clone(),
            timeout_secs: h.timeout_secs,
            enabled: h.enabled,
        }
    }
}

// ── Helper ─────────────────────────────────────────────────────────────

/// Load hooks from the settings table.
fn load_hooks(state: &State<'_, AppState>) -> Result<HookManager, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let json = db
        .get_setting("hooks")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "[]".to_string());
    drop(db);
    HookManager::load_from_json(&json).map_err(|e| e.to_string())
}

/// Save hooks to the settings table.
fn save_hooks(state: &State<'_, AppState>, mgr: &HookManager) -> Result<(), String> {
    let json = mgr.to_json().map_err(|e| e.to_string())?;
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_setting("hooks", &json).map_err(|e| e.to_string())
}

// ── Commands ───────────────────────────────────────────────────────────

/// List all configured hooks.
#[tauri::command]
pub fn list_hooks(state: State<'_, AppState>) -> Result<Vec<HookInfo>, String> {
    let mgr = load_hooks(&state)?;
    Ok(mgr.hooks().iter().map(HookInfo::from).collect())
}

/// Add a new hook.
#[tauri::command]
pub fn add_hook(
    state: State<'_, AppState>,
    name: String,
    event: String,
    command: String,
    timeout_secs: Option<u64>,
) -> Result<HookInfo, String> {
    let event: HookEvent = serde_json::from_str(&format!("\"{event}\""))
        .map_err(|e| format!("Invalid hook event '{event}': {e}"))?;

    let hook = Hook {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        event,
        command,
        timeout_secs: timeout_secs.unwrap_or(30),
        enabled: true,
    };

    let mut mgr = load_hooks(&state)?;
    mgr.add_hook(hook);
    save_hooks(&state, &mgr)?;

    // Return the last added hook
    let info = mgr.hooks().last().map(HookInfo::from).unwrap();
    info!("Hook added: {} ({})", info.name, info.id);
    Ok(info)
}

/// Remove a hook by ID.
#[tauri::command]
pub fn remove_hook(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut mgr = load_hooks(&state)?;
    if !mgr.remove_hook(&id) {
        return Err(format!("Hook not found: {id}"));
    }
    save_hooks(&state, &mgr)?;
    info!("Hook removed: {id}");
    Ok(())
}

/// Toggle a hook's enabled state.
#[tauri::command]
pub fn toggle_hook(state: State<'_, AppState>, id: String) -> Result<HookInfo, String> {
    let mut mgr = load_hooks(&state)?;
    if !mgr.toggle_hook(&id) {
        return Err(format!("Hook not found: {id}"));
    }
    save_hooks(&state, &mgr)?;

    let hook = mgr
        .hooks()
        .iter()
        .find(|h| h.id == id)
        .map(HookInfo::from)
        .unwrap();
    info!("Hook toggled: {} -> enabled={}", hook.name, hook.enabled);
    Ok(hook)
}

/// Test a hook by running it with test data.
#[tauri::command]
pub async fn test_hook(state: State<'_, AppState>, id: String) -> Result<HookResult, String> {
    let mgr = load_hooks(&state)?;
    let hook = mgr
        .hooks()
        .iter()
        .find(|h| h.id == id)
        .ok_or_else(|| format!("Hook not found: {id}"))?;

    let ctx = HookContext {
        tool_name: "test_tool".to_string(),
        session_id: "test-session".to_string(),
        working_dir: std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| "/tmp".to_string()),
    };

    info!("Testing hook: {} ({})", hook.name, hook.id);
    let result = devpilot_tools::run_hook(hook, &ctx).await;
    Ok(result)
}
