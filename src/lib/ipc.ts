/**
 * Tauri IPC bridge layer (frontend side)
 *
 * This module wraps @tauri-apps/api invoke/listen calls.
 * When running in browser (dev mode without Tauri), it falls back
 * to mock implementations so the UI remains functional.
 */

// Check if Tauri APIs are available
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Invoke a Tauri command.
 * Falls back to mock in browser dev mode.
 */
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri) {
    return mockInvoke(cmd, args) as T;
  }
  // Dynamic import to avoid bundling errors in browser
  // @ts-expect-error — @tauri-apps/api is optional, only available in Tauri runtime
  const tauriApi = await import("@tauri-apps/api/core") as any;
  return tauriApi.invoke(cmd, args) as T;
}

/**
 * Listen to a Tauri event.
 * Falls back to no-op in browser dev mode.
 */
export async function listen<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!isTauri) {
    return () => {};
  }
  // @ts-expect-error — @tauri-apps/api is optional
  const tauriApi = await import("@tauri-apps/api/event") as any;
  const unlisten = await tauriApi.listen(event, (e: any) => handler(e.payload));
  return unlisten;
}

/**
 * Emit a Tauri event to the backend.
 */
export async function emit(event: string, payload?: unknown): Promise<void> {
  if (!isTauri) {return;}
  // @ts-expect-error — @tauri-apps/api is optional
  const tauriApi = await import("@tauri-apps/api/event") as any;
  await tauriApi.emit(event, payload);
}

// --- Mock implementations for browser dev mode ---

function mockInvoke(cmd: string, args?: Record<string, unknown>): unknown {
  console.log(`[IPC mock] ${cmd}`, args);

  switch (cmd) {
    case "ping":
      return "pong";
    case "get_version":
      return "0.1.0";
    case "get_settings":
      return { theme: "dark", locale: "en", providers: [] };
    default:
      console.warn(`[IPC mock] Unhandled command: ${cmd}`);
      return null;
  }
}

/**
 * IPC command types for type-safe invocations.
 * These mirror the Tauri backend command signatures.
 */
export interface IPCCommands {
  // Session
  create_session: { config: SessionConfig };
  send_message: { sessionId: string; content: string; attachments?: string[] };
  pause_session: { sessionId: string };
  resume_session: { sessionId: string };
  rewind_session: { sessionId: string; checkpointId: string };
  delete_session: { sessionId: string };

  // Tools
  approve_tool_call: { callId: string; approved: boolean };
  list_mcp_servers: void;
  add_mcp_server: { config: MCPServerConfig };

  // Files
  read_file: { path: string };
  list_dir: { path: string };
  search_files: { query: string; rootPath?: string };

  // Settings
  get_settings: void;
  update_settings: { settings: Record<string, unknown> };
  get_providers: void;
  test_provider: { providerId: string };
}

export interface SessionConfig {
  model: string;
  provider: string;
  workingDir?: string;
  mode?: string;
}

export interface MCPServerConfig {
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}
