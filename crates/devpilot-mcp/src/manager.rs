//! MCP manager — orchestrates multiple MCP server connections.
//!
//! Connects/disconnects MCP servers, discovers tools, and registers them
//! as `Tool` trait objects in a `ToolRegistry`.

use crate::client::McpClient;
use crate::error::{McpError, McpResult};
use crate::transport::McpServerConfig;
use devpilot_tools::{Tool, ToolContext, ToolOutput, ToolRegistry};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

/// Manages multiple MCP server connections.
#[derive(Clone)]
pub struct McpManager {
    clients: Arc<RwLock<HashMap<String, Arc<McpClient>>>>,
    registry: ToolRegistry,
}

impl McpManager {
    /// Create a new McpManager that will register tools into the given registry.
    pub fn new(registry: ToolRegistry) -> Self {
        Self {
            clients: Arc::new(RwLock::new(HashMap::new())),
            registry,
        }
    }

    /// Connect to an MCP server, discover its tools, and register them.
    pub async fn connect_server(&self, config: &McpServerConfig) -> McpResult<()> {
        let mut clients = self.clients.write().await;

        if clients.contains_key(&config.id) {
            return Err(McpError::AlreadyConnected(config.id.clone()));
        }

        tracing::info!(server = %config.name, "Connecting to MCP server...");

        let client = McpClient::connect(
            config.id.clone(),
            config.name.clone(),
            &config.transport,
        )
        .await?;

        let client = Arc::new(client);

        // Register each discovered tool as a proxy in the registry
        let tools = client.tools().await;
        let tool_count = tools.len();

        for tool_info in &tools {
            let full_name = format!("mcp__{}__{}", config.id, tool_info.name);
            let mcp_tool = McpProxyTool {
                full_name: full_name.clone(),
                tool_name: tool_info.name.clone(),
                description: tool_info.description.clone().unwrap_or_default(),
                input_schema: tool_info.input_schema.clone(),
                client: Arc::clone(&client),
            };
            self.registry.register(Arc::new(mcp_tool)).await;
        }

        clients.insert(config.id.clone(), client);

        tracing::info!(
            server = %config.name,
            tools = tool_count,
            "MCP server connected and tools registered"
        );

        Ok(())
    }

    /// Disconnect from an MCP server and unregister its tools.
    pub async fn disconnect_server(&self, server_id: &str) -> McpResult<()> {
        let mut clients = self.clients.write().await;

        let client = clients
            .remove(server_id)
            .ok_or_else(|| McpError::ServerNotFound(server_id.to_string()))?;

        // Unregister all tools from this server
        let tools = client.tools().await;
        for tool_info in &tools {
            let registry_name = format!("mcp__{}__{}", server_id, tool_info.name);
            self.registry.unregister(&registry_name).await;
        }

        client.shutdown().await?;

        tracing::info!(server = server_id, "MCP server disconnected");
        Ok(())
    }

    /// Reconnect to a server (disconnect then connect).
    pub async fn reconnect_server(&self, config: &McpServerConfig) -> McpResult<()> {
        let _ = self.disconnect_server(&config.id).await;
        self.connect_server(config).await
    }

    /// List all connected servers.
    pub async fn connected_servers(&self) -> Vec<(String, String)> {
        let clients = self.clients.read().await;
        clients
            .values()
            .map(|c| (c.server_id().to_string(), c.server_name().to_string()))
            .collect()
    }

    /// Check if a server is connected.
    pub async fn is_connected(&self, server_id: &str) -> bool {
        let clients = self.clients.read().await;
        clients.contains_key(server_id)
    }

    /// Shut down all connections.
    pub async fn shutdown_all(&self) -> McpResult<()> {
        let mut clients = self.clients.write().await;
        for (id, client) in clients.drain() {
            if let Err(e) = client.shutdown().await {
                tracing::warn!(server = id, error = %e, "Error shutting down MCP server");
            }
        }
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// McpProxyTool — adapts an MCP tool into the devpilot Tool trait
// ---------------------------------------------------------------------------

/// A `Tool` implementation that proxies calls to an MCP server tool.
pub struct McpProxyTool {
    full_name: String,
    tool_name: String,
    description: String,
    input_schema: serde_json::Value,
    client: Arc<McpClient>,
}

#[async_trait::async_trait]
impl Tool for McpProxyTool {
    fn name(&self) -> &str {
        &self.full_name
    }

    fn description(&self) -> &str {
        &self.description
    }

    fn input_schema(&self) -> serde_json::Value {
        self.input_schema.clone()
    }

    fn requires_approval(&self) -> bool {
        true // MCP tools require approval by default
    }

    async fn execute(
        &self,
        input: serde_json::Value,
        _ctx: &ToolContext,
    ) -> devpilot_tools::ToolResult<ToolOutput> {
        let result = self
            .client
            .call_tool(&self.tool_name, input)
            .await
            .map_err(|e| devpilot_tools::ToolError::ExecutionFailed {
                tool: format!("mcp__{}", self.tool_name),
                message: e.to_string(),
            })?;

        let content = result
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string();

        let is_error = result
            .get("is_error")
            .and_then(|e| e.as_bool())
            .unwrap_or(false);

        if is_error {
            Ok(ToolOutput::err(content))
        } else {
            Ok(ToolOutput::ok(content))
        }
    }
}
