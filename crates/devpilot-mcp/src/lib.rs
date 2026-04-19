//! DevPilot MCP — Model Context Protocol client.
//!
//! Provides:
//! - `McpTransport`: stdio and SSE transport implementations
//! - `McpClient`: individual MCP server connection with tool discovery
//! - `McpTool`: a `Tool` trait adapter that bridges MCP tools into the devpilot-tools registry
//! - `McpManager`: manages multiple MCP server connections

mod client;
mod error;
mod manager;
mod transport;

pub use client::McpClient;
pub use error::{McpError, McpResult};
pub use manager::McpManager;
pub use transport::{McpServerConfig, McpTransport, TransportType};
