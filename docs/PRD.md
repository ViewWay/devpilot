# DevPilot — AI Coding Agent Desktop Client
# DevPilot — AI 编程 Agent 桌面客户端

**Product Requirements Document / 产品需求文档**
**Version:** 0.1.0-draft
**Date:** 2026-04-18
**Status:** Draft / 草案

---

## Table of Contents / 目录

1. [Vision & Positioning / 愿景与定位](#1-vision--positioning)
2. [Competitive Landscape / 竞品格局](#2-competitive-landscape)
3. [Core Features / 核心功能](#3-core-features)
4. [Technical Architecture / 技术架构](#4-technical-architecture)
5. [Module Design / 模块设计](#5-module-design)
6. [Data Model / 数据模型](#6-data-model)
7. [Development Phases / 开发阶段](#7-development-phases)
8. [Success Metrics / 成功指标](#8-success-metrics)
9. [Risks & Mitigations / 风险与缓解](#9-risks--mitigations)
10. [Reference Projects / 参考项目](#10-reference-projects)

---

## 1. Vision & Positioning / 愿景与定位

### English

**DevPilot** is an open-source, multi-model AI coding agent desktop application built with **Tauri 2 (Rust) + React**. It combines the power of terminal-based coding agents (Claude Code, Codex CLI, Aider) with a rich desktop GUI experience.

**Mission:** Provide developers with a lightweight, extensible, privacy-first AI coding companion that runs on macOS, Windows, and Linux.

**Key Differentiators:**
- **Tauri + Rust backend** — 10-20x lighter than Electron-based competitors (~15MB vs ~200MB)
- **Multi-model support** — Switch between Anthropic, OpenAI, Google, Chinese providers (GLM, Qwen, DeepSeek), and local models (Ollama) mid-conversation
- **Sandboxed execution** — Borrow Codex's sandbox architecture for safe command execution
- **Terminal-first design** — Embedded PTY + Monaco Editor + Chat, the best of CLI and GUI worlds
- **Assistant personality** — Persistent memory, persona files (SOUL.md, USER.md), learning your workflow over time

### 中文

**DevPilot** 是一款基于 **Tauri 2 (Rust) + React** 构建的开源多模型 AI 编程 Agent 桌面应用。它将终端编码 Agent（Claude Code、Codex CLI、Aider）的强大能力与丰富的桌面 GUI 体验相结合。

**使命：** 为开发者提供一个轻量、可扩展、隐私优先的 AI 编程伙伴，运行于 macOS、Windows 和 Linux。

**核心差异化：**
- **Tauri + Rust 后端** — 比 Electron 方案轻 10-20 倍（~15MB vs ~200MB）
- **多模型支持** — 对话中随时切换 Anthropic、OpenAI、Google、国内大模型（GLM、通义、DeepSeek）和本地模型（Ollama）
- **沙盒执行** — 借鉴 Codex 沙盒架构，安全执行命令
- **终端优先设计** — 内嵌 PTY + Monaco Editor + 聊天，CLI 和 GUI 的最佳结合
- **助理人设** — 持久记忆、人设文件（SOUL.md、USER.md），持续学习你的工作方式

---

## 2. Competitive Landscape / 竞品格局

### Feature Comparison Matrix / 功能对比矩阵

| Feature / 功能 | DevPilot | CodePilot | Claude Code | Codex CLI | Cursor | Aider | Cline |
|---|---|---|---|---|---|---|---|
| **Framework / 框架** | Tauri 2+Rust | Electron+Next.js | Terminal CLI | Terminal CLI | Electron fork | Terminal CLI | VS Code Ext |
| **Package Size / 包体积** | ~15 MB | ~200 MB | ~50 MB | ~100 MB | ~400 MB | ~30 MB | Plugin |
| **Multi-Model / 多模型** | ✅ 15+ | ✅ 17+ | ❌ Claude only | ❌ OpenAI only | ✅ | ✅ | ✅ |
| **Sandbox / 沙盒** | ✅ seatbelt/bwrap | ❌ | ❌ | ✅ Firecracker | ❌ | ❌ | ❌ |
| **PTY Terminal / 终端** | ✅ embedded | ✅ (via CLI) | ✅ native | ✅ native | ✅ integrated | ✅ native | ❌ |
| **Code Editor / 代码编辑** | ✅ Monaco | ❌ | ❌ | ❌ | ✅ full IDE | ❌ | ✅ VS Code |
| **Diff Preview / 差异预览** | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ (git diff) | ✅ |
| **File Tree / 文件树** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Session Rewind / 会话回退** | ✅ checkpoint | ✅ checkpoint | ❌ | ❌ | ❌ | ✅ (git) | ❌ |
| **MCP Support / MCP 支持** | ✅ stdio/sse/http | ✅ stdio/sse/http | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Skills System / 技能系统** | ✅ | ✅ marketplace | ❌ | ❌ | ❌ | ❌ | ❌ |
| **IM Bridge / IM 桥接** | ✅ extensible | ✅ 5+ channels | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Task Scheduler / 任务调度** | ✅ cron | ✅ cron | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Memory System / 记忆系统** | ✅ SOUL.md+MEMORY | ✅ persona files | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Chinese Providers / 国内模型** | ✅ GLM/Qwen/DeepSeek | ✅ GLM/Kimi/MiniMax | ❌ | ❌ | ❌ | ✅ (via API) | ✅ |
| **Image Gen / 图片生成** | ✅ Gemini | ✅ Gemini | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Split View / 分屏** | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **Cost Tracking / 费用追踪** | ✅ | ✅ | ✅ /cost | ❌ | ✅ | ❌ | ❌ |
| **i18n / 国际化** | ✅ EN/CN | ✅ EN/CN | ✅ EN | ✅ EN | ✅ | ❌ | ❌ |
| **Open Source / 开源** | ✅ Apache-2.0 | BSL-1.1 | Apache-2.0 | Apache-2.0 | ❌ closed | Apache-2.0 | Apache-2.0 |
| **Theme / 主题** | ✅ Dark/Light | ✅ Dark/Light | Terminal | Terminal | ✅ | Terminal | VS Code |

### Unique Value Proposition / 独特价值主张

**vs CodePilot (Electron):** 10-20x smaller, lower memory, Rust-native performance, fully open-source (not BSL)

**vs Cursor (IDE):** Lightweight companion, not a full IDE replacement — works with your existing editor

**vs Claude Code / Codex CLI (Terminal):** Rich GUI with Monaco Editor, diff preview, file tree, split view

**vs Cline (VS Code Extension):** Standalone app, no VS Code dependency, lighter weight, native sandbox

**vs CodePilot 对比（Electron）：** 体积小 10-20 倍，内存占用更低，Rust 原生性能，完全开源（非 BSL）

**vs Cursor 对比（IDE）：** 轻量级伙伴，不是完整 IDE 替代品——与现有编辑器协同工作

**vs Claude Code / Codex CLI 对比（终端）：** 丰富的 GUI，集成 Monaco Editor、差异预览、文件树、分屏

**vs Cline 对比（VS Code 扩展）：** 独立应用，无需 VS Code 依赖，更轻量，原生沙盒

---

## 3. Core Features / 核心功能

### 3.1 Conversation System / 对话系统

**EN:** Multi-turn conversation with streaming responses, model switching mid-conversation, session management with pause/resume/rewind to any checkpoint.

**CN:** 多轮对话支持流式响应，对话中切换模型，会话管理支持暂停/恢复/回退到任意检查点。

**Requirements:**
- [ ] Chat panel with Markdown rendering + code syntax highlighting (Shiki)
- [ ] Streaming SSE output with real-time display
- [ ] Model switch dropdown (preserves conversation context)
- [ ] Session list (sidebar): create, rename, archive, delete
- [ ] Session rewind: checkpoint-based, navigate to any previous state
- [ ] Split view: side-by-side dual sessions
- [ ] Attachments: files and images (multimodal vision support)
- [ ] Slash commands: /help, /clear, /cost, /compact, /model, /doctor
- [ ] Interaction modes: Code (execute), Plan (analyze only), Ask (question only)
- [ ] Reasoning effort control: Low / Medium / High / Max + Thinking mode

### 3.2 Terminal & Execution / 终端与执行

**EN:** Embedded PTY terminal with sandboxed command execution, supporting macOS (seatbelt), Linux (bwrap+landlock), and Windows (restricted token).

**CN:** 内嵌 PTY 终端，支持沙盒命令执行，覆盖 macOS（seatbelt）、Linux（bwrap+landlock）和 Windows（restricted token）。

**Requirements:**
- [ ] Embedded PTY via `portable-pty` (Rust) + xterm.js (frontend)
- [ ] Sandbox system (borrowed from Codex architecture):
  - macOS: `seatbelt` profile generation
  - Linux: `bwrap` + `landlock` sandbox
  - Windows: Restricted token + private desktop
- [ ] Command approval UI: approve/deny per-command or auto-approve by policy
- [ ] Working directory selector per session
- [ ] Shell integration: bash, zsh, fish, PowerShell
- [ ] Environment variable management per session

### 3.3 Code Editing & Preview / 代码编辑与预览

**EN:** Monaco Editor for code preview/edit with diff visualization, syntax highlighting for 100+ languages, and LSP integration.

**CN:** Monaco Editor 用于代码预览/编辑，支持差异可视化、100+ 语言语法高亮和 LSP 集成。

**Requirements:**
- [ ] Monaco Editor embedded in Tauri WebView
- [ ] Diff preview: unified diff view for file changes (apply-patch format)
- [ ] File tree browser with icons, git status indicators
- [ ] Quick file search (fuzzy matching via nucleo)
- [ ] Syntax highlighting (Shiki, 100+ languages)
- [ ] Tab-based multi-file view
- [ ] LSP support (optional Phase 2): diagnostics, hover, go-to-definition

### 3.4 Multi-Model Provider / 多模型服务商

**EN:** Unified provider interface supporting 15+ AI providers with hot-switching.

**CN:** 统一服务商接口，支持 15+ AI 服务商，可热切换。

**Requirements:**
- [ ] Provider categories:
  - **Direct API:** Anthropic, OpenAI (direct)
  - **Aggregators:** OpenRouter, LiteLLM
  - **Cloud:** AWS Bedrock, Google Vertex AI
  - **Chinese:** 智谱 GLM (CN/Global), 通义千问, DeepSeek, Kimi, Moonshot, MiniMax, 火山引擎 (豆包)
  - **Local:** Ollama, LM Studio
  - **Custom:** Any OpenAI/Anthropic-compatible endpoint
- [ ] Per-provider configuration: API key, base URL, model list, pricing
- [ ] Provider health check / diagnostic (probe + auto-fix)
- [ ] Model list with context window, pricing, capabilities metadata
- [ ] Token counting estimation per request

### 3.5 Tool System / 工具系统

**EN:** Extensible tool system supporting built-in tools, MCP servers, and custom skills.

**CN:** 可扩展工具系统，支持内置工具、MCP 服务器和自定义技能。

**Requirements:**
- [ ] Built-in tools (borrowed from Codex tool architecture):
  - `shell` — Execute terminal commands (with approval)
  - `apply_patch` — Apply unified diff patches to files
  - `file_read` — Read file contents
  - `file_write` — Write/create files
  - `file_search` — Search files by name or content (ripgrep-style)
  - `web_fetch` — Fetch and extract web content
- [ ] MCP (Model Context Protocol) support:
  - Transports: stdio, SSE, HTTP streamable
  - Runtime status monitoring (connected/disconnected/error)
  - Tool discovery and invocation
  - Resource reading
- [ ] Skills system:
  - Skill definition: SKILL.md + optional code files
  - Skill marketplace integration (skills.sh)
  - Project-level and global skills
  - Skill installation/update/uninstall

### 3.6 Memory & Personality / 记忆与人设

**EN:** Persistent assistant with persona files, long-term memory, and learning capabilities.

**CN:** 持久化助理，支持人设文件、长期记忆和学习能力。

**Requirements:**
- [ ] Persona files at workspace root:
  - `SOUL.md` — Assistant personality, tone, style
  - `USER.md` — User preferences, context, notes
  - `MEMORY.md` — Long-term curated memory
  - `AGENTS.md` — Workspace rules and conventions
  - `TOOLS.md` — Environment-specific tool notes
- [ ] Daily memory files: `memory/YYYY-MM-DD.md`
- [ ] Memory search: semantic search across all memory files
- [ ] Auto-compact: summarize old conversation history to save context window
- [ ] Onboarding flow: first-launch questionnaire to build initial USER.md

### 3.7 Task Scheduler / 任务调度

**EN:** Built-in cron-based task scheduler for recurring AI tasks.

**CN:** 内置 cron 任务调度器，用于周期性 AI 任务。

**Requirements:**
- [ ] Cron expression scheduling (standard 5-field)
- [ ] Interval scheduling (every N minutes/hours)
- [ ] One-shot delayed tasks (at specific timestamp)
- [ ] Task CRUD: create, list, update, delete, trigger manually
- [ ] Task execution history with logs
- [ ] Notification on task completion (system notification / IM bridge)

### 3.8 IM Bridge / IM 桥接

**EN:** Connect external messaging platforms for remote AI assistant access.

**CN:** 连接外部消息平台，实现远程 AI 助理访问。

**Requirements:**
- [ ] Supported channels (extensible via adapter pattern):
  - Telegram
  - Feishu (飞书)
  - Discord
  - WeChat (微信, via WeChatFerry or ComWeChatBot)
  - QQ
- [ ] Channel adapter interface: `ChannelPlugin<T>` contract
- [ ] Message routing: IM ↔ DevPilot session binding
- [ ] Markdown → channel-specific format rendering
- [ ] Permission broker: approval requests via inline buttons
- [ ] Rate limiting and message chunking

### 3.9 Generative UI / 生成式 UI

**EN:** AI can create interactive visualizations rendered live in-app.

**CN:** AI 可创建交互式可视化组件，在应用内实时渲染。

**Requirements:**
- [ ] AI-generated React components rendered in sandboxed iframe
- [ ] Chart generation (via Recharts or ECharts)
- [ ] Dashboard creation from data analysis
- [ ] SVG diagram rendering
- [ ] Safe execution sandbox for generated code

### 3.10 Media Generation / 媒体生成

**EN:** AI image generation with batch task support.

**CN:** AI 图片生成，支持批量任务。

**Requirements:**
- [ ] Provider support: Google Gemini (Imagen), OpenAI (DALL-E)
- [ ] Batch generation tasks with queue
- [ ] Gallery with tagging and search
- [ ] Image export (PNG, WebP)

### 3.11 Settings & Configuration / 设置与配置

**EN:** Multi-layer configuration with provider management, theme, i18n.

**CN:** 多层配置系统，支持服务商管理、主题切换、国际化。

**Requirements:**
- [ ] Settings sections: Providers, Appearance, Sandbox, Shortcuts, Advanced
- [ ] Theme: Dark / Light / System
- [ ] i18n: English + Chinese (extensible)
- [ ] Keyboard shortcuts (customizable)
- [ ] Data export/import (full session backup)
- [ ] Auto-update (Tauri updater)
- [ ] Multi-layer config: global (`~/.devpilot/config.toml`) + project (`.devpilot/config.toml`)

### 3.12 Cost & Usage Tracking / 费用与用量追踪

**EN:** Track token usage and estimated costs with daily charts.

**CN:** 追踪 Token 用量和预估费用，附每日图表。

**Requirements:**
- [ ] Per-request token count (input, output, cache read/write)
- [ ] Cost estimation based on model pricing
- [ ] Daily/weekly/monthly usage charts (Recharts)
- [ ] Per-session cost display
- [ ] Budget alert (optional)

---

## 4. Technical Architecture / 技术架构

### 4.1 High-Level Architecture / 高层架构

```
┌──────────────────────────────────────────────────────────┐
│                    Tauri 2 Shell (Rust)                   │
│  ┌────────────────────────────────────────────────────┐  │
│  │              WebView (React 19 Frontend)            │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │  │
│  │  │  Chat    │ Terminal │  Code    │   File       │ │  │
│  │  │  Panel   │ (xterm)  │ (Monaco) │   Tree       │ │  │
│  │  ├──────────┴──────────┴──────────┴──────────────┤ │  │
│  │  │  Settings │ Bridge │ Gallery │ Scheduler      │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │ Tauri IPC (invoke / events)     │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │              Rust Backend (tokio)                    │  │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │  │
│  │  │ Session  │  LLM     │ Sandbox  │   Tool       │ │  │
│  │  │ Manager  │  Client  │ Manager  │   Registry   │ │  │
│  │  ├──────────┼──────────┼──────────┼──────────────┤ │  │
│  │  │ Apply    │  File    │ Thread   │   Config     │ │  │
│  │  │ Patch    │  Search  │ Store    │   Manager    │ │  │
│  │  ├──────────┼──────────┼──────────┼──────────────┤ │  │
│  │  │ Bridge   │ Memory   │ Media    │   Scheduler  │ │  │
│  │  │ Manager  │ Engine   │ Engine   │   (cron)     │ │  │
│  │  └──────────┴──────────┴──────────┴──────────────┘ │  │
│  └─────────────────────────────────────────────────────┘  │
│                         │                                  │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │              Data Layer                              │  │
│  │  SQLite (via rusqlite) │ File System │ Keychain     │  │
│  └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 4.2 Technology Stack / 技术栈

| Layer / 层 | Technology / 技术 | Purpose / 用途 |
|---|---|---|
| Desktop Shell | Tauri 2 (Rust) | Native window, IPC, filesystem, process management |
| Frontend | React 19 + TypeScript | UI components, state management |
| Styling | Tailwind CSS 4 + Radix UI | Responsive layout, accessible components |
| Terminal | xterm.js | Embedded terminal emulator |
| Code Editor | Monaco Editor | Code preview, editing, diff view |
| Syntax Highlight | Shiki | 100+ language syntax coloring |
| Charts | Recharts | Usage charts, cost tracking |
| Markdown | react-markdown + streamdown | Rich text rendering, streaming |
| Rust Runtime | tokio | Async runtime for backend services |
| Database | rusqlite (SQLite WAL) | Local persistence |
| Encryption | keyring-rs | Secure API key storage |
| Sandboxing | portable-pty + platform libs | Sandboxed command execution |
| Build | Vite + Tauri CLI | Fast dev builds, cross-platform packaging |
| Test | Vitest (unit) + Playwright (E2E) | Testing framework |

### 4.3 Why Tauri over Electron / 为什么选 Tauri 而不是 Electron

| Dimension / 维度 | Tauri 2 | Electron |
|---|---|---|
| Package size / 包体积 | ~15 MB | ~200 MB |
| Memory / 内存占用 | ~50-150 MB | ~200-500 MB |
| Startup time / 启动时间 | <1s | 2-5s |
| Backend language / 后端语言 | Rust (memory-safe, fast) | Node.js |
| Security / 安全性 | Rust memory safety + capability system | Chromium sandbox |
| Cross-platform / 跨平台 | macOS / Windows / Linux | macOS / Windows / Linux |
| Auto-update / 自动更新 | Built-in Tauri Updater | electron-updater |
| Moncao/xterm.js / 组件支持 | ✅ WebView supports both | ✅ Chromium supports both |
| Ecosystem / 生态 | Growing fast, v2 stable | Very mature |
| CC Switch reference / 参考 | — | CodePilot uses Electron |

**Decision / 决策:** Use Tauri 2 for significantly lower resource footprint. AI tools are already memory-intensive; the shell should be as light as possible.

### 4.4 Reusable Modules from Codex / 从 Codex 复用的模块

| Module / 模块 | Reuse Level / 复用程度 | Description / 说明 |
|---|---|---|
| `apply-patch` | 🟢 Direct reuse | Patch parsing and application, no I/O coupling |
| `file-search` | 🟢 Direct reuse | nucleo + ignore fuzzy matching |
| `thread-store` (trait + local) | 🟢 Direct reuse | Storage abstraction, trait-based backend |
| `state` (SQLite models) | 🟢 Direct reuse | Log and metadata storage schema |
| `config` | 🟢 Direct reuse | TOML parsing and multi-layer merging |
| `sandboxing` | 🟡 Adapt needed | Core logic reusable, needs Tauri permission model |
| `codex-protocol` (types) | 🟢 Direct reuse | ThreadId, ResponseItem, Event shared types |
| `tools` (tool_spec, tool_definition) | 🟢 Direct reuse | Tool definition data structures |

---

## 5. Module Design / 模块设计

### 5.1 Rust Backend Crates / Rust 后端 Crate

```
devpilot/
├── crates/
│   ├── devpilot-core/          # Core session management, agent engine
│   │   ├── session.rs          # Session lifecycle (create, pause, resume, rewind)
│   │   ├── turn_context.rs     # Single-turn context
│   │   ├── agent.rs            # Agent trait and registry
│   │   ├── compact.rs          # Context compression / summarization
│   │   └── event_bus.rs        # Internal event bus (tokio::broadcast)
│   │
│   ├── devpilot-llm/           # LLM client abstraction
│   │   ├── provider.rs         # ModelProvider trait
│   │   ├── openai.rs           # OpenAI-compatible API client
│   │   ├── anthropic.rs        # Anthropic API client
│   │   ├── google.rs           # Google Gemini/Vertex client
│   │   ├── chinese.rs          # Chinese providers (GLM, Qwen, DeepSeek, etc.)
│   │   ├── ollama.rs           # Local model client
│   │   ├── stream.rs           # SSE/WebSocket stream handling
│   │   └── token_count.rs      # Token estimation
│   │
│   ├── devpilot-tools/         # Tool system
│   │   ├── registry.rs         # ToolRegistry (lookup + dispatch)
│   │   ├── shell.rs            # Shell command execution
│   │   ├── apply_patch.rs      # Patch application (from Codex)
│   │   ├── file_ops.rs         # File read/write/search
│   │   ├── web_fetch.rs        # HTTP fetch
│   │   ├── mcp.rs              # MCP client (stdio/sse/http)
│   │   └── skill_loader.rs     # Skill definition loader
│   │
│   ├── devpilot-sandbox/       # Sandboxed execution
│   │   ├── manager.rs          # SandboxType selection
│   │   ├── seatbelt.rs         # macOS sandbox-exec
│   │   ├── bwrap.rs            # Linux bubblewrap + landlock
│   │   └── windows.rs          # Windows restricted token
│   │
│   ├── devpilot-store/         # Data persistence
│   │   ├── sqlite.rs           # SQLite via rusqlite
│   │   ├── thread_store.rs     # Conversation thread storage
│   │   ├── memory.rs           # Memory file management
│   │   ├── config.rs           # Config TOML management
│   │   └── migrations.rs       # Schema migrations
│   │
│   ├── devpilot-bridge/        # IM bridge subsystem
│   │   ├── adapter.rs          # ChannelAdapter trait
│   │   ├── router.rs           # Message routing
│   │   ├── delivery.rs         # Message formatting + chunking
│   │   ├── telegram.rs         # Telegram adapter
│   │   ├── feishu.rs           # Feishu adapter
│   │   ├── discord.rs          # Discord adapter
│   │   └── wechat.rs           # WeChat adapter
│   │
│   ├── devpilot-scheduler/     # Task scheduler
│   │   ├── cron.rs             # Cron expression parser
│   │   ├── executor.rs         # Task execution engine
│   │   └── persistence.rs      # Task state persistence
│   │
│   ├── devpilot-media/         # Media generation
│   │   ├── image_gen.rs        # Image generation (Gemini/DALL-E)
│   │   ├── gallery.rs          # Gallery management
│   │   └── batch.rs            # Batch task queue
│   │
│   ├── devpilot-protocol/      # Shared types
│   │   ├── types.rs            # ThreadId, Message, Event, ToolCall, etc.
│   │   └── proto.rs            # IPC protocol definitions
│   │
│   └── devpilot-search/        # File search
│       ├── fuzzy.rs            # Fuzzy matching (nucleo)
│       ├── content.rs          # Content search (ignore + regex)
│       └── index.rs            # Project file index
│
├── src-tauri/                  # Tauri application entry
│   ├── main.rs                 # Tauri setup, plugin registration
│   ├── commands/               # Tauri IPC command handlers
│   │   ├── session.rs          # Session CRUD commands
│   │   ├── chat.rs             # Chat send/receive commands
│   │   ├── tools.rs            # Tool invocation commands
│   │   ├── files.rs            # Filesystem commands
│   │   ├── settings.rs         # Settings commands
│   │   └── bridge.rs           # Bridge management commands
│   └── state.rs                # Global app state (Arc<RwLock>)
│
├── src/                        # React frontend
│   ├── app/                    # Page routes
│   │   ├── chat/               # Chat page (main)
│   │   ├── settings/           # Settings page
│   │   ├── bridge/             # Bridge config page
│   │   ├── gallery/            # Media gallery page
│   │   └── scheduler/          # Task scheduler page
│   ├── components/
│   │   ├── chat/               # Chat UI components
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── CodeBlock.tsx
│   │   │   ├── ToolCallView.tsx
│   │   │   └── ApprovalOverlay.tsx
│   │   ├── terminal/           # Terminal components
│   │   │   ├── Terminal.tsx    # xterm.js wrapper
│   │   │   └── TerminalManager.ts
│   │   ├── editor/             # Code editor components
│   │   │   ├── MonacoEditor.tsx
│   │   │   ├── DiffView.tsx
│   │   │   └── FileTabs.tsx
│   │   ├── layout/             # Layout components
│   │   │   ├── AppShell.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── SplitView.tsx
│   │   ├── files/              # File browser
│   │   │   ├── FileTree.tsx
│   │   │   └── FileSearch.tsx
│   │   ├── settings/           # Settings panels
│   │   ├── bridge/             # Bridge config UI
│   │   └── ui/                 # Base UI (Radix primitives)
│   ├── hooks/                  # React hooks
│   ├── lib/                    # Business logic
│   ├── stores/                 # State management (Zustand)
│   ├── types/                  # TypeScript types
│   └── i18n/                   # Internationalization
│       ├── en.ts
│       └── zh.ts
│
├── docs/                       # Documentation
├── tests/                      # Integration tests
├── Cargo.toml                  # Rust workspace root
├── package.json                # Frontend dependencies
├── vite.config.ts              # Vite config
├── tauri.conf.json             # Tauri configuration
└── README.md
```

### 5.2 Core Data Flow / 核心数据流

```
User Input → MessageInput (React)
           → Tauri IPC invoke("send_message", {session_id, content})
           → Rust Session Manager
           → LLM Client (provider-specific API call)
           → SSE Stream
           → Tauri event emit("stream_chunk", {session_id, chunk})
           → React useListen hook
           → MessageList re-render
           → SQLite persistence (async)
```

**Tool Execution Flow / 工具执行流程:**
```
LLM Response contains tool_call
→ ToolRegistry dispatch
→ Tool execution (sandboxed for shell)
→ Approval overlay if needed (Tauri event → React → user click → IPC back)
→ Tool result sent back to LLM
→ LLM continues generation
```

### 5.3 IPC Communication / IPC 通信

**Tauri invoke (Frontend → Backend):**
```typescript
// Session management
invoke("create_session", { config: SessionConfig }): Promise<SessionId>
invoke("send_message", { sessionId, content, attachments }): Promise<void>
invoke("pause_session", { sessionId }): Promise<void>
invoke("resume_session", { sessionId }): Promise<void>
invoke("rewind_session", { sessionId, checkpointId }): Promise<void>

// Tools
invoke("approve_tool_call", { callId, approved }): Promise<void>
invoke("list_mcp_servers"): Promise<MCPServer[]>
invoke("add_mcp_server", { config }): Promise<void>

// Files
invoke("read_file", { path }): Promise<string>
invoke("list_dir", { path }): Promise<FileEntry[]>
invoke("search_files", { query, rootPath }): Promise<FileMatch[]>

// Settings
invoke("get_settings"): Promise<Settings>
invoke("update_settings", { settings }): Promise<void>
invoke("get_providers"): Promise<Provider[]>
invoke("test_provider", { providerId }): Promise<ProbeResult>
```

**Tauri events (Backend → Frontend):**
```typescript
// Streaming
listen("stream_chunk", (event) => { /* append to message */ });
listen("stream_done", (event) => { /* finalize message */ });
listen("stream_error", (event) => { /* show error */ });

// Tool calls
listen("tool_call_started", (event) => { /* show tool call */ });
listen("tool_call_result", (event) => { /* show result */ });
listen("approval_required", (event) => { /* show approval overlay */ });

// Session
listen("session_created", (event) => { /* add to session list */ });
listen("cost_update", (event) => { /* update cost display */ });
```

---

## 6. Data Model / 数据模型

### 6.1 SQLite Schema / SQLite 数据库结构

```sql
-- Sessions / 会话
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,              -- UUID
    title TEXT NOT NULL DEFAULT 'New Chat',
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    working_dir TEXT,
    mode TEXT NOT NULL DEFAULT 'code', -- code | plan | ask
    reasoning_effort TEXT DEFAULT 'medium',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archived_at DATETIME,
    checkpoint_count INTEGER DEFAULT 0
);

-- Messages / 消息
CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                -- user | assistant | tool | system
    content TEXT NOT NULL,             -- JSON array of content blocks
    model TEXT,
    token_input INTEGER DEFAULT 0,
    token_output INTEGER DEFAULT 0,
    token_cache_read INTEGER DEFAULT 0,
    token_cache_write INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    checkpoint_id TEXT,                -- For rewind support
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Tool Calls / 工具调用
CREATE TABLE tool_calls (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    tool_input TEXT NOT NULL,          -- JSON
    tool_output TEXT,                  -- JSON
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | denied | running | done | error
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Checkpoints / 检查点 (for session rewind)
CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_index INTEGER NOT NULL,    -- Messages up to this index
    snapshot TEXT NOT NULL,            -- JSON snapshot of session state
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Providers / 服务商
CREATE TABLE providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,                -- anthropic | openai | openrouter | ollama | custom
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT,            -- Encrypted with keychain
    models TEXT,                       -- JSON array of model metadata
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- MCP Servers / MCP 服务器
CREATE TABLE mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    transport TEXT NOT NULL,           -- stdio | sse | http
    command TEXT,                      -- For stdio
    url TEXT,                          -- For sse/http
    args TEXT,                         -- JSON array
    env TEXT,                          -- JSON object
    status TEXT DEFAULT 'stopped',     -- stopped | running | error
    enabled BOOLEAN DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bridge Channels / 桥接渠道
CREATE TABLE bridge_channels (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,                -- telegram | feishu | discord | wechat | qq
    config TEXT NOT NULL,              -- JSON (tokens, webhooks, etc.)
    session_bindings TEXT,             -- JSON: channel_id → session_id mapping
    enabled BOOLEAN DEFAULT 1,
    status TEXT DEFAULT 'disconnected',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Tasks / 定时任务
CREATE TABLE scheduled_tasks (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,            -- Cron expression or interval ms
    prompt TEXT NOT NULL,              -- AI prompt to execute
    model TEXT,
    provider TEXT,
    enabled BOOLEAN DEFAULT 1,
    last_run_at DATETIME,
    next_run_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Task Runs / 任务执行记录
CREATE TABLE task_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'running', -- running | done | error
    result TEXT,                       -- AI response text
    error TEXT,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME
);

-- Usage / 用量统计
CREATE TABLE usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    token_input INTEGER DEFAULT 0,
    token_output INTEGER DEFAULT 0,
    token_cache_read INTEGER DEFAULT 0,
    token_cache_write INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0.0,
    request_count INTEGER DEFAULT 1,
    UNIQUE(date, provider, model)
);

-- Settings / 设置
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL                -- JSON value
);

-- Media Generations / 媒体生成
CREATE TABLE media_generations (
    id TEXT PRIMARY KEY,
    prompt TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    file_path TEXT,
    status TEXT DEFAULT 'pending',
    tags TEXT,                         -- JSON array
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Media Tags / 媒体标签
CREATE TABLE media_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);
CREATE INDEX idx_usage_date ON usage(date);
CREATE INDEX idx_checkpoints_session ON checkpoints(session_id, message_index);
```

### 6.2 File-based Storage / 文件存储

```
~/.devpilot/
├── config.toml              # Global configuration
├── devpilot.db              # SQLite database
├── providers/               # Provider credentials (keychain-backed)
├── sessions/                # Session thread files (JSONL)
│   └── {session-id}.jsonl
├── memory/                  # Memory files (shared with workspace)
│   └── YYYY-MM-DD.md
├── media/                   # Generated images
│   └── {id}.png
├── skills/                  # Installed skills
│   └── {skill-name}/
│       └── SKILL.md
├── plugins/                 # MCP server configs
│   └── {server-name}.json
└── logs/                    # Application logs
    └── devpilot.log
```

---

## 7. Development Phases / 开发阶段

### Phase 0: Foundation / 基础搭建 (Week 1-2)

**Goal / 目标:** Tauri 2 + React project scaffold, basic window, IPC working.

- [ ] Initialize Tauri 2 project with Vite + React 19
- [ ] Set up Cargo workspace with crate structure
- [ ] Implement basic Tauri IPC ping/pong
- [ ] Set up Tailwind CSS 4 + Radix UI
- [ ] Create AppShell layout (sidebar + main area + header)
- [ ] Implement Dark/Light theme toggle
- [ ] Set up i18n framework (en + zh)
- [ ] CI: GitHub Actions (build macOS + Windows + Linux)

**Deliverable / 交付物:** Runnable empty shell with sidebar, theme, i18n.

### Phase 1: Core Chat / 核心对话 (Week 3-5)

**Goal / 目标:** Working chat with one provider (Anthropic), streaming, persistence.

- [ ] Implement `devpilot-llm` with Anthropic provider
- [ ] Implement `devpilot-core` session management
- [ ] Implement `devpilot-store` SQLite persistence
- [ ] Chat UI: MessageList, MessageInput, streaming display
- [ ] Markdown rendering + code syntax highlighting (Shiki)
- [ ] Session CRUD (create, list, archive, delete)
- [ ] Slash commands (/help, /clear, /cost)
- [ ] Auto-compact / context compression
- [ ] Token counting and cost tracking
- [ ] Provider settings UI (add API key, test connection)

**Deliverable / 交付物:** Functional chat app with one provider.

### Phase 2: Terminal & Tools / 终端与工具 (Week 6-8)

**Goal / 目标:** Embedded terminal, shell execution, file operations, diff preview.

- [ ] Implement `devpilot-sandbox` (macOS seatbelt first)
- [ ] Implement `devpilot-tools` (shell, file_read, file_write, apply_patch)
- [ ] Embedded PTY via `portable-pty` + xterm.js
- [ ] Command approval overlay UI
- [ ] Monaco Editor integration (read-only preview + diff view)
- [ ] File tree browser
- [ ] Quick file search (fuzzy matching)
- [ ] apply_patch tool with diff visualization
- [ ] Working directory selector per session

**Deliverable / 交付物:** Full coding agent with terminal and file operations.

### Phase 3: Multi-Model & MCP / 多模型与 MCP (Week 9-11)

**Goal / 目标:** 15+ providers, MCP support, skills system.

- [ ] Implement all LLM providers (OpenAI, Google, Chinese, local)
- [ ] Model switch mid-conversation
- [ ] Provider diagnostic engine (probe + auto-fix)
- [ ] MCP client implementation (stdio/sse/http)
- [ ] MCP server management UI
- [ ] Skills system: SKILL.md loader + marketplace integration
- [ ] Interaction modes: Code / Plan / Ask
- [ ] Reasoning effort control

**Deliverable / 交付物:** Full multi-model agent with extensibility.

### Phase 4: Memory & Personality / 记忆与人设 (Week 12-13)

**Goal / 目标:** Persistent assistant with memory, persona, and learning.

- [ ] Persona file system (SOUL.md, USER.md, MEMORY.md, AGENTS.md)
- [ ] Memory file management (daily files + long-term)
- [ ] Memory search (semantic)
- [ ] Onboarding flow (first-launch questionnaire)
- [ ] Session rewind with checkpoints
- [ ] Split view (dual sessions)

**Deliverable / 交付物:** Persistent, personalized AI assistant.

### Phase 5: Bridge & Scheduling / 桥接与调度 (Week 14-16)

**Goal / 目标:** IM bridge, task scheduler, media generation.

- [ ] Implement `devpilot-bridge` adapter framework
- [ ] Telegram adapter
- [ ] Feishu adapter
- [ ] Discord adapter
- [ ] Implement `devpilot-scheduler` (cron + interval)
- [ ] Task scheduler UI
- [ ] Media generation (Gemini/DALL-E image gen)
- [ ] Media gallery with tagging

**Deliverable / 交付物:** Full-featured AI agent desktop client.

### Phase 6: Polish & Ship / 打磨与发布 (Week 17-18)

**Goal / 目标:** Production-ready release.

- [ ] Generative UI sandbox (AI-generated visualizations)
- [ ] Keyboard shortcuts (customizable)
- [ ] Auto-update (Tauri Updater)
- [ ] Data export/import
- [ ] Performance optimization
- [ ] Accessibility audit
- [ ] Documentation (user guide + developer docs)
- [ ] v0.1.0 release: GitHub Release for macOS + Windows + Linux

**Deliverable / 交付物:** v0.1.0 stable release.

---

## 8. Success Metrics / 成功指标

### Technical / 技术指标

| Metric / 指标 | Target / 目标 |
|---|---|
| Package size / 包体积 | < 20 MB |
| Cold start / 冷启动 | < 2 seconds |
| Memory (idle) / 内存（空闲） | < 100 MB |
| Memory (active session) / 内存（活跃会话） | < 300 MB |
| First meaningful paint / 首次有效渲染 | < 1 second |
| Streaming latency / 流式延迟 | < 200ms (time to first token) |

### Product / 产品指标

| Metric / 指标 | Target / 目标 |
|---|---|
| Supported providers / 支持服务商 | 15+ |
| Supported platforms / 支持平台 | macOS + Windows + Linux |
| Test coverage / 测试覆盖率 | > 80% |
| Accessibility score / 无障碍评分 | > 90 (Lighthouse) |
| i18n languages / 国际化语言 | 2 (EN + CN) |

---

## 9. Risks & Mitigations / 风险与缓解

| Risk / 风险 | Impact / 影响 | Mitigation / 缓解措施 |
|---|---|---|
| Tauri WebView compatibility / WebView 兼容性 | Medium | Test on all 3 platforms early; fallback to Electron if critical issues |
| Monaco Editor in WebView / WebView 中的 Monaco | Low | Proven in VS Code Web; test early in Phase 0 |
| xterm.js performance / xterm.js 性能 | Medium | Benchmark early; consider WebGL renderer addon |
| Sandbox on Windows / Windows 沙盒 | Medium | Start with macOS+Linux; Windows sandbox in Phase 5 |
| API key security / API 密钥安全 | High | Use OS keychain (keyring-rs); never store in plaintext |
| MCP server crashes / MCP 服务端崩溃 | Medium | Process isolation; auto-restart; status monitoring |
| Context window limits / 上下文窗口限制 | Medium | Auto-compact; configurable truncation policy |
| Anthropic/Cursor releasing competing desktop app | High | Open-source advantage; community-driven; Chinese provider focus |

---

## 10. Reference Projects / 参考项目

### Architecture References / 架构参考

| Project / 项目 | What to Learn / 学习点 |
|---|---|
| **Codex CLI** (`codex-rs/`) | Rust crate architecture, tool system, sandbox, apply-patch, session management, thread-store, compact, file-search |
| **CodePilot** | Electron+Next.js desktop app structure, Bridge subsystem, SQLite schema, provider management, skills marketplace, i18n, persona files |
| **Claude Code** | Agent workflow, permission model, MCP integration, streaming UX |
| **Aider** | Multi-LLM support, git-based editing, repository map, voice mode |
| **Cline** | VS Code extension architecture, MCP client, tool approval UX |
| **Cursor** | Codebase indexing (vector + BM25), agent mode, inline editing UX |
| **OpenCode** | Go TUI architecture, Bubbletea patterns, multi-provider |
| **CC Switch** | CLI tool configuration management, provider switching |

### Code Reuse / 代码复用

| Source / 来源 | Module / 模块 | Reuse Strategy / 复用策略 |
|---|---|---|
| Codex `apply-patch/` | Patch parsing and application | Fork and adapt as `devpilot-tools/apply_patch.rs` |
| Codex `file-search/` | Fuzzy file search | Fork and adapt as `devpilot-search/` |
| Codex `sandboxing/` | Sandbox management | Fork and adapt as `devpilot-sandbox/` |
| Codex `codex-protocol/` | Shared types | Reference for `devpilot-protocol/` type definitions |
| CodePilot `src/lib/bridge/` | Bridge architecture | Reference for adapter pattern, not direct code reuse (TypeScript → Rust) |
| CodePilot `src/lib/db.ts` | SQLite schema | Reference for table design |
| CodePilot `src/i18n/` | i18n keys | Reference for translation key structure |

---

## Appendix A: Codex Crate Mapping / Codex Crate 映射

Full Codex workspace has **80+ crates**. Key ones for DevPilot:

| Codex Crate | DevPilot Equivalent | Notes |
|---|---|---|
| `core/` | `devpilot-core/` | Session, agent, compact — rewrite for multi-model |
| `tools/` | `devpilot-tools/` | Tool registry, specs — largely reusable |
| `sandboxing/` | `devpilot-sandbox/` | Platform sandbox — reusable with adaptation |
| `apply-patch/` | part of `devpilot-tools/` | Direct reuse |
| `file-search/` | `devpilot-search/` | Direct reuse |
| `protocol/` | `devpilot-protocol/` | Type definitions — reference |
| `config/` | part of `devpilot-store/` | TOML config — reusable |
| `state/` | part of `devpilot-store/` | SQLite models — reusable |
| `thread-store/` | part of `devpilot-store/` | Thread persistence — reusable |
| `tui/` | React frontend | Complete rewrite (TUI → GUI) |
| `codex-api/` | `devpilot-llm/` | Rewrite for multi-provider |
| `codex-mcp/` | part of `devpilot-tools/` | MCP client — adapt |
| `skills/` | part of `devpilot-tools/` | Skill loader — adapt |

## Appendix B: CodePilot Feature Mapping / CodePilot 功能映射

| CodePilot Feature | DevPilot Equivalent | Implementation Difference |
|---|---|---|
| Provider management | Same | Rust backend vs Node.js |
| Claude Agent SDK | `devpilot-llm` | Multi-provider from day 1 |
| Bridge (Telegram/Feishu) | Same | Rust adapters vs TypeScript |
| MCP servers | Same | Rust MCP client |
| Skills marketplace | Same | Rust skill loader |
| Persona files (SOUL/USER/MEMORY) | Same | Inspired by CodePilot + OpenClaw |
| Generative UI | Same | Sandboxed iframe in WebView |
| Session rewind | Same | Checkpoint-based in SQLite |
| Media gallery | Same | Rust media engine |
| Task scheduler | Same | Rust cron scheduler |
| Cost tracking | Same | Per-request tracking in SQLite |
| Split view | Same | React component |
| Import Claude Code sessions | Same | .jsonl parser in Rust |
| SQLite storage | Same | rusqlite vs better-sqlite3 |
| i18n (EN/CN) | Same | Same approach |
| Dark/Light theme | Same | Same approach |

---

*Document generated on 2026-04-18 by DevPilot research team.*
*Based on analysis of: Codex CLI (codex-rs, 80+ Rust crates), CodePilot (Electron+Next.js, v0.50.3), Claude Code, Aider, Cursor, Cline, OpenCode.*
