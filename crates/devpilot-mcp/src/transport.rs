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
    async fn send_request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> McpResult<Value>;

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

        let mut child = cmd.spawn().map_err(|e| McpError::Transport(format!(
            "Failed to spawn '{}': {}", command, e
        )))?;

        let stdin = child.stdin.take().ok_or_else(|| {
            McpError::Transport("Failed to acquire stdin".into())
        })?;
        let stdout = child.stdout.take().ok_or_else(|| {
            McpError::Transport("Failed to acquire stdout".into())
        })?;

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
            return Err(McpError::Disconnected("Empty response from MCP server".into()));
        }

        let resp: JsonRpcResponse = serde_json::from_str(response_line.trim())?;

        if let Some(err) = resp.error {
            return Err(McpError::JsonRpc {
                code: err.code,
                message: err.message,
            });
        }

        resp.result.ok_or_else(|| McpError::Protocol("No result in response".into()))
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

        let resp = self
            .http
            .post(&self.url)
            .json(&req)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Err(McpError::Transport(format!(
                "HTTP {}: {}", resp.status(), resp.text().await.unwrap_or_default()
            )));
        }

        let rpc_resp: JsonRpcResponse = resp.json().await?;

        if let Some(err) = rpc_resp.error {
            return Err(McpError::JsonRpc {
                code: err.code,
                message: err.message,
            });
        }

        rpc_resp.result.ok_or_else(|| McpError::Protocol("No result in response".into()))
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
                "HTTP {} on notification", resp.status()
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
    }
}
