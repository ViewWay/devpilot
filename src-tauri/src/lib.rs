use std::sync::{Arc, Mutex};

use devpilot_bridge::BridgeManager;
use devpilot_core::{Agent, AgentConfig, EventBus};
use devpilot_mcp::McpManager;
use devpilot_media::MediaManager;
use devpilot_store::Store;
use devpilot_tools::{ToolExecutor, ToolRegistry};
use tokio::sync::Mutex as AsyncMutex;

use crate::commands::media::MediaState;
use crate::commands::scheduler::SchedulerState;
use devpilot_scheduler::Scheduler;

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
            commands::update_message_content,
            // Settings
            commands::get_setting,
            commands::set_setting,
            commands::list_settings,
            // Usage
            commands::get_total_usage,
            // Providers
            commands::list_providers,
            commands::get_provider,
            commands::upsert_provider,
            commands::get_provider_api_key,
            commands::delete_provider,
            // Checkpoints
            commands::create_checkpoint,
            commands::list_checkpoints,
            commands::rewind_checkpoint,
            // Compact
            commands::compact_session,
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
            // Sandbox
            commands::sandbox::sandbox_execute,
            commands::sandbox::sandbox_default_policy,
            // Search
            commands::search::search_files,
            // Scheduler
            commands::scheduler::scheduler_create_task,
            commands::scheduler::scheduler_list_tasks,
            commands::scheduler::scheduler_remove_task,
            commands::scheduler::scheduler_pause_task,
            commands::scheduler::scheduler_resume_task,
            // Bridge
            commands::bridge::bridge_create,
            commands::bridge::bridge_list,
            commands::bridge::bridge_remove,
            commands::bridge::bridge_send,
            commands::bridge::bridge_enable,
            commands::bridge::bridge_disable,
            // Media
            commands::media::media_generate,
            commands::media::media_providers,
            // MCP
            commands::mcp::list_mcp_servers,
            commands::mcp::upsert_mcp_server,
            commands::mcp::delete_mcp_server,
            commands::mcp::mcp_connect_server,
            commands::mcp::mcp_disconnect_server,
            commands::mcp::mcp_list_connected,
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
    /// Agent engine — orchestrates LLM <-> tool calling loop.
    pub agent: Arc<Agent>,
    /// Event bus — broadcasts agent events to the Tauri frontend.
    pub event_bus: EventBus,
    /// Scheduler state — cron task management.
    pub scheduler_state: SchedulerState,
    /// Bridge manager — IM/notification integrations.
    pub bridge_manager: Arc<AsyncMutex<BridgeManager>>,
    /// Media state — image generation.
    pub media_state: MediaState,
    /// MCP manager — Model Context Protocol server connections.
    pub mcp_manager: Arc<AsyncMutex<Option<McpManager>>>,
}

impl AppState {
    /// Create a new AppState, initializing the database and all subsystems.
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
        let executor_arc = Arc::new(AsyncMutex::new(executor));

        // Create event bus and agent engine
        let event_bus = EventBus::new();
        let agent = Agent::new(
            AgentConfig::default(),
            event_bus.clone(),
            Arc::clone(&executor_arc),
        );

        let scheduler = Scheduler::new();

        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            tool_registry: registry_arc,
            tool_executor: executor_arc,
            agent: Arc::new(agent),
            event_bus,
            scheduler_state: SchedulerState {
                scheduler: Arc::new(AsyncMutex::new(scheduler)),
            },
            bridge_manager: Arc::new(AsyncMutex::new(BridgeManager::new())),
            media_state: MediaState {
                manager: MediaManager::new(),
            },
            mcp_manager: Arc::new(AsyncMutex::new(None)),
        })
    }
}
