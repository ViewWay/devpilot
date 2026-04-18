# Backend Development Guide / 后端开发指南

**Version:** 0.1.0
**Date:** 2026-04-18
**Status:** Active

---

## Table of Contents

1. [Overview / 概览](#1-overview)
2. [Project Structure / 项目结构](#2-project-structure)
3. [IPC Contract / IPC 契约](#3-ipc-contract)
4. [Streaming Protocol / 流式响应协议](#4-streaming-protocol)
5. [Database Schema / 数据库 Schema](#5-database-schema)
6. [Frontend Data Types / 前端数据类型](#6-frontend-data-types)
7. [Technical Constraints / 技术约束](#7-technical-constraints)
8. [Recommended Implementation Order / 建议实现顺序](#8-recommended-implementation-order)
9. [Crate Architecture / Crate 架构](#9-crate-architecture)
10. [Security Notes / 安全注意事项](#10-security-notes)

---

## 1. Overview

DevPilot is a multi-model AI coding agent desktop app built with **Tauri 2 (Rust) + React 19**.

### Current State

| Layer | Status | Description |
|-------|--------|-------------|
| Frontend (React) | In Progress | UI shell, chat, sidebar, terminal, i18n — functional in browser dev mode |
| Tauri Commands | Partial | Basic CRUD (sessions, messages, settings, usage) implemented |
| LLM Integration | Not Started | No API calls to any LLM provider yet |
| Tool Execution | Not Started | Shell, file ops, MCP not wired |
| Independent Crates | Empty | `crates/` directory — all 10 crates are scaffolded but not implemented |

### Key Entry Points

```
src-tauri/
├── src/
│   ├── lib.rs           # Tauri app setup, AppState, Database, shared types
│   ├── main.rs          # Binary entry
│   └── commands/mod.rs  # All #[tauri::command] handlers (341 lines, CRUD only)
├── Cargo.toml           # Rust dependencies
├── tauri.conf.json      # Tauri config (window, CSP, plugins)
└── capabilities/default.json  # Tauri 2 permissions
```

---

## 2. Project Structure

```
devpilot/
├── crates/                  # Independent Rust crates (TODO)
│   ├── devpilot-core/       # Session management, agent loop, event bus, context compaction
│   ├── devpilot-llm/        # Multi-provider LLM client (OpenAI, Anthropic, GLM, Ollama...)
│   ├── devpilot-tools/      # Tool registry, shell execution, file operations, MCP client
│   ├── devpilot-sandbox/    # Sandboxed command execution
│   ├── devpilot-store/      # SQLite persistence layer, config management
│   ├── devpilot-bridge/     # IM bridge (Telegram, Feishu, etc.)
│   ├── devpilot-scheduler/  # Cron task scheduler
│   ├── devpilot-media/      # Image generation proxy
│   ├── devpilot-protocol/   # Shared types between crates
│   └── devpilot-search/     # File search (fuzzy + content)
├── src-tauri/               # Tauri app shell (commands, IPC)
├── src/                     # React frontend
└── docs/                    # Documentation
```

---

## 3. IPC Contract

The frontend communicates with the backend exclusively through `src/lib/ipc.ts`, which wraps `@tauri-apps/api` invoke/listen/emit.

### 3.1 Implemented Commands (in `lib.rs` generate_handler!)

These are registered and functional:

| Command | Signature | Description |
|---------|-----------|-------------|
| `ping` | `() -> PingResponse` | Health check |
| `list_sessions` | `() -> Vec<SessionInfo>` | List all sessions |
| `get_session` | `(id: String) -> SessionInfo` | Get session by ID |
| `create_session` | `(title, model, provider) -> SessionInfo` | Create new session |
| `delete_session` | `(id: String) -> ()` | Delete session (CASCADE) |
| `update_session_title` | `(id, title) -> ()` | Rename session |
| `get_session_messages` | `(sessionId: String) -> Vec<MessageInfo>` | Get all messages |
| `add_message` | `(sessionId, role, content, model?, toolCalls?, toolCallId?) -> MessageInfo` | Add message |
| `get_setting` | `(key: String) -> Option<String>` | Get setting |
| `set_setting` | `(key, value) -> ()` | Upsert setting |
| `list_settings` | `() -> Vec<SettingEntry>` | List all settings |
| `get_session_usage` | `(sessionId: String) -> Vec<UsageRecord>` | Per-session usage |
| `get_total_usage` | `() -> Vec<UsageRecord>` | All usage (last 1000) |

### 3.2 Declared but NOT Implemented (in `ipc.ts` IPCCommands)

The frontend defines these in the TypeScript interface. Backend must implement matching Tauri commands:

```typescript
// Session control
send_message:     { sessionId: string; content: string; attachments?: string[] }
pause_session:    { sessionId: string }
resume_session:   { sessionId: string }
rewind_session:   { sessionId: string; checkpointId: string }

// Tool approval
approve_tool_call: { callId: string; approved: boolean }

// MCP
list_mcp_servers:  void
add_mcp_server:    { config: MCPServerConfig }

// File operations
read_file:    { path: string }
list_dir:     { path: string }
search_files: { query: string; rootPath?: string }

// Provider management
get_settings:   void   // NOTE: different from get_setting (singular)
update_settings: { settings: Record<string, unknown> }
get_providers:  void
test_provider:  { providerId: string }
```

**Important:** When implementing these, add them to `lib.rs` `generate_handler![]` macro. Use `#[tauri::command(rename_all = "camelCase")]` for multi-word parameter names.

### 3.3 Frontend IPC Helper

```typescript
// src/lib/ipc.ts
invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>
listen<T>(event: string, handler: (payload: T) => void): Promise<() => void>
emit(event: string, payload?: unknown): Promise<void>
```

- Falls back to mock in browser dev mode (when `__TAURI_INTERNALS__` is absent)
- Backend only needs to implement real Tauri commands; mock handling is on the frontend side

---

## 4. Streaming Protocol

The frontend has a fully implemented streaming listener in `src/hooks/useTauriEvents()`. The backend **must** emit these events in this exact format.

### 4.1 User Message Initiation

The frontend sends user input via:

```
emit("user_message", { sessionId: string, content: string })
```

The backend should listen for this event, then process through the LLM and emit stream events.

### 4.2 Stream Events

#### `stream_chunk` — Partial LLM output

```rust
// Rust side
app_handle.emit("stream_chunk", StreamChunkPayload {
    session_id: "uuid".into(),
    chunk: "partial text".into(),
})?;
```

```typescript
// Frontend handler receives
{ sessionId: string; chunk: string }
```

- The frontend appends `chunk + "▌"` (cursor) to the last assistant message
- Multiple chunks are concatenated sequentially

#### `stream_done` — Stream complete

```rust
app_handle.emit("stream_done", StreamDonePayload {
    session_id: "uuid".into(),
    model: "gpt-4o".into(),
})?;
```

```typescript
// Frontend handler receives
{ sessionId: string; model: string }
```

- Removes trailing `"▌"` cursor from the last assistant message
- Sets `isLoading = false` in chatStore

#### `stream_error` — Error occurred

```rust
app_handle.emit("stream_error", StreamErrorPayload {
    message: "API rate limit exceeded".into(),
})?;
```

```typescript
// Frontend handler receives
{ message: string }
```

- Displays error in chat UI
- Sets `isLoading = false`

### 4.3 Cursor Convention

- During streaming, the frontend appends `"▌"` as a visual cursor
- `stream_done` must be emitted to clean up the cursor — otherwise it stays visible
- Do NOT include `"▌"` in chunk content from the backend

---

## 5. Database Schema

All tables are created in `Database::run_migrations()` in `src-tauri/src/lib.rs`. Do **not** alter existing column definitions — add new columns via migration ALTER TABLE if needed.

### 5.1 `sessions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | UUID v4 |
| `title` | TEXT | NOT NULL DEFAULT 'New Chat' | |
| `model` | TEXT | NOT NULL DEFAULT '' | e.g. "gpt-4o" |
| `provider` | TEXT | NOT NULL DEFAULT '' | e.g. "openai" |
| `working_dir` | TEXT | nullable | Project working directory |
| `mode` | TEXT | NOT NULL DEFAULT 'code' | "code" / "plan" / "ask" |
| `created_at` | TEXT | NOT NULL | RFC 3339 |
| `updated_at` | TEXT | NOT NULL | RFC 3339 |

### 5.2 `messages`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | UUID v4 |
| `session_id` | TEXT | FK -> sessions(id) CASCADE | |
| `role` | TEXT | CHECK('user','assistant','system','tool') | |
| `content` | TEXT | NOT NULL DEFAULT '' | |
| `model` | TEXT | nullable | Model that generated this |
| `tool_calls` | TEXT | nullable | JSON array of tool calls |
| `tool_call_id` | TEXT | nullable | For tool response messages |
| `token_input` | INTEGER | DEFAULT 0 | |
| `token_output` | INTEGER | DEFAULT 0 | |
| `cost_usd` | REAL | DEFAULT 0.0 | |
| `created_at` | TEXT | NOT NULL | |

Index: `idx_messages_session` on `session_id`

### 5.3 `providers`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `name` | TEXT | NOT NULL | Display name |
| `type` | TEXT | NOT NULL | "openai" / "anthropic" / "glm" / "ollama" etc. |
| `base_url` | TEXT | NOT NULL | API endpoint |
| `api_key_encrypted` | TEXT | nullable | Encrypted API key |
| `models` | TEXT | nullable | JSON array of available models |
| `enabled` | INTEGER | DEFAULT 1 | |

### 5.4 `settings`

| Column | Type | Constraints |
|--------|------|-------------|
| `key` | TEXT | PK |
| `value` | TEXT | NOT NULL |

### 5.5 `usage`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK |
| `session_id` | TEXT | FK CASCADE |
| `model` | TEXT | NOT NULL |
| `provider` | TEXT | NOT NULL |
| `token_input` | INTEGER | DEFAULT 0 |
| `token_output` | INTEGER | DEFAULT 0 |
| `cost_usd` | REAL | DEFAULT 0.0 |
| `created_at` | TEXT | NOT NULL |

Index: `idx_usage_session` on `session_id`

### 5.6 `checkpoints`

For agent conversation compaction / context window management.

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK |
| `session_id` | TEXT | FK CASCADE |
| `message_id` | TEXT | FK -> messages(id) |
| `summary` | TEXT | NOT NULL |
| `token_count` | INTEGER | DEFAULT 0 |
| `created_at` | TEXT | NOT NULL |

### 5.7 `mcp_servers`

| Column | Type | Constraints |
|--------|------|-------------|
| `id` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `transport` | TEXT | CHECK('stdio', 'sse') |
| `command` | TEXT | nullable |
| `args` | TEXT | nullable | JSON array |
| `url` | TEXT | nullable | For SSE transport |
| `env` | TEXT | nullable | JSON object |
| `enabled` | INTEGER | DEFAULT 1 |

### 5.8 Current Limitation

The database uses `open_in_memory()` — data is lost on restart. A future task should change this to a persistent file path (e.g. `app_data_dir/devpilot.db`).

---

## 6. Frontend Data Types

Defined in `src/types/index.ts`. Backend types should match these structures.

```typescript
interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  model?: string;
  timestamp: string;          // ISO 8601
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

interface ToolCall {
  id: string;
  name: string;               // e.g. "shell_exec", "read_file"
  input: string;              // JSON string of arguments
  output?: string;
  status: "running" | "done" | "error";
  duration?: number;          // ms
}

interface Session {
  id: string;
  title: string;
  model: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  messages: Message[];
}

interface ModelInfo {
  id: string;                 // e.g. "gpt-4o"
  name: string;               // e.g. "GPT-4o"
  provider: string;           // e.g. "openai"
  color: string;              // Hex color for UI
}

type AgentMode = "code" | "plan" | "ask";

interface ApprovalRequest {
  id: string;
  toolCallId: string;
  command: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  workingDir?: string;
  createdAt: string;
}

interface MCPServerConfig {
  name: string;
  transport: "stdio" | "sse" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}
```

### Rust-side Equivalents (already defined in lib.rs)

```rust
struct SessionInfo { id, title, model, provider, working_dir, mode, created_at, updated_at }
struct MessageInfo { id, session_id, role, content, model, tool_calls, tool_call_id, token_input, token_output, cost_usd, created_at }
struct UsageRecord { id, session_id, model, provider, token_input, token_output, cost_usd, created_at }
struct SettingEntry { key, value }
```

---

## 7. Technical Constraints

### 7.1 Rust

- **Edition:** 2024
- **Tauri:** v2
- **Async runtime:** Tokio (features = ["full"])
- **Naming convention:** Tauri commands use `#[tauri::command(rename_all = "camelCase")]` for multi-word params

### 7.2 Dependencies (Cargo.toml)

```toml
tauri = { version = "2" }
tauri-plugin-log = "2"
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
tauri-plugin-fs = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.31", features = ["bundled"] }
thiserror = "2"
anyhow = "1"
uuid = { version = "1", features = ["v4", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["env-filter"] }
```

### 7.3 CSP (Content Security Policy)

The Tauri config allows connections to:

```
https://api.openai.com
https://api.anthropic.com
https://generativelanguage.googleapis.com
https://open.bigmodel.cn.cn
```

Additional API endpoints (e.g. DeepSeek, Qwen, Ollama localhost) need to be added to `tauri.conf.json` `app.security.csp`.

### 7.4 Tauri Capabilities

Current permissions in `capabilities/default.json`:

```json
{ "permissions": ["core:default"] }
```

Additional permissions needed:
- `shell:allow-open` (already configured in plugins)
- `fs:allow-read`, `fs:allow-write` for file tool operations
- `dialog:allow-open`, `dialog:allow-save` for file dialogs
- Custom permissions for MCP process spawning

### 7.5 Build & Test

```bash
# Build Tauri app
cd src-tauri && cargo build

# Run tests
cargo test

# Lint
cargo fmt && cargo clippy -- -D warnings
```

---

## 8. Recommended Implementation Order

### Phase 1: LLM Communication (Priority)

1. **`devpilot-llm` crate** — Multi-provider HTTP client
   - OpenAI-compatible API (covers OpenAI, DeepSeek, Qwen, GLM, Ollama)
   - Native Anthropic API (different message format)
   - Streaming SSE parser
   - Token counting / cost estimation

2. **`send_message` command + streaming events**
   - Listen for `"user_message"` event from frontend
   - Route to appropriate LLM provider
   - Emit `stream_chunk` / `stream_done` / `stream_error`
   - Persist messages to SQLite

3. **Provider management**
   - CRUD for `providers` table
   - API key encryption (use OS keyring or AES-256-GCM)
   - Model listing per provider
   - `get_providers` / `test_provider` commands

### Phase 2: Tool Execution

4. **`devpilot-tools` crate** — Tool registry and execution
   - Shell command execution (via `portable-pty`)
   - File read/write/search operations
   - Tool call parsing from LLM response

5. **Tool approval flow**
   - Emit approval requests to frontend
   - Listen for `approve_tool_call` responses
   - Risk level classification (read-only = low, write = medium, destructive = high)

6. **`devpilot-sandbox` crate** — Sandboxed execution
   - Isolated filesystem namespace
   - Resource limits (time, memory, network)

### Phase 3: Advanced Features

7. **MCP client** — `devpilot-tools` MCP module
   - Spawn MCP servers (stdio/sse)
   - Tool discovery and invocation
   - `list_mcp_servers` / `add_mcp_server` commands

8. **Context compaction** — Checkpoint system
   - Summarize old messages when context window fills
   - `rewind_session` command
   - Token budget management

9. **`devpilot-store` crate** — Extract persistence
   - Move Database out of `lib.rs` into dedicated crate
   - Persistent file-based SQLite
   - Migration framework

### Phase 4: Integrations

10. **`devpilot-bridge`** — IM notifications
11. **`devpilot-scheduler`** — Cron tasks
12. **`devpilot-media`** — Image generation
13. **`devpilot-search`** — File search

---

## 9. Crate Architecture

### Dependency Graph (Planned)

```
src-tauri (app shell)
├── devpilot-core          (agent loop, session management)
│   ├── devpilot-llm       (LLM API client)
│   ├── devpilot-tools     (tool registry + execution)
│   │   └── devpilot-sandbox
│   ├── devpilot-store     (persistence)
│   └── devpilot-protocol  (shared types)
├── devpilot-bridge        (IM integrations)
│   └── devpilot-protocol
├── devpilot-scheduler     (cron tasks)
│   └── devpilot-store
└── devpilot-search        (file search)
```

### `devpilot-protocol` (Shared Types)

This crate should contain all type definitions shared between crates:

- `Session`, `Message`, `ToolCall`, `Provider`, `ModelInfo`
- LLM request/response types
- Event payload types for streaming
- MCP protocol types

Avoid duplicating types across crates — define once in `protocol`, use everywhere.

---

## 10. Security Notes

1. **API Keys** — Must be encrypted at rest. Use `tauri-plugin-store` with encryption, or OS keyring via `keyring` crate. Never log API keys.

2. **Shell Execution** — All shell commands must go through the approval flow. Never execute without user consent. Risk classification:
   - `low`: read-only (cat, ls, grep, git status)
   - `medium`: writes (file edits, git commits)
   - `high`: destructive (rm -rf, git push --force, npm publish)

3. **File Access** — Respect sandbox boundaries. Validate paths against the session's `working_dir`.

4. **CSP** — Only allowlisted domains can receive API requests. Update `tauri.conf.json` when adding new providers.

5. **Input Validation** — Sanitize all user input before passing to LLM or shell. No injection attacks.

6. **Database** — Use parameterized queries (rusqlite `params![]`). The current code already does this correctly.

---

## Appendix A: Frontend Store Architecture

For reference — the frontend uses Zustand stores. These define what data the UI expects:

| Store | File | Purpose |
|-------|------|---------|
| `chatStore` | `src/stores/chatStore.ts` | Sessions, messages, loading state, mock replies |
| `uiStore` | `src/stores/uiStore.ts` | Sidebar, panel visibility, active tabs |
| `settingsStore` | `src/stores/settingsStore.ts` | Theme, locale, provider config |
| `toastStore` | `src/stores/toastStore.ts` | Toast notifications |

## Appendix B: Event Reference

### Frontend → Backend (emit)

| Event | Payload | Description |
|-------|---------|-------------|
| `user_message` | `{ sessionId, content }` | New user message to process |

### Backend → Frontend (emit)

| Event | Payload | Description |
|-------|---------|-------------|
| `stream_chunk` | `{ sessionId, chunk }` | Partial LLM output |
| `stream_done` | `{ sessionId, model }` | Stream complete |
| `stream_error` | `{ message }` | Error during processing |
| `tool_approval_request` | `{ id, toolCallId, command, description, riskLevel, workingDir }` | Request user approval (planned) |
