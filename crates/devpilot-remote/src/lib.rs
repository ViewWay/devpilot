//! DevPilot Remote — WebSocket server for mobile device pairing and control.
//!
//! Provides a JSON-over-WebSocket protocol so that a mobile companion app can
//! authenticate, list/chat sessions, read settings, and receive streaming
//! responses from the desktop DevPilot instance.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;

use chrono::Utc;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{RwLock, mpsc};
use tokio_tungstenite::tungstenite::Message;
use tracing::{error, info};
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// JSON message protocol exchanged over the WebSocket.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RemoteMessage {
    // ---- Client -> Server ----
    Ping,
    Auth {
        token: String,
        device_name: String,
    },
    Chat {
        session_id: String,
        message: String,
    },
    ListSessions,
    GetSession {
        id: String,
    },
    Settings,

    // ---- Server -> Client ----
    Pong,
    AuthResult {
        success: bool,
        error: Option<String>,
    },
    ChatResponse {
        session_id: String,
        content: String,
        streaming: bool,
    },
    SessionList {
        sessions: Vec<SessionInfo>,
    },
    SessionData {
        session: SessionInfo,
        messages: Vec<MessageInfo>,
    },
    SettingsData {
        settings: serde_json::Value,
    },
    Error {
        message: String,
    },
}

/// Summary of a chat session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub message_count: usize,
}

/// A single message inside a chat session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageInfo {
    pub role: String,
    pub content: String,
    pub timestamp: i64,
}

/// A connected (and possibly authenticated) mobile device.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedDevice {
    pub id: String,
    pub name: String,
    pub auth_token: String,
    pub connected_at: i64,
}

// ---------------------------------------------------------------------------
// Connection URL / local IP helpers
// ---------------------------------------------------------------------------

/// Detect the local IP address of this machine.
/// Returns the first non-loopback IPv4 address found.
pub fn detect_local_ip() -> Option<std::net::IpAddr> {
    local_ip_address::local_ip().ok()
}

/// Build the WebSocket URL that a mobile client should connect to.
///
/// Returns something like `ws://192.168.1.42:30081`.
/// If local IP detection fails, falls back to `127.0.0.1`.
pub fn connection_url(port: u16) -> String {
    let ip = detect_local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    format!("ws://{}:{}", ip, port)
}

/// Return a JSON payload suitable for a frontend QR-code renderer.
///
/// The payload contains the `ws_url` and a human-readable label.
pub fn qr_payload(port: u16) -> serde_json::Value {
    let url = connection_url(port);
    serde_json::json!({
        "ws_url": url,
        "label": format!("DevPilot Remote — {}", url),
    })
}

// ---------------------------------------------------------------------------
// Server configuration
// ---------------------------------------------------------------------------

/// Configuration for the remote WebSocket server.
#[derive(Debug, Clone)]
pub struct RemoteServerConfig {
    /// TCP port to listen on (default `30081`).
    pub port: u16,
    /// Shared secret that mobile clients must present to authenticate.
    /// An empty string means *any* token is accepted (dev mode).
    pub auth_secret: String,
}

impl Default for RemoteServerConfig {
    fn default() -> Self {
        Self {
            port: 30_081,
            auth_secret: String::new(),
        }
    }
}

// ---------------------------------------------------------------------------
// Shared server state
// ---------------------------------------------------------------------------

/// Callback type used to handle incoming `Chat` messages.
///
/// The implementor is expected to return the full (or partial) response text
/// and a flag indicating whether this is a streaming chunk.
pub type ChatHandler = Arc<
    dyn Fn(
            String,
            String,
            mpsc::Sender<RemoteMessage>,
        ) -> Box<dyn std::future::Future<Output = ()> + Send + Unpin>
        + Send
        + Sync,
>;

/// Callback for `ListSessions`.
pub type ListSessionsHandler = Arc<
    dyn Fn() -> Box<dyn std::future::Future<Output = Vec<SessionInfo>> + Send + Unpin>
        + Send
        + Sync,
>;

/// Callback for `GetSession`.
pub type GetSessionHandler = Arc<
    dyn Fn(
            String,
        ) -> Box<
            dyn std::future::Future<Output = Option<(SessionInfo, Vec<MessageInfo>)>>
                + Send
                + Unpin,
        > + Send
        + Sync,
>;

/// Callback for `Settings`.
pub type SettingsHandler = Arc<
    dyn Fn() -> Box<dyn std::future::Future<Output = serde_json::Value> + Send + Unpin>
        + Send
        + Sync,
>;

/// Collection of optional callbacks that the host application can register
/// to provide real data for mobile clients.
#[derive(Default, Clone)]
pub struct RemoteHandlers {
    pub on_chat: Option<ChatHandler>,
    pub on_list_sessions: Option<ListSessionsHandler>,
    pub on_get_session: Option<GetSessionHandler>,
    pub on_settings: Option<SettingsHandler>,
}

/// The mutable server state shared across all connections.
pub struct RemoteState {
    /// Authenticated devices keyed by connection id.
    devices: HashMap<String, ConnectedDevice>,
    /// Registered application callbacks.
    handlers: RemoteHandlers,
}

impl RemoteState {
    fn new(handlers: RemoteHandlers) -> Self {
        Self {
            devices: HashMap::new(),
            handlers,
        }
    }
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

/// The WebSocket remote server.
///
/// Call [`RemoteServer::start`] to spawn it in the background.
pub struct RemoteServer {
    config: RemoteServerConfig,
    handlers: RemoteHandlers,
    state: Arc<RwLock<RemoteState>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
}

impl RemoteServer {
    /// Create a new server with the given configuration.
    pub fn new(config: RemoteServerConfig) -> Self {
        Self {
            config,
            handlers: RemoteHandlers::default(),
            state: Arc::new(RwLock::new(RemoteState::new(RemoteHandlers::default()))),
            shutdown_tx: None,
        }
    }

    /// Register application callbacks.
    pub fn set_handlers(&mut self, handlers: RemoteHandlers) {
        self.handlers = handlers;
        // We rebuild state on start, so just store handlers for now.
    }

    /// Start the server.
    ///
    /// Returns a handle that can be used to shut down the server.
    /// The server runs as a background tokio task.
    pub async fn start(&mut self) -> Result<RemoteServerHandle, String> {
        let addr = format!("0.0.0.0:{}", self.config.port);
        let listener = TcpListener::bind(&addr)
            .await
            .map_err(|e| format!("failed to bind {}: {}", addr, e))?;

        let local_addr = listener.local_addr().unwrap();
        info!("DevPilot remote server listening on {}", local_addr);
        info!("Connection URL: {}", connection_url(local_addr.port()));

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        let state = Arc::new(RwLock::new(RemoteState::new(self.handlers.clone())));
        self.state = state.clone();
        let auth_secret = self.config.auth_secret.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept = listener.accept() => {
                        match accept {
                            Ok((stream, peer)) => {
                                info!("New connection from {}", peer);
                                let state = state.clone();
                                let auth_secret = auth_secret.clone();
                                tokio::spawn(handle_connection(stream, peer, state, auth_secret));
                            }
                            Err(e) => {
                                error!("Accept error: {}", e);
                            }
                        }
                    }
                    _ = shutdown_rx.recv() => {
                        info!("Remote server shutting down");
                        break;
                    }
                }
            }
        });

        self.shutdown_tx = Some(shutdown_tx.clone());

        Ok(RemoteServerHandle {
            shutdown: shutdown_tx,
            port: local_addr.port(),
        })
    }

    /// Return a snapshot of currently connected devices.
    pub async fn connected_devices(&self) -> Vec<ConnectedDevice> {
        let state = self.state.read().await;
        state.devices.values().cloned().collect()
    }
}

/// Handle returned by [`RemoteServer::start`], used to control the running server.
pub struct RemoteServerHandle {
    shutdown: mpsc::Sender<()>,
    /// The actual port the server is listening on.
    pub port: u16,
}

impl RemoteServerHandle {
    /// Request a graceful shutdown of the server.
    pub async fn shutdown(&self) -> Result<(), String> {
        self.shutdown
            .send(())
            .await
            .map_err(|_| "server already shut down".to_string())
    }
}

// ---------------------------------------------------------------------------
// Per-connection handler
// ---------------------------------------------------------------------------

async fn handle_connection(
    raw_stream: TcpStream,
    peer: SocketAddr,
    state: Arc<RwLock<RemoteState>>,
    auth_secret: String,
) {
    let ws_stream = match tokio_tungstenite::accept_async(raw_stream).await {
        Ok(ws) => ws,
        Err(e) => {
            error!("WebSocket handshake failed for {}: {}", peer, e);
            return;
        }
    };
    info!("WebSocket connection established with {}", peer);

    let (mut ws_sink, mut ws_stream) = ws_stream.split();
    let conn_id = Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::channel::<RemoteMessage>(64);

    // Outgoing message pump: forward RemoteMessages from the channel to the WS sink.
    let outgoing_conn_id = conn_id.clone();
    let outgoing = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            let text = match serde_json::to_string(&msg) {
                Ok(t) => t,
                Err(e) => {
                    error!("Serialize error: {}", e);
                    continue;
                }
            };
            if ws_sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
        info!("Outgoing pump ended for {}", outgoing_conn_id);
    });

    // Track auth state.
    let mut authenticated = auth_secret.is_empty(); // no secret = auto-auth
    let conn_id_for_cleanup = conn_id.clone();

    // Incoming message loop.
    while let Some(result) = ws_stream.next().await {
        match result {
            Ok(Message::Text(text)) => {
                let msg: RemoteMessage = match serde_json::from_str(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        let _ = tx
                            .send(RemoteMessage::Error {
                                message: format!("invalid message: {}", e),
                            })
                            .await;
                        continue;
                    }
                };

                match msg {
                    RemoteMessage::Ping => {
                        let _ = tx.send(RemoteMessage::Pong).await;
                    }

                    RemoteMessage::Auth { token, device_name } => {
                        if !auth_secret.is_empty() && token != auth_secret {
                            let _ = tx
                                .send(RemoteMessage::AuthResult {
                                    success: false,
                                    error: Some("invalid token".to_string()),
                                })
                                .await;
                            continue;
                        }
                        authenticated = true;
                        let device = ConnectedDevice {
                            id: conn_id.clone(),
                            name: device_name,
                            auth_token: token,
                            connected_at: Utc::now().timestamp(),
                        };
                        {
                            let mut st = state.write().await;
                            st.devices.insert(conn_id.clone(), device);
                        }
                        let _ = tx
                            .send(RemoteMessage::AuthResult {
                                success: true,
                                error: None,
                            })
                            .await;
                    }

                    RemoteMessage::ListSessions => {
                        if !authenticated {
                            send_auth_required(&tx).await;
                            continue;
                        }
                        let sessions = {
                            let st = state.read().await;
                            if let Some(ref h) = st.handlers.on_list_sessions {
                                h().await
                            } else {
                                vec![]
                            }
                        };
                        let _ = tx.send(RemoteMessage::SessionList { sessions }).await;
                    }

                    RemoteMessage::GetSession { id } => {
                        if !authenticated {
                            send_auth_required(&tx).await;
                            continue;
                        }
                        let result = {
                            let st = state.read().await;
                            if let Some(ref h) = st.handlers.on_get_session {
                                h(id).await
                            } else {
                                None
                            }
                        };
                        match result {
                            Some((session, messages)) => {
                                let _ = tx
                                    .send(RemoteMessage::SessionData { session, messages })
                                    .await;
                            }
                            None => {
                                let _ = tx
                                    .send(RemoteMessage::Error {
                                        message: "session not found".to_string(),
                                    })
                                    .await;
                            }
                        }
                    }

                    RemoteMessage::Chat {
                        session_id,
                        message,
                    } => {
                        if !authenticated {
                            send_auth_required(&tx).await;
                            continue;
                        }
                        let handler = {
                            let st = state.read().await;
                            st.handlers.on_chat.clone()
                        };
                        match handler {
                            Some(h) => {
                                let tx_clone = tx.clone();
                                h(session_id.clone(), message, tx_clone).await;
                            }
                            None => {
                                let _ = tx
                                    .send(RemoteMessage::ChatResponse {
                                        session_id,
                                        content: "no chat handler registered".to_string(),
                                        streaming: false,
                                    })
                                    .await;
                            }
                        }
                    }

                    RemoteMessage::Settings => {
                        if !authenticated {
                            send_auth_required(&tx).await;
                            continue;
                        }
                        let settings = {
                            let st = state.read().await;
                            if let Some(ref h) = st.handlers.on_settings {
                                h().await
                            } else {
                                serde_json::json!({})
                            }
                        };
                        let _ = tx.send(RemoteMessage::SettingsData { settings }).await;
                    }

                    // Server-to-client messages received from a client are ignored.
                    _ => {
                        let _ = tx
                            .send(RemoteMessage::Error {
                                message: "unexpected message type".to_string(),
                            })
                            .await;
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("Client {} closed connection", peer);
                break;
            }
            Ok(_) => {} // ignore binary/ping/pong frames
            Err(e) => {
                error!("WebSocket error for {}: {}", peer, e);
                break;
            }
        }
    }

    // Cleanup: remove device from state.
    {
        let mut st = state.write().await;
        st.devices.remove(&conn_id_for_cleanup);
    }

    // Drop the sender to stop the outgoing pump.
    drop(tx);
    let _ = outgoing.await;
    info!("Connection {} cleaned up", conn_id_for_cleanup);
}

async fn send_auth_required(tx: &mpsc::Sender<RemoteMessage>) {
    let _ = tx
        .send(RemoteMessage::Error {
            message: "authentication required".to_string(),
        })
        .await;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn connection_url_format() {
        let url = connection_url(30_081);
        // Either a real IP or the fallback 127.0.0.1.
        assert!(url.starts_with("ws://"));
        assert!(url.ends_with(":30081"));
    }

    #[test]
    fn qr_payload_has_ws_url() {
        let payload = qr_payload(30_081);
        assert!(payload["ws_url"].as_str().unwrap().starts_with("ws://"));
        assert!(payload["label"].as_str().unwrap().contains("DevPilot"));
    }

    #[test]
    fn serialize_deserialize_ping() {
        let msg = RemoteMessage::Ping;
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"ping\""));
        let back: RemoteMessage = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, RemoteMessage::Ping));
    }

    #[test]
    fn serialize_deserialize_auth() {
        let msg = RemoteMessage::Auth {
            token: "secret".to_string(),
            device_name: "iPhone".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"auth\""));
        let back: RemoteMessage = serde_json::from_str(&json).unwrap();
        match back {
            RemoteMessage::Auth { token, device_name } => {
                assert_eq!(token, "secret");
                assert_eq!(device_name, "iPhone");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn serialize_deserialize_error() {
        let msg = RemoteMessage::Error {
            message: "oops".to_string(),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("\"type\":\"error\""));
    }
}
