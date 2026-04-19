use std::sync::{Arc, Mutex};

use devpilot_store::Store;
use devpilot_tools::{ToolExecutor, ToolRegistry};
use tokio::sync::Mutex as AsyncMutex;

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
            commands::get_total_usage,
            // LLM
            commands::llm::send_message,
            commands::llm::send_message_stream,
            commands::llm::check_provider,
            commands::llm::list_provider_models,
            // Tools
            commands::tools::list_tools,
            commands::tools::execute_tool,
            commands::tools::resolve_tool_approval,
            commands::tools::pending_approvals,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Global application state shared across all Tauri commands.
pub struct AppState {
    pub db: Arc<Mutex<Store>>,
    /// Shared tool registry — both the executor and direct queries use this.
    pub tool_registry: Arc<ToolRegistry>,
    /// Tool executor — handles tool execution with approval flow.
    pub tool_executor: Arc<AsyncMutex<ToolExecutor>>,
}

impl AppState {
    /// Create a new AppState, initializing the database and tool subsystem.
    pub fn new() -> anyhow::Result<Self> {
        let db = Store::open_default()?;

        // Initialize the tool registry synchronously using a temporary runtime.
        // Tauri's own async runtime isn't available yet at this point.
        let registry = tokio::task::block_in_place(|| {
            tokio::runtime::Runtime::new()
                .expect("Failed to create tokio runtime")
                .block_on(ToolRegistry::with_defaults())
        });

        let registry_arc: Arc<ToolRegistry> = Arc::new(registry);
        let executor = ToolExecutor::new(Arc::clone(&registry_arc));

        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            tool_registry: registry_arc,
            tool_executor: Arc::new(AsyncMutex::new(executor)),
        })
    }
}
