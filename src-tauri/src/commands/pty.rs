//! Tauri commands for embedded PTY terminal sessions.
//!
//! Provides a persistent interactive shell session using `portable-pty`.
//! The frontend creates a PTY session, writes keystrokes to it, and
//! receives output events via Tauri's event system.

use crate::AppState;
use base64::Engine;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tracing::{info, warn};

/// A running PTY session.
struct PtySession {
    /// The writer half — used to send keystrokes to the shell.
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    /// The master PTY handle — used for resizing.
    master: Arc<Mutex<Box<dyn portable_pty::MasterPty + Send>>>,
    /// The child process handle — used to check if alive and kill.
    child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

/// Per-app PTY session manager.
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
}

impl Default for PtyManager {
    fn default() -> Self {
        Self::new()
    }
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }
}

/// Result of creating a PTY session.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateResult {
    pub session_id: String,
    pub shell: String,
}

/// Request to create a new PTY session.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyCreateRequest {
    /// Optional working directory for the shell.
    pub working_dir: Option<String>,
    /// Optional shell command (defaults to system shell).
    pub shell: Option<String>,
    /// Initial terminal size.
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

/// Allowed shells for PTY sessions — prevents arbitrary command execution.
const ALLOWED_SHELLS: &[&str] = &[
    "/bin/sh",
    "/bin/bash",
    "/bin/zsh",
    "/usr/bin/bash",
    "/usr/bin/zsh",
    "/usr/bin/fish",
];

/// Validate that the requested shell is in the allowed list.
/// Returns the validated shell path, or defaults to `/bin/sh`.
fn validate_shell(shell: &str) -> String {
    if ALLOWED_SHELLS.contains(&shell) {
        shell.to_string()
    } else {
        tracing::warn!(
            "Rejected shell '{}' — not in allowed list. Falling back to /bin/sh.",
            shell
        );
        "/bin/sh".to_string()
    }
}

/// Create a new interactive PTY session.
///
/// Spawns a shell process (bash/zsh/sh) and begins forwarding its output
/// to the frontend via `pty-output` events.
#[tauri::command(rename_all = "camelCase")]
pub async fn pty_create(
    app: AppHandle,
    state: State<'_, AppState>,
    req: PtyCreateRequest,
) -> Result<PtyCreateResult, String> {
    let pty_system = NativePtySystem::default();

    let cols = req.cols.unwrap_or(80);
    let rows = req.rows.unwrap_or(24);

    let session_id = uuid::Uuid::new_v4().to_string();

    // Build the shell command — [C-03] validate shell against allowlist
    let shell_name = match &req.shell {
        Some(s) => validate_shell(s),
        None => {
            let default = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
            validate_shell(&default)
        }
    };
    let mut cmd = CommandBuilder::new(&shell_name);

    // Set working directory
    if let Some(wd) = &req.working_dir {
        cmd.cwd(wd);
    }

    // Create the PTY pair
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let shell_display = shell_name.clone();

    // Get the writer for sending input (from master) — must call before moving master
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {e}"))?;

    // Read output from the PTY reader (from master) — must call before moving master
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    // Spawn the child process from the slave side
    let child = pair
        .slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {e}"))?;

    // Keep a reference to master for resizing
    let master = Arc::new(Mutex::new(pair.master));

    let sid = session_id.clone();
    let app_handle = app.clone();

    // Spawn background task to read PTY output and emit events
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF — shell exited
                    info!("PTY session {} exited (EOF)", sid);
                    let _ = app_handle.emit(
                        "pty-exit",
                        &serde_json::json!({
                            "sessionId": sid,
                            "exitCode": 0,
                        }),
                    );
                    break;
                }
                Ok(n) => {
                    // Forward raw bytes as a base64-encoded payload
                    let data = &buf[..n];
                    let b64 = base64::engine::general_purpose::STANDARD.encode(data);
                    let payload = serde_json::json!({
                        "sessionId": sid,
                        "data": b64,
                    });
                    let _ = app_handle.emit("pty-output", &payload);
                }
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::Interrupted {
                        continue;
                    }
                    warn!("PTY read error for session {}: {}", sid, e);
                    let _ = app_handle.emit(
                        "pty-exit",
                        &serde_json::json!({
                            "sessionId": sid,
                            "exitCode": -1,
                        }),
                    );
                    break;
                }
            }
        }
    });

    // Store the session
    {
        let mut pty_manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
        pty_manager.sessions.insert(
            session_id.clone(),
            PtySession {
                writer: Arc::new(Mutex::new(writer)),
                master,
                child: Arc::new(Mutex::new(child)),
            },
        );
    }

    info!(
        "Created PTY session {} (shell: {}, size: {}x{})",
        session_id, shell_display, cols, rows
    );

    Ok(PtyCreateResult {
        session_id,
        shell: shell_display,
    })
}

/// Write input data to a PTY session.
///
/// The `data` field is base64-encoded raw bytes (keypresses, control sequences).
#[tauri::command(rename_all = "camelCase")]
pub async fn pty_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&data)
        .map_err(|e| format!("Invalid base64 data: {e}"))?;

    let pty_manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    let session = pty_manager
        .sessions
        .get(&session_id)
        .ok_or_else(|| format!("PTY session {} not found", session_id))?;

    let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
    writer
        .write_all(&bytes)
        .map_err(|e| format!("Write error: {e}"))?;
    writer.flush().map_err(|e| format!("Flush error: {e}"))?;

    Ok(())
}

/// Resize a PTY session's terminal dimensions.
#[tauri::command(rename_all = "camelCase")]
pub async fn pty_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let pty_manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    let session = pty_manager
        .sessions
        .get(&session_id)
        .ok_or_else(|| format!("PTY session {} not found", session_id))?;

    // resize() is on the MasterPty trait, not on Child
    let master = session.master.lock().map_err(|e| e.to_string())?;
    master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Resize error: {e}"))?;

    Ok(())
}

/// Kill a PTY session.
#[tauri::command(rename_all = "camelCase")]
pub async fn pty_kill(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    let mut pty_manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    if let Some(session) = pty_manager.sessions.remove(&session_id) {
        // Try to kill the child process gracefully
        let mut child = session.child.lock().map_err(|e| e.to_string())?;
        let _ = child.kill();
        info!("Killed PTY session {}", session_id);
        Ok(())
    } else {
        Err(format!("PTY session {} not found", session_id))
    }
}

/// List active PTY sessions.
#[tauri::command]
pub async fn pty_list(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let pty_manager = state.pty_manager.lock().map_err(|e| e.to_string())?;
    Ok(pty_manager.sessions.keys().cloned().collect())
}
