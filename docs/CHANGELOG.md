# DevPilot Changelog

All notable changes to DevPilot will be documented in this file.

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
