//! MCP client — individual connection to an MCP server.
//!
//! Handles initialization, tool discovery, and tool execution.

use crate::error::{McpError, McpResult};
use crate::transport::{McpTransport, TransportType, create_transport};
use devpilot_protocol::ToolDefinition;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::RwLock;

/// Capabilities reported by the MCP server.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerCapabilities {
    #[serde(default)]
    pub tools: Option<ToolsCapability>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ToolsCapability {
    #[serde(default)]
    pub list_changed: Option<bool>,
}

/// Info about a tool discovered from an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolInfo {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(rename = "inputSchema")]
    pub input_schema: serde_json::Value,
}

/// Represents a live connection to an MCP server.
pub struct McpClient {
    server_id: String,
    server_name: String,
    transport: Arc<RwLock<Box<dyn McpTransport>>>,
    capabilities: RwLock<ServerCapabilities>,
    tools: RwLock<Vec<McpToolInfo>>,
}

impl McpClient {
    /// Connect to an MCP server and perform the initialize handshake.
    pub async fn connect(
        server_id: String,
        server_name: String,
        transport_type: &TransportType,
    ) -> McpResult<Self> {
        let transport = create_transport(transport_type).await?;
        let client = Self {
            server_id,
            server_name,
            transport: Arc::new(RwLock::new(transport)),
            capabilities: RwLock::new(ServerCapabilities::default()),
            tools: RwLock::new(Vec::new()),
        };

        client.initialize().await?;
        Ok(client)
    }

    /// Create a client with a pre-configured transport (for testing).
    pub fn with_transport(
        server_id: String,
        server_name: String,
        transport: Box<dyn McpTransport>,
    ) -> Self {
        Self {
            server_id,
            server_name,
            transport: Arc::new(RwLock::new(transport)),
            capabilities: RwLock::new(ServerCapabilities::default()),
            tools: RwLock::new(Vec::new()),
        }
    }

    /// Perform the MCP initialize handshake.
    async fn initialize(&self) -> McpResult<()> {
        let transport = self.transport.read().await;

        let init_params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "devpilot",
                "version": env!("CARGO_PKG_VERSION")
            }
        });

        let result = transport
            .send_request("initialize", Some(init_params))
            .await?;

        // Parse capabilities
        if let Some(caps) = result.get("capabilities") {
            let caps: ServerCapabilities = serde_json::from_value(caps.clone())?;
            *self.capabilities.write().await = caps;
        }

        // Send initialized notification
        transport
            .send_notification("notifications/initialized", None)
            .await?;

        // Discover tools
        self.discover_tools().await?;

        Ok(())
    }

    /// Discover available tools from the server.
    pub async fn discover_tools(&self) -> McpResult<()> {
        let transport = self.transport.read().await;
        let result = transport
            .send_request("tools/list", Some(serde_json::json!({})))
            .await?;

        let tools: Vec<McpToolInfo> = if let Some(tools_val) = result.get("tools") {
            serde_json::from_value(tools_val.clone())?
        } else {
            Vec::new()
        };

        tracing::info!(
            server = %self.server_name,
            count = tools.len(),
            "Discovered MCP tools"
        );

        *self.tools.write().await = tools;
        Ok(())
    }

    /// Call a tool on this MCP server.
    pub async fn call_tool(
        &self,
        tool_name: &str,
        arguments: serde_json::Value,
    ) -> McpResult<serde_json::Value> {
        let transport = self.transport.read().await;

        if !transport.is_alive() {
            return Err(McpError::Disconnected(self.server_id.clone()));
        }

        let params = serde_json::json!({
            "name": tool_name,
            "arguments": arguments,
        });

        let result = transport.send_request("tools/call", Some(params)).await?;

        // MCP tool results have content array
        if let Some(content) = result.get("content").and_then(|c| c.as_array()) {
            let texts: Vec<String> = content
                .iter()
                .filter_map(|item| {
                    if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                        item.get("text")
                            .and_then(|t| t.as_str())
                            .map(|s| s.to_string())
                    } else {
                        None
                    }
                })
                .collect();
            return Ok(serde_json::json!({
                "content": texts.join("\n"),
                "is_error": result.get("isError").and_then(|e| e.as_bool()).unwrap_or(false),
            }));
        }

        Ok(result)
    }

    /// Get the list of discovered tools.
    pub async fn tools(&self) -> Vec<McpToolInfo> {
        self.tools.read().await.clone()
    }

    /// Convert discovered tools to `ToolDefinition` for the devpilot registry.
    pub async fn tool_definitions(&self) -> Vec<ToolDefinition> {
        let tools = self.tools.read().await;
        tools
            .iter()
            .map(|t| ToolDefinition {
                name: format!("mcp__{}__{}", self.server_id, t.name),
                description: t.description.clone().unwrap_or_default(),
                input_schema: t.input_schema.clone(),
            })
            .collect()
    }

    /// Get the server ID.
    pub fn server_id(&self) -> &str {
        &self.server_id
    }

    /// Get the server name.
    pub fn server_name(&self) -> &str {
        &self.server_name
    }

    /// Check if the underlying transport is alive.
    pub async fn is_alive(&self) -> bool {
        self.transport.read().await.is_alive()
    }

    /// Shut down the connection.
    pub async fn shutdown(&self) -> McpResult<()> {
        self.transport.read().await.shutdown().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::McpResult;
    use async_trait::async_trait;
    use serde_json::Value;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicBool, Ordering};

    /// Mock transport for testing — returns pre-configured responses.
    struct MockTransport {
        alive: Arc<AtomicBool>,
    }

    impl MockTransport {
        fn new() -> Self {
            Self {
                alive: Arc::new(AtomicBool::new(true)),
            }
        }
    }

    #[async_trait]
    impl McpTransport for MockTransport {
        async fn send_request(&self, method: &str, _params: Option<Value>) -> McpResult<Value> {
            match method {
                "initialize" => Ok(serde_json::json!({
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": { "listChanged": false }
                    },
                    "serverInfo": { "name": "mock-server", "version": "1.0" }
                })),
                "tools/list" => Ok(serde_json::json!({
                    "tools": [
                        {
                            "name": "read_file",
                            "description": "Read a file",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "path": { "type": "string" }
                                },
                                "required": ["path"]
                            }
                        },
                        {
                            "name": "search",
                            "description": "Search for text",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "query": { "type": "string" }
                                }
                            }
                        }
                    ]
                })),
                "tools/call" => Ok(serde_json::json!({
                    "content": [
                        { "type": "text", "text": "Hello from MCP" }
                    ]
                })),
                _ => Ok(serde_json::json!({})),
            }
        }

        async fn send_notification(&self, _method: &str, _params: Option<Value>) -> McpResult<()> {
            Ok(())
        }

        async fn shutdown(&self) -> McpResult<()> {
            self.alive.store(false, Ordering::Relaxed);
            Ok(())
        }

        fn is_alive(&self) -> bool {
            self.alive.load(Ordering::Relaxed)
        }
    }

    #[tokio::test]
    async fn test_client_initialize_and_discover() {
        let transport = Box::new(MockTransport::new());
        let client =
            McpClient::with_transport("test-server".into(), "Test Server".into(), transport);

        // Manually trigger initialize
        // (with_transport doesn't auto-initialize, so we test discover_tools separately)
        client.discover_tools().await.unwrap();

        let tools = client.tools().await;
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "read_file");
        assert_eq!(tools[1].name, "search");
    }

    #[tokio::test]
    async fn test_tool_definitions() {
        let transport = Box::new(MockTransport::new());
        let client = McpClient::with_transport("my-server".into(), "My Server".into(), transport);

        client.discover_tools().await.unwrap();
        let defs = client.tool_definitions().await;

        assert_eq!(defs.len(), 2);
        assert_eq!(defs[0].name, "mcp__my-server__read_file");
        assert_eq!(defs[1].name, "mcp__my-server__search");
    }

    #[tokio::test]
    async fn test_call_tool() {
        let transport = Box::new(MockTransport::new());
        let client = McpClient::with_transport("test".into(), "Test".into(), transport);

        let result = client
            .call_tool("read_file", serde_json::json!({"path": "/tmp/test.txt"}))
            .await
            .unwrap();

        assert_eq!(result["content"].as_str().unwrap(), "Hello from MCP");
    }

    #[tokio::test]
    async fn test_shutdown() {
        let transport = Box::new(MockTransport::new());
        let client = McpClient::with_transport("test".into(), "Test".into(), transport);

        assert!(client.is_alive().await);
        client.shutdown().await.unwrap();
        assert!(!client.is_alive().await);
    }

    #[test]
    fn test_server_capabilities_default() {
        let caps = ServerCapabilities::default();
        assert!(caps.tools.is_none());
    }

    #[test]
    fn test_server_capabilities_with_tools() {
        let json = serde_json::json!({
            "tools": { "list_changed": true }
        });
        let caps: ServerCapabilities = serde_json::from_value(json).unwrap();
        assert!(caps.tools.is_some());
        assert_eq!(caps.tools.unwrap().list_changed, Some(true));
    }

    #[test]
    fn test_mcp_tool_info_serde() {
        let json = serde_json::json!({
            "name": "read_file",
            "description": "Read a file from disk",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "path": { "type": "string" }
                }
            }
        });
        let info: McpToolInfo = serde_json::from_value(json).unwrap();
        assert_eq!(info.name, "read_file");
        assert_eq!(info.description.as_deref(), Some("Read a file from disk"));
        assert!(info.input_schema.is_object());
    }

    #[test]
    fn test_mcp_tool_info_no_description() {
        let json = serde_json::json!({
            "name": "ping",
            "inputSchema": { "type": "object", "properties": {} }
        });
        let info: McpToolInfo = serde_json::from_value(json).unwrap();
        assert_eq!(info.name, "ping");
        assert!(info.description.is_none());
    }

    #[test]
    fn test_accessors() {
        let transport = Box::new(MockTransport::new());
        let client = McpClient::with_transport("my-id".into(), "My Server".into(), transport);
        assert_eq!(client.server_id(), "my-id");
        assert_eq!(client.server_name(), "My Server");
    }
}
