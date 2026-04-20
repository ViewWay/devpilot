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

/** Get the Tauri app local data directory. Returns empty string in browser dev. */
export async function getAppDataDir(): Promise<string> {
  if (!isTauri) {
    return "/tmp/devpilot-mock-data";
  }
  const tauriApi = await import("@tauri-apps/api/path") as any;
  return tauriApi.appLocalDataDir() as string;
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
    case "list_tools":
      return [
        {
          name: "shell_exec",
          description: "Execute a shell command",
          inputSchema: {
            type: "object",
            properties: {
              command: { type: "string", description: "Command to execute" },
            },
            required: ["command"],
          },
        },
        {
          name: "file_read",
          description: "Read file contents",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
            },
            required: ["path"],
          },
        },
        {
          name: "file_write",
          description: "Write content to a file",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
              content: { type: "string", description: "File content" },
            },
            required: ["path", "content"],
          },
        },
        {
          name: "apply_patch",
          description: "Apply a find-and-replace patch to a file",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path" },
              old_string: { type: "string", description: "Text to find" },
              new_string: { type: "string", description: "Replacement text" },
            },
            required: ["path", "old_string", "new_string"],
          },
        },
        {
          name: "file_search",
          description: "Search files by name (fuzzy) or content (regex)",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query (glob pattern or regex)" },
              mode: { type: "string", description: "Search mode: 'fuzzy' or 'content'" },
              path: { type: "string", description: "Root directory to search in" },
              max_results: { type: "number", description: "Max results (default 50)" },
            },
            required: ["query"],
          },
        },
        {
          name: "web_fetch",
          description: "Fetch and extract text content from a web URL",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "The URL to fetch" },
              max_length: { type: "number", description: "Max characters to return (default 10000)" },
            },
            required: ["url"],
          },
        },
      ];
    case "execute_tool":
      return {
        approval: "auto_approved",
        output: `[mock] Tool ${args?.toolName} executed`,
        isError: false,
        durationMs: 42,
      };
    case "pending_approvals":
      return 0;
    case "scheduler_create_task":
      return `task-${Date.now()}`;
    case "scheduler_list_tasks":
      return [
        { id: "task-1", name: "Daily Backup", cronExpr: "0 2 * * *", status: "Active", executionCount: 42, maxExecutions: null },
        { id: "task-2", name: "Health Check", cronExpr: "*/15 * * * *", status: "Paused", executionCount: 120, maxExecutions: null },
      ];
    case "scheduler_remove_task":
    case "scheduler_pause_task":
    case "scheduler_resume_task":
      return null;
    case "bridge_create":
      return `bridge-${Date.now()}`;
    case "bridge_list":
      return [
        { id: "bridge-1", name: "Dev Alerts", platform: "Telegram", enabled: true },
        { id: "bridge-2", name: "CI Notify", platform: "Discord", enabled: false },
      ];
    case "bridge_remove":
    case "bridge_send":
    case "bridge_enable":
    case "bridge_disable":
      return null;
    case "media_generate":
      return {
        provider: "openai",
        model: "dall-e-3",
        images: [{ url: "https://picsum.photos/1024/1024", b64Json: null, revisedPrompt: "A scenic landscape" }],
      };
    case "media_providers":
      return ["openai", "stability", "generic"];
    case "list_checkpoints":
      return [];
    case "create_checkpoint":
      return { id: "cp-mock-1", sessionId: args?.sessionId, messageId: args?.messageId, summary: args?.summary, tokenCount: args?.tokenCount, createdAt: new Date().toISOString() };
    case "rewind_checkpoint":
      return 0;
    case "list_mcp_servers":
      return [];
    case "mcp_list_connected":
      return [];
    case "upsert_mcp_server":
      return args?.server ?? { id: args?.id, name: "Mock MCP", transport: "stdio", enabled: true, createdAt: new Date().toISOString() };
    case "delete_mcp_server":
      return null;
    case "mcp_connect_server":
      return null;
    case "mcp_disconnect_server":
      return null;
    case "export_sessions":
      return JSON.stringify({
        version: "0.4.0",
        exportedAt: new Date().toISOString(),
        sessions: [],
      });
    case "import_sessions":
      return { sessionsImported: 0, messagesImported: 0 };
    // Memory & Persona
    case "load_persona_files_cmd":
      return { soulMd: null, userMd: null, memoryMd: null, agentsMd: null };
    case "save_persona_file_cmd":
      return null;
    case "list_daily_memories_cmd":
      return [];
    case "search_memories_cmd":
      return [];
    case "create_daily_memory_cmd":
      return null;
    case "searchFiles":
      return [];
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
  /** Tool call started. Payload: { sessionId, callId, toolName, input } */
  TOOL_START: "stream-tool-start",
  /** Tool call completed. Payload: { sessionId, callId, output, isError } */
  TOOL_RESULT: "stream-tool-result",
  /** Tool approval requested. Payload: { sessionId, callId, toolName, input, riskLevel } */
  APPROVAL: "stream-approval",
  /** Stream completed. Payload: StreamEvent::Done */
  DONE: "stream-done",
  /** Turn completed. Payload: StreamEvent::TurnDone */
  TURN_DONE: "stream-turn-done",
  /** Stream error. Payload: StreamEvent::Error */
  ERROR: "stream-error",
  /** Context compaction happened. Payload: { sessionId, messagesRemoved, summaryAdded } */
  COMPACTED: "stream-compacted",
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
  set_session_working_dir: { id: string; workingDir: string };
  get_session_messages: { sessionId: string };
  add_message: {
    sessionId: string;
    role: string;
    content: string;
    model?: string;
    toolCalls?: string;
    toolCallId?: string;
  };
  update_message_content: {
    messageId: string;
    content: string;
  };

  // LLM
  send_message: {
    provider: ProviderConfigIPC;
    chatRequest: ChatRequestIPC;
  };
  send_message_stream: {
    provider: ProviderConfigIPC;
    chatRequest: ChatRequestIPC;
    sessionId: string;
    userMessage: string;
    workingDir?: string;
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

  // Providers (persistent)
  list_providers: void;
  get_provider: { id: string };
  upsert_provider: { provider: ProviderRecordIPC; apiKey?: string };
  get_provider_api_key: { id: string };
  delete_provider: { id: string };

  // Tools
  list_tools: void;
  execute_tool: {
    toolName: string;
    input: unknown;
    sessionId: string;
    workingDir: string;
  };
  resolve_tool_approval: { request: { requestId: string; approved: boolean } };
  pending_approvals: void;

  // Scheduler
  scheduler_create_task: {
    name: string;
    cronExpr: string;
    action: { type: string; command?: string; url?: string; method?: string; headers?: [string, string][]; body?: string; id?: string };
    maxExecutions?: number;
  };
  scheduler_list_tasks: void;
  scheduler_remove_task: { taskId: string };
  scheduler_pause_task: { taskId: string };
  scheduler_resume_task: { taskId: string };

  // Bridge
  bridge_create: {
    name: string;
    platform: string;
    url: string;
    channel?: string;
    token?: string;
  };
  bridge_list: void;
  bridge_remove: { bridgeId: string };
  bridge_send: { bridgeId: string; content: string; title?: string };
  bridge_enable: { bridgeId: string };
  bridge_disable: { bridgeId: string };

  // Media
  media_generate: {
    prompt: string;
    model?: string;
    size?: string;
    n?: number;
    provider?: string;
    apiKey: string;
    apiBase?: string;
  };
  media_providers: void;

  // Data Import / Export
  export_sessions: void;
  import_sessions: { jsonData: string };

  // Memory & Persona
  load_persona_files_cmd: { workspaceDir: string };
  save_persona_file_cmd: { workspaceDir: string; fileType: string; content: string };
  list_daily_memories_cmd: { dataDir: string; limit?: number | null };
  search_memories_cmd: { workspaceDir: string; dataDir: string; query: string };
  create_daily_memory_cmd: { dataDir: string; date: string; content: string };
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

// ── Provider Types (persistent) ─────────────────────────────────

export interface ProviderRecordIPC {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  apiKeySet: boolean;
  models?: string;
  enabled: boolean;
  createdAt: string;
}

// ── Tool Types ─────────────────────────────────────────────────

export interface ToolDefinitionIPC {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolExecutionResultIPC {
  approval: "approved" | "rejected" | "auto_approved";
  output?: string;
  isError: boolean;
  metadata?: unknown;
  durationMs: number;
}

export interface ResolveApprovalRequestIPC {
  requestId: string;
  approved: boolean;
}

/** Event payload for `tool-executed` events from the backend. */
export interface ToolExecutedEventIPC {
  toolName: string;
  isError: boolean;
  durationMs: number;
}

// ── Tool Events ────────────────────────────────────────────────

/** Event names used by the Rust backend for tool execution. */
export const TOOL_EVENTS = {
  /** A tool was executed. Payload: ToolExecutedEventIPC */
  EXECUTED: "tool-executed",
} as const;

// ── Scheduler Types ──────────────────────────────────────────

export interface TaskInfoIPC {
  id: string;
  name?: string;
  cronExpr: string;
  status: string;
  executionCount: number;
  maxExecutions?: number;
}

export type TaskActionIPC =
  | { type: "shellCommand"; command: string }
  | { type: "httpRequest"; url: string; method: string; headers?: [string, string][]; body?: string }
  | { type: "custom"; id: string };

// ── Bridge Types ──────────────────────────────────────────────

export interface BridgeInfoIPC {
  id: string;
  name?: string;
  platform: string;
  enabled: boolean;
}

// ── Media Types ───────────────────────────────────────────────

export interface GenerateImageResultIPC {
  provider: string;
  model: string;
  images: ImageResultItemIPC[];
}

export interface ImageResultItemIPC {
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
}

// ── Memory & Persona Types ────────────────────────────────────

export interface PersonaFilesIPC {
  soulMd: string | null;
  userMd: string | null;
  memoryMd: string | null;
  agentsMd: string | null;
}

export interface DailyEntryIPC {
  date: string;
  content: string;
}

export interface MemorySearchResultIPC {
  source: string;
  snippet: string;
}

// ── PTY (Embedded Terminal) Types ────────────────────────────

export interface PtyCreateRequestIPC {
  workingDir?: string;
  shell?: string;
  cols?: number;
  rows?: number;
}

export interface PtyCreateResultIPC {
  sessionId: string;
  shell: string;
}

export interface PtyOutputEventIPC {
  sessionId: string;
  data: string; // base64-encoded raw bytes
}

export interface PtyExitEventIPC {
  sessionId: string;
  exitCode: number;
}

// ── PTY IPC Commands ──────────────────────────────────────────

export async function ptyCreate(
  req: PtyCreateRequestIPC,
): Promise<PtyCreateResultIPC> {
  return invoke<PtyCreateResultIPC>("pty_create", { req });
}

export async function ptyWrite(
  sessionId: string,
  data: string,
): Promise<void> {
  return invoke("pty_write", { sessionId, data });
}

export async function ptyResize(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<void> {
  return invoke("pty_resize", { sessionId, cols, rows });
}

export async function ptyKill(sessionId: string): Promise<void> {
  return invoke("pty_kill", { sessionId });
}

export async function ptyList(): Promise<string[]> {
  return invoke<string[]>("pty_list");
}
