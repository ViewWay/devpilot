# DevPilot Changelog

All notable changes to DevPilot will be documented in this file.

## [0.5.5] — 2026-04-21

### Added

- **P13: MCP Plugin System** — remote marketplace catalog with built-in fallback, `McpCatalogEntry` types (category, env vars, version)
- `McpClient.tool_count()` + `connected_servers_detail()` — display tool counts per connected server
- **Provider Diagnostics** — `DiagnosticReportPanel` in Settings with severity badges, latency, model count
- `fetch_mcp_catalog` Tauri command fetching from GitHub raw JSON with graceful fallback

### Fixed

- **FIX-7**: chatStore `cleanup`/`flushStreamBuffers` moved outside `try{}` block — visible to `catch{}` in strict TS
- Remove unused imports (`Search`, `ExternalLink`, `RefreshCw`) from SettingsPage
- Fix `eqeqeq` ESLint error (`!=` → `!==`)

## [0.5.4] — 2026-04-21

### Fixed

- **FIX-5**: UpdateChecker no longer renders as flex child beside main content — now uses `fixed` position at top of viewport
- **FIX-6**: chatStore `isLoading` stuck on Tauri invoke failure — catch block now cleans up event listeners + resets loading state
- Archive/unarchive sessions now use native Rust commands (`archive_session`/`unarchive_session`) instead of settings table workaround

### Added

- Global `ErrorBoundary` component wrapping entire App — prevents white-screen crashes on unhandled component errors, shows retry button
- `archive_session`/`unarchive_session` Rust commands in `devpilot-store` with proper `archived_at` column usage
- i18n keys: `retry`, `restartApp` (EN + CN)

## [0.5.3] — 2026-04-21

### Added

- **Test Coverage Improvements**
  - 4 new frontend test files: ThinkingBlock (3 tests), ToastContainer (6 tests), systemPrompt (12 tests), utils (28 tests)
  - 12 new Rust tests for `LlmError` (is_retryable + display_message coverage)
  - Total test count: 374 frontend + 430 Rust = 804 tests passing
  - Frontend test suite: 24 files, 0 failures

### Fixed

- Fix `advanceTimersByTime` TypeScript error in ToastContainer test — replaced with store-based dismiss test
- Fix unused imports (`beforeEach`, `userEvent`) in test files — clean `tsc -b` + ESLint pass
- Fix `no-constant-binary-expression` ESLint error in utils test

## [0.5.2] — 2026-04-21

### Added

- **P13: MCP Server Presets (Marketplace Foundation)**
  - 10 curated MCP server presets for one-click quick-add: Filesystem, GitHub, Memory, Fetch, PostgreSQL, SQLite, Brave Search, Puppeteer, Sentry, Everything
  - Grid-based preset browser in Settings → MCP tab with emoji icons, descriptions, and Add/Added state
  - Auto-detection of already-installed presets (disabled "Added" button)
  - 24 new i18n keys (EN + CN) for preset names, descriptions, and UI labels

### Fixed

- **MCP Connect IPC Bug** — `mcp_connect_server` Tauri command now accepts `id: String` and looks up the server record from SQLite, matching the frontend `mcpStore.connect(id)` call signature (previously expected full `McpServerRecord` from frontend, causing deserialization failure)

## [0.5.1] — 2026-04-21

### Added

- **Frontend Provider Catalog: Kimi, MiniMax, VolcEngine**
  - Added Kimi (月之暗面/Moonshot AI) provider with Moonshot V1 8K/32K/128K models
  - Added MiniMax provider with MiniMax-Text-01 and ABAB 6.5s Chat models
  - Added VolcEngine (火山引擎/豆包) provider with Doubao 1.5 Pro and Lite models
  - Updated `mapProviderType()` in `src/lib/utils.ts` to route kimi, minimax, volcengine IDs to correct backend ProviderType
  - Frontend catalog now matches backend `devpilot-llm/chinese.rs` model definitions (all 11 Chinese providers available)

### Fixed

- Sidebar test missing `GALLERY_TAB_ID` and `BRIDGE_TAB_ID` mocks

## [0.5.0] — 2026-04-21

### Added

- **P11: Split View / Dual Session Polish**
  - Migrated `DualSessionSplitView` to cc-haha CSS design tokens (replaced old `border-border`, `bg-primary` classes)
  - Migrated `SessionPanelView` to cc-haha CSS design tokens — consistent visual style with the rest of the app
  - Added session switcher dropdown in secondary split panel — users can switch which session appears in the right panel
  - Polished secondary panel header with backdrop blur, hover states, and visual consistency

- **P10-B: LLM Streaming Pipeline Optimization**
  - Backend: text delta batching in agent loop (flush interval instead of per-chunk emit)
  - Backend: `cancel_stream` Tauri command — aborts running agent task via `AbortHandle` stored in `AppState.active_streams`
  - Frontend: chunk batching in `chatStore.ts` — accumulate deltas in mutable buffer, flush to Zustand store every 16ms via `setTimeout`, reducing immutable state tree clones from ~40-50/sec to ~60/sec
  - Frontend: `abortStreaming()` now calls `cancel_stream` to propagate cancellation to the Rust backend
  - `Usage` struct in `devpilot-protocol` now serializes with `camelCase` (`inputTokens`, `outputTokens`, etc.)
  - IPC mock for `cancel_stream` in browser dev mode
- **P10 UI Rewrite** — Complete visual overhaul matching cc-haha design system
  - CSS design system: oklch color tokens, Material Symbols icons, Inter/Manrope/JetBrains Mono fonts
  - `tabStore` for multi-tab session management with drag-reorder
  - `TabBar` component with session tabs (returns null when no tabs open)
  - `ContentRouter` for tab-based content routing
  - `AppShell` layout with Sidebar + ContentRouter
  - Rewritten `Sidebar` matching cc-haha style: nav buttons, search, time-grouped sessions
  - Migrated all chat components (ChatInput, MessageList, ChatPanel) to cc-haha CSS variables
  - Migrated remaining components to semantic design tokens (ToastContainer, ApprovalOverlay, UpdateChecker, DiffView, ToolCallView, TerminalPanel)
  - All 33 component files now fully tokenized — no hardcoded colors remain
  - Removed react-router dependency (replaced with tabStore navigation)
  - `useKeyboardShortcuts` rewritten to use tabStore

### Fixed

- Empty page on startup: `useNavigate()` called outside `<BrowserRouter>` — rewrote to use tabStore
- Double line number prefix corruption in ModelSelector.tsx and CodeBlockInner.tsx
- Sidebar session grouping now uses ISO string timestamps correctly
- Onboarding wizard stuck after completion — `getState()` replaced with Zustand hook subscription so `completed` state changes trigger re-render
- Tailwind 4 build failure: `border-border` and other shadcn utilities unknown — added semantic color aliases in `@theme` block
- OnboardingWizard buttons invisible — `--color-accent` (undefined) replaced with `--color-brand`
- SettingsPage ConfigTab ESLint warning — `loadConfig` wrapped in `useCallback`

### Changed

- 24 files changed, +2244 / -1005 lines
- index.css replaced with cc-haha globals.css (oklch color tokens, Tailwind v4)
- Approval gate system for tool execution (backend, P9)

## [0.4.0] — 2026-04-19

### Added

- UI density optimization — CodePilot-inspired spacious spacing
- Frosted glass effects on input and sidebar
- Softened borders with reduced opacity
- Approval gate system for tool execution

## [0.3.0] — 2026-04-18

### Added

- Sandbox execution environment
- LLM streaming support
- Message rendering improvements

## [0.2.0] — 2026-04-15

### Added

- Multi-provider LLM client (OpenAI, Anthropic, etc.)
- Terminal emulator integration
- Code editor (Monaco)
- Settings page

## [0.1.0] — 2026-04-10

### Added

- Initial release
- Basic chat with agent loop
- SQLite persistence
- i18n (EN + CN)
