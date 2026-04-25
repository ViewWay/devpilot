<p align="center">
  <img src="docs/logo.svg" alt="DevPilot" width="120" height="120" />
</p>

<h1 align="center">DevPilot</h1>

<p align="center">
  <strong>Multi-Model AI Coding Agent for Your Desktop</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge" alt="version" />
  <img src="https://img.shields.io/badge/tests-1000%2B-green?style=for-the-badge" alt="tests" />
  <img src="https://img.shields.io/badge/license-MIT-yellow?style=for-the-badge" alt="license" />
</p>

<p align="center">
  Built with <strong>Tauri 2</strong> (Rust) + <strong>React 19</strong> + <strong>TypeScript</strong><br/>
  Fast. Private. Yours.
</p>

---

## ✨ What is DevPilot?

DevPilot is a native desktop AI coding agent that puts you in control.  
Connect to **any major LLM provider**, spin up a full agentic coding loop with tool execution and context management, and work with your code — all inside a single polished app.

## 🚀 Key Features

### 🤖 Multi-Provider LLM Support

Connect to the model that works best for you — and fail over automatically if one goes down.

| Provider      |     | Provider    |     |
| ------------- | --- | ----------- | --- |
| OpenAI        | ✅  | DeepSeek    | ✅  |
| Anthropic     | ✅  | Qwen        | ✅  |
| Google Gemini | ✅  | GLM / ZhiPu | ✅  |
| Kimi          | ✅  | MiniMax     | ✅  |
| VolcEngine    | ✅  | OpenRouter  | ✅  |
| LiteLLM       | ✅  |             |     |

**Automatic failover** keeps your workflow moving when a provider has issues.

### 🔁 Full Agent Loop

- **Tool execution** — the agent can run tools, read/write files, and shell commands
- **Context compaction** — smart summarization to keep conversations within token limits
- **Checkpoint & rewind** — snapshot your session and roll back at any time

### 🖥️ Built-In Developer Environment

- **Integrated terminal** — powered by xterm.js + portable-pty
- **Monaco editor** — the same editor that powers VS Code
- **File tree** — browse and navigate your project at a glance
- **Split view** — see code and chat side by side

### 🔍 Code Intelligence

- **Symbol index** powered by tree-sitter
- Languages supported: **Rust, TypeScript, JavaScript, Python, Go**
- Jump to definitions, search symbols, and explore code structure

### 🧠 Persona & Memory System

Define who your agent is and what it remembers:

| File        | Purpose                              |
| ----------- | ------------------------------------ |
| `SOUL.md`   | Agent personality and behavior rules |
| `USER.md`   | Your preferences and context         |
| `MEMORY.md` | Persistent knowledge store           |
| `AGENTS.md` | Multi-agent configuration            |

### 🛠️ Skills System

Extend DevPilot with reusable skill definitions using the `SKILL.md` parser.  
Create, share, and compose skills for common development workflows.

### 💬 Interaction Modes

| Mode     | Description                                                 |
| -------- | ----------------------------------------------------------- |
| **Code** | Full agent — execute tools, edit files, run commands        |
| **Plan** | Think before you act — agent creates a plan for your review |
| **Ask**  | Quick Q&A with no side effects                              |

### 📦 Data Portability

- **Export / import** your sessions, settings, and memory
- **Claude Code session import** — bring your existing conversations into DevPilot

### 🌐 Internationalization

Full support for **English** and **Chinese** (简体中文).

### ⌨️ Keyboard-First

Extensive keyboard shortcuts for power users. Stay in the flow.

### 🔄 Auto-Update

DevPilot checks for updates automatically so you always have the latest features.

---

## 🏗️ Architecture

```
devpilot/
├── src/                  # React 19 + TypeScript frontend
│   ├── components/       # UI components (Radix UI + Tailwind CSS 4)
│   ├── stores/           # Zustand state management
│   └── ...
├── src-tauri/            # Tauri 2 app shell (Rust)
├── crates/               # 15 Rust crates — clean, modular architecture
│   ├── devpilot-core/    # Core abstractions and types
│   ├── devpilot-llm/     # Multi-provider LLM client
│   ├── devpilot-tools/   # Agent tool implementations
│   ├── devpilot-memory/  # Persona & memory management
│   ├── devpilot-index/   # Tree-sitter symbol index
│   ├── devpilot-store/   # SQLite persistence layer
│   ├── devpilot-bridge/  # Frontend ↔ backend bridge
│   ├── devpilot-sandbox/ # Sandboxed execution
│   ├── devpilot-scheduler/ # Task scheduling
│   ├── devpilot-search/  # Full-text search
│   ├── devpilot-protocol/ # Protocol & message types
│   ├── devpilot-mcp/     # Model Context Protocol
│   ├── devpilot-media/   # Media handling
│   └── devpilot-git/     # Git integration
└── ...
```

**Stats:** 15 Rust crates · ~20K LOC Rust + ~15K LOC TypeScript · 1000+ tests

---

## 🛠️ Tech Stack

| Layer                 | Technologies               |
| --------------------- | -------------------------- |
| **Desktop**           | Tauri 2 (Rust backend)     |
| **Frontend**          | React 19, TypeScript, Vite |
| **Styling**           | Tailwind CSS 4, Radix UI   |
| **Database**          | SQLite                     |
| **Terminal**          | xterm.js, portable-pty     |
| **Editor**            | Monaco Editor              |
| **Code Intelligence** | tree-sitter                |
| **State**             | Zustand                    |
| **Testing**           | Vitest, Testing Library    |

---

## 📋 Requirements

- **macOS** — Apple Silicon (M1/M2/M3/M4) or Intel
- **Rust** — stable toolchain (install via [rustup](https://rustup.rs))
- **Node.js** — v20+ (recommend v22 LTS)
- **Xcode Command Line Tools** — `xcode-select --install`

---

## 🔨 Build from Source

```bash
# Clone the repository
git clone https://github.com/ViewWay/devpilot.git
cd devpilot

# Install frontend dependencies
npm install

# Start in development mode (hot reload)
npm run tauri:dev
```

### Release Build

```bash
npm run tauri:build
```

The compiled `.dmg` and `.app` bundles will appear in `src-tauri/target/release/bundle/`.

---

## 🧪 Development

```bash
# Type checking
npm run typecheck

# Lint
npm run lint

# Run tests
npm run test

# Tests with coverage
npm run test:coverage

# Full quality gate (typecheck + lint + test + build)
npm run quality
```

---

## 📄 License

DevPilot is released under the [MIT License](LICENSE).

---

<p align="center">
  Made with ❤️ by the <a href="https://github.com/ViewWay">ViewWay</a> team
</p>
