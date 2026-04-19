# DevPilot Changelog

All notable changes to DevPilot will be documented in this file.

## [0.3.0] — 2026-04-19 (In Progress)

### Added — Chinese Provider Support (P3-6)

- `ProviderType` enum: added `GLM`, `Qwen`, `DeepSeek` variants (serde-compatible)
- `devpilot-llm/chinese.rs`: model catalogs for 3 Chinese providers (16 models total)
  - GLM: glm-4-plus, glm-4-flash (free), glm-4-air, glm-4-long, glm-4v
  - Qwen: qwen-max, qwen-plus, qwen-turbo, qwen-long, qwen-vl-max, qwq-32b
  - DeepSeek: deepseek-chat (V3), deepseek-reasoner (R1), deepseek-coder
- Preset config factories: `glm_config()`, `qwen_config()`, `deepseek_config()`
- Provider registry: all Chinese providers registered (OpenAI-compatible API)
- Frontend `mapProviderType`: maps Chinese provider IDs to correct type strings
- 15 new Rust tests (protocol serde, chinese models, registry creation)
- 42 new frontend tests (persistence + streaming stores)

### Added — Frontend Integration

- Router system: react-router-dom with /chat /scheduler /gallery /settings routes
- `ActiveView` type extended: `"scheduler"` | `"gallery"` routes
- Sidebar: bottom buttons navigate to scheduler/gallery/settings with active highlight
- `SchedulerPage` stub route placeholder
- `GalleryPage` stub route placeholder
- Dynamic model selector in TopBar — derives from providerStore enabled providers
- Model management UI in SettingsPage — add/edit/delete models per provider
- Archived sessions section in sidebar with unarchive support
- i18n keys: archived/unarchive, model management (10 keys), scheduler/gallery labels
- Abort streaming support — `chatStore.abortStreaming()` + stop button in MessageInput

### Added — Agent Loop Integration

- `AppState` extended with `Agent` + `EventBus` instances
- CoreEvent → Tauri event bridge: chunk/tool-start/tool-result/approval/done/error/compacted
- `send_message_stream` IPC command now calls `Agent::run()` (full tool loop)
- chatStore: listeners for all stream events including tool calls and approvals
- `ApprovalOverlay` → `ApprovalQueue` integrated in ChatPanel
- `resolveApproval` + `approveAll` in chatStore
- Tool call rendering via `ToolCallView` in `MessageList`
- Fix resolve_tool_approval IPC signature

### Added — Tauri Capabilities

- `capabilities/default.json`: shell, dialog, fs permissions for main window
- CSP `connect-src`: added DeepSeek, Qwen, Moonshot, MiniMax, Volcengine, OpenRouter, LiteLLM, localhost (Ollama/LM Studio)

### Added — Provider Persistence (P1)

- Tauri IPC: `list_providers`, `get_provider`, `upsert_provider`, `get_provider_api_key`, `delete_provider` (42 total commands)
- Provider config persisted to SQLite `providers` table
- `providerStore.hydrateFromBackend()`: loads from SQLite on startup, merges with defaults
- All provider mutations (add/update/remove/setApiKey) persist to backend

### Added — API Key Encryption (P1)

- `devpilot-store/crypto`: AES-256-GCM encryption for API keys at rest
- Machine-specific key derivation (SHA-256 of data dir + label)
- `Store::upsert_provider_with_key()` — encrypts before SQLite storage
- `Store::get_provider_api_key()` — decrypts on read
- Frontend hydration restores encrypted API keys from backend
- 4 unit tests (roundtrip, different ciphertexts, invalid inputs)

### Added — Context Compaction (P2)

- `compact_session` Tauri IPC command — uses `devpilot-core::compact::compact_messages` with Summarize strategy
- Store: `delete_session_messages()` helper for compaction
- Frontend: `/compact` slash command triggers real backend compaction, reloads messages, shows summary

### Added — Checkpoint / Rewind (P2)

- `CheckpointInfo` type with camelCase serde
- `checkpoints` SQLite table (id, session_id, message_id, summary, token_count, created_at)
- Store: checkpoint CRUD (create, list, get, delete, delete_session_checkpoints)
- Store: `rewind_to_checkpoint()` — deletes messages after checkpoint + newer checkpoints
- Tauri IPC: `create_checkpoint`, `list_checkpoints`, `rewind_checkpoint` commands (45 total)

### Added — Streaming Usage Tracking (P2)

- Usage persisted to DB after `stream_done` event
- Daily aggregation via existing `Store::add_usage()` upsert

### Added — MCP Client (P2-3)

- `devpilot-mcp` crate: Model Context Protocol client with stdio + SSE transport
- `McpTransport` trait: bidirectional JSON-RPC transport abstraction
- `StdioTransport`: spawns child process, communicates over stdin/stdout
- `SseTransport`: connects to remote HTTP endpoint via reqwest
- `McpClient`: individual server connection — initialize handshake, tool discovery, tool execution
- `McpManager`: manages multiple MCP servers, registers tools into `ToolRegistry`
- `McpProxyTool`: adapts MCP tools into devpilot `Tool` trait for agent loop integration
- Tool naming convention: `mcp__<server_id>__<tool_name>`
- SQLite persistence: `mcp_servers` table (id, name, transport, command, args, url, env, enabled)
- Tauri IPC: `list_mcp_servers`, `upsert_mcp_server`, `delete_mcp_server`, `mcp_connect_server`, `mcp_disconnect_server`, `mcp_list_connected` (51 total commands)
- `AppState` extended with `mcp_manager: Arc<AsyncMutex<Option<McpManager>>>`
- 32 unit tests (transport serde, client mock, manager lifecycle, error display)

### Added — Checkpoint Frontend UI (P3-5)

- `CheckpointInfo` type in `src/types/index.ts`
- `checkpointStore` — Zustand store: `loadCheckpoints`, `createCheckpoint`, `rewindCheckpoint`
- `CheckpointPanel` component — side panel with timeline view, rewind button per checkpoint, create button
- `ChatPanel` — History icon toggle button, CheckpointPanel integration
- IPC mock cases for `list_checkpoints`, `create_checkpoint`, `rewind_checkpoint`
- i18n: 8 checkpoint keys (EN + CN) — checkpoints, createCheckpoint, noCheckpoints, rewindToHere, etc.

### Added — P3 Polish (Error Handling + i18n + Tests)

- `src/lib/errors.ts` — unified error helpers: `getErrorMessage`, `reportError`, `safeAsync`
- `persistence.ts` — all `console.error` replaced with `reportError()` for consistent toast + logging
- `SchedulerPage.tsx` — all hardcoded strings replaced with `t()` i18n calls, `reportError` for error handling
- i18n: 13 new keys (EN + CN) — `creating`, `createTask`, `httpMethod`, `httpHeaders`, `httpBody`, `customActionId`, `maxExecutionsUnlimited`, `errorGeneric`, `errorPersistence`, `errorStream`, `errorCompact`, `errorProvider`
- Tests: `errors.test.ts` (8 tests), `schedulerStore.test.ts` (6 tests), `checkpointStore.test.ts` (7 tests)
- Frontend test count: 100 tests across 9 files, all passing

### Added — P3-4 E2E Integration Tests

- `src-tauri/tests/e2e_test.rs` — 10 end-to-end tests exercising Store→SQLite via `Store::open_in_memory()`
  - Session CRUD lifecycle (create/read/list/update/delete)
  - Message CRUD lifecycle (add/list/update content)
  - Settings CRUD (get/set/list/upsert/unicode/long JSON)
  - Provider lifecycle with encrypted API key roundtrip
  - Checkpoint create/list/rewind with message cleanup
  - Multi-session isolation verification
  - Full chat flow simulation (session → messages → checkpoint → rewind → update title)
  - Multiple providers with mixed API key state
  - Session with tool-use and tool-result messages
- `src-tauri/Cargo.toml`: added `[dev-dependencies] chrono`
- Total Rust tests: 202 (192 crate tests + 10 E2E)

### Stats (as of HEAD)

| Metric         | Value                          |
| -------------- | ------------------------------ |
| Rust crates    | 12 crates, 12,116 LOC          |
| Rust tests     | 202 tests, all passing         |
| Frontend       | 55+ files, ~10,007 LOC         |
| Frontend tests | 142 tests (11 files), all pass |
| IPC commands   | 51 registered (28 #[command])  |
| i18n keys      | 249 (EN + CN)                  |

### Fixed

- Unused `mut` and variable warnings in scheduler tests
- Unused `ResourceLimits` import in sandbox tests
- **IPC resolve_tool_approval mismatch** — frontend sent `{ callId, approved }` but backend expected `{ request: { requestId, approved } }`. Corrected both ipc.ts and chatStore.ts.
- **Stream race condition** — early stream events missed because listeners registered after `invoke()`. Moved listener setup before the invoke call.
- **Sidebar navigation** — settings/scheduler/gallery buttons had no navigation handlers. Wired to `useNavigate()`.
- **Model disappear** — switching providers could leave invalid model selected. Auto-select first available model.
- **Unused imports** — multiple clippy warnings from stale imports after refactoring.

### Changed

- `send_message_stream` now accepts `user_message` + `working_dir` params (agent loop inputs)
- Streaming listener registration moved BEFORE `invoke()` call to prevent race condition
- TopBar model selector: now dynamic (from providerStore) instead of hardcoded DEFAULT_MODELS
- SettingsPage: expanded ProviderCard with full model CRUD form
- Sidebar settings button: now uses `navigate('/settings')` instead of `setActiveView`
- Removed DemoApproval overlay from production chat rendering

---

## [0.2.0] — 2026-04-19

### Added — Backend Crates

#### devpilot-bridge (799 lines, 12 tests)

- `BridgeManager`: register, remove, enable, disable bridges
- `PlatformSender` trait: `send()`, `validate_config()`, `platform_name()`
- Built-in platforms: Telegram (Bot API), Discord (Webhook), Feishu (Bot)
- `BridgeConfig` with URL validation, rate limiting, retry with backoff
- Rich payloads: title, metadata, color per platform
- Message templating with `{title}`, `{content}`, `{metadata}` placeholders

#### devpilot-media (544 lines, 8 tests)

- `MediaManager`: orchestrates multi-provider image generation
- `ImageGenerator` trait with async `generate()`
- Providers: OpenAI DALL-E 3, Stability AI (Stable Diffusion), Generic OpenAI-compatible
- `ImageSize` presets: 256x256 to 1792x1024
- `GenerateRequest` / `GenerateResponse` / `ImageData` types
- Provider registration (custom generators pluggable at runtime)

### Added — src-tauri IPC Integration

- 5 new IPC command modules: sandbox, search, scheduler, bridge, media
- `AppState` extended with `SchedulerState`, `BridgeManager`, `MediaState`
- 16 new Tauri invoke commands (21 total)
- All 10 backend crates wired into Tauri binary

### Changed

- Workspace now has 10 crate members (up from 8)
- devpilot-store types restructured:
  - `ProviderInfo` renamed to `ProviderRecord` (field: `api_key_encrypted` → `api_key_set: bool`, added `created_at`)
  - `SessionInfo`: added `reasoning_effort`, `archived_at`, `message_count` fields
  - `MessageInfo`: added `token_cache_read`, `token_cache_write` fields
  - `UsageRecord`: restructured from per-session to daily aggregated records
  - SQL migrations, queries, and row mappers updated to match
- src-tauri: removed `get_session_usage` command (method no longer exists)

### Fixed

- devpilot-store: 11 compile errors due to type sync drift (see Changed above)
- src-tauri `lib.rs`: removed reference to deleted `get_session_usage` IPC handler
- devpilot-media: `ImageProvider` missing `Hash` derive — needed for `HashMap` key
- devpilot-media: test `use crate::ImageSize` not imported in providers.rs test module
- src-tauri IPC: 39 API mismatch errors across sandbox/search/scheduler/bridge/media modules
  - SandboxedCommand builder API corrected
  - SearchQuery field names aligned
  - TaskAction variant names aligned
  - BridgeManager method signatures aligned
  - MessagePayload field names aligned

---

## [0.1.0] — 2026-04-19

### Added — Backend Crates

#### devpilot-protocol (470 lines, 34 tests)

- Shared types: `ChatRequest`, `ChatResponse`, `Message`, `MessageRole`
- `ProviderConfig` with API key management
- `ToolCall`, `ToolResult`, `SessionMode` (Default derive)
- Cost tracking: `TokenUsage`, `CostInfo`

#### devpilot-llm (2,785 lines, 2 tests)

- Multi-provider LLM client (OpenAI, Anthropic, Ollama, OpenRouter, Qwen)
- Streaming support with `StreamEvent`
- Provider registry + factory pattern
- Token estimation (`estimate_chat_tokens`)
- Retry with exponential backoff

#### devpilot-store (801 lines, 6 tests)

- SQLite persistence via rusqlite
- Session store trait + implementation
- Provider config CRUD
- Message history with pagination
- File-based DB (not in-memory) for durability

#### devpilot-tools (1,835 lines, 28 tests)

- Tool registry with trait-based plugin system
- 4 built-in tools: ShellExec, FileRead, FileWrite, ApplyPatch
- `ToolOutput` struct with `ok()`/`err()` builder methods
- `ExecutionResult` wrapping `Option<ToolOutput>`
- `ToolExecutor` with context and definition resolution

#### devpilot-core (1,311 lines, 16 tests)

- `AgentLoop` with `run()` — main agent execution cycle
- `SessionManager` + `SessionStore` trait
- `EventBus` with broadcast channel
- `ContextCompactor` for message history compression
- `CoreError` enum

#### devpilot-sandbox (728 lines, 17 tests)

- `SandboxPolicy`: default/permissive/strict presets
- `SandboxedCommand`: builder with policy checks, timeout, output cap
- `FsRule` first-match-wins filesystem access control
- `NetworkPolicy`: Allow/Deny/Disabled
- `ResourceLimits`: timeout, max output, max processes
- `SizeLimit`: configurable KB/MB/GB helpers

#### devpilot-search (581 lines, 14 tests)

- `SearchEngine`: async file + content search
- Fuzzy matching with consecutive/boundary/coverage scoring
- Regex content search with concurrent file scanning (semaphore)
- Glob-to-regex conversion for file filtering
- `SearchQuery`/`SearchMatch` types

#### devpilot-scheduler (562 lines, 12 tests)

- `Scheduler`: async cron loop with start/stop lifecycle
- `TaskDef`: cron expressions, max executions, pause/resume
- `TaskAction`: ShellCommand, HttpRequest, Custom
- `TaskCallback` for external action handling
- Automatic removal of expired tasks

### Changed

- Workspace now has 8 crate members (up from 0)
- `SessionMode` gained `Default` derive for agent ergonomics
- `.gitignore` updated with `.claude/` exclusion

### Fixed

- `ToolOutput` is a struct (not enum) — agent.rs rewritten to use `ok()`/`err()`
- `ExecutionResult` has `output: Option<ToolOutput>` — must extract `.output`
- `definitions()` is async — added `.await` in agent loop
- `session_id` move in tests — clone before async blocks
- `auto_title` test threshold: 48-char input < 50-char threshold = no truncation
- FsRule strict policy: Deny `/` was overriding Write `/tmp/sandbox` — fixed with first-match-wins
- Default policy: added Read `/home/` rule for home directory access
- Glob-to-regex: `'|'` missing in char pattern (`'{' '}'` → `'{' | '}'`)
- Fuzzy test: "xyzabc" has no 'r' char — changed to "parser"
- Engine tests: relative paths fail in cargo test — use `CARGO_MANIFEST_DIR` + parent traversal
