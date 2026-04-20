# DevPilot Development Log

## 2026-04-19 Session F — Phase 1 Agent Loop 集成 (P0-1 ~ P0-3)

### Goal

将后端 Agent Loop 与前端 Chat 串联，实现 LLM→工具执行→审批→结果的完整闭环。

### P0-1: 数据库持久化路径验证 ✅

**分析:**

- `Store::open_default()` 使用 `dirs::data_dir()` 获取路径
- macOS 上 `dirs::data_dir()` = `~/Library/Application Support/`
- Tauri 的 `app_data_dir()` 也解析到相同路径
- 结论: 无需修改，路径天然兼容

### P0-2: Agent Loop 集成 ✅

**Implementation:**

1. **AppState 扩展** (`src-tauri/src/lib.rs`)
   - 新增 `Agent` 和 `EventBus` 到 `AppState`
   - 添加 `start_event_bridge()` 函数，在 setup 中 spawn tokio task
   - EventBus broadcast → Tauri `app.emit()` 事件桥接

2. **CoreEvent → Tauri 事件映射:**
   | CoreEvent | Tauri Event | 前端用途 |
   |-----------|-------------|----------|
   | `StreamDelta` | `stream-chunk` | 流式文本追加 |
   | `StreamDone` | `stream-done` | 流式完成 |
   | `StreamError` | `stream-error` | 错误处理 |
   | `ToolCallStarted` | `stream-tool-start` | 工具调用开始 |
   | `ToolCallCompleted` | `stream-tool-result` | 工具调用结果 |
   | `ApprovalRequested` | `stream-approval` | 审批请求 |
   | `ThinkingDelta` | `stream-thinking` | 思维链 |

3. **send_message_stream 重写** (`src-tauri/src/commands/llm.rs`)
   - 从直接调用 LLM provider 改为调用 `Agent::run()`
   - 接受 `user_message` + `working_dir` 参数
   - spawn 为 tokio 异步任务

4. **CoreEvent re-export** (`crates/devpilot-core/src/lib.rs`)
   - `pub use event_bus::{CoreEvent, EventBus, EventBusReceiver};`

### P0-3: Tool Approval 前端 (进行中)

**已完成:**

- `chatStore.ts` 添加 `stream-approval` 事件监听
- `chatStore.ts` 添加 `stream-tool-start` / `stream-tool-result` 事件监听
- `activeToolCalls` Map 追踪活跃工具调用
- `ipc.ts` 修正 `resolve_tool_approval` 类型为 `{ request: { requestId, approved } }`
- 当前实现为自动批准 (`approved: true`)，等待 UI 集成

**待完成:**

- ApprovalOverlay 组件已存在但未集成到 ChatPanel
- 需要实现用户手动审批/拒绝的 UI 交互

### Issues & Fixes

1. **IPC resolve_tool_approval 参数不匹配** — 前端发送 `{ callId, approved }`，后端期望 `{ request: { requestId, approved } }`。修正前端 ipc.ts 和 chatStore.ts。
2. **ProviderType::Qwen 不存在** — devpilot-protocol 中只有 `OpenAi`, `Anthropic`, `Google`, `Ollama` 四种变体。
3. **多个未使用 import** — 连续 patch 修复 clippy 警告。

### Quality Gates

- `cargo build` ✅
- `cargo test --workspace` 155/155 ✅
- TypeScript lint: TS5112 (pre-existing, non-blocking)

### Modified Files

| 文件                              | 变更                                          |
| --------------------------------- | --------------------------------------------- |
| `src-tauri/src/lib.rs`            | AppState + Agent/EventBus + event bridge task |
| `src-tauri/src/commands/llm.rs`   | Agent::run() 替代直接 LLM 调用                |
| `crates/devpilot-core/src/lib.rs` | CoreEvent re-export                           |
| `src/stores/chatStore.ts`         | 工具事件监听 + IPC 参数修正                   |
| `src/lib/ipc.ts`                  | resolve_tool_approval 类型修正                |
| `TODO.md`                         | 进度更新                                      |

---

## 2026-04-19 Session E — Hermes优化 + 文档更新 (commit 6b8e263)

### Hermes 上下文压缩优化

**问题:** Hermes 上下文管理频繁丢失关键信息，压缩过于激进。

**分析:**

- 阅读 `context_compressor.py` (1,163行)、`context_engine.py` (184行)、`auxiliary_client.py` 核心代码
- 发现 config 中 `compression.summary_model` 被硬编码 `summary_model_override=None` 无视，实际走 `auxiliary.compression` 段
- `auxiliary.compression.model` 为空 → fallback 到主模型 GLM，不存在跨 provider 开销
- threshold 0.50 对 GLM 200K 上下文窗口过于激进

**修复 (config.yaml):**

| 配置项                          | 旧值 | 新值 | 效果                |
| ------------------------------- | ---- | ---- | ------------------- |
| `compression.threshold`         | 0.50 | 0.70 | 上下文用到70%才压缩 |
| `auxiliary.compression.timeout` | 120  | 180  | 压缩LLM调用多60秒   |

**注意:** `compression.summary_model: google/gemini-3-flash-preview` 在 config 中存在但实际无效（run_agent.py:1541 硬编码 None）。无需修改，当前自动用主模型。

---

## 2026-04-19 Session D — Frontend Panels (commit 2d0328f → 6b8e263)

### Phase 8: SchedulerPanel + GalleryPanel + Bridge

**Goal:** 完成 Phase 3 所有前端面板。

**Implementation:**

- SchedulerPage: 定时任务CRUD面板
- GalleryPage: 图片画廊管理
- Bridge设置标签: IM平台集成配置 (Telegram/Discord/Feishu)
- IPC层完善: scheduler/gallery/bridge IPC调用
- i18n补全: 所有新页面中英文
- streaming修复: 竞态条件 + 中止支持
- 动态模型选择器: 从 providerStore 读取

**Issues & Fixes:**

1. **流式竞态** — stream listener 注册在 invoke 之后，丢失早期 chunk。重构为先注册再 invoke。
2. **中止支持** — 添加 `chatStore.abortStreaming()`，清除 listener + 标记消息完成。
3. **Sidebar导航死按钮** — scheduler/gallery/settings 无 onClick，改用 `navigate()`。
4. **Mock流提前中止** — mock 循环检查 `isLoading` flag。

**Result:** commit `a6397e8` → `6b8e263`

---

### Phase 3 Complete Summary

| 维度       | 数据                                |
| ---------- | ----------------------------------- |
| 后端       | 10 crate, 11,848 行 Rust, 155 tests |
| IPC        | 21 commands, 7 modules, 1,264 行    |
| 前端       | 49 files, 9,001 行 TypeScript       |
| 总代码     | 20,849 行                           |
| 最新commit | `6b8e263`                           |

---

## 2026-04-19 Session C (commit 40fdf06 → 2d0328f)

### Phase 6: Router + Streaming Fixes

**Goal:** Fix critical streaming bugs, add routing for new pages.

**Implementation:**

- Router: added /scheduler and /gallery routes with stub pages
- `ActiveView` extended with `"scheduler" | "gallery"`
- Sidebar: bottom buttons wired to `useNavigate()` with active-state highlighting
- `RouteSync` component: syncs URL path → `activeView` store on location change
- Sidebar: archived sessions section with unarchive button
- Removed `DemoApproval` overlay from production chat rendering

**Issues & Fixes:**

1. **Stream race condition** — stream listeners were registered AFTER `invoke("send_message_stream")`, so early chunks emitted between the Rust side starting and the JS listeners being attached were lost. Fixed by restructuring: register all listeners first, then invoke.
2. **Abort support** — added `chatStore.abortStreaming()` method that cleans up listeners, marks message as finalized, and sets `isLoading = false`. Wired to stop button in MessageInput.
3. **Sidebar navigation dead buttons** — scheduler/gallery/settings buttons had no `onClick`. Wired to `navigate()`.
4. **Early abort in mock** — mock streaming loop now checks `isLoading` flag each tick, respecting user abort.

**Result:** 6 files changed, commit `02517ff`

---

### Phase 7: Dynamic Model Selector + Model Management

**Goal:** TopBar model selector should be dynamic from providerStore, not hardcoded.

**Implementation:**

- TopBar: model dropdown now reads from `providerStore.enabledProviders`
- Models grouped by provider in dropdown, colored section headers
- Auto-select first available model when current selection disappears
- SettingsPage: `ProviderCard` expanded with model add/edit/delete UI
- Model form: id, name, maxTokens, supportsVision, inputPrice, outputPrice
- Added 10 i18n keys for model management (EN + CN)

**Result:** 4 files changed, commit `2d0328f`

---

### Session C Totals

| Metric       | Before Session C   | After Session C                        |
| ------------ | ------------------ | -------------------------------------- |
| Frontend LOC | 7,420              | 7,814                                  |
| Pages        | 2 (chat, settings) | 4 (chat, settings, scheduler, gallery) |
| Commits      | 40fdf06            | 2d0328f                                |

---

## 2026-04-19 Session B (commit 0aaf7d4 → 40fdf06)

### Phase 4: devpilot-bridge

**Goal:** IM/notification integrations — Telegram, Discord, Feishu.

**Implementation:**

- `BridgeManager`: register/remove/enable/disable bridge instances
- `PlatformSender` trait with `send()`, `validate_config()`, `platform_name()`
- Platform implementations: TelegramBot (Bot API), DiscordWebhook, FeishuBot
- `BridgeConfig` with URL validation, max_retries, rate_limit
- `MessagePayload` with title/content/metadata/color fields
- Retry with exponential backoff + rate limiting via `tokio::time`
- `format_payload()`: platform-specific message templating

**Issues & Fixes:**

1. **`PlatformSender` not Debug** — `Bridge` derived `Debug` but `Box<dyn PlatformSender>` doesn't implement it. Removed `#[derive(Debug)]` from `Bridge`.
2. **Unused import `std::sync::Arc`** — clippy caught it after check. Fixed with `cargo clippy --fix`.

**Result:** 799 lines, 12 tests

---

### Phase 5: devpilot-media

**Goal:** Image generation with multiple provider backends.

**Implementation:**

- `MediaManager`: async orchestrator with pluggable `ImageGenerator` trait
- `ImageGenerator` trait: `async fn generate(&self, req: &GenerateRequest)`
- Provider implementations: OpenAI DALL-E 3, Stability AI, Generic (OpenAI-compatible)
- `ImageSize` enum with dimension presets (256x256 to 1792x1024)
- `GenerateRequest` validation, effective base URL resolution
- Provider registration at runtime via `register_generator()`

**Issues & Fixes:**

1. **`ImageProvider` missing `Hash`** — Used as `HashMap` key but didn't derive `Hash`. Added `Hash` to derive list.
2. **Test import missing** — `providers.rs` test module used `ImageSize` but didn't import it. Added `use crate::types::ImageSize`.

**Result:** 544 lines, 8 tests

---

### Fix: devpilot-store type sync

**Problem:** 11 compile errors in devpilot-store due to `types.rs` being updated but `store.rs` not synced.

**Root cause:** Store's `types.rs` had been updated with new/changed struct fields (from protocol or manual edits), but `store.rs` (SQL queries, row mappers, struct constructors, migrations) was not updated to match.

**Changes:**

- `ProviderInfo` → `ProviderRecord`: renamed, `api_key_encrypted` → `api_key_set: bool`, added `created_at`
- `SessionInfo`: added `reasoning_effort`, `archived_at`, `message_count` to constructors and row mappers
- `MessageInfo`: added `token_cache_read`, `token_cache_write` fields
- `UsageRecord`: restructured from per-session to daily aggregated (`id`, `date`, `token_cache_read`, `token_cache_write`, `request_count`)
- `add_usage()` changed to upsert with aggregation logic
- Removed `get_session_usage()` (no longer applicable)
- Updated DB migration schemas
- `error.rs`: added `#[allow(dead_code)]` on unused `Result` alias

**Additional fix:** `src-tauri/src/commands/mod.rs` — removed `get_session_usage` IPC handler. Also removed from `src-tauri/src/lib.rs` handler registration.

**Result:** All 155 workspace tests passing, clippy clean

---

### Phase 5.5: src-tauri IPC Integration

**Goal:** Wire all 10 backend crates into Tauri IPC commands.

**Implementation:**

- 5 new command modules: `sandbox.rs`, `search.rs`, `scheduler.rs`, `bridge.rs`, `media.rs`
- `AppState` extended with `SchedulerState`, `BridgeManager`, `MediaState`
- 16 new invoke commands registered in `lib.rs`
- Total: 21 IPC commands across 7 modules

**Issues & Fixes:**

1. **39 API mismatch errors** — IPC modules used incorrect API surfaces from the actual crates. Delegate agent fixed all by reading crate source and rewriting:
   - `SandboxedCommand` builder API: `new()` → `.command()` → `.policy()` chain
   - `SearchQuery` fields: `directory` not `path`, `pattern` naming
   - `TaskAction` variants: `ShellCommand`/`HttpRequest`/`Custom` not `Shell`/`Http`
   - `BridgeManager` methods: `create_bridge()` not `add()`, `list_bridges()` not `list()`
   - `MessagePayload` fields: `text` not `content`, `level` not `priority`

**Result:** src-tauri compiles clean, 155/155 workspace tests pass, clippy + fmt clean. Commit `40fdf06`.

---

### Session B Totals

| Metric   | Before Session B | After Session B |
| -------- | ---------------- | --------------- |
| Crates   | 8                | 10              |
| Rust LOC | 9,853            | 11,737          |
| IPC cmds | 5                | 21              |
| Tests    | 101              | 155             |
| Commits  | aa2cdd6          | 40fdf06         |

Quality gates: `cargo fmt`, `cargo clippy -D warnings`, `cargo test --workspace` — all passing.

---

## 2026-04-19 Session A (commits f2e3d15 → aa2cdd6)

### Phase 1: devpilot-sandbox

**Goal:** Sandboxed command execution with resource limits and filesystem access control.

**Implementation:**

- `SandboxPolicy` with 3 presets (default/permissive/strict)
- `SandboxedCommand` builder — validates commands against policy before execution
- `FsRule` system with first-match-wins semantics (Read/Write/Deny)
- Network policy, resource limits, size limits

**Issues & Fixes:**

1. **Lifetime issue** — `SandboxedCommand` originally borrowed `&'a SandboxPolicy`, but `new()` returned temporary. Fixed by making policy fully owned (no lifetime parameter).
2. **FsRule strict policy** — `Deny "/"` was placed after `Write "/tmp/sandbox"`, blocking the allowed path. Fixed with first-match-wins: rules checked in order, first match determines outcome.
3. **Default policy missing /home** — test expected `/home/user/code` to be allowed but no rule covered it. Added `FsRule::Read("/home/")` to default policy.

**Result:** 728 lines, 17 tests, commit `f2e3d15`

---

### Phase 2: devpilot-search

**Goal:** File search engine with fuzzy filename matching and regex content search.

**Implementation:**

- `SearchEngine` — async search dispatching to file/content modes
- `fuzzy_match()` — character sequence scoring (consecutive bonus, word boundary bonus, coverage bonus, length penalty)
- `search_file()` — regex line-by-line matching with async buffered reader
- `glob_to_regex()` — simple glob → regex conversion for file filtering
- Concurrent content search with tokio semaphore

**Issues & Fixes:**

1. **Glob char pattern typo** — `'{' '}'` missing `|` separator → `'{' | '}'`
2. **Fuzzy word_boundary test** — `fuzzy_match("r", "xyzabc")` returns `None` because "xyzabc" has no 'r'. Changed to `fuzzy_match("r", "parser")`.
3. **Test relative paths** — `cargo test` runs from `target/` dir, relative paths don't resolve. Fixed with `CARGO_MANIFEST_DIR` + double `.parent()` traversal.
4. **Missing tempfile dev-dependency** — added `tempfile = "3"` to `[dev-dependencies]`.

**Result:** 581 lines, 14 tests, commit `904e161`

---

### Phase 3: devpilot-scheduler

**Goal:** Cron task scheduler with async execution loop.

**Implementation:**

- `Scheduler` — async loop: find soonest task, sleep, fire due tasks, repeat
- `TaskDef` — cron expression, max executions, pause/resume, execution tracking
- `TaskAction` — ShellCommand, HttpRequest, Custom (extensible)
- `TaskCallback` — external handler for task execution events

**Issues & Fixes:**

1. **Schedule not Default** — `cron::Schedule` doesn't implement `Default`. Fixed by storing `cron_expr: String`, parsed on demand.
2. **Unused imports** — Fixed by `cargo clippy --fix`.

**Result:** 562 lines, 12 tests, commit `aa2cdd6`

---

### Workspace Totals After Session A

| Metric   | Before  | After   |
| -------- | ------- | ------- |
| Crates   | 5       | 8       |
| Rust LOC | ~7,200  | 9,853   |
| Tests    | 58      | 101     |
| Commits  | bd61612 | aa2cdd6 |

All quality gates passing: `cargo fmt`, `cargo clippy -D warnings`, `cargo test --workspace`.

---

## Session G — 2026-04-19 (P0 Complete + P1 Provider Management)

**Goal:** Complete P0 remaining tasks and implement P1 Provider Management.

### What was done

1. **P0-5: Tauri Capabilities**
   - `capabilities/default.json`: added shell, dialog, fs permissions
   - CSP connect-src: 15+ provider domains including localhost for Ollama

2. **P1-1: Provider CRUD IPC** — 4 Tauri commands (list/get/upsert/delete)
3. **P1-2: API Key Encryption** — `devpilot-store/crypto`: AES-256-GCM, machine-specific key
4. **P1-3: CSP Update** — 15+ provider domains
5. **P1-4: Provider Hydration** — `providerStore.hydrateFromBackend()` on startup

### Stats

| Metric   | Before  | After   |
| -------- | ------- | ------- |
| IPC Cmds | 37      | 42      |
| Tests    | 155     | 159     |
| Commits  | 6b8e263 | 1f49ee6 |

All quality gates passing.

---

## Session H — 2026-04-19 (P2 Checkpoint + Context + Usage)

**Goal:** Implement P2 advanced features — context compaction, checkpoint/rewind, streaming usage.

### P2-1: Context Compaction

- `compact_session` Tauri IPC command in `commands/mod.rs`
- Uses `devpilot-core::compact::compact_messages` with Summarize strategy
- Store: `delete_session_messages()` helper for compaction
- Frontend: `/compact` slash command → real backend call
  - Reloads messages from DB after compaction
  - Shows messages removed count and summary status

### P2-2: Checkpoint / Rewind

- Store: `CheckpointInfo` type with camelCase serde
- Store: `checkpoints` table migration (id, session_id, message_id, summary, token_count, created_at)
- Store: checkpoint CRUD methods (create, list, get, delete, delete_session_checkpoints)
- Store: `rewind_to_checkpoint()` — deletes messages + newer checkpoints
- Tauri IPC: `create_checkpoint`, `list_checkpoints`, `rewind_checkpoint` commands
- Registered in `lib.rs` invoke_handler (45 total)

### P2-4: Streaming Usage Tracking

- Persist usage to DB after `stream_done` event in `llm.rs`
- Uses existing `Store::add_usage()` upsert with daily aggregation

### Modified Files

| 文件                                 | 变更                                         |
| ------------------------------------ | -------------------------------------------- |
| `crates/devpilot-store/src/store.rs` | +122 行: Checkpoint CRUD + compaction helper |
| `crates/devpilot-store/src/types.rs` | +12 行: CheckpointInfo 类型                  |
| `src-tauri/src/commands/llm.rs`      | +22 行: stream_done 持久化 usage             |
| `src-tauri/src/commands/mod.rs`      | +150 行: compact + checkpoint IPC commands   |
| `src-tauri/src/lib.rs`               | +6 行: 注册新命令                            |
| `src/stores/chatStore.ts`            | +76 行: /compact 前端逻辑                    |

### Stats

| Metric   | Before  | After   |
| -------- | ------- | ------- |
| IPC Cmds | 42      | 45      |
| Rust LOC | ~11,848 | ~12,350 |
| Commit   | 1f49ee6 | 852a0d5 |

All quality gates passing: `cargo build`, `cargo test --workspace`, `tsc --noEmit`.

---

## Session I — 2026-04-19 (P2-3 MCP Client + Tests)

**Goal:** Implement MCP (Model Context Protocol) client with stdio/SSE transport, tool discovery, and full test coverage.

### P2-3: MCP Client

**Implementation:**

1. **devpilot-mcp crate** (new, ~730 lines)
   - `McpTransport` trait: bidirectional JSON-RPC transport abstraction
   - `StdioTransport`: spawns child process, communicates over stdin/stdout (newline-delimited JSON)
   - `SseTransport`: connects to remote HTTP endpoint via reqwest
   - `McpClient`: individual server connection — initialize handshake, tool discovery, tool execution
   - `McpManager`: manages multiple MCP servers, registers discovered tools into `ToolRegistry`
   - `McpProxyTool`: adapts MCP tools into devpilot `Tool` trait for agent loop integration
   - Tool naming convention: `mcp__<server_id>__<tool_name>`

2. **SQLite persistence**
   - `mcp_servers` table: id, name, transport, command, args, url, env, enabled, created_at
   - Store: `list_mcp_servers`, `get_mcp_server`, `upsert_mcp_server`, `delete_mcp_server`
   - `McpServerRecord` type with camelCase serde

3. **Tauri IPC** (6 new commands, 51 total)
   - `list_mcp_servers`, `upsert_mcp_server`, `delete_mcp_server`
   - `mcp_connect_server`, `mcp_disconnect_server`, `mcp_list_connected`

4. **AppState integration**
   - `mcp_manager: Arc<AsyncMutex<Option<McpManager>>>`

5. **32 unit tests**
   - transport: 10 tests (serde roundtrip, SSE lifecycle, stdio spawn failure, JSON-RPC serialization)
   - client: 11 tests (MockTransport, initialize/discover, tool definitions, call_tool, serde, accessors)
   - manager: 6 tests (new/connect/disconnect/shutdown lifecycle)
   - error: 9 tests (Display trait for all error variants)

6. **Warning fixes**
   - scheduler: unused `mut` and variable in `duplicate_task_rejected` test
   - sandbox: unused `ResourceLimits` import in test module

### Stats

| Metric   | Before  | After |
| -------- | ------- | ----- |
| Crates   | 10      | 11    |
| Tests    | 159     | 192   |
| IPC Cmds | 45      | 51    |
| Commit   | 852a0d5 | HEAD  |

All quality gates: `cargo build`, `cargo clippy`, `cargo test --workspace` — all passing, zero warnings.

## Session J — 2026-04-19 (P3-5 Checkpoint 前端 UI)

**Goal:** Build the frontend Checkpoint panel — list checkpoints, rewind to a previous state, create manual checkpoints.

### P3-5: Checkpoint Frontend UI

**Backend already complete:**

- Store: `create_checkpoint`, `list_checkpoints`, `rewind_to_checkpoint`
- IPC: `create_checkpoint`, `list_checkpoints`, `rewind_checkpoint` commands registered

**Frontend work:**

1. `src/types/index.ts` — `CheckpointInfo` type added
2. `src/lib/ipc.ts` — mock cases for checkpoint commands
3. `src/stores/checkpointStore.ts` — Zustand store for checkpoint state
4. `src/components/chat/CheckpointPanel.tsx` — timeline panel UI
5. `src/components/chat/ChatPanel.tsx` — integrate CheckpointPanel
6. i18n — checkpoint-related keys

### Status: Complete — committed as `7d7d304`

**Files created/modified:**

- `src/types/index.ts` — CheckpointInfo interface
- `src/stores/checkpointStore.ts` — Zustand store (load/create/rewind + error handling)
- `src/components/chat/CheckpointPanel.tsx` — side panel with timeline + rewind buttons
- `src/components/chat/ChatPanel.tsx` — History icon toggle + CheckpointPanel integration
- `src/lib/ipc.ts` — mock for list_checkpoints, create_checkpoint, rewind_checkpoint
- `src/i18n/en.ts` + `zh.ts` — 8 checkpoint-related keys
- `TODO.md` — P3-5 marked done, cleaned duplicates
- `docs/DEVLOG.md` — Session J record

**QA:** tsc --noEmit zero errors, cargo test --workspace all pass, ESLint zero warnings

---

## Session K — 2026-04-19 (P3-2 + P3-3 i18n + Error Handling + Tests)

**Goal:** Polish Phase 4 — unified error handling, i18n coverage for SchedulerPage, frontend tests.

### P3-3: Unified Error Handling

1. `src/lib/errors.ts` — created unified error helpers:
   - `getErrorMessage(err)` — extract human-readable message from unknown error
   - `reportError(err, context?)` — console.error + toast.error in one call
   - `safeAsync(fn, context?)` — wraps async ops with [result, error] tuple

2. `src/lib/persistence.ts` — replaced all 7 `console.error` calls with `reportError()`:
   - `create_session`, `delete_session`, `update_session_title`, `archive_session`
   - `add_message`, `update_message_content`, `hydrateSessions`

3. `src/app/SchedulerPage.tsx` — replaced `console.error` with `reportError()`

### P3-2: i18n — SchedulerPage Hardcoded Strings

Replaced all hardcoded English strings in SchedulerPage with `t()` calls:

- "New Task" → `t("newTask")`
- "Cron Expression" → `t("cronExpression")`
- "Action Type" → `t("actionType")`
- "Shell Command" / "HTTP Request" / "Custom" → `t("shellCommand")` / `t("httpRequest")` / `t("customAction")`
- "Command" → `t("command")`
- "Max Executions (optional)" → `t("maxExecutionsOptional")`
- "Creating..." / "Create Task" → `t("creating")` / `t("createTask")`
- Added new keys: `httpMethod`, `httpHeaders`, `httpBody`, `customActionId`, `maxExecutionsUnlimited`
- Added error keys: `errorGeneric`, `errorPersistence`, `errorStream`, `errorCompact`, `errorProvider`

### P3-1: Frontend Tests (partial)

New test files:

1. `src/__tests__/lib/errors.test.ts` — 8 tests (getErrorMessage, reportError, safeAsync)
2. `src/__tests__/stores/schedulerStore.test.ts` — 6 tests (fetchTasks, createTask, removeTask, pauseTask, resumeTask)
3. `src/__tests__/stores/checkpointStore.test.ts` — 7 tests (loadCheckpoints, createCheckpoint, rewindCheckpoint, clear)

**Total frontend tests: 100 across 9 files, all passing**

### Stats

| Metric         | Before        | After         |
| -------------- | ------------- | ------------- |
| Frontend tests | 79 (6 files)  | 100 (9 files) |
| i18n keys      | 236 (EN + CN) | 249 (EN + CN) |
| Files          | 52            | 55            |

**QA:** `tsc --noEmit` zero errors, `vitest run` 100/100 pass, `cargo build` + `cargo clippy` clean

---

## Session L — 2026-04-19 (文档更新 + P3-1 前端测试)

**Goal:** 更新项目文档，补充 P3-1 前端测试（persistence + streaming）。

### P3-1: 前端测试补充

1. `src/__tests__/lib/persistence.test.ts` — 26 tests (save/load/delete session, save/load messages, settings CRUD, provider hydration)
2. `src/__tests__/stores/streaming.test.ts` — 16 tests (mock streaming path: chunk accumulation, abort, tool events, error handling, done event)

**Frontend tests: 142 across 11 files, all passing**

---

## Session M — 2026-04-19 (P3-4 E2E 集成测试)

**Goal:** 完成 P3-4 E2E 集成测试，使用 `Store::open_in_memory()` 测试完整 IPC 数据路径。

### P3-4: E2E 集成测试 ✅

**文件:** `src-tauri/tests/e2e_test.rs` — 10 tests

1. `test_session_crud_lifecycle` — create → get → list → update title → delete
2. `test_message_crud_lifecycle` — add user/assistant → list → update content
3. `test_settings_crud` — set → get → list → upsert → missing key
4. `test_provider_lifecycle_with_encryption` — upsert with key → list → decrypt → delete
5. `test_checkpoint_create_list_rewind` — 4 msgs → checkpoint → rewind → verify cleanup
6. `test_multi_session_isolation` — 2 sessions, messages isolated, delete cascade
7. `test_full_chat_flow` — session → messages → checkpoint → continue → rewind → update title
8. `test_multiple_providers` — 2 providers, mixed API key state
9. `test_settings_unicode_and_long_values` — Unicode keys/values, long JSON config
10. `test_session_with_working_dir_and_mode` — default mode "code", tool-use/tool-result messages

**关键发现:** `create_session` 默认 mode 是 `"code"` 而非 `"agent"`

**Total tests:** 202 Rust (192 crate + 10 E2E) + 142 frontend = **344 tests, all passing**

---

## Session N — 2026-04-19 (P4 开始 — 清理 + 面板真实化)

**Goal:** Phase 4 实用化 — 清理 dead code，核心面板接入真实 IPC。

### P4-13: Dead Code 清除 (2c6d966)

- 删除 `src/hooks/useTauri.ts` (254行) — 旧版 mock 流式实现
- 删除 `src/components/layout/Header.tsx` (76行) — 被 TopBar 替代的旧组件
- 移除 `App.tsx` 中重复的 `useKeyboardShortcuts` 注册
- 更新 TODO.md

### Fix: TypeScript 编译错误 (83ef696)

- `types/index.ts`: Message role 添加 `"system"` 变体
- `uiStore.ts`: 添加 `previewFile`/`setPreviewFile` 实现
- `FileTree.tsx`: 真实文件树实现 — 展开/折叠目录 + search_files IPC
- 测试修复: void unused sessionId, non-null assertions

### P4-1 + P4-7 + P4-8: 核心面板真实化 (556d11c)

1. **TerminalPanel** — 接入 `sandbox_execute` IPC
   - 彩色 stdout (白) / stderr (红) 输出
   - 显示 exit code
   - 命令历史 + 输入框

2. **工作目录选择器** — TopBar 原生 folder picker
   - Tauri `dialog::open()` 原生对话框
   - 选中目录显示在 TopBar
   - 通过 chatStore 传递给 agent

3. **System Prompt 编辑器** — ChatPanel 可折叠区域
   - 消息输入框上方可折叠文本区
   - 输入内容作为 system message 注入消息流
   - chatStore: `setSystemPrompt()` + 注入逻辑

4. **i18n**: 5 个新 key (systemPrompt, systemPromptPlaceholder, selectWorkingDir, workingDirectory, refresh)

### Stats

| Metric         | Before (587aa31) | After (556d11c)     |
| -------------- | ---------------- | ------------------- |
| P4 tasks done  | 0/15             | 5/15                |
| Files changed  | —                | 18 files, +371 -402 |
| Rust tests     | 202              | 202                 |
| Frontend tests | 142              | 142                 |
| tsc --noEmit   | clean            | clean               |

**QA:** `cargo test --workspace` 202 pass, `vitest run` 142 pass, `tsc --noEmit` clean, `cargo clippy` clean

## 2026-04-19 Session I — P4 Practicalization (5/15 → 15/15 完成)

### Goal

完成 P4 剩余实用功能：文件预览、流事件补全、会话导出、MCP 管理、字体大小、沙箱策略、i18n 修补。

### P4-3: PreviewPanel 文件预览 ✅

- PreviewPanel 接入 `sandbox_execute` IPC（`cat` 命令）读取真实文件
- FileTree 点击文件 → `uiStore.setPreviewFile()` → PreviewPanel 加载
- Monaco Editor 自动语言检测（根据扩展名映射 20+ 语言）
- Loading / Error 状态处理
- Diff 模式占位符（未来 P5）

### P4-4 ~ P4-6: 流事件 + 工具调用渲染 ✅

- chatStore 已覆盖 6/7 流事件，补全 `stream-compacted` 监听
- context 压缩时自动 `loadMessages()` 重载消息列表
- ToolCallView 已渲染工具名称 + 参数 + 结果

### P4-9: 会话导出 ✅

- Sidebar 导出按钮 → JSON / Markdown 两种格式
- Blob 下载方案（不依赖 Tauri 文件对话框）
- chatStore `exportSession()` 方法

### P4-10: MCP Server 管理 ✅

- 新增 `mcpStore.ts`：Zustand store，8 个 action，6 个 IPC mock handler
- 新增 `McpServerConfig` 类型（types/index.ts）
- SettingsPage 新增 MCP 标签页：
  - Server 列表 + Add/Edit 表单
  - stdio / SSE 传输模式切换
  - Connect / Disconnect 按钮
  - Delete 确认
- 18 个 i18n key（EN + CN）
- ESLint 修复：McpServerConfig 类型替代 any，useCallback deps

### P4-13 + P4-14: 版本号 + 窗口标题 ✅

- tauri.conf.json: version `0.1.0` → `0.4.0`, title → `DevPilot — AI Coding Agent`
- Cargo.toml: version `0.1.0` → `0.4.0`

### P4-11: 字体大小调整 ✅

- uiStore 已有 `fontSize` (12-18, default 14) + `setFontSize` + clamping
- AppearanceTab 已有 slider 控件（range input 12~18, step 1）
- **关键修复**: MessageBubble 从硬编码 `text-sm` 改为 `style={{ fontSize }}`
  - 用户气泡 (user bubble) ✅
  - 助手气泡 (assistant markdown) ✅
  - import useUIStore added

### P4-12: Sandbox 策略选择 ✅

- SecurityTab 完整实现：Default/Permissive/Strict 三档 radio selector
  - Default: 工作目录读写, 禁止网络, 60s 超时
  - Permissive: 完整文件系统+网络, 120s 超时
  - Strict: 只读, 禁止网络, 30s 超时
- TerminalPanel `sandbox_execute` 调用已改为读取 `useUIStore.getState().sandboxPolicy`
- 12 个 i18n key (EN + CN): security, sandboxPolicy, sandbox\*Desc

### P4-15: i18n 修补 ✅

- 补全缺失 key: `messages` ("messages" / "条消息")
- 全量扫描：189 used keys vs 264 defined keys → 0 missing

### Stats

| Metric         | Before (556d11c) | Current   |
| -------------- | ---------------- | --------- |
| P4 tasks done  | 5/15             | **15/15** |
| Files changed  | —                | ~35 files |
| Rust tests     | 202              | 202       |
| Frontend tests | 142              | 142       |
| i18n keys      | ~240             | **264**   |
| Version        | 0.1.0            | 0.4.0     |

**QA:** `cargo test --workspace` 202 pass, `vitest run` 142 pass, `tsc --noEmit` clean, ESLint 0 errors

---

## Session O: P5 Persistence Layer / P5 持久化层

**Goal:** Add SQLite persistence for Phase 5 features (bridge, scheduler, media) to complement the existing in-memory managers.

### P5-1: Store Types & Migrations ✅

- Added `BridgeChannelRecord`, `ScheduledTaskRecord`, `TaskRunRecord`, `MediaGenerationRecord` to `devpilot-store/src/types.rs`
- Added 4 new DB migrations: `bridge_channels`, `scheduled_tasks`, `task_runs`, `media_generations`
- All tables follow PRD schema with proper CHECK constraints, FK cascades, and indexes

### P5-2: Store CRUD Methods ✅

- Bridge: `list_bridge_channels`, `get_bridge_channel`, `upsert_bridge_channel`, `delete_bridge_channel`, `update_bridge_channel_status`
- Scheduler: `list_scheduled_tasks`, `get_scheduled_task`, `upsert_scheduled_task`, `delete_scheduled_task`, `update_task_run_times`
- Task Runs: `create_task_run`, `list_task_runs`, `update_task_run`
- Media: `list_media_generations`, `get_media_generation`, `create_media_generation`, `update_media_generation`, `update_media_generation_tags`, `delete_media_generation`

### P5-3: Tauri Persistence Commands ✅

- Bridge: `bridge_save`, `bridge_list_saved`, `bridge_delete_saved`, `bridge_update_status`
- Scheduler: `scheduler_save_task`, `scheduler_list_saved`, `scheduler_delete_saved`, `scheduler_save_run`, `scheduler_list_runs`
- Media: `media_save`, `media_list_saved`, `media_get`, `media_update_status`, `media_update_tags`, `media_delete`
- All 14 new commands registered in `invoke_handler`

### P5-4: Frontend Store Persistence Integration ✅

- `bridgeStore.ts`: Added `BridgeChannelRecord` type, `savedChannels` state, `fetchSavedChannels`, `saveChannel`, `deleteSavedChannel`, `updateChannelStatus`
- `schedulerStore.ts`: Added `ScheduledTaskRecord`, `TaskRunRecord` types, `savedTasks`, `taskRuns` state, `fetchSavedTasks`, `fetchTaskRuns`, `saveTask`, `deleteSavedTask`, `saveRun`
- `mediaStore.ts`: Added `MediaGenerationRecord` type, `savedGenerations` state, `fetchSavedGenerations`, `saveGeneration`, `updateGenerationStatus`, `updateGenerationTags`, `deleteGeneration`

### P5-5: Store Tests ✅

- `test_bridge_channels_crud`: Create, get, update, status update, delete
- `test_scheduled_tasks_crud`: Create, get, update run times, delete
- `test_task_runs_crud`: Create, update to done, cascade delete
- `test_media_generations_crud`: Create, get, update status, update tags, delete

### Stats

| Metric         | Before (67dde96) | Current |
| -------------- | ---------------- | ------- |
| Rust tests     | 230              | **234** |
| Frontend tests | 142              | 142     |
| Tauri commands | 57               | **71**  |
| DB tables      | 7                | **11**  |

**QA:** `cargo test --workspace` 234 pass, `vitest run` 142 pass, `cargo clippy -D warnings` clean, `npm run build` clean

---

## 2026-04-20 Session Q — Phase 8 UI 自适应 + Provider 增强

### Goal

改善 DevPilot 界面在全屏/不同分辨率下的自适应表现，参考 Codex CLI 和 CodePilot 的设计。

### P8-1: AppShell 重构 ✅

- Sidebar 改为始终渲染（条件 class 切换），消除 toggle 时的布局跳跃
- 导入 `cn` 工具函数做 class 合并

### P8-2: TopBar 自适应 ✅

- WorkingDir selector: `hidden lg:block` — 窄屏隐藏
- ReasoningEffort: `hidden md:block` — 中等屏隐藏
- 间距从 `gap-2` 缩为 `gap-1`

### P8-3: MessageList/Input 全屏自适应 ✅

- `max-w-3xl` → `max-w-4xl 2xl:max-w-5xl`
- 大屏幕下聊天内容区域更宽

### P8-4: CheckpointPanel Overlay ✅

- 从 flex 内联改为 absolute overlay
- 添加 `backdrop-blur-sm` + `slide-in-from-right` 动画
- 不再挤压聊天区域宽度

### P8-5: SplitView Min-Width 保护 ✅

- 左面板 min-width: 280px
- 右面板 min-width: 200px
- 防止拖拽时面板被挤压到不可见

### P8-6: Terminal 主题跟随 ✅

- 消除所有硬编码颜色 (#1a1b26, #16161e)
- 改用 CSS 变量 (--background, --card, --muted, --accent)
- Terminal 字体颜色根据 oklch 亮度自动选择前景色
- 外层 div: `bg-card`, tab bar: `bg-muted/50`, hover: `bg-accent`

### P8-7: CSS 润色 ✅

- Scrollbar: 5px 宽, oklch alpha 25%/50% 渐变
- `.prose-sm`: line-height 1.65, blockquote primary tint
- `button:focus-visible`: 2px ring outline
- `.empty-pattern`: 点状背景图（空状态页面）
- `.slide-in-from-right`: CheckpointPanel 滑入动画
- `.transition-layout`: 宽高变化过渡

### P8-8~11: 其他增强 (prior sessions) ✅

- Provider 健康诊断系统 (DiagnosticReport + diagnoseProvider)
- LLM 指数退避重试
- Kimi / MiniMax / VolcEngine (Doubao) 中国 Provider
- Google Gemini 原生 API + 多模态图片附件

### Stats

| Metric         | Before (56c2a51) | Current      |
| -------------- | ---------------- | ------------ |
| Frontend tests | 142              | **145**      |
| Files changed  | -                | **13 files** |
| Lines added    | -                | **+219**     |
| Lines removed  | -                | **-54**      |

**QA:** `npx tsc --noEmit` clean (only pre-existing SettingsPage warnings), `npx vitest run` 145 pass

---

## Session R — 2026-04-20 (P9 UI 密度优化)

**Goal:** 解决 "太拥挤" 问题，参考 CodePilot 的间距设计系统，全面优化 DevPilot UI 密度。

### 设计参考: CodePilot 间距分析

- NavRail: 52px icon sidebar, gap-2 items, px-2 padding
- ChatListPanel: 280px width, p-3 section headers, gap-1 list items
- TopBar: 48px height, px-4, gap-2, text-xs secondary labels
- Chat: p-4 per message, gap-6 between messages, max-w-2xl (672px) — 故意收窄
- 间距体系: 4/8/12/16/24px scale

### P9-1: TopBar 减密度

- 高度 h-11→h-12, 间距 gap-1.5→gap-2, 内边距 px-2→px-3
- 移除 overflow-hidden, 允许自然呼吸
- Model Selector: 移除 border, 改 text-foreground/80 ghost 风格
- Mode Tabs: border→bg-muted/50 圆角胶囊背景, px-2.5→px-3
- 全部分割线 bg-border→bg-border/40 半透明

### P9-2: Sidebar 毛玻璃

- 背景 bg-sidebar→bg-sidebar/80 + backdrop-blur-sm 毛玻璃效果
- 搜索框 border border-input→bg-muted/50 无边框更干净
- 会话列表项 gap-2→gap-2.5, px-2→px-2.5, py-1.5→py-2
- 底部工具栏 border→border/40

### P9-3: MessageList 间距

- 消息间距 space-y-6→space-y-8, 容器 py-6→py-8, px-4→px-6
- 聊天宽度 max-w-4xl→max-w-3xl (2xl:max-w-4xl) — 收窄提升可读性
- Assistant/Tool 消息 gap-2.5→gap-3
- Suggestion cards p-3→p-4, border→border/40
- Tool 消息边框 border→border/40, bg-muted/50→bg-muted/30 更淡

### P9-4: MessageInput 磨砂浮层

- bg-background→bg-background/80 + backdrop-blur-md
- border-t border→border/40
- max-width 跟随 MessageList: max-w-3xl (2xl:max-w-4xl)

### P9-5: 全局边框柔化

- ChatPanel: loading/error/approval/systemPrompt 区域 border→border/40
- Checkpoint 按钮 border→border/40
- 视觉效果: 分割线若隐若现, 减少视觉噪音

### Stats

| Metric          | Before (P8) | After (P9)  |
| --------------- | ----------- | ----------- |
| TopBar height   | h-11 (44px) | h-12 (48px) |
| TopBar gap      | gap-1.5     | gap-2       |
| Message spacing | space-y-6   | space-y-8   |
| Chat max-width  | max-w-4xl   | max-w-3xl   |
| Frontend tests  | 145         | **146**     |
| Files changed   | —           | **7 files** |

**QA:** `npx tsc --noEmit` clean, `npx vitest run` 146 pass
