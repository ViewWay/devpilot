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
