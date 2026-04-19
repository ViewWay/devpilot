use std::sync::{Arc, Mutex};

use devpilot_store::Store;

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
            // Sessions
            commands::list_sessions,
            commands::get_session,
            commands::create_session,
            commands::delete_session,
            commands::update_session_title,
            // Messages
            commands::get_session_messages,
            commands::add_message,
            // Settings
            commands::get_setting,
            commands::set_setting,
            commands::list_settings,
            // Usage
            commands::get_session_usage,
            commands::get_total_usage,
            // LLM
            commands::llm::send_message,
            commands::llm::send_message_stream,
            commands::llm::check_provider,
            commands::llm::list_provider_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Global application state shared across all Tauri commands.
pub struct AppState {
    pub db: Arc<Mutex<Store>>,
}

impl AppState {
    pub fn new() -> anyhow::Result<Self> {
        let db = Store::open_default()?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
        })
    }
}
