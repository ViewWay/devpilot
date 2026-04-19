# DevPilot Development Log

## 2026-04-19 Session C — Frontend Integration (commit 40fdf06 →)

### Goal

Connect React frontend to the 10-crate backend: routing, new panels, IPC bindings.

### Phase 6: Router + SchedulerPanel + GalleryPanel

**Goal:** Add page routing system and build the two major missing panels.

**Implementation:**

- (pending)

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

**Additional fix:** `src-tauri/src/commands/mod.rs` — removed `get_session_usage` IPC handler that called the deleted method. Also removed from `src-tauri/src/lib.rs` handler registration.

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
3. **Test relative paths** — `cargo test` runs from `target/` dir, relative paths like `crates/devpilot-search/src` don't resolve. Fixed with `CARGO_MANIFEST_DIR` + double `.parent()` traversal.
4. **Missing tempfile dev-dependency** — content.rs tests use `tempfile::NamedTempFile`. Added `tempfile = "3"` to `[dev-dependencies]`.

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

1. **Schedule not Default** — `cron::Schedule` doesn't implement `Default`, so `TaskDef` couldn't derive it. Fixed by removing `#[derive(Default)]` and storing `cron_expr: String` instead of `Schedule` directly. Schedule parsed on-demand via `fn schedule(&self)`.
2. **Unused imports** — `TaskAction`, `TaskId` imported but unused after refactor. Fixed by `cargo clippy --fix`.

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
