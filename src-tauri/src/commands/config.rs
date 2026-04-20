//! Tauri IPC commands for TOML configuration management.

use crate::AppState;
use devpilot_store::config::{ConfigFile, ConfigLoader};
use std::path::PathBuf;
use tauri::State;

/// Load the merged configuration (defaults + global + optional project).
#[tauri::command]
pub fn config_load(
    _state: State<'_, AppState>,
    project_dir: Option<String>,
) -> Result<ConfigFile, String> {
    let project = project_dir.as_deref().map(PathBuf::from);
    ConfigLoader::load(project.as_deref()).map_err(|e| e.to_string())
}

/// Save the global configuration file (~/.devpilot/config.toml).
#[tauri::command]
pub fn config_save_global(_state: State<'_, AppState>, config: ConfigFile) -> Result<(), String> {
    ConfigLoader::save_global(&config).map_err(|e| e.to_string())
}

/// Save a project-level configuration file.
#[tauri::command]
pub fn config_save_project(
    _state: State<'_, AppState>,
    project_dir: String,
    config: ConfigFile,
) -> Result<(), String> {
    let path = PathBuf::from(&project_dir);
    ConfigLoader::save_project(&path, &config).map_err(|e| e.to_string())
}

/// Load only the global configuration (no project layer).
#[tauri::command]
pub fn config_load_global(_state: State<'_, AppState>) -> Result<ConfigFile, String> {
    match ConfigLoader::global_config_path() {
        Some(path) if path.exists() => ConfigLoader::read_file(&path).map_err(|e| e.to_string()),
        _ => Ok(ConfigFile::default()),
    }
}

/// Delete the global configuration file.
#[tauri::command]
pub fn config_delete_global(_state: State<'_, AppState>) -> Result<(), String> {
    ConfigLoader::delete_global().map_err(|e| e.to_string())
}

/// Delete a project-level configuration file.
#[tauri::command]
pub fn config_delete_project(
    _state: State<'_, AppState>,
    project_dir: String,
) -> Result<(), String> {
    let path = PathBuf::from(&project_dir);
    ConfigLoader::delete_project(&path).map_err(|e| e.to_string())
}

/// Check whether a global config file exists.
#[tauri::command]
pub fn config_global_exists(_state: State<'_, AppState>) -> Result<bool, String> {
    Ok(ConfigLoader::global_exists())
}

/// Check whether a project-level config file exists.
#[tauri::command]
pub fn config_project_exists(
    _state: State<'_, AppState>,
    project_dir: String,
) -> Result<bool, String> {
    let path = PathBuf::from(&project_dir);
    Ok(ConfigLoader::project_exists(&path))
}
