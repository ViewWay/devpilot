//! MCP server management IPC commands.

use crate::AppState;
use devpilot_mcp::{McpManager, McpServerConfig, TransportType};
use devpilot_store::McpServerRecord;
use serde::{Deserialize, Serialize};
use tauri::State;

// ── CRUD (backed by SQLite) ───────────────────────────

#[tauri::command]
pub async fn list_mcp_servers(state: State<'_, AppState>) -> Result<Vec<McpServerRecord>, String> {
    let db = state.db.lock().unwrap();
    db.list_mcp_servers().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upsert_mcp_server(
    state: State<'_, AppState>,
    server: McpServerRecord,
) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.upsert_mcp_server(&server).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_mcp_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let db = state.db.lock().unwrap();
    db.delete_mcp_server(&id).map_err(|e| e.to_string())
}

// ── Runtime connection management ─────────────────────

/// Lazily initialize McpManager on first connect.
async fn ensure_mcp_manager(state: &State<'_, AppState>) -> McpManager {
    let mut guard = state.mcp_manager.lock().await;
    if guard.is_none() {
        guard.replace(McpManager::new((*state.tool_registry).clone()));
    }
    guard.clone().unwrap()
}

/// Connect an MCP server by ID.
///
/// Looks up the server configuration from SQLite, then connects via McpManager.
/// Accepts an `id` string from the frontend rather than a full record.
#[tauri::command]
pub async fn mcp_connect_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    // Look up the server record from SQLite
    let record = {
        let db = state.db.lock().unwrap();
        db.get_mcp_server(&id).map_err(|e| e.to_string())?
    };

    let config = record_to_config(&record);
    let manager = ensure_mcp_manager(&state).await;
    manager
        .connect_server(&config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn mcp_disconnect_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let manager = state.mcp_manager.lock().await;
    match manager.as_ref() {
        Some(m) => m.disconnect_server(&id).await.map_err(|e| e.to_string()),
        None => Err("MCP manager not initialized".into()),
    }
}

#[tauri::command]
pub async fn mcp_list_connected(
    state: State<'_, AppState>,
) -> Result<Vec<(String, String)>, String> {
    let manager = state.mcp_manager.lock().await;
    match manager.as_ref() {
        Some(m) => Ok(m.connected_servers().await),
        None => Ok(vec![]),
    }
}

/// List connected servers with tool counts: `(id, name, tool_count)`.
#[tauri::command]
pub async fn mcp_list_connected_detail(
    state: State<'_, AppState>,
) -> Result<Vec<(String, String, usize)>, String> {
    let manager = state.mcp_manager.lock().await;
    match manager.as_ref() {
        Some(m) => Ok(m.connected_servers_detail().await),
        None => Ok(vec![]),
    }
}

// ── Helpers ───────────────────────────────────────────

/// Convert a DB record to a runtime config.
fn record_to_config(record: &McpServerRecord) -> McpServerConfig {
    let transport = match record.transport.as_str() {
        "sse" => TransportType::Sse {
            url: record.url.clone().unwrap_or_default(),
        },
        _ => TransportType::Stdio {
            command: record.command.clone().unwrap_or_default(),
            args: record
                .args
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default(),
            env: record
                .env
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default(),
        },
    };

    McpServerConfig {
        id: record.id.clone(),
        name: record.name.clone(),
        transport,
        enabled: record.enabled,
    }
}

// ── MCP Marketplace Catalog ───────────────────────────

/// A single entry in the remote MCP server catalog.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCatalogEntry {
    /// Unique identifier for the catalog entry.
    pub id: String,
    /// Display name.
    pub name: String,
    /// Short description.
    pub description: String,
    /// Category tag (e.g., "filesystem", "database", "search", "devtools").
    pub category: String,
    /// Transport type: "stdio" or "sse".
    pub transport: String,
    /// Command to run (for stdio).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Arguments (for stdio).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    /// URL (for SSE).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// Homepage or documentation URL.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub homepage: Option<String>,
    /// Package version.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    /// Environment variables needed (key → description).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<Vec<McpCatalogEnvVar>>,
}

/// An environment variable required by a catalog entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCatalogEnvVar {
    pub key: String,
    pub description: String,
    pub required: bool,
}

/// The full catalog response.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpCatalog {
    pub version: u32,
    pub updated_at: String,
    pub servers: Vec<McpCatalogEntry>,
}

/// URL for the remote MCP catalog. Points to a JSON file that lists available servers.
const MCP_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/ViewWay/devpilot/main/docs/mcp-catalog.json";

/// Fetch the remote MCP server catalog.
///
/// Falls back to a bundled built-in catalog if the remote fetch fails.
#[tauri::command]
pub async fn fetch_mcp_catalog() -> Result<McpCatalog, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    match client.get(MCP_CATALOG_URL).send().await {
        Ok(resp) if resp.status().is_success() => resp
            .json::<McpCatalog>()
            .await
            .map_err(|e| format!("Failed to parse catalog: {e}")),
        Ok(resp) => Err(format!("Catalog server returned HTTP {}", resp.status())),
        Err(_) => {
            // Fallback: return built-in catalog
            Ok(builtin_catalog())
        }
    }
}

/// Built-in fallback catalog with popular MCP servers.
fn builtin_catalog() -> McpCatalog {
    McpCatalog {
        version: 1,
        updated_at: "2025-01-01".into(),
        servers: vec![
            McpCatalogEntry {
                id: "catalog-filesystem".into(),
                name: "Filesystem".into(),
                description: "Secure file operations with configurable access permissions".into(),
                category: "filesystem".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-filesystem".into(),
                    "~/Documents".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem"
                        .into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-github".into(),
                name: "GitHub".into(),
                description: "GitHub API integration for repos, issues, PRs, and more".into(),
                category: "devtools".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-github".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/github".into(),
                ),
                version: Some("latest".into()),
                env: Some(vec![McpCatalogEnvVar {
                    key: "GITHUB_PERSONAL_ACCESS_TOKEN".into(),
                    description: "GitHub personal access token".into(),
                    required: true,
                }]),
            },
            McpCatalogEntry {
                id: "catalog-memory".into(),
                name: "Memory".into(),
                description: "Persistent key-value memory store for AI agents".into(),
                category: "utilities".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-memory".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/memory".into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-fetch".into(),
                name: "Fetch".into(),
                description: "Web fetching and content extraction".into(),
                category: "search".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-fetch".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch".into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-postgres".into(),
                name: "PostgreSQL".into(),
                description: "Read-only PostgreSQL database querying".into(),
                category: "database".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-postgres".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres".into(),
                ),
                version: Some("latest".into()),
                env: Some(vec![McpCatalogEnvVar {
                    key: "POSTGRES_CONNECTION_STRING".into(),
                    description: "PostgreSQL connection string".into(),
                    required: true,
                }]),
            },
            McpCatalogEntry {
                id: "catalog-sqlite".into(),
                name: "SQLite".into(),
                description: "SQLite database operations".into(),
                category: "database".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-sqlite".into(),
                    "--db".into(),
                    "devpilot.db".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite".into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-brave-search".into(),
                name: "Brave Search".into(),
                description: "Web search via Brave Search API".into(),
                category: "search".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-brave-search".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search"
                        .into(),
                ),
                version: Some("latest".into()),
                env: Some(vec![McpCatalogEnvVar {
                    key: "BRAVE_API_KEY".into(),
                    description: "Brave Search API key".into(),
                    required: true,
                }]),
            },
            McpCatalogEntry {
                id: "catalog-puppeteer".into(),
                name: "Puppeteer".into(),
                description: "Browser automation for web scraping and testing".into(),
                category: "devtools".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-puppeteer".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer"
                        .into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-sentry".into(),
                name: "Sentry".into(),
                description: "Error tracking and crash reporting integration".into(),
                category: "devtools".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-sentry".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/sentry".into(),
                ),
                version: Some("latest".into()),
                env: Some(vec![McpCatalogEnvVar {
                    key: "SENTRY_AUTH_TOKEN".into(),
                    description: "Sentry authentication token".into(),
                    required: true,
                }]),
            },
            McpCatalogEntry {
                id: "catalog-everything".into(),
                name: "Everything (Test)".into(),
                description: "Test server with all MCP features for development".into(),
                category: "utilities".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-everything".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/everything"
                        .into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-git".into(),
                name: "Git".into(),
                description: "Git repository operations, blame, log, diff, and more".into(),
                category: "devtools".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec!["-y".into(), "@modelcontextprotocol/server-git".into()]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/git".into(),
                ),
                version: Some("latest".into()),
                env: None,
            },
            McpCatalogEntry {
                id: "catalog-google-maps".into(),
                name: "Google Maps".into(),
                description: "Location services, directions, and place search".into(),
                category: "search".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-google-maps".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps"
                        .into(),
                ),
                version: Some("latest".into()),
                env: Some(vec![McpCatalogEnvVar {
                    key: "GOOGLE_MAPS_API_KEY".into(),
                    description: "Google Maps API key".into(),
                    required: true,
                }]),
            },
            McpCatalogEntry {
                id: "catalog-slack".into(),
                name: "Slack".into(),
                description: "Slack workspace messaging and channel management".into(),
                category: "communication".into(),
                transport: "stdio".into(),
                command: Some("npx".into()),
                args: Some(vec![
                    "-y".into(),
                    "@modelcontextprotocol/server-slack".into(),
                ]),
                url: None,
                homepage: Some(
                    "https://github.com/modelcontextprotocol/servers/tree/main/src/slack".into(),
                ),
                version: Some("latest".into()),
                env: Some(vec![McpCatalogEnvVar {
                    key: "SLACK_BOT_TOKEN".into(),
                    description: "Slack bot OAuth token".into(),
                    required: true,
                }]),
            },
        ],
    }
}
