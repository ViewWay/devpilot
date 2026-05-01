import { create } from "zustand";
import type { Session, Message, ApprovalRequest, AttachmentIPC, MessageSearchResult } from "../types";
import { useUsageStore } from "./usageStore";
import { useProviderStore } from "./providerStore";
import { useUIStore } from "./uiStore";
import { useSettingsStore } from "./settingsStore";
import {
  persistCreateSession,
  persistDeleteSession,
  persistUpdateSessionTitle,
  persistArchiveSession,
  persistSetSessionWorkingDir,
  persistSetSessionEnvVars,
  persistAddMessage,
  persistUpdateMessageContent,
  hydrateSessions,
  type HydratedSession,
} from "../lib/persistence";
import { invoke, listen, isTauriRuntime } from "../lib/ipc";
import { buildSystemPromptWithPersona } from "../lib/systemPrompt";
import { mapProviderType } from "../lib/utils";

/**
 * Generate a unique ID using crypto.randomUUID() to avoid collision
 * with backend-generated IDs after hydration.
 * Falls back to timestamp + random for very old browsers.
 */
function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

const MOCK_SESSIONS: Session[] = [
  {
    id: "1",
    title: "Rust HDLC parser refactor",
    model: "claude-4-sonnet",
    provider: "provider-anthropic",
    createdAt: new Date(Date.now() - 120_000).toISOString(),
    updatedAt: new Date(Date.now() - 120_000).toISOString(),
    messages: [
      {
        id: "m1",
        role: "user",
        content: "帮我分析一下 Codex CLI 的 Rust 架构设计，重点关注 Agent 引擎和工具系统",
        timestamp: "10:23",
      },
      {
        id: "m2",
        role: "assistant",
        content: `Codex CLI 采用 **80+ crate** 的 Rust workspace 架构，核心设计模式：

## Agent 引擎

\`\`\`rust
pub(crate) struct Session {
    pub(crate) conversation_id: ThreadId,
    pub(super) tx_event: Sender<Event>,
    pub(super) agent_status: watch::Sender<AgentStatus>,
    pub(super) state: Mutex<SessionState>,
    pub(super) mailbox: Mailbox,
}
\`\`\`

关键设计模式：
- **Event Bus** — \`Sender<Event>\` 驱动 UI 更新和状态流转
- **Mailbox** — Agent 间通过 mpsc + watch 通信
- **Agent Registry** — spawn slot reservation，类似信号量并发控制

## 工具系统

工具注册采用 **双层映射**：
1. API 侧 (\`ToolSpec\`) 发给 LLM 做函数调用
2. 本地侧 (\`ToolHandlerKind\`) 路由到具体处理函数

\`\`\`rust
pub enum ToolHandlerKind {
    Shell, ShellCommand, ApplyPatch,
    DynamicTool, Mcp, McpResource,
    SpawnAgentV1, SpawnAgentV2,
}
\`\`\`

## 沙盒架构

| 平台 | 实现 | 隔离方式 |
|------|------|---------|
| macOS | seatbelt | sandbox-exec profile |
| Linux | bwrap + landlock | namespace + seccomp |
| Windows | restricted token | private desktop |

这个架构可以大量复用到 DevPilot 的 Tauri 后端。`,
        model: "Claude 4 Sonnet",
        timestamp: "10:24",
      },
      {
        id: "m3",
        role: "tool",
        content: "📄 file_read: core/src/session/session.rs (read 234/466 lines)\n🔧 shell: cargo check → 0 errors, 0 warnings",
        timestamp: "10:24",
        toolCalls: [
          {
            id: "tc1",
            name: "file_read",
            input: "core/src/session/session.rs",
            output: "Read 234/466 lines",
            status: "done",
            duration: 42,
          },
          {
            id: "tc2",
            name: "shell",
            input: "cargo check",
            output: "0 errors, 0 warnings",
            status: "done",
            duration: 3200,
          },
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Fix auth middleware token expiry",
    model: "gpt-5.2",
    provider: "provider-openai",
    createdAt: new Date(Date.now() - 900_000).toISOString(),
    updatedAt: new Date(Date.now() - 900_000).toISOString(),
    messages: [],
  },
  {
    id: "3",
    title: "DLMS COSEM integration tests",
    model: "glm-5",
    provider: "provider-zhipu",
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    messages: [],
  },
  {
    id: "4",
    title: "Add WebSocket transport layer",
    model: "deepseek-v3",
    provider: "provider-deepseek",
    createdAt: new Date(Date.now() - 10800_000).toISOString(),
    updatedAt: new Date(Date.now() - 10800_000).toISOString(),
    messages: [],
  },
  {
    id: "5",
    title: "Power quality THD analysis",
    model: "qwen-max",
    provider: "provider-qwen",
    createdAt: new Date(Date.now() - 86400_000).toISOString(),
    updatedAt: new Date(Date.now() - 86400_000).toISOString(),
    messages: [],
  },
];

// Simulated AI responses keyed by keywords
const MOCK_RESPONSES: { keywords: string[]; reply: string }[] = [
  {
    keywords: ["hello", "hi", "hey", "你好", "嗨"],
    reply: "Hello! I'm DevPilot, your AI coding agent. I can help you:\n\n- **Write code** — Generate features, refactor, fix bugs\n- **Analyze** — Explain codebases, review architecture\n- **Execute** — Run commands, manage files, apply patches\n\nWhat would you like to work on?",
  },
  {
    keywords: ["rust", "cargo", " Ownership", "lifetime"],
    reply: `Great topic! Here's a quick Rust ownership refresher:

\`\`\`rust
fn main() {
    let s1 = String::from("hello");
    let s2 = s1; // s1 is MOVED, no longer valid
    
    // println!("{}", s1); // ❌ compile error!
    println!("{}", s2);  // ✅ works fine
    
    let s3 = s2.clone(); // deep copy, both valid
    println!("{} {}", s2, s3); // ✅
}
\`\`\`

Key rules:
1. **Each value has one owner** at a time
2. **Move** happens on assignment (no copy for heap data)
3. **Clone** creates a deep copy when you need both
4. **Borrow** (\`&T\`) lets you reference without taking ownership

Need me to dive deeper into any of these concepts?`,
  },
  {
    keywords: ["typescript", "ts", "interface", "type", "泛型"],
    reply: `TypeScript best practices for production code:

\`\`\`typescript
// Use \`interface\` for object shapes, \`type\` for unions
interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

type Result<T> = 
  | { ok: true; value: T }
  | { ok: false; error: string };

// Generic constraints with \`extends\`
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
\`\`\`

**Tips:**
- Prefer \`interface\` for public APIs (easier to extend)
- Use \`type\` for unions, intersections, and mapped types
- Enable \`strict: true\` in tsconfig — never ship without it
- Use \`satisfies\` (TS 4.9+) for type checking without widening`,
  },
  {
    keywords: ["react", "component", "hook", "状态"],
    reply: `Modern React patterns (2026):

\`\`\`tsx
// 1. Server Components (default in Next.js)
async function UserCard({ id }: { id: string }) {
  const user = await fetchUser(id); // runs on server
  return <div>{user.name}</div>;
}

// 2. Custom hook with Zustand
function useCounter() {
  return useStore((s) => ({
    count: s.count,
    inc: s.increment,
    dec: s.decrement,
  }));
}

// 3. use() hook for promises (React 19)
function DataDisplay({ promise }: { promise: Promise<Data> }) {
  const data = use(promise);
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
\`\`\`

**Key React 19 features:**
- \`use()\` — unwrap promises and context in render
- Actions — \`useTransition\` for form submissions
- \`useOptimistic\` — optimistic UI updates
- Server Components — zero client JS for data fetching`,
  },
];

const DEFAULT_REPLY = `I understand your request. Here's my analysis:

This is a **mock response** — the actual AI backend (Tauri + Rust) isn't connected yet. In the full implementation, your message would be sent through:

1. **Tauri IPC** → \`invoke("send_message", { sessionId, content })\`
2. **Rust Session Manager** → routes to the selected LLM provider
3. **SSE Stream** → chunks streamed back via \`listen("stream_chunk")\`
4. **React UI** → real-time rendering with streaming markdown

The architecture is ready — we just need to wire up the Rust backend.

What else would you like to try? Type \`/help\` for available commands.`;

function pickMockReply(input: string): string {
  const lower = input.toLowerCase();
  for (const r of MOCK_RESPONSES) {
    if (r.keywords.some((kw) => lower.includes(kw))) {
      return r.reply;
    }
  }
  return DEFAULT_REPLY;
}

/**
 * Fallback mock streaming — used when NOT running inside Tauri.
 * Extracted from sendMessage so the Tauri path can take priority.
 */
function mockStreamReply(
  sessionId: string,
  model: string,
  content: string,
  get: () => ChatState,
  updateMessageContent: (sid: string, mid: string, c: string, s?: boolean) => void,
  addMessage: (sid: string, msg: Omit<Message, "id" | "timestamp">) => string,
  set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
) {
  set({ isLoading: true, error: null });
  const replyContent = pickMockReply(content);
  const msgId = addMessage(sessionId, { role: "assistant", content: "", model, streaming: true });
  set({ streamingMessageId: msgId });

  let charIndex = 0;
  const chunkSize = () => 1 + Math.floor(Math.random() * 3);
  const tickDelay = () => 15 + Math.random() * 25;

  const streamTick = () => {
    if (!get().isLoading) { return; } // aborted

    const currentSessionId = get().activeSessionId;
    if (currentSessionId !== sessionId) {
      set({ isLoading: false, streamingMessageId: null });
      return;
    }

    if (charIndex < replyContent.length) {
      const step = chunkSize();
      charIndex = Math.min(charIndex + step, replyContent.length);
      const partialContent = replyContent.slice(0, charIndex);
      updateMessageContent(sessionId, msgId, partialContent, true);
      setTimeout(streamTick, tickDelay());
    } else {
      updateMessageContent(sessionId, msgId, replyContent, false);
      set({ isLoading: false });

      // Record usage
      useUsageStore.getState().recordUsage({
        sessionId,
        model,
        provider: useSettingsStore.getState().selectedModel.provider ?? "",
        inputText: content,
        outputText: replyContent,
      });
    }
  };

  setTimeout(streamTick, 300 + Math.random() * 400);
}

function generateTitle(content: string): string {
  // Take first ~40 chars, strip markdown, trim
  const cleaned = content
    .replace(/[#*`_[\]]/g, "")
    .replace(/\n/g, " ")
    .trim();
  if (cleaned.length <= 40) {return cleaned;}
  return cleaned.slice(0, 37) + "...";
}

interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  streamingMessageId: string | null;

  // Computed
  activeSession: () => Session | undefined;

  // Actions
  createSession: (model: string, provider: string) => string;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  addMessage: (sessionId: string, msg: Omit<Message, "id" | "timestamp">) => string;
  updateMessageContent: (sessionId: string, messageId: string, content: string, streaming?: boolean) => void;
  /** Update the thinkingContent field on a streaming assistant message. */
  updateMessageThinking: (sessionId: string, messageId: string, thinkingContent: string) => void;
  searchSessions: (query: string) => Session[];
  sendMessage: (content: string, model: string, attachments?: AttachmentIPC[]) => void;
  clearMessages: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  archiveSession: (id: string) => void;
  /** Restore an archived session back to active. */
  unarchiveSession: (id: string) => void;
  setError: (error: string | null) => void;
  /** Abort an in-progress streaming response, cleaning up listeners. */
  abortStreaming: () => void;
  /** Hydrate store from Tauri backend (SQLite). No-op in browser dev mode. */
  hydrateFromBackend: () => Promise<void>;
  /** Pending tool approval requests from the agent loop. */
  pendingApprovals: ApprovalRequest[];
  /** Resolve a pending approval (approve or deny). Calls backend IPC. */
  resolveApproval: (requestId: string, approved: boolean) => void;
  /** Approve all pending approvals at once. */
  approveAll: () => void;
  /** Export a session as JSON or Markdown file (browser download). */
  exportSession: (sessionId: string, format: "json" | "markdown") => void;
  /** Import sessions from a DevPilot JSON export file (file picker → IPC). */
  importSessions: () => Promise<{ sessionsImported: number; messagesImported: number } | null>;
  /** Regenerate the last assistant response by removing it and re-sending the last user message. */
  regenerateLastResponse: () => void;
  /** Search messages across all sessions via backend. */
  searchMessages: (query: string) => Promise<MessageSearchResult[]>;
  /** Set the working directory for a specific session (persists to backend). */
  setSessionWorkingDir: (sessionId: string, workingDir: string) => void;
  /** Set environment variables for a specific session (persists to backend). */
  setSessionEnvVars: (sessionId: string, envVars: Array<{ key: string; value: string }>) => void;
  /** Reorder sessions (e.g. from drag-and-drop in sidebar). */
  reorderSessions: (sessionId: string, targetIndex: number) => void;
  /** Current agent type override for the next message. */
  agentType: string;
  /** Set the agent type for the next message. */
  setAgentType: (agentType: string) => void;

  // Internal
  _lastStreamUpdate: number;
  _pendingStreamUpdate: (() => void) | null;
  _streamRafId: number | null;
  _streamCleanup: (() => void) | null;
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) {return "just now";}
  if (mins < 60) {return `${mins}m ago`;}
  const hours = Math.floor(mins / 60);
  if (hours < 24) {return `${hours}h ago`;}
  return "Yesterday";
}

/** Build content blocks for the user message, including image attachments. */
type UserContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; mediaType: string; data: string } };

function buildUserContentBlocks(
  text: string,
  attachments?: AttachmentIPC[],
): UserContentBlock[] {
  const blocks: UserContentBlock[] = [];

  if (text) {
    blocks.push({ type: "text", text });
  }

  if (attachments) {
    for (const att of attachments) {
      if (att.type.startsWith("image/") && att.base64Data) {
        // Extract base64 data from data URL if needed
        const raw = att.base64Data;
        const base64Data = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
        blocks.push({
          type: "image",
          source: {
            type: "base64",
            mediaType: att.type,
            data: base64Data,
          },
        });
      }
    }
  }

  return blocks;
}

export { relativeTime };

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: MOCK_SESSIONS,
  activeSessionId: "1",
  isLoading: false,
  error: null,
  streamingMessageId: null,
  pendingApprovals: [],
  agentType: "general",
  _streamCleanup: null,

  activeSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId);
  },

  createSession: (model, provider) => {
    const id = genId();
    const session: Session = {
      id,
      title: "New Chat",
      model,
      provider,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
    set((s) => ({
      sessions: [session, ...s.sessions],
      activeSessionId: id,
    }));
    persistCreateSession(id, "New Chat", model, provider);
    return id;
  },

  setActiveSession: (id) => {
    set((s) => {
      // Sync the session's workingDir to the global uiStore on switch
      const session = s.sessions.find((sess) => sess.id === id);
      if (session?.workingDir) {
        useUIStore.getState().setWorkingDir(session.workingDir);
      }
      return { activeSessionId: id };
    });
    // Refresh context size bar on session switch
    try { window.dispatchEvent(new CustomEvent("context-size-refresh")); } catch { /* ignore */ }
  },

  deleteSession: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id);
      const activeSessionId = s.activeSessionId === id
        ? sessions[0]?.id ?? null
        : s.activeSessionId;
      return { sessions, activeSessionId };
    });
    persistDeleteSession(id);
  },

  addMessage: (sessionId, msg) => {
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const message: Message = { ...msg, id: genId(), timestamp };
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, messages: [...sess.messages, message], updatedAt: new Date().toISOString() }
          : sess,
      ),
    }));
    persistAddMessage(sessionId, message.id, msg.role, msg.content ?? "", msg.model, msg.toolCalls);
    return message.id;
  },

  // P15-2: Streaming throttle — batch updates to ~60fps during streaming
  _lastStreamUpdate: 0 as number,
  _pendingStreamUpdate: null as (() => void) | null,
  _streamRafId: null as number | null,

  updateMessageContent: (sessionId, messageId, content, streaming) => {
    // Non-streaming updates apply immediately
    if (!streaming) {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === messageId ? { ...m, content, streaming } : m,
                ),
              }
            : sess,
        ),
        streamingMessageId: null,
      }));
      return;
    }

    // Streaming: throttle to 60fps using rAF
    const state = get();
    const now = performance.now();
    const elapsed = now - state._lastStreamUpdate;

    // Cancel any pending rAF
    if (state._streamRafId !== null) {
      cancelAnimationFrame(state._streamRafId);
    }

    const applyUpdate = () => {
      set((s) => ({
        sessions: s.sessions.map((sess) =>
          sess.id === sessionId
            ? {
                ...sess,
                messages: sess.messages.map((m) =>
                  m.id === messageId ? { ...m, content, streaming } : m,
                ),
              }
            : sess,
        ),
        streamingMessageId: messageId,
        _lastStreamUpdate: performance.now(),
        _pendingStreamUpdate: null,
        _streamRafId: null,
      }));
    };

    if (elapsed >= 16) {
      // Enough time passed — apply immediately
      applyUpdate();
    } else {
      // Schedule for next frame
      const rafId = requestAnimationFrame(applyUpdate);
      set({ _pendingStreamUpdate: applyUpdate, _streamRafId: rafId });
    }
  },

  updateMessageThinking: (sessionId, messageId, thinkingContent) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id === messageId ? { ...m, thinkingContent } : m,
              ),
            }
          : sess,
      ),
    }));
  },

  searchSessions: (query) => {
    const q = query.toLowerCase();
    return get().sessions.filter((s) => s.title.toLowerCase().includes(q));
  },

  searchMessages: async (query) => {
    if (!isTauriRuntime() || query.trim().length < 2) {
      return [];
    }
    try {
      const results = await invoke<MessageSearchResult[]>("search_messages", {
        query,
        sessionId: null,
        role: null,
        limit: 20,
      });
      return results;
    } catch (err) {
      console.error("searchMessages failed:", err);
      return [];
    }
  },

  setSessionWorkingDir: (sessionId, workingDir) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, workingDir } : sess,
      ),
    }));
    // Sync to global uiStore so all components pick it up
    useUIStore.getState().setWorkingDir(workingDir);
    persistSetSessionWorkingDir(sessionId, workingDir);
  },

  setSessionEnvVars: (sessionId, envVars) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, envVars } : sess,
      ),
    }));
    persistSetSessionEnvVars(sessionId, envVars);
  },

  sendMessage: (content, model, attachments) => {
    const { activeSessionId, addMessage, updateMessageContent, updateMessageThinking, createSession, updateSessionTitle } = get();

    // Auto-create session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createSession(model, "");
    }

    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) {return;}

    // Handle slash commands
    const trimmed = content.trim();
    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed, sessionId, model, set, get);
      return;
    }

    // Add user message
    addMessage(sessionId, { role: "user", content });

    // Auto-generate title from first user message
    if (session.messages.length === 0) {
      updateSessionTitle(sessionId, generateTitle(content));
    }

    // Add placeholder assistant message for streaming
    const assistantMsgId = addMessage(sessionId, { role: "assistant", content: "", model, streaming: true });
    set({ isLoading: true, error: null, streamingMessageId: assistantMsgId });

    // Try Tauri backend first, fall back to mock streaming
    const tryTauri = async () => {
      // Pre-declare cleanup variables so they're accessible in catch block
      let unlistenChunk = () => {};
      let unlistenToolStart = () => {};
      let unlistenToolResult = () => {};
      let unlistenApproval = () => {};
      let unlistenDone = () => {};
      let unlistenTurnDone = () => {};
      let unlistenError = () => {};
      let unlistenCompacted = () => {};
      let unlistenPlanning = () => {};
      let unlistenExecuting = () => {};
      let unlistenVerifying = () => {};
      let unlistenPevDone = () => {};

      // Streaming buffer declarations (moved outside try for catch access)
      let textBuffer = "";
      let thinkingBuffer = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flushStreamBuffers = () => {
        const text = textBuffer;
        const think = thinkingBuffer;
        textBuffer = "";
        thinkingBuffer = "";
        flushTimer = null;

        if (!text && !think) { return; }

        const msg = get().sessions.find((s) => s.id === sessionId)
          ?.messages.find((m) => m.id === assistantMsgId);

        if (think) {
          updateMessageThinking(
            sessionId,
            assistantMsgId,
            (msg?.thinkingContent ?? "") + think,
          );
        }
        if (text) {
          updateMessageContent(
            sessionId,
            assistantMsgId,
            (msg?.content as string ?? "") + text,
            true,
          );
        }
      };

      const cleanup = () => {
        if (flushTimer) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
        flushStreamBuffers();
        unlistenChunk();
        unlistenToolStart();
        unlistenToolResult();
        unlistenApproval();
        unlistenTurnDone();
        unlistenDone();
        unlistenError();
        unlistenCompacted();
        unlistenPlanning();
        unlistenExecuting();
        unlistenVerifying();
        unlistenPevDone();
      };

      try {
        if (!isTauriRuntime()) {
          // Not in Tauri — use mock streaming
          mockStreamReply(sessionId, model, content, get, updateMessageContent, addMessage, set);
          return;
        }

        // Build provider config from providerStore
        const provider = useProviderStore.getState().getProviderById(
          session.provider || "provider-anthropic",
        );
        if (!provider) {
          throw new Error(`Provider "${session.provider}" not found`);
        }

        const providerConfig = {
          id: provider.id,
          name: provider.name,
          providerType: mapProviderType(provider.id),
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey || undefined,
          models: provider.models.map((m) => ({
            id: m.id,
            name: m.name,
            provider: mapProviderType(provider.id),
            maxInputTokens: m.maxTokens,
            maxOutputTokens: 4096,
            supportsStreaming: m.supportsStreaming,
            supportsTools: true,
            supportsVision: m.supportsVision,
            inputPricePerMillion: m.inputPrice,
            outputPricePerMillion: m.outputPrice,
          })),
          enabled: provider.enabled,
          fallbackProviderIds: provider.fallbackProviderIds ?? [],
        };

        // Collect all enabled providers for failover resolution
        const allProviders = useProviderStore
          .getState()
          .providers.filter((p) => p.enabled && p.id !== provider.id)
          .map((p) => ({
            id: p.id,
            name: p.name,
            providerType: mapProviderType(p.id),
            baseUrl: p.baseUrl,
            apiKey: p.apiKey || undefined,
            models: p.models.map((m) => ({
              id: m.id,
              name: m.name,
              provider: mapProviderType(p.id),
              maxInputTokens: m.maxTokens,
              maxOutputTokens: 4096,
              supportsStreaming: m.supportsStreaming,
              supportsTools: true,
              supportsVision: m.supportsVision,
              inputPricePerMillion: m.inputPrice,
              outputPricePerMillion: m.outputPrice,
            })),
            enabled: p.enabled,
            fallbackProviderIds: p.fallbackProviderIds ?? [],
          }));

        // Build messages history
        const messages: Array<{ role: string; content: UserContentBlock[] }> = session.messages.map((m) => ({
          role: m.role,
          content: [{ type: "text" as const, text: typeof m.content === "string" ? m.content : "" }],
        }));

        // Inject system prompt with persona data (SOUL/USER/MEMORY.md)
        const customPrompt = useSettingsStore.getState().systemPrompt;
        const workspaceDir = useUIStore.getState().workingDir || "";
        const systemPrompt = await buildSystemPromptWithPersona(workspaceDir, customPrompt);
        messages.unshift({ role: "system", content: [{ type: "text" as const, text: systemPrompt }] });

        messages.push({ role: "user", content: buildUserContentBlocks(content, attachments) });

        // Register listeners BEFORE invoking to avoid missing early events.
        // Backend emits globally:
        //   "stream-chunk"        → text delta
        //   "stream-tool-start"   → tool call started (name, input)
        //   "stream-tool-result"  → tool call completed (output)
        //   "stream-approval"     → tool approval requested
        //   "stream-done"         → agent loop finished
        //   "stream-error"        → error occurred
        // We filter by sessionId in the handler.

        // Track active tool calls for this session
        const activeToolCalls: Record<string, { msgId: string; startTime: number; toolName?: string; input?: unknown }> = {};

        const scheduleFlush = () => {
          if (!flushTimer) {
            flushTimer = setTimeout(flushStreamBuffers, 16);
          }
        };

        unlistenChunk = await listen<{
          type: string; sessionId: string; delta?: string;
        }>(
          "stream-chunk",
          (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            // Accumulate deltas in buffer — flush happens on timer
            const delta = payload.delta ?? "";
            if (delta) {
              textBuffer += delta;
            }
            scheduleFlush();
          },
        );
        // Tool call started — create a tool message
        unlistenToolStart = await listen<{
          sessionId: string; callId: string; toolName: string; input: unknown;
        }>(
          "stream-tool-start",
          (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            const toolMsgId = addMessage(sessionId, {
              role: "tool",
              content: "",
              toolCalls: [{
                id: payload.callId,
                name: payload.toolName,
                input: typeof payload.input === "string" ? payload.input : JSON.stringify(payload.input, null, 2),
                status: "running",
              }],
            });
            activeToolCalls[payload.callId] = { msgId: toolMsgId, startTime: Date.now(), toolName: payload.toolName, input: payload.input };
          },
        );

        // Tool call result — update the tool message
        unlistenToolResult = await listen<{
          sessionId: string; callId: string; output: string; isError: boolean;
        }>(
          "stream-tool-result",
          (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            const tc = activeToolCalls[payload.callId];
            if (!tc) {return;}
            const duration = Date.now() - tc.startTime;
            set((s) => ({
              sessions: s.sessions.map((sess) =>
                sess.id === sessionId
                  ? {
                      ...sess,
                      messages: sess.messages.map((m) =>
                        m.id === tc.msgId
                          ? {
                              ...m,
                              content: payload.output,
                              toolCalls: m.toolCalls?.map((t) =>
                                t.id === payload.callId
                                  ? { ...t, output: payload.output, status: payload.isError ? "error" : "done", duration }
                                  : t,
                              ),
                            }
                          : m,
                      ),
                    }
                  : sess,
              ),
            }));

            // Populate diff view for apply_patch results
            if (tc.toolName === "apply_patch" && !payload.isError) {
              const input = tc.input as Record<string, unknown> | undefined;
              if (input) {
                const oldStr = typeof input.old_string === "string" ? input.old_string : "";
                const newStr = typeof input.new_string === "string" ? input.new_string : "";
                const filePath = typeof input.path === "string" ? input.path : "";
                if (oldStr || newStr) {
                  // Determine language from file path
                  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
                  const langMap: Record<string, string> = {
                    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
                    rs: "rust", py: "python", json: "json", toml: "toml",
                    yaml: "yaml", yml: "yaml", md: "markdown", css: "css",
                    html: "html", sh: "shell", sql: "sql",
                  };
                  useUIStore.getState().setDiffData({
                    original: oldStr,
                    modified: newStr,
                    language: langMap[ext] ?? "plaintext",
                  });
                  // Auto-switch to preview panel in diff mode
                  const ui = useUIStore.getState();
                  if (ui.rightPanel === "none") {
                    ui.setRightPanel("preview");
                  }
                }
              }
            }
          },
        );

        // Tool approval requested — add to pending queue for UI
        unlistenApproval = await listen<{
          sessionId: string; callId: string; toolName: string; input: unknown; riskLevel: string;
        }>(
          "stream-approval",
          (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            const req: ApprovalRequest = {
              id: payload.callId,
              toolCallId: payload.callId,
              command: `${payload.toolName} ${typeof payload.input === "string" ? payload.input : JSON.stringify(payload.input)}`,
              description: `Tool: ${payload.toolName}`,
              riskLevel: (payload.riskLevel as "low" | "medium" | "high") ?? "medium",
              createdAt: new Date().toISOString(),
            };
            set((s) => ({
              pendingApprovals: [...s.pendingApprovals, req],
            }));
          },
        );

        // Turn done — emitted after each LLM↔tool iteration in the agent loop.
        // Persists the current content after each turn so partial progress is saved
        // even if the agent crashes before the final "done" event.
        unlistenTurnDone = await listen<{
          sessionId: string;
          usage: { inputTokens: number; outputTokens: number };
          finishReason: string;
        }>(
          "stream-turn-done",
          (payload) => {
            if (payload.sessionId !== sessionId) { return; }
            // Persist current streaming content after each agent turn
            const currentContent =
              get().sessions.find((s) => s.id === sessionId)
                ?.messages.find((m) => m.id === assistantMsgId)?.content as string ?? "";
            persistUpdateMessageContent(sessionId, assistantMsgId, currentContent);
          },
        );

        unlistenDone = await listen<{
          event: string; sessionId: string;
          usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number };
          finishReason: string;
        }>(
          "stream-done",
          async (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            if (payload.usage) {
              try {
                useUsageStore.getState().recordUsageFromTokens({
                  sessionId,
                  model,
                  provider: provider.id,
                  inputTokens: payload.usage.inputTokens ?? 0,
                  outputTokens: payload.usage.outputTokens ?? 0,
                });
              } catch { /* ignore */ }
            }
            // Finalize the streaming message and persist content to backend
            const finalContent =
              get().sessions.find((s) => s.id === sessionId)
                ?.messages.find((m) => m.id === assistantMsgId)?.content as string ?? "";
            updateMessageContent(sessionId, assistantMsgId, finalContent, false);
            // Persist final content to SQLite so it survives app restart
            persistUpdateMessageContent(sessionId, assistantMsgId, finalContent);
            set({ isLoading: false, streamingMessageId: null, _streamCleanup: null });
            cleanup();
            // Refresh context size bar after stream completion
            try { window.dispatchEvent(new CustomEvent("context-size-refresh")); } catch { /* ignore */ }
            // Auto-compact: check context usage and trigger compaction if over threshold
            autoCompactIfNeeded(sessionId);
          },
        );
        unlistenError = await listen<{
          event: "error"; sessionId: string; message: string; code?: string;
        }>(
          "stream-error",
          (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            updateMessageContent(sessionId, assistantMsgId,
              `⚠️ Stream error: ${payload.message}`,
              false,
            );
            set({ isLoading: false, streamingMessageId: null, _streamCleanup: null });
            cleanup();
          },
        );

        // Context compaction event — reload messages from backend
        unlistenCompacted = await listen<{
          sessionId: string; messagesRemoved: number; summaryAdded: boolean;
        }>(
          "stream-compacted",
          async (payload) => {
            if (payload.sessionId !== sessionId) {return;}
            // Reload messages from DB to reflect compacted state
            try {
              const dbMessages = await invoke<
                Array<{
                  id: string; sessionId: string; role: string; content: string;
                  model: string | null; createdAt: string;
                }>
              >("get_session_messages", { sessionId });
              set((s) => ({
                sessions: s.sessions.map((sess) =>
                  sess.id === sessionId
                    ? {
                        ...sess,
                        messages: dbMessages.map((m) => ({
                          id: m.id,
                          role: m.role as Message["role"],
                          content: m.content,
                          model: m.model ?? undefined,
                          timestamp: m.createdAt,
                        })),
                      }
                    : sess,
                ),
              }));
            } catch { /* ignore reload failure */ }
          },
        );

        // PEV (Plan→Execute→Verify) events — show agent phase indicators
        unlistenPlanning = await listen<{
          sessionId: string; cycle: number;
        }>(
          "stream-agent-planning",
          (payload) => {
            if (payload.sessionId !== sessionId) { return; }
            textBuffer += `\n🔄 **Planning** (cycle ${payload.cycle})...\n`;
            flushStreamBuffers();
          },
        );

        unlistenExecuting = await listen<{
          sessionId: string; cycle: number; step: number; totalSteps: number;
        }>(
          "stream-agent-executing",
          (payload) => {
            if (payload.sessionId !== sessionId) { return; }
            textBuffer += `\n⚡ **Executing** step ${payload.step}/${payload.totalSteps} (cycle ${payload.cycle})...\n`;
            flushStreamBuffers();
          },
        );

        unlistenVerifying = await listen<{
          sessionId: string; cycle: number;
        }>(
          "stream-agent-verifying",
          (payload) => {
            if (payload.sessionId !== sessionId) { return; }
            textBuffer += `\n✅ **Verifying** (cycle ${payload.cycle})...\n`;
            flushStreamBuffers();
          },
        );

        unlistenPevDone = await listen<{
          sessionId: string; cycle: number; success: boolean;
        }>(
          "stream-pev-cycle-done",
          (payload) => {
            if (payload.sessionId !== sessionId) { return; }
            const icon = payload.success ? "✅" : "🔄";
            textBuffer += `\n${icon} Cycle ${payload.cycle} ${payload.success ? "passed" : "retrying"}\n`;
            flushStreamBuffers();
          },
        );

        // Save cleanup so abortStreaming can cancel listeners
        set({ _streamCleanup: cleanup });

        // NOW start streaming — listeners are already registered
        const workingDir = useUIStore.getState().workingDir || undefined;
        const { activeMode, reasoningEffort } = useSettingsStore.getState();
        const { agentType } = get();
        await invoke("send_message_stream", {
          provider: providerConfig,
          chatRequest: { model, messages, stream: true },
          sessionId,
          userMessage: content,
          workingDir,
          mode: activeMode,
          reasoningEffort,
          agentType: agentType !== "general" ? agentType : undefined,
          allProviders,
        });

        return; // Tauri handled it
      } catch (err) {
        // Tauri invoke failed — clean up listeners and reset loading state
        console.warn("[chatStore] Tauri invoke failed, falling back to mock:", err);
        try { cleanup(); } catch { /* ignore cleanup errors */ }
        set({ isLoading: false, streamingMessageId: null, _streamCleanup: null });
      }

      // Mock streaming fallback
      mockStreamReply(sessionId, model, content, get, updateMessageContent, addMessage, set);
    };

    tryTauri();
  },

  clearMessages: (sessionId) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId
          ? { ...sess, messages: [], updatedAt: new Date().toISOString() }
          : sess,
      ),
    }));
  },

  updateSessionTitle: (sessionId, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === sessionId ? { ...sess, title } : sess,
      ),
    }));
    persistUpdateSessionTitle(sessionId, title);
  },

  archiveSession: (id) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, archived: true } : sess,
      ),
      activeSessionId:
        s.activeSessionId === id
          ? s.sessions.find((sess) => sess.id !== id && !sess.archived)?.id ?? null
          : s.activeSessionId,
    }));
    persistArchiveSession(id, true);
  },

  unarchiveSession: (id) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, archived: false } : sess,
      ),
    }));
    persistArchiveSession(id, false);
  },

  setError: (error) => set({ error }),

  reorderSessions: (sessionId, targetIndex) => {
    set((s) => {
      const sessions = [...s.sessions];
      const currentIndex = sessions.findIndex((sess) => sess.id === sessionId);
      if (currentIndex === -1 || currentIndex === targetIndex) { return s; }
      const removed = sessions.splice(currentIndex, 1);
      if (removed.length === 0) { return s; }
      sessions.splice(targetIndex, 0, removed[0]!);
      return { sessions };
    });
  },

  setAgentType: (agentType) => {
    set({ agentType });
  },

  resolveApproval: (requestId, approved) => {
    // Remove from pending list immediately for responsive UI
    set((s) => ({
      pendingApprovals: s.pendingApprovals.filter((r) => r.id !== requestId),
    }));
    // Send resolution to backend
    invoke("resolve_tool_approval", {
      request: { requestId, approved },
    }).catch(() => {});
  },

  approveAll: () => {
    const { pendingApprovals } = get();
    for (const req of pendingApprovals) {
      invoke("resolve_tool_approval", {
        request: { requestId: req.id, approved: true },
      }).catch(() => {});
    }
    set({ pendingApprovals: [] });
  },

  exportSession: (sessionId, format) => {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) { return; }

    const exportedAt = new Date().toISOString();
    let content: string;
    let mimeType: string;
    let extension: string;

    if (format === "json") {
      const exportObj = {
        title: session.title,
        model: session.model,
        provider: session.provider,
        exportedAt,
        messages: session.messages.map((m) => ({
          role: m.role,
          content: m.content,
          model: m.model,
          timestamp: m.timestamp,
          ...(m.toolCalls ? { toolCalls: m.toolCalls } : {}),
        })),
      };
      content = JSON.stringify(exportObj, null, 2);
      mimeType = "application/json";
      extension = "json";
    } else {
      // Markdown format
      const lines: string[] = [
        `# ${session.title}`,
        `Model: ${session.model} | Provider: ${session.provider} | Exported: ${exportedAt}`,
        "",
        "---",
        "",
      ];
      for (const m of session.messages) {
        if (m.role === "user") {
          lines.push(`## User`, m.content, "", "---", "");
        } else if (m.role === "assistant") {
          lines.push(`## Assistant`, m.content, "", "---", "");
        } else if (m.role === "tool") {
          const toolName = m.toolCalls?.map((tc) => tc.name).join(", ") ?? "Tool";
          lines.push(`## Tool: ${toolName}`, m.content, "", "---", "");
        } else if (m.role === "system") {
          lines.push(`## System`, m.content, "", "---", "");
        }
      }
      content = lines.join("\n");
      mimeType = "text/markdown";
      extension = "md";
    }

    // Sanitize title for filename
    const safeTitle = session.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]/g, "_").slice(0, 60);

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  },

  importSessions: async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "DevPilot Export", extensions: ["json"] }],
      });
      if (!selected) { return null; }
      // `open` returns string | string[] | null
      const filePath = typeof selected === "string" ? selected : (selected as string[])[0];
      if (!filePath) { return null; }

      // Read the file content via Tauri FS plugin
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const jsonData = await readTextFile(filePath);

      const result = await invoke<{ sessionsImported: number; messagesImported: number }>(
        "import_sessions",
        { jsonData },
      );

      // Re-hydrate the store to reflect imported sessions
      await get().hydrateFromBackend();

      return result;
    } catch (err) {
      console.error("Failed to import sessions:", err);
      return null;
    }
  },

  regenerateLastResponse: () => {
    const { activeSessionId, sendMessage } = get();
    if (!activeSessionId) { return; }

    const session = get().sessions.find((s) => s.id === activeSessionId);
    if (!session || session.messages.length === 0) { return; }

    // Abort any in-progress streaming first
    if (get().isLoading) {
      get().abortStreaming();
    }

    const messages = session.messages;

    // Find the last assistant message index
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx === -1) { return; }

    // Find the last user message before the assistant message
    let lastUserIdx = -1;
    for (let i = lastAssistantIdx - 1; i >= 0; i--) {
      if (messages[i]!.role === "user") {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) { return; }

    const userContent = messages[lastUserIdx]!.content;

    // Remove the assistant message and any tool messages after the last user message
    const trimmedMessages = messages.slice(0, lastUserIdx + 1);

    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === activeSessionId
          ? { ...sess, messages: trimmedMessages, updatedAt: new Date().toISOString() }
          : sess,
      ),
    }));

    // Re-send the last user message through sendMessage flow
    const model = session.model;
    sendMessage(userContent, model);
  },

  abortStreaming: () => {
    const cleanup = get()._streamCleanup;
    if (cleanup) {
      cleanup();
    }
    // Notify backend to abort the agent task
    const { activeSessionId } = get();
    if (activeSessionId && isTauriRuntime()) {
      invoke<boolean>("cancel_stream", { sessionId: activeSessionId }).catch(() => {
        // Silently ignore — stream may have already finished
      });
    }
    // Finalize any streaming message
    const { streamingMessageId } = get();
    if (streamingMessageId && activeSessionId) {
      const session = get().sessions.find(s => s.id === activeSessionId);
      const msg = session?.messages.find(m => m.id === streamingMessageId);
      if (msg && typeof msg.content === "string") {
        get().updateMessageContent(activeSessionId, streamingMessageId, msg.content + "\n\n*[Generation stopped]*", false);
      }
    }
    set({ isLoading: false, streamingMessageId: null, _streamCleanup: null });
  },

  hydrateFromBackend: async () => {
    // Hydrate providers first so they're available for sessions
    await useProviderStore.getState().hydrateFromBackend();

    const data = await hydrateSessions();
    if (!data) { return; } // not in Tauri runtime

    if (data.length > 0) {
      const sessions: Session[] = data.map(convertHydratedSession);
      // Sync the first (active) session's workingDir to the global uiStore
      if (sessions[0]?.workingDir) {
        useUIStore.getState().setWorkingDir(sessions[0].workingDir);
      }
      set({
        sessions,
        activeSessionId: sessions[0]?.id ?? null,
      });
    }
  },
}));

/** Convert a HydratedSession from the persistence layer into a store Session. */
function convertHydratedSession(hs: HydratedSession): Session {
  return {
    id: hs.id,
    title: hs.title,
    model: hs.model,
    provider: hs.provider,
    archived: hs.archived,
    workingDir: hs.workingDir,
    envVars: hs.envVars,
    createdAt: hs.createdAt,
    updatedAt: hs.updatedAt,
    messages: hs.messages.map((hm) => ({
      id: hm.id,
      role: hm.role as Message["role"],
      content: hm.content,
      model: hm.model,
      timestamp: hm.timestamp,
      streaming: hm.streaming,
      toolCalls: hm.toolCalls ? JSON.parse(hm.toolCalls) : undefined,
    })),
  };
}

// Auto-compact: check if context exceeds threshold and trigger compaction.
// This runs after each streaming response completes.
async function autoCompactIfNeeded(sessionId: string) {
  try {
    const isTauri = typeof window !== "undefined" &&
      "__TAURI_INTERNALS__" in window;
    if (!isTauri) {
      return;
    }

    const result = await invoke<{
      tokens: number;
      limit: number;
      percent: number;
    }>("get_context_size", { sessionId });

    // Default threshold is 80% if not configured in settings store
    const threshold = 0.8;
    if (result.percent / 100 >= threshold) {
      const compactResult = await invoke<{
        messagesRemoved: number;
        summaryAdded: boolean;
      }>("compact_session", { sessionId });

      if (compactResult.messagesRemoved > 0) {
        // Reload messages from DB to reflect compacted state
        const dbMessages = await invoke<
          Array<{
            id: string;
            sessionId: string;
            role: string;
            content: string;
            model: string | null;
            createdAt: string;
          }>
        >("get_session_messages", { sessionId });

        useChatStore.setState((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId
              ? {
                  ...sess,
                  messages: dbMessages.map((m) => ({
                    id: m.id,
                    role: m.role as Message["role"],
                    content: m.content,
                    model: m.model ?? undefined,
                    timestamp: m.createdAt,
                  })),
                }
              : sess,
          ),
        }));
      }
    }
  } catch (e) {
    // Auto-compact is best-effort; don't disrupt the user
    console.warn("[auto-compact] Failed:", e);
  }
}

// Slash command handler
async function handleSlashCommand(
  input: string,
  sessionId: string,
  model: string,
  _set: (partial: Partial<ChatState> | ((s: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) {
  const parts = input.toLowerCase().split(/\s+/);
  const cmd = parts[0] ?? "";
  const args = input.slice(cmd.length).trim();

  switch (cmd) {
    case "/help": {
      const helpText = `## Available Commands

| Command | Description |
|---------|-------------|
| \`/help\` | Show this help message |
| \`/clear\` | Clear current conversation |
| \`/model <name>\` | Switch active model |
| \`/compact\` | Compact conversation history |
| \`/cost\` | Show estimated usage and cost |
| \`/doctor\` | Run system health check |

### Tips
- **Enter** to send, **Shift+Enter** for new line
- Type \`/model claude\` to switch to Claude
- Type \`/model gpt\` to switch to GPT`;
      get().addMessage(sessionId, { role: "assistant", content: helpText, model });
      break;
    }
    case "/clear":
      get().clearMessages(sessionId);
      break;
    case "/model": {
      const models = useSettingsStore.getState().models;
      if (!args) {
        const list = models
          .map((m) => `- ${m.name} (${m.provider})`)
          .join("\n");
        get().addMessage(sessionId, {
          role: "assistant",
          content: `Available models:\n\n${list}\n\nUsage: \`/model claude\` or \`/model Claude 4 Sonnet\``,
          model,
        });
        return;
      }
      const argLower = args.toLowerCase();
      const matched = models.find(
        (m) =>
          m.name.toLowerCase() === argLower ||
          m.id.toLowerCase() === argLower ||
          m.name.toLowerCase().includes(argLower) ||
          m.provider.toLowerCase() === argLower,
      );
      if (matched) {
        useSettingsStore.getState().setSelectedModel(matched);
        get().addMessage(sessionId, {
          role: "assistant",
          content: `Switched model to **${matched.name}** (${matched.provider}).`,
          model,
        });
      } else {
        get().addMessage(sessionId, {
          role: "assistant",
          content: `Unknown model: \`${args}\`. Use \`/model\` without args to see available models.`,
          model,
        });
      }
      break;
    }
    case "/compact": {
      try {
        const result = await invoke<{
          messagesRemoved: number;
          summaryAdded: boolean;
        }>("compact_session", {
          sessionId,
          keepLast: null,
        });
        if (result.messagesRemoved === 0) {
          get().addMessage(sessionId, {
            role: "assistant",
            content: "No compaction needed — the conversation is short enough already.",
            model,
          });
        } else {
          // Reload messages from DB to reflect compacted state
          if (isTauriRuntime()) {
            try {
              const dbMessages = await invoke<
                Array<{
                  id: string;
                  sessionId: string;
                  role: string;
                  content: string;
                  model: string | null;
                  tokenInput: number;
                  tokenOutput: number;
                  tokenCacheRead: number;
                  tokenCacheWrite: number;
                  costUsd: number;
                  toolCalls: string | null;
                  toolCallId: string | null;
                  createdAt: string;
                }>
              >("get_session_messages", { sessionId });
              const session = get().sessions.find((s) => s.id === sessionId);
              if (session) {
                const updatedMessages = dbMessages.map((m) => ({
                  id: m.id,
                  role: m.role as Message["role"],
                  content: m.content,
                  model: m.model ?? undefined,
                  timestamp: m.createdAt,
                }));
                _set((s) => ({
                  sessions: s.sessions.map((sess) =>
                    sess.id === sessionId
                      ? { ...sess, messages: updatedMessages, updatedAt: new Date().toISOString() }
                      : sess,
                  ),
                }));
              }
            } catch {
              // Silently ignore reload failure
            }
          }
          const summaryNote = result.summaryAdded
            ? "\nA summary of the older messages has been prepended."
            : "";
          get().addMessage(sessionId, {
            role: "assistant",
            content: `✅ Context compacted: **${result.messagesRemoved}** messages removed.${summaryNote}`,
            model,
          });
        }
      } catch (err) {
        get().addMessage(sessionId, {
          role: "assistant",
          content: `Compaction failed: ${err}`,
          model,
        });
      }
      break;
    }
    case "/cost": {
      const summary = useUsageStore.getState().getSummary();
      if (summary.totalInputTokens + summary.totalOutputTokens === 0) {
        get().addMessage(sessionId, {
          role: "assistant",
          content: "No usage data yet. Send some messages first, then check back!",
          model,
        });
      } else {
        const providerRows = Object.entries(summary.byProvider)
          .map(([provider, data]) => `| ${provider} | ${data.tokens.toLocaleString()} | $${data.cost.toFixed(4)} |`)
          .join("\n");
        get().addMessage(sessionId, {
          role: "assistant",
          content: `### Usage Summary\n\n| Provider | Tokens | Est. Cost |\n|----------|--------|----------|\n${providerRows}\n\n**Total:** ${(summary.totalInputTokens + summary.totalOutputTokens).toLocaleString()} tokens, $${summary.totalCost.toFixed(4)}`,
          model,
        });
      }
      break;
    }
    case "/doctor": {
      const checks: Array<{ name: string; status: string }> = [];

      // Tauri runtime
      const hasTauri = typeof window !== "undefined" && "__TAURI__" in window;
      checks.push({
        name: "Tauri Runtime",
        status: hasTauri ? "Connected ✅" : "Not connected (web preview) ⚠️",
      });

      // SQLite Database — try a lightweight IPC call
      try {
        await invoke("list_sessions");
        checks.push({ name: "SQLite Database", status: "Connected ✅" });
      } catch {
        checks.push({ name: "SQLite Database", status: "Error ⚠️" });
      }

      // Default Provider — check provider store
      const providerState = useProviderStore.getState();
      const enabledProviders = providerState.providers.filter((p) => p.enabled);
      if (enabledProviders.length > 0) {
        const names = enabledProviders.map((p) => p.name).join(", ");
        checks.push({ name: "Default Provider", status: `${names} ✅` });
      } else {
        checks.push({ name: "Default Provider", status: "None configured ⚠️" });
      }

      // Working directory
      const wd = useUIStore.getState().workingDir;
      checks.push({
        name: "Working Directory",
        status: wd ? `${wd} ✅` : "Not set ⚠️",
      });

      // Filesystem — try reading app data dir
      if (hasTauri) {
        try {
          await invoke("get_settings");
          checks.push({ name: "Filesystem Access", status: "Granted ✅" });
        } catch {
          checks.push({ name: "Filesystem Access", status: "Error ⚠️" });
        }
      } else {
        checks.push({ name: "Filesystem Access", status: "Unavailable ⚠️" });
      }

      // Terminal / Sandbox
      try {
        await invoke("sandbox_default_policy");
        checks.push({ name: "Terminal (Sandbox)", status: "Ready ✅" });
      } catch {
        checks.push({ name: "Terminal (Sandbox)", status: "Error ⚠️" });
      }

      const table = checks.map((c) => `| ${c.name} | ${c.status} |`).join("\n");
      const allGood = checks.every((c) => c.status.includes("✅"));
      get().addMessage(sessionId, {
        role: "assistant",
        content: `### System Health Check\n\n| Component | Status |\n|-----------|--------|\n${table}\n\n${allGood ? "✅ All systems operational." : "⚠️ Some components need attention. Check Settings → Providers."}`,
        model,
      });
      break;
    }
    default:
      get().addMessage(sessionId, {
        role: "assistant",
        content: `Unknown command: \`${cmd}\`. Type \`/help\` for available commands.`,
        model,
      });
  }
}
