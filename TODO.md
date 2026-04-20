# DevPilot TODO

## 项目概况

- **版本**: 0.4.0 (开发中)
- **后端**: 12 Rust crates, 17,200+ 行, 293 tests, 全部通过
- **前端**: 70+ TS/TSX 文件, ~15,400 行, 146 tests (11 files)
- **IPC**: 86 个 Tauri 命令已注册 (40+ 个 #[tauri::command])
- **编译**: cargo build OK, cargo clippy OK, tsc OK

---

## Phase 1~3: 完成 ✅ (P0 核心可用 + P1 Provider管理 + P2 高级功能 + P3 打磨)

详见 git history

---

## Phase 4: 实用化 (P4) — 15/15 完成 ✅

### P4-A: 核心面板真实化 (Critical)

- [x] **P4-1** TerminalPanel: 接入 sandbox_execute IPC, 彩色 stdout/stderr + exit code (556d11c)
- [x] **P4-2** FileTree: 接入 search_files IPC, 真实目录文件树 + 点击预览 (83ef696)
- [x] **P4-3** PreviewPanel: 真实文件读取 + Monaco Editor + diff 占位 (b5d14e0)

### P4-B: Agent 事件完整接入 (Critical)

- [x] **P4-4** chatStore: 监听全部 7 种 stream 事件 (含 stream-compacted) (b8b6a22)
- [x] **P4-5** chatStore: tool events → Message 的 toolCalls 字段 (已有)
- [x] **P4-6** MessageList: ToolCallView 多轮 tool call 可视化 (已有)

### P4-C: 开发者体验 (High)

- [x] **P4-7** 工作目录选择器: TopBar Tauri dialog 原生目录选择器 (556d11c)
- [x] **P4-8** System Prompt 编辑器: ChatPanel 可折叠区域 (556d11c)
- [x] **P4-9** 对话导出: JSON/Markdown Blob 下载 + Sidebar 导出按钮 (b8b6a22)

### P4-D: 设置完善 (Medium)

- [x] **P4-10** MCP Server 管理: SettingsPage MCP 标签页 + mcpStore + 18 i18n keys (30affbe)
- [x] **P4-11** 字体大小: uiStore fontSize + SettingsPage slider → MessageBubble 联动 (f40d2d4+)
- [x] **P4-12** Sandbox 策略选择: SecurityTab + TerminalPanel 接入 sandboxPolicy (f40d2d4+)

### P4-E: 清理 & 配置 (Low)

- [x] **P4-13** 删除 dead Header.tsx, useTauri.ts, 重复快捷键 (2c6d966)
- [x] **P4-14** tauri.conf.json: 版本号 0.4.0 + 标题栏 "DevPilot — AI Coding Agent" (b8b6a22)
- [x] **P4-15** i18n 修补: messages key 补全 (f40d2d4+)

---

## Phase 5: Persona & Memory + Split View — 完成 ✅

### P5-A: Persona File System

- [x] **P5-1** devpilot-memory crate: PersonaFiles (SOUL/USER/MEMORY/AGENTS.md) + DailyMemory + search_memory + build_persona_prompt — 31 tests (f382c5f)
- [x] **P5-2** Tauri IPC: 5 memory commands (load_persona_files, save_persona_file, list_daily_memories, search_memories, create_daily_memory) (f382c5f)
- [x] **P5-3** Frontend PersonaMemoryTab: Settings tab with 4 persona editors, daily memories viewer, cross-source search (1f9fc1b)

### P5-B: Split View

- [x] **P5-4** Split view: DualSessionSplitView with resizable divider, mobile responsive (74d3efa)
- [x] **P5-5** Sidebar smart selection in split mode + TopBar toggle button (74d3efa)

### P5-C: Session Rewind

- [x] **P5-6** CheckpointPanel: Timeline view with create/rewind — already existed from P3

---

## Phase 6: Generative UI + Shortcuts — 完成 ✅

- [x] **P6-1** SandboxRenderer: iframe-based sandbox with srcdoc, resize handle, open-in-new-tab, error boundary (e5ef4f2)
- [x] **P6-2** SandboxBlock: Chat message block for html code blocks — auto-detected in MessageList (e5ef4f2)
- [x] **P6-3** Keyboard shortcuts: 9 default shortcuts, customizable with click-to-rebind recording, persistence (2a22820)

---

## Phase 8: UI 自适应 + 美化 — 8/8 完成 ✅

### P8-A: 布局自适应 (Critical)

- [x] **P8-1** AppShell 重构: sidebar 始终渲染(条件 class 切换)，消除布局跳跃
- [x] **P8-2** TopBar 自适应: 溢出隐藏非核心元素 (lg: WorkingDir, md: ReasoningEffort)
- [x] **P8-3** MessageList/MessageInput 全屏自适应: max-w-3xl → max-w-4xl/5xl (2xl 断点)
- [x] **P8-4** ChatPanel CheckpointPanel 改为 absolute overlay (不再挤压聊天区域)

### P8-B: 面板 + Terminal (High)

- [x] **P8-5** SplitView: min-width 保护 (左 280px, 右 200px)，防止挤压为零
- [x] **P8-6** Terminal 主题跟随: 消除硬编码 #1a1b26，改用 CSS 变量自动适配 dark/light

### P8-C: 细节润色 (Medium)

- [x] **P8-7** CSS: 更细腻 scrollbar (5px + oklch alpha)，prose 排版，空状态背景图案，CheckpointPanel 滑入动画，focus-visible 全局样式

### P8-D: 其他增强 (from prior sessions)

- [x] **P8-8** Provider 健康诊断: providerStore.diagnoseProvider + DiagnosticReport 类型 + i18n keys
- [x] **P8-9** LLM 重试逻辑: 指数退避 transient error 重试 (Rust 后端)
- [x] **P8-10** 更多中国 Provider: Kimi, MiniMax, VolcEngine (Doubao)
- [x] **P8-11** Google Gemini 原生 API + 多模态图片附件支持

---

## Phase 9: UI 密度优化 — 6/6 完成 ✅

### P9-A: TopBar 减密度 (Critical)

- [x] **P9-1** TopBar: h-11→h-12, gap-1.5→gap-2, px-2→px-3, 移除 overflow-hidden
- [x] Model Selector: 移除 border, 改 text-foreground/80 ghost 风格
- [x] Mode Tabs: border→bg-muted/50 圆角背景, px-2.5→px-3
- [x] 分割线: bg-border→bg-border/40 半透明
- [x] 右侧按钮组: gap-0.5→gap-1, gap-1→gap-2

### P9-B: Sidebar 毛玻璃 (High)

- [x] **P9-2** Sidebar: bg-sidebar/80 + backdrop-blur-sm 毛玻璃效果
- [x] 搜索框: border border-input→bg-muted/50 无边框
- [x] 会话列表项: gap-2→gap-2.5, px-2→px-2.5, py-1.5→py-2 更宽松
- [x] 底部工具栏 border→border/40

### P9-C: MessageList 间距 (High)

- [x] **P9-3** MessageList: space-y-6→space-y-8, py-6→py-8, px-4→px-6
- [x] 聊天宽度: max-w-4xl→max-w-3xl (2xl:max-w-4xl) 收窄提升可读性
- [x] Assistant/Tool 消息: gap-2.5→gap-3
- [x] Suggestion cards: p-3→p-4, border→border/40
- [x] Tool 消息边框: border→border/40, bg-muted/50→bg-muted/30

### P9-D: MessageInput 磨砂 (Medium)

- [x] **P9-4** MessageInput: bg-background→bg-background/80 + backdrop-blur-md 磨砂浮层
- [x] border-t border→border/40
- [x] 输入框宽度跟随 MessageList: max-w-3xl (2xl:max-w-4xl)

### P9-E: 全局边框柔化 (Medium)

- [x] **P9-5** 全局 border→border/40: TopBar分割线, Sidebar, ChatPanel, SystemPrompt, Checkpoint按钮, ApprovalQueue
- [x] 视觉效果: 分割线若隐若现, 减少视觉噪音

---

## Phase 10: Claude Code Import — 1/1 完成 ✅

### P10-A: Claude Code Session Import

- [x] **P10-1** claude_import.rs: parse Claude Code .jsonl thread files → DevPilot sessions (534 lines)
- [x] **P10-2** IPC commands: scan_claude_threads_cmd, scan_claude_threads_from, import_claude_thread, import_claude_threads_batch
- [x] **P10-3** ClaudeImportSection UI: Settings > Data Management tab — scan, select, batch import with result summary
- [x] **P10-4** i18n: 16+ Claude import keys (EN + ZH)

---

## 已完成模块

### Rust Crates (13)

- [x] devpilot-protocol (494行, 36 tests) — 共享类型 (含 GLM/Qwen/DeepSeek ProviderType)
- [x] devpilot-llm (2,910行, 48 tests) — 多Provider LLM客户端 (含 chinese.rs 模型目录)
- [x] devpilot-store (1,400行, 10 tests) — SQLite持久化 + AES加密 + Checkpoint + MCP Servers
- [x] devpilot-tools (1,835行, 28 tests) — 工具注册+4内置工具
- [x] devpilot-core (1,311行, 16 tests) — Agent引擎+Session+EventBus+ContextCompactor
- [x] devpilot-sandbox (728行, 17 tests) — 沙箱执行策略
- [x] devpilot-search (581行, 14 tests) — 文件搜索
- [x] devpilot-scheduler (562行, 12 tests) — Cron调度器
- [x] devpilot-bridge (799行, 6 tests) — IM通知桥接
- [x] devpilot-media (544行, 8 tests) — 图像生成
- [x] devpilot-mcp (~730行, 32 tests) — MCP客户端 (stdio/SSE transport + tool discovery)
- [x] devpilot-memory (~863行, 31 tests) — Persona files + daily memory + search

### Tauri IPC (56命令, 33 个 #[tauri::command])

- [x] Session CRUD (5)
- [x] Message CRUD (3)
- [x] Settings (3)
- [x] Usage (1)
- [x] Provider CRUD + API Key (5)
- [x] LLM send_message/stream/check/list (4)
- [x] Tools list/execute/approval (4)
- [x] Sandbox execute/policy (2)
- [x] Search (1)
- [x] Scheduler CRUD+pause/resume (5)
- [x] Bridge CRUD+send+enable/disable (6)
- [x] Media generate/providers (2)
- [x] Checkpoint create/list/rewind (3)
- [x] Context compaction (1)
- [x] MCP CRUD+connect/disconnect/list (6)
- [x] Memory/Persona load/save/list/search/create (5)

### 前端 (65+文件, ~12,000行, 142 tests)

- [x] ChatPanel + MessageList + MessageInput + CodeBlock + ToolCallView
- [x] ApprovalOverlay → ApprovalQueue (工具审批 UI)
- [x] Sidebar (含归档区) + TopBar (动态模型选择器)
- [x] SettingsPage (Provider/Model/Bridge/Scheduler/Media/PersonaMemory/Shortcuts)
- [x] SchedulerPage + GalleryPage
- [x] TerminalPanel + PreviewPanel + FileTree
- [x] CheckpointPanel + SessionPanelView + DualSessionSplitView
- [x] SandboxRenderer + SandboxBlock (iframe-based generative UI)
- [x] memoryStore + shortcutStore
- [x] i18n (EN + CN) 全覆盖
- [x] 流式中止 + 竞态修复
- [x] Provider 持久化 + 加密 API key 水合
- [x] 上下文压缩 /compact 命令
- [x] Checkpoint 前端面板 + rewind (P3-5)
- [x] 统一错误处理 (errors.ts + reportError)

### 测试覆盖

- 后端: 293 Rust tests (12 crates, 全部通过)
- 前端: 142 tests (11 files, 全部通过)
  - components: MessageInput.test.tsx, Sidebar.test.tsx
  - stores: chatStore, providerStore, usageStore, uiStore, schedulerStore, checkpointStore, streaming
  - lib: errors.test.ts, persistence.test.ts

---

## Phase 7: Polish & Release Prep — 完成 ✅

### P7-A: Interaction Modes (Critical)

- [x] **P7-1** Wire Code/Plan/Ask modes through full stack: frontend (TopBar selector) → IPC (StreamMessageRequest.mode) → backend (SessionConfig.mode) → agent (enforce mode: Ask=no tools, Plan=tools but no execution, Code=full agent)
- [x] Add ReasoningEffort::from_number() converter (0-100 → Low/Medium/High)
- [x] 5 new mode-enforcement tests in devpilot-core

### P7-B: Skills System (High)

- [x] **P7-2** SkillLoader in devpilot-tools: SKILL.md parser with YAML frontmatter + .state sidecar for enabled flag
- [x] SkillInfo type in devpilot-protocol
- [x] 6 Tauri commands: list/get/install/uninstall/toggle/search skills
- [x] build_skill_context() for system prompt injection
- [x] 9 unit tests for skill loading, parsing, install, search

### P7-C: Data Management (High)

- [x] **P7-3** Full export/import: ExportData JSON with sessions, messages, providers, settings, usage
- [x] ImportStrategy (Overwrite/Merge/SkipExisting) with conflict resolution
- [x] 4 Tauri commands: export_data, import_data, export_to_file, import_from_file
- [x] DataTab in SettingsPage with export/import UI + strategy selector
- [x] 3 export/import tests in devpilot-store

### P7-D: Accessibility (Medium)

- [x] **P7-4** Skip-to-main-content link in AppShell
- [x] TopBar: role="toolbar", aria-labels on all buttons, aria-pressed/aria-expanded, radiogroup for mode selector
- [x] Sidebar: role="navigation", role="list/listitem", aria-current="page", keyboard nav (Enter/Space)
- [x] MessageInput: aria-live for "Message sent" announcement, aria-labels, role="listbox" for autocomplete
- [x] MessageList: role="log" with aria-live="polite", role="article" on messages
- [x] CodeBlock: role="region", aria-labels on copy/toggle buttons
- [x] ToolCallView: aria-expanded, role="region"
- [x] 53 a11y i18n keys (EN + ZH)

### P7-E: Auto-Update (Medium)

- [x] **P7-5** tauri-plugin-updater + tauri-plugin-process configured
- [x] UpdateChecker component: auto-check, download progress, install & restart
- [x] Graceful handling of unconfigured pubkey (no crashes)
- [x] 12 update-related i18n keys (EN + ZH)

### P7-F: Metadata

- [x] **P7-6** TODO.md updated with P7 completion status

### 开发时间线

- 2026-04-19 Session A~J: P0+P1+P2 核心功能 (参见 CHANGELOG)
- 2026-04-19 Session K: P3-2 i18n + P3-3 错误处理 + P3-1 测试补充
- 2026-04-19 Session L: P3-6 Chinese Provider + P3-1 测试完善
- 2026-04-19 Session M: P3-4 E2E 集成测试 + 提交推送 (587aa31)
- 2026-04-19 Session N: P4 规划 + 开始开发
- 2026-04-20 Session O: P5+P6 开发 — devpilot-memory crate, persona UI, split view, sandbox renderer, keyboard shortcuts
- 2026-04-20 Session P: P7 开发 — interaction modes, skills system, data export/import, accessibility, auto-update
- 2026-04-20 Session Q: P8 UI 改进 + Provider 增强 — 布局自适应, Terminal 主题跟随, CSS 润色, 健康诊断, Gemini/Kimi/MiniMax/VolcEngine
- 2026-04-20 Session R: P9 UI 密度优化 — CodePilot 风格间距, 毛玻璃效果, 柔和边框, 磨砂输入框
