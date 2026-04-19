# DevPilot Changelog

All notable changes to DevPilot will be documented in this file.

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
