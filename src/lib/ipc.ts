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
  const tauriApi = await import("@tauri-apps/api/event") as any;
  const unlisten = await tauriApi.listen(event, (e: any) => handler(e.payload));
  return unlisten;
}

/**
 * Emit a Tauri event to the backend.
 */
export async function emit(event: string, payload?: unknown): Promise<void> {
  if (!isTauri) {return;}
  const tauriApi = await import("@tauri-apps/api/event") as any;
  await tauriApi.emit(event, payload);
}

/** Check if running inside Tauri runtime. */
export function isTauriRuntime(): boolean {
  return isTauri;
}

// --- Mock implementations for browser dev mode ---

function mockInvoke(cmd: string, args?: Record<string, unknown>): unknown {
  console.log(`[IPC mock] ${cmd}`, args);

  switch (cmd) {
    case "ping":
      return { message: "pong", version: "0.1.0", timestamp: new Date().toISOString() };
    case "list_sessions":
      return [];
    case "get_settings":
      return { theme: "dark", locale: "en", providers: [] };
    case "create_session":
      return {
        id: `mock-${Date.now()}`,
        title: args?.title ?? "New Chat",
        model: args?.model ?? "",
        provider: args?.provider ?? "",
        workingDir: null,
        mode: "code",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    default:
      console.warn(`[IPC mock] Unhandled command: ${cmd}`);
      return null;
  }
}

// ── Tauri Event Names (must match Rust backend) ──────────────

/** Event names used by the Rust backend for streaming.
 *  The backend emits these as global events; the sessionId is inside the payload.
 *  Frontend handlers should filter by `payload.sessionId`. */
export const STREAM_EVENTS = {
  /** Incremental content chunk. Payload: StreamEvent::Chunk */
  CHUNK: "stream-chunk",
  /** Stream completed. Payload: StreamEvent::Done */
  DONE: "stream-done",
  /** Stream error. Payload: StreamEvent::Error */
  ERROR: "stream-error",
} as const;

// ── IPC Command Types ────────────────────────────────────────

/**
 * IPC command types for type-safe invocations.
 * These mirror the Tauri backend command signatures in `src-tauri/src/commands/`.
 */
export interface IPCCommands {
  // Session
  create_session: { title: string; model: string; provider: string };
  list_sessions: void;
  get_session: { id: string };
  delete_session: { id: string };
  update_session_title: { id: string; title: string };
  get_session_messages: { sessionId: string };
  add_message: {
    sessionId: string;
    role: string;
    content: string;
    model?: string;
    toolCalls?: string;
    toolCallId?: string;
  };

  // LLM
  send_message: {
    provider: ProviderConfigIPC;
    chatRequest: ChatRequestIPC;
  };
  send_message_stream: {
    provider: ProviderConfigIPC;
    chatRequest: ChatRequestIPC;
    sessionId?: string;
  };
  check_provider: { config: ProviderConfigIPC };
  list_provider_models: { config: ProviderConfigIPC };

  // Settings
  get_setting: { key: string };
  set_setting: { key: string; value: string };
  list_settings: void;

  // Usage
  get_session_usage: { sessionId: string };
  get_total_usage: void;
}

export interface ProviderConfigIPC {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKey?: string;
  models: ModelInfoIPC[];
  enabled: boolean;
}

export interface ModelInfoIPC {
  id: string;
  name: string;
  provider: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
}

export interface ChatRequestIPC {
  model: string;
  messages: MessageIPC[];
  system?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string[];
  tools?: ToolDefinitionIPC[];
  stream: boolean;
}

export interface MessageIPC {
  role: "user" | "assistant" | "system" | "tool";
  content: ContentBlockIPC[];
  name?: string;
  toolCallId?: string;
}

export type ContentBlockIPC =
  | { type: "text"; text: string }
  | { type: "image"; source: ImageSourceIPC }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export type ImageSourceIPC =
  | { type: "url"; url: string }
  | { type: "base64"; mediaType: string; data: string };

export interface ToolDefinitionIPC {
  name: string;
  description: string;
  inputSchema: unknown;
}

// ── Stream Event Types (match Rust StreamEvent) ──────────────

export interface StreamChunkEvent {
  event: "chunk";
  sessionId: string;
  delta?: string;
  role?: string;
  toolUse?: {
    id?: string;
    name?: string;
    inputJson?: string;
  };
}

export interface StreamDoneEvent {
  event: "done";
  sessionId: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  finishReason: "stop" | "length" | "tool_use" | "content_filter";
}

export interface StreamErrorEvent {
  event: "error";
  sessionId: string;
  message: string;
  code?: string;
}

export type StreamEventIPC = StreamChunkEvent | StreamDoneEvent | StreamErrorEvent;

// ── Result Types ─────────────────────────────────────────────

export interface SendMessageResult {
  response: {
    id: string;
    message: MessageIPC;
    model: string;
    usage: {
      inputTokens: number;
      outputTokens: number;
    };
    finishReason: string;
  };
  costUsd: number;
}

export interface StreamResult {
  sessionId: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  costUsd: number;
  finishReason: string;
}

export interface ProviderCheckResult {
  connected: boolean;
  message: string;
  modelsCount?: number;
}

export interface SessionInfoIPC {
  id: string;
  title: string;
  model: string;
  provider: string;
  workingDir?: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageInfoIPC {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  model?: string;
  toolCalls?: string;
  toolCallId?: string;
  tokenInput: number;
  tokenOutput: number;
  costUsd: number;
  createdAt: string;
}

export interface UsageRecordIPC {
  id: string;
  sessionId: string;
  model: string;
  provider: string;
  tokenInput: number;
  tokenOutput: number;
  costUsd: number;
  createdAt: string;
}

export interface SettingEntryIPC {
  key: string;
  value: string;
}
