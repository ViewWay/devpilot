# Contributing to DevPilot

Thanks for your interest in contributing to DevPilot! This guide will help you get started.

## Development Setup

### Prerequisites

- **Rust** — `rustup` (stable toolchain)
- **Node.js** — v22+
- **Tauri CLI** — `cargo install tauri-cli`

### Quick Start

```bash
git clone https://github.com/ViewWay/devpilot.git
cd devpilot
npm ci
npm run tauri:dev
```

## Project Structure

```
devpilot/
├── crates/               # Rust backend crates
│   ├── devpilot-core/    # Session, agent, event bus
│   ├── devpilot-llm/     # Multi-provider LLM client
│   ├── devpilot-tools/   # Tool registry (14 built-in tools)
│   ├── devpilot-store/   # SQLite persistence
│   ├── devpilot-agent/   # Sub-agent, tasks, plan mode
│   ├── devpilot-protocol/ # Shared types
│   └── ...
├── src-tauri/            # Tauri app entry, IPC commands
├── src/                  # React frontend
│   ├── components/       # UI components
│   ├── stores/           # Zustand stores
│   ├── i18n/             # EN + ZH translations
│   └── lib/              # Business logic
└── docs/                 # Documentation
```

## Code Conventions

### Rust

- `cargo fmt` — always format before committing
- `cargo clippy --all-targets -- -D warnings` — zero warnings policy
- Conventional commits for all PRs

### TypeScript / React

- ESLint + Prettier enforced via husky + lint-staged
- All user-facing strings must use i18n keys (`t("key")`) in both `en.ts` and `zh.ts`
- Zustand for state management
- Tailwind CSS 4 + Radix UI for components

### Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(scope): description
fix(scope): description
chore(scope): description
docs(scope): description
```

Valid scopes: `ui`, `llm`, `tools`, `agent`, `store`, `mcp`, `terminal`, `i18n`, `ci`

## Pull Request Process

1. Create a branch from `master`: `feat/my-feature` or `fix/my-fix`
2. Make your changes with clear, atomic commits
3. Run `npm run quality` locally to verify
4. Open a PR with a clear description
5. Ensure CI passes (Quality Gate + PR Checks)

## Adding New Tools

DevPilot has 14 built-in tools. To add a new one:

1. Create `crates/devpilot-tools/src/tools/your_tool.rs`
2. Implement the `Tool` trait (name, description, schema, execute)
3. Register in `crates/devpilot-tools/src/registry.rs` → `with_defaults()`
4. Add a renderer in `src/components/chat/ToolCallView.tsx` (optional)
5. Add i18n keys in both `en.ts` and `zh.ts`

## Adding New LLM Providers

1. Create a provider struct implementing `ModelProvider` trait
2. Register in `devpilot-llm/src/provider.rs`
3. Add provider config UI in settings panel

## Reporting Issues

Use the GitHub issue templates:

- **Bug Report** — include OS, version, steps to reproduce, logs
- **Feature Request** — describe the problem and proposed solution
