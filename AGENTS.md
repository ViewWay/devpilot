# DevPilot — AI Coding Agent Desktop Client

## Project Overview

DevPilot is a multi-model AI coding agent desktop app built with **Tauri 2 (Rust) + React 19**.

### Key Tech Stack
- **Desktop Shell**: Tauri 2 (Rust)
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS 4 + Radix UI
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
│   └── devpilot-search/  # File search (fuzzy + content)
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

## Development Conventions

- Rust: `cargo fmt` + `cargo clippy` (deny warnings)
- TypeScript: ESLint + Prettier
- Testing: `cargo test` (Rust) + Vitest (TS)
- Commits: conventional commits (feat:, fix:, chore:, etc.)
- i18n: All user-facing strings must use i18n keys (EN + CN)
