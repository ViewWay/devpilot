# DevPilot — AI Coding Agent Desktop Client

> **MANDATORY**: Before any code change to this project, load skill `tauri-fullstack-dev`.
> After completing any feature/phase, load skill `project-doc-sync`.
> For any CSS/styling work, load skill `cc-haha-css-migration`.

## Project Overview

DevPilot is a multi-model AI coding agent desktop app built with **Tauri 2 (Rust) + React 19**.

### Key Tech Stack

- **Desktop Shell**: Tauri 2 (Rust)
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 + Radix UI (cc-haha oklch CSS custom properties)
- **Database**: SQLite via rusqlite
- **Terminal**: xterm.js + portable-pty (Rust)
- **Code Editor**: Monaco Editor
- **Syntax Highlighting**: Shiki
- **State Management**: Zustand

### Architecture

```
devpilot/
├── crates/               # Rust backend crates
│   ├── devpilot-core/    # Session, agent, event bus, compact
│   ├── devpilot-llm/     # Multi-provider LLM client
│   ├── devpilot-tools/   # Tool registry, shell, file ops, MCP
│   ├── devpilot-sandbox/ # Sandboxed command execution
│   ├── devpilot-store/   # SQLite persistence, config
│   ├── devpilot-bridge/  # IM bridge (Telegram, Feishu, etc.)
│   ├── devpilot-scheduler/ # Cron task scheduler
│   ├── devpilot-media/   # Image generation
│   ├── devpilot-protocol/ # Shared types
│   ├── devpilot-search/  # File search (fuzzy + content)
│   ├── devpilot-git/     # Git operations
│   ├── devpilot-agent/   # Agent orchestration
│   └── devpilot-index/   # Code indexing
├── src-tauri/            # Tauri app entry, IPC commands
├── src/                  # React frontend
│   ├── app/              # Pages (chat, settings, bridge, gallery)
│   ├── components/       # UI components (chat, terminal, editor, layout)
│   ├── hooks/            # React hooks
│   ├── stores/           # Zustand stores
│   ├── lib/              # Business logic
│   ├── types/            # TypeScript types
│   └── i18n/             # EN + CN
└── docs/                 # Documentation
```

### Crate Dependencies (MUST follow to avoid circular deps)

```
protocol ← {search, tools, llm, store}
tools → core
```

Shared types go in `devpilot-protocol`. Never import from a higher crate into a lower one.

## Development Conventions

- Rust: `cargo fmt` + `cargo clippy` (deny warnings)
- TypeScript: ESLint + Prettier
- Testing: `cargo test` (Rust) + Vitest (TS)
- Commits: conventional commits (feat:, fix:, chore:, etc.)
- i18n: All user-facing strings must use i18n keys (EN + CN)
- CSS: Use `var(--color-*)` custom properties, NOT Tailwind default colors

## Project Status

- **Phases 1-6, 15**: COMPLETE
- **Security hardening**: COMPLETE (path traversal, XSS, shell injection, command validation)
- **P2 features**: COMPLETE (DiffView+Shiki, streaming dual-mode, Mermaid fullscreen)
- **P12 (Git visualization)**: COMPLETE (StatusTab, LogTab, DiffTab, BranchesTab, worktree)
- **P13 (Editor deepening)**: COMPLETE (Monaco multi-file tabs, Ctrl+S/W, FileTree dblclick)
- **P14 (Collaboration & Sharing)**: COMPLETE (4-format export, Presets CRUD, Marketplace i18n)
- **Remaining**: P16 (release: signing, notarization, CI/CD)
- 12 LLM providers, 14 built-in tools, ~86 IPC commands, 15 workspace crates

## Security

Audit report: `SECURITY_AUDIT_REPORT.md` (project root)
Key modules: `path_security.rs`, `policy.rs`, DOMPurify in MarkdownRenderer, Mermaid strict mode.

## DevPilot-Specific Pitfalls

- **crate dep direction**: protocol is the bottom, nothing depends on tools, core depends on llm+tools
- **IPC camelCase**: Rust `#[serde(rename_all = "camelCase")]` → TS camelCase, Rust snake_case
- **patch truncation**: Always read_file after patching to verify no `...[truncated]` injected
- **SettingsPage.tsx**: Frequently accumulates unused imports — check before commit
- **tree-sitter**: Prefer regex over grammar crates (compile C, bloat build times)
