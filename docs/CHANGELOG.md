# DevPilot Changelog

All notable changes to DevPilot will be documented in this file.

## [0.5.0] — 2026-04-21

### Added

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
