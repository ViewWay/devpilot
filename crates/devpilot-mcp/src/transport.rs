//! MCP transport layer — stdio (subprocess) and SSE (HTTP) transports.

use crate::error::{McpError, McpResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct JsonRpcRequest {
    jsonrpc: &'static str,
    id: u64,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcResponse {
    #[allow(dead_code)]
    jsonrpc: String,
    #[allow(dead_code)]
    id: Option<u64>,
    result: Option<Value>,
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    code: i64,
    message: String,
}

// ---------------------------------------------------------------------------
// Server config
// ---------------------------------------------------------------------------

/// How to connect to an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TransportType {
    /// Spawn a local process and communicate over stdin/stdout.
    Stdio {
        /// The command to run (e.g. "npx", "python").
        command: String,
        /// Arguments to pass.
        #[serde(default)]
        args: Vec<String>,
        /// Environment variables.
        #[serde(default)]
        env: HashMap<String, String>,
    },
    /// Connect to a remote server via Server-Sent Events.
    Sse { url: String },
    /// Connect via Streamable HTTP (MCP spec 2025-03).
    /// Sends JSON-RPC over HTTP POST with optional session management.
    Http {
        /// The server URL endpoint.
        url: String,
        /// Optional custom headers (e.g. Authorization, API keys).
        #[serde(default)]
        headers: HashMap<String, String>,
    },
}

/// Full configuration for a single MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerConfig {
    /// Unique identifier.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Transport configuration.
    pub transport: TransportType,
    /// Whether the server is enabled.
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}

// ---------------------------------------------------------------------------
// Transport trait
// ---------------------------------------------------------------------------

/// Bidirectional message transport for MCP JSON-RPC.
#[async_trait]
pub trait McpTransport: Send + Sync {
    /// Send a JSON-RPC request and wait for the response.
    async fn send_request(&self, method: &str, params: Option<Value>) -> McpResult<Value>;

    /// Send a notification (no response expected).
    async fn send_notification(&self, method: &str, params: Option<Value>) -> McpResult<()>;

    /// Cleanly shut down the transport.
    async fn shutdown(&self) -> McpResult<()>;

    /// Whether the transport is still alive.
    fn is_alive(&self) -> bool;
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

/// Stdio-based MCP transport — spawns a child process.
pub struct StdioTransport {
    child: Mutex<Option<Child>>,
    writer: Mutex<tokio::process::ChildStdin>,
    reader: Mutex<BufReader<tokio::process::ChildStdout>>,
    next_id: AtomicU64,
    alive: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl StdioTransport {
    /// Spawn the child process and return a new transport.
    pub async fn spawn(
        command: &str,
        args: &[String],
        env: &HashMap<String, String>,
    ) -> McpResult<Self> {
        let mut cmd = Command::new(command);
        cmd.args(args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        for (k, v) in env {
            cmd.env(k, v);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| McpError::Transport(format!("Failed to spawn '{}': {}", command, e)))?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| McpError::Transport("Failed to acquire stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| McpError::Transport("Failed to acquire stdout".into()))?;

        Ok(Self {
            child: Mutex::new(Some(child)),
            writer: Mutex::new(stdin),
            reader: Mutex::new(BufReader::new(stdout)),
            next_id: AtomicU64::new(1),
            alive: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
        })
    }
}

#[async_trait]
impl McpTransport for StdioTransport {
    async fn send_request(&self, method: &str, params: Option<Value>) -> McpResult<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };

        let mut line = serde_json::to_string(&req)?;
        line.push('\n');

        // Write request
        {
            let mut writer = self.writer.lock().await;
            writer.write_all(line.as_bytes()).await?;
            writer.flush().await?;
        }

        // Read response
        let mut response_line = String::new();
        {
            let mut reader = self.reader.lock().await;
            reader.read_line(&mut response_line).await?;
        }

        if response_line.is_empty() {
            self.alive.store(false, Ordering::Relaxed);
            return Err(McpError::Disconnected(
                "Empty response from MCP server".into(),
            ));
        }

        let resp: JsonRpcResponse = serde_json::from_str(response_line.trim())?;

        if let Some(err) = resp.error {
            return Err(McpError::JsonRpc {
                code: err.code,
                message: err.message,
            });
        }

        resp.result
            .ok_or_else(|| McpError::Protocol("No result in response".into()))
    }

    async fn send_notification(&self, method: &str, params: Option<Value>) -> McpResult<()> {
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id: 0, // notifications have no id
            method: method.to_string(),
            params,
        };

        let mut line = serde_json::to_string(&req)?;
        line.push('\n');

        let mut writer = self.writer.lock().await;
        writer.write_all(line.as_bytes()).await?;
        writer.flush().await?;
        Ok(())
    }

    async fn shutdown(&self) -> McpResult<()> {
        let mut child_guard = self.child.lock().await;
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill().await;
        }
        self.alive.store(false, Ordering::Relaxed);
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }
}

// ---------------------------------------------------------------------------
// SSE transport
// ---------------------------------------------------------------------------

/// SSE-based MCP transport — connects to a remote HTTP endpoint.
pub struct SseTransport {
    url: String,
    http: reqwest::Client,
    next_id: AtomicU64,
    alive: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl SseTransport {
    pub fn new(url: &str) -> Self {
        Self {
            url: url.to_string(),
            http: reqwest::Client::new(),
            next_id: AtomicU64::new(1),
            alive: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
        }
    }
}

#[async_trait]
impl McpTransport for SseTransport {
    async fn send_request(&self, method: &str, params: Option<Value>) -> McpResult<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };

        let resp = self.http.post(&self.url).json(&req).send().await?;

        if !resp.status().is_success() {
            return Err(McpError::Transport(format!(
                "HTTP {}: {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            )));
        }

        let rpc_resp: JsonRpcResponse = resp.json().await?;

        if let Some(err) = rpc_resp.error {
            return Err(McpError::JsonRpc {
                code: err.code,
                message: err.message,
            });
        }

        rpc_resp
            .result
            .ok_or_else(|| McpError::Protocol("No result in response".into()))
    }

    async fn send_notification(&self, method: &str, params: Option<Value>) -> McpResult<()> {
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id: 0,
            method: method.to_string(),
            params,
        };

        let resp = self.http.post(&self.url).json(&req).send().await?;
        if !resp.status().is_success() {
            return Err(McpError::Transport(format!(
                "HTTP {} on notification",
                resp.status()
            )));
        }
        Ok(())
    }

    async fn shutdown(&self) -> McpResult<()> {
        // HTTP transport: nothing to close
        self.alive.store(false, Ordering::Relaxed);
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::Relaxed)
    }
}

// ---------------------------------------------------------------------------
// Streamable HTTP transport (MCP spec 2025-03)
// ---------------------------------------------------------------------------

/// Streamable HTTP transport for MCP servers.
///
/// Sends JSON-RPC requests via HTTP POST and supports optional session
/// management through the `Mcp-Session-Id` header, as defined in the
/// MCP Streamable HTTP transport specification (2025-03).
pub struct HttpTransport {
    url: String,
    headers: HashMap<String, String>,
    session_id: Mutex<Option<String>>,
    http: reqwest::Client,
    next_id: AtomicU64,
    alive: std::sync::Arc<std::sync::atomic::AtomicBool>,
}

impl HttpTransport {
    /// Create a new HTTP transport targeting the given URL.
    pub fn new(url: &str, headers: HashMap<String, String>) -> Self {
        Self {
            url: url.to_string(),
            headers,
            session_id: Mutex::new(None),
            http: reqwest::Client::new(),
            next_id: AtomicU64::new(1),
            alive: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
        }
    }

    /// Build a request with the common headers applied.
    fn build_request(&self, body: &str) -> reqwest::RequestBuilder {
        let mut req = self
            .http
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .body(body.to_string());

        for (key, value) in &self.headers {
            req = req.header(key.as_str(), value.as_str());
        }

        req
    }
}

#[async_trait]
impl McpTransport for HttpTransport {
    async fn send_request(&self, method: &str, params: Option<Value>) -> McpResult<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id,
            method: method.to_string(),
            params,
        };

        let body = serde_json::to_string(&req)?;

        let mut http_req = self.build_request(&body);

        // Attach session ID if we have one from a previous response.
        {
            let sid = self.session_id.lock().await;
            if let Some(ref session_id) = *sid {
                http_req = http_req.header("Mcp-Session-Id", session_id.as_str());
            }
        }

        let resp = http_req.send().await?;

        if !resp.status().is_success() {
            return Err(McpError::Transport(format!(
                "HTTP {}: {}",
                resp.status(),
                resp.text().await.unwrap_or_default()
            )));
        }

        // Capture session ID from response headers if present.
        if let Some(sid) = resp.headers().get("Mcp-Session-Id")
            && let Ok(sid_str) = sid.to_str()
        {
            let mut guard = self.session_id.lock().await;
            *guard = Some(sid_str.to_string());
        }

        let rpc_resp: JsonRpcResponse = resp.json().await?;

        if let Some(err) = rpc_resp.error {
            return Err(McpError::JsonRpc {
                code: err.code,
                message: err.message,
            });
        }

        rpc_resp
            .result
            .ok_or_else(|| McpError::Protocol("No result in response".into()))
    }

    async fn send_notification(&self, method: &str, params: Option<Value>) -> McpResult<()> {
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id: 0,
            method: method.to_string(),
            params,
        };

        let body = serde_json::to_string(&req)?;
        let mut http_req = self.build_request(&body);

        {
            let sid = self.session_id.lock().await;
            if let Some(ref session_id) = *sid {
                http_req = http_req.header("Mcp-Session-Id", session_id.as_str());
            }
        }

        let resp = http_req.send().await?;
        if !resp.status().is_success() {
            return Err(McpError::Transport(format!(
                "HTTP {} on notification",
                resp.status()
            )));
        }
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

// ---------------------------------------------------------------------------
// Helper: build transport from config
// ---------------------------------------------------------------------------

/// Create the appropriate transport from a `TransportType` config.
pub async fn create_transport(config: &TransportType) -> McpResult<Box<dyn McpTransport>> {
    match config {
        TransportType::Stdio { command, args, env } => {
            let transport = StdioTransport::spawn(command, args, env).await?;
            Ok(Box::new(transport))
        }
        TransportType::Sse { url } => {
            let transport = SseTransport::new(url);
            Ok(Box::new(transport))
        }
        TransportType::Http { url, headers } => {
            let transport = HttpTransport::new(url, headers.clone());
            Ok(Box::new(transport))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_transport_type_stdio_serde_roundtrip() {
        let stdio = TransportType::Stdio {
            command: "npx".to_string(),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server".to_string()],
            env: HashMap::new(),
        };
        let json = serde_json::to_string(&stdio).unwrap();
        assert!(json.contains(r#""type":"stdio""#));
        assert!(json.contains(r#""command":"npx""#));

        let deserialized: TransportType = serde_json::from_str(&json).unwrap();
        if let TransportType::Stdio { command, args, .. } = deserialized {
            assert_eq!(command, "npx");
            assert_eq!(args.len(), 2);
        } else {
            panic!("Expected Stdio variant");
        }
    }

    #[test]
    fn test_transport_type_sse_serde_roundtrip() {
        let sse = TransportType::Sse {
            url: "http://localhost:8080/mcp".to_string(),
        };
        let json = serde_json::to_string(&sse).unwrap();
        assert!(json.contains(r#""type":"sse""#));

        let deserialized: TransportType = serde_json::from_str(&json).unwrap();
        if let TransportType::Sse { url } = deserialized {
            assert_eq!(url, "http://localhost:8080/mcp");
        } else {
            panic!("Expected Sse variant");
        }
    }

    #[test]
    fn test_server_config_serde_roundtrip() {
        let config = McpServerConfig {
            id: "test-server".to_string(),
            name: "Test MCP Server".to_string(),
            transport: TransportType::Stdio {
                command: "python".to_string(),
                args: vec!["mcp_server.py".to_string()],
                env: HashMap::new(),
            },
            enabled: true,
        };

        let json = serde_json::to_string_pretty(&config).unwrap();
        let deserialized: McpServerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "test-server");
        assert_eq!(deserialized.name, "Test MCP Server");
        assert!(deserialized.enabled);
    }

    #[test]
    fn test_server_config_enabled_defaults_to_true() {
        let json = r#"{
            "id": "x",
            "name": "X",
            "transport": {"type": "sse", "url": "http://x"}
        }"#;
        let config: McpServerConfig = serde_json::from_str(json).unwrap();
        assert!(config.enabled);
    }

    #[test]
    fn test_sse_transport_new_is_alive() {
        let transport = SseTransport::new("http://localhost:3000/mcp");
        assert!(transport.is_alive());
    }

    #[tokio::test]
    async fn test_sse_transport_shutdown_sets_not_alive() {
        let transport = SseTransport::new("http://localhost:3000/mcp");
        assert!(transport.is_alive());
        transport.shutdown().await.unwrap();
        assert!(!transport.is_alive());
    }

    #[test]
    fn test_stdio_spawn_fails_for_nonexistent_command() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let result = rt.block_on(StdioTransport::spawn(
            "nonexistent_command_xyz_12345",
            &[],
            &HashMap::new(),
        ));
        assert!(result.is_err());
        if let Err(McpError::Transport(msg)) = result {
            assert!(msg.contains("Failed to spawn"));
        } else {
            panic!("Expected Transport error");
        }
    }

    #[test]
    fn test_json_rpc_request_serialization() {
        let req = JsonRpcRequest {
            jsonrpc: "2.0",
            id: 42,
            method: "tools/list".to_string(),
            params: Some(serde_json::json!({})),
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains(r#""jsonrpc":"2.0""#));
        assert!(json.contains(r#""id":42"#));
        assert!(json.contains(r#""method":"tools/list""#));
    }

    // -----------------------------------------------------------------------
    // HTTP transport tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_transport_type_http_serde_roundtrip() {
        let http = TransportType::Http {
            url: "http://localhost:8080/mcp".to_string(),
            headers: {
                let mut h = HashMap::new();
                h.insert("Authorization".to_string(), "Bearer token123".to_string());
                h
            },
        };
        let json = serde_json::to_string(&http).unwrap();
        assert!(json.contains(r#""type":"http""#));
        assert!(json.contains(r#""url":"http://localhost:8080/mcp""#));

        let deserialized: TransportType = serde_json::from_str(&json).unwrap();
        if let TransportType::Http { url, headers } = deserialized {
            assert_eq!(url, "http://localhost:8080/mcp");
            assert_eq!(headers.get("Authorization").unwrap(), "Bearer token123");
        } else {
            panic!("Expected Http variant");
        }
    }

    #[test]
    fn test_transport_type_http_default_headers() {
        let json = r#"{"type":"http","url":"http://example.com/mcp"}"#;
        let transport: TransportType = serde_json::from_str(json).unwrap();
        if let TransportType::Http { url, headers } = transport {
            assert_eq!(url, "http://example.com/mcp");
            assert!(headers.is_empty());
        } else {
            panic!("Expected Http variant");
        }
    }

    #[test]
    fn test_http_transport_new_is_alive() {
        let transport = HttpTransport::new("http://localhost:3000/mcp", HashMap::new());
        assert!(transport.is_alive());
    }

    #[tokio::test]
    async fn test_http_transport_shutdown_sets_not_alive() {
        let transport = HttpTransport::new("http://localhost:3000/mcp", HashMap::new());
        assert!(transport.is_alive());
        transport.shutdown().await.unwrap();
        assert!(!transport.is_alive());
    }

    #[tokio::test]
    async fn test_http_transport_with_custom_headers() {
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer test".to_string());
        let transport = HttpTransport::new("http://localhost:3000/mcp", headers);
        assert!(transport.is_alive());
        transport.shutdown().await.unwrap();
        assert!(!transport.is_alive());
    }

    #[test]
    fn test_server_config_with_http_transport() {
        let config = McpServerConfig {
            id: "remote-mcp".to_string(),
            name: "Remote MCP".to_string(),
            transport: TransportType::Http {
                url: "http://localhost:8080/mcp".to_string(),
                headers: HashMap::new(),
            },
            enabled: true,
        };
        let json = serde_json::to_string_pretty(&config).unwrap();
        assert!(json.contains(r#""type": "http""#));

        let deserialized: McpServerConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "remote-mcp");
        assert!(matches!(deserialized.transport, TransportType::Http { .. }));
    }
}
