# DevPilot TODO

## Completed

- [x] **P0** — Agent Loop + DB persistence + Tauri IPC bridge
- [x] **P1** — Tool system (shell, file ops, MCP)
- [x] **P2** — Multi-provider LLM client
- [x] **P3** — Session management + history
- [x] **P4** — Terminal emulator (xterm.js + portable-pty)
- [x] **P5** — Code editor (Monaco)
- [x] **P6** — Settings page + model config
- [x] **P7** — i18n (EN + CN)
- [x] **P8** — Sandbox execution + streaming
- [x] **P9** — UI density optimization + approval gate backend
- [x] **P10-1** — cc-haha CSS/fonts design system migration
- [x] **P10-2** — tabStore + AppShell + TabBar + ContentRouter
- [x] **P10-3** — Fix empty page (react-router removal)
- [x] **P10-4** — Sidebar rewrite (cc-haha style)
- [x] **P10-5** — ChatInput + MessageList + ChatPanel CSS migration
- [x] **P10** — Full UI rewrite matching cc-haha design system (all components migrated)
- [x] **P10-B** — LLM streaming optimization (backend batching, frontend chunk batching, abort/cancellation)
- [x] **P11-1** — DualSessionSplitView + SessionPanelView cc-haha CSS migration + session switcher
- [x] **P11** — Split view / dual session polish (swap sessions ✅, drag-to-reorder ✅)
- [x] **P12** — Bridge (Telegram/Feishu) integration (5 platforms, Tauri commands, bridgeStore, SettingsPage bridge tab, BridgePage)
- [x] **P13** — MCP Plugin System: presets + remote catalog + tool_count + provider diagnostics

## Upcoming

- [ ] **P14** — Session export/import (JSON/Markdown)
- [ ] **P15** — Keyboard shortcuts + command palette (Cmd+K)
- [ ] **P16** — Multi-file attachment support (images, PDFs via vision)

## Fixes & Improvements (unreleased)

- [x] **FIX-1** — Onboarding wizard stuck: `useOnboardingStore.getState()` → hook subscription (rules-of-hooks + reactivity)
- [x] **FIX-2** — Tailwind 4 build failure: `border-border` unknown utility — added semantic color aliases in `@theme` block
- [x] **FIX-3** — OnboardingWizard invisible buttons: `--color-accent` undefined → `--color-brand`
- [x] **FIX-4** — Settings ConfigTab: `useCallback` for exhaustive-deps
- [x] **FIX-5** — UpdateChecker rendering as flex child beside main content → fixed position banner
- [x] **FIX-6** — chatStore isLoading stuck: catch block now cleans up listeners + resets state on Tauri invoke failure
- [x] **FIX-7** — chatStore cleanup scope: moved cleanup/flushStreamBuffers outside try block for strict TS
- [x] **FEAT** — ConfigTab: global config file management in Settings page
- [x] **FEAT** — Global ErrorBoundary: prevent white-screen crashes on component errors
- [x] **FEAT** — Native archive/unarchive_session: Rust commands replacing settings table hack
- [x] **FEAT** — MCP marketplace: remote catalog fetch with built-in fallback
- [x] **FEAT** — MCP tool_count: McpClient.tool_count() + connected_servers_detail()
- [x] **FEAT** — Provider diagnostics: DiagnosticReportPanel with severity badges
