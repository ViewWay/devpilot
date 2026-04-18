import { create } from "zustand";
import type { Session, Message } from "../types";

let nextId = 100;
function genId() {
  return String(++nextId);
}

const MOCK_SESSIONS: Session[] = [
  {
    id: "1",
    title: "Rust HDLC parser refactor",
    model: "Claude 4 Sonnet",
    provider: "Anthropic",
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
    model: "GPT-5.2",
    provider: "OpenAI",
    createdAt: new Date(Date.now() - 900_000).toISOString(),
    updatedAt: new Date(Date.now() - 900_000).toISOString(),
    messages: [],
  },
  {
    id: "3",
    title: "DLMS COSEM integration tests",
    model: "GLM-5",
    provider: "智谱",
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    messages: [],
  },
  {
    id: "4",
    title: "Add WebSocket transport layer",
    model: "DeepSeek V3",
    provider: "DeepSeek",
    createdAt: new Date(Date.now() - 10800_000).toISOString(),
    updatedAt: new Date(Date.now() - 10800_000).toISOString(),
    messages: [],
  },
  {
    id: "5",
    title: "Power quality THD analysis",
    model: "通义千问 Max",
    provider: "阿里云",
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

function generateTitle(content: string): string {
  // Take first ~40 chars, strip markdown, trim
  const cleaned = content
    .replace(/[#*`_\[\]]/g, "")
    .replace(/\n/g, " ")
    .trim();
  if (cleaned.length <= 40) return cleaned;
  return cleaned.slice(0, 37) + "...";
}

interface ChatState {
  sessions: Session[];
  activeSessionId: string | null;
  isLoading: boolean;
  error: string | null;

  // Computed
  activeSession: () => Session | undefined;

  // Actions
  createSession: (model: string, provider: string) => string;
  setActiveSession: (id: string) => void;
  deleteSession: (id: string) => void;
  addMessage: (sessionId: string, msg: Omit<Message, "id" | "timestamp">) => void;
  searchSessions: (query: string) => Session[];
  sendMessage: (content: string, model: string) => void;
  clearMessages: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  setError: (error: string | null) => void;
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return "Yesterday";
}

export { relativeTime };

export const useChatStore = create<ChatState>((set, get) => ({
  sessions: MOCK_SESSIONS,
  activeSessionId: "1",
  isLoading: false,
  error: null,

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
    return id;
  },

  setActiveSession: (id) => set({ activeSessionId: id }),

  deleteSession: (id) =>
    set((s) => {
      const sessions = s.sessions.filter((sess) => sess.id !== id);
      const activeSessionId = s.activeSessionId === id
        ? sessions[0]?.id ?? null
        : s.activeSessionId;
      return { sessions, activeSessionId };
    }),

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
  },

  searchSessions: (query) => {
    const q = query.toLowerCase();
    return get().sessions.filter((s) => s.title.toLowerCase().includes(q));
  },

  sendMessage: (content, model) => {
    const { activeSessionId, addMessage, createSession, updateSessionTitle } = get();

    // Auto-create session if none active
    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = createSession(model, "");
    }

    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;

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

    // Simulate AI response (will be replaced by Tauri IPC)
    set({ isLoading: true, error: null });
    const replyContent = pickMockReply(content);
    const delay = 600 + Math.random() * 1000;

    setTimeout(() => {
      const currentSessionId = get().activeSessionId;
      if (currentSessionId !== sessionId) {
        set({ isLoading: false });
        return;
      }
      addMessage(sessionId, { role: "assistant", content: replyContent, model });
      set({ isLoading: false });
    }, delay);
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
  },

  setError: (error) => set({ error }),
}));

// Slash command handler
function handleSlashCommand(
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
| \`/cost\` | Show estimated cost (mock) |

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
      if (!args) {
        get().addMessage(sessionId, {
          role: "assistant",
          content: `Please specify a model. Available models:\n\n${get().sessions.length > 0 ? "- claude (Claude 4 Sonnet)\n- gpt (GPT-5.2)\n- glm (GLM-5)\n- deepseek (DeepSeek V3)\n- qwen (通义千问 Max)\n- gemini (Gemini 3 Pro)\n- ollama (Llama 4 local)" : ""}\n\nUsage: \`/model claude\``,
          model,
        });
        return;
      }
      const modelMap: Record<string, { name: string; provider: string }> = {
        claude: { name: "Claude 4 Sonnet", provider: "Anthropic" },
        gpt: { name: "GPT-5.2", provider: "OpenAI" },
        glm: { name: "GLM-5", provider: "智谱" },
        deepseek: { name: "DeepSeek V3", provider: "DeepSeek" },
        qwen: { name: "通义千问 Max", provider: "阿里云" },
        gemini: { name: "Gemini 3 Pro", provider: "Google" },
        ollama: { name: "Llama 4 (local)", provider: "Ollama" },
      };
      const matched = modelMap[args.toLowerCase()];
      if (matched) {
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
    case "/compact":
      get().addMessage(sessionId, {
        role: "assistant",
        content: "Context compaction is not yet available. This feature will summarize older messages to save context window space when connected to the Rust backend.",
        model,
      });
      break;
    case "/cost":
      get().addMessage(sessionId, {
        role: "assistant",
        content: `### Usage Summary (Mock)

| Provider | Model | Tokens | Est. Cost |
|----------|-------|--------|-----------|
| Anthropic | Claude 4 Sonnet | ~2,450 | $0.018 |
| OpenAI | GPT-5.2 | ~1,200 | $0.009 |
| 智谱 | GLM-5 | ~800 | ¥0.006 |

**Total estimated cost:** ~$0.027

> Cost tracking will be accurate once connected to the Tauri backend with real provider APIs.`,
        model,
      });
      break;
    default:
      get().addMessage(sessionId, {
        role: "assistant",
        content: `Unknown command: \`${cmd}\`. Type \`/help\` for available commands.`,
        model,
      });
  }
}
