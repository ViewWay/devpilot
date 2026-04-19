# DevPilot TODO

## 项目概况

- **版本**: 0.4.0 (开发中)
- **后端**: 12 Rust crates, 12,250+ 行, 202 tests, 全部通过
- **前端**: 55+ TS/TSX 文件, ~10,200 行, 142 tests (11 files)
- **IPC**: 51 个 Tauri 命令已注册 (28 个 #[tauri::command])
- **编译**: cargo build OK, cargo clippy OK, tsc OK

---

## Phase 1~3: 完成 ✅ (P0 核心可用 + P1 Provider管理 + P2 高级功能 + P3 打磨)

详见 git history

---

## Phase 4: 实用化 (P4) — 进行中

### P4-A: 核心面板真实化 (Critical)

- [ ] **P4-1** TerminalPanel: 接入 sandbox_execute IPC, 实现 PTY 流式终端
- [ ] **P4-2** FileTree: 接入 search_files IPC, 显示真实工作目录文件
- [ ] **P4-3** PreviewPanel: 接入真实文件读取 + diff 显示

### P4-B: Agent 事件完整接入 (Critical)

- [ ] **P4-4** useTauri: 监听所有 7 种 stream 事件 (chunk/done/error/tool-start/tool-result/approval/compacted)
- [ ] **P4-5** chatStore: tool events → Message 对象的 toolCalls/toolResults 字段填充
- [ ] **P4-6** MessageList: 完善多轮 tool call 可视化

### P4-C: 开发者体验 (High)

- [ ] **P4-7** 工作目录选择器: TopBar 或 session 属性, dialog 选目录
- [ ] **P4-8** System Prompt 编辑器: 设置页 + ChatPanel 可折叠区域
- [ ] **P4-9** 对话导出: JSON/Markdown 格式导出

### P4-D: 设置完善 (Medium)

- [ ] **P4-10** MCP Server 管理: SettingsPage 新增 MCP 标签页
- [ ] **P4-11** 字体大小: uiStore + SettingsPage slider 联动
- [ ] **P4-12** Sandbox 策略选择: SettingsPage 安全性标签页

### P4-E: 清理 & 配置 (Low)

- [ ] **P4-13** 删除 dead Header.tsx, 修复重复 useKeyboardShortcuts
- [ ] **P4-14** tauri.conf.json: 版本号 + 标题栏 + 图标
- [ ] **P4-15** i18n 修补: loading/mode keys

---

## 已完成模块

### Rust Crates (12)

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

### Tauri IPC (51命令, 28 个 #[tauri::command])

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

### 前端 (55+文件, ~10,200行, 142 tests)

- [x] ChatPanel + MessageList + MessageInput + CodeBlock + ToolCallView
- [x] ApprovalOverlay → ApprovalQueue (工具审批 UI)
- [x] Sidebar (含归档区) + TopBar (动态模型选择器)
- [x] SettingsPage (Provider/Model/Bridge/Scheduler/Media)
- [x] SchedulerPage + GalleryPage
- [x] TerminalPanel + PreviewPanel + FileTree
- [x] i18n (EN + CN) 全覆盖
- [x] 流式中止 + 竞态修复
- [x] Provider 持久化 + 加密 API key 水合
- [x] 上下文压缩 /compact 命令
- [x] Checkpoint 前端面板 + rewind (P3-5)
- [x] 统一错误处理 (errors.ts + reportError)

### 测试覆盖

- 后端: 202 Rust tests (12 crates + 10 E2E, 全部通过)
- 前端: 142 tests (11 files, 全部通过)
  - components: MessageInput.test.tsx, Sidebar.test.tsx
  - stores: chatStore, providerStore, usageStore, uiStore, schedulerStore, checkpointStore, streaming
  - lib: errors.test.ts, persistence.test.ts

### 开发时间线

- 2026-04-19 Session A~J: P0+P1+P2 核心功能 (参见 CHANGELOG)
- 2026-04-19 Session K: P3-2 i18n + P3-3 错误处理 + P3-1 测试补充
- 2026-04-19 Session L: P3-6 Chinese Provider + P3-1 测试完善
- 2026-04-19 Session M: P3-4 E2E 集成测试 + 提交推送 (587aa31)
- 2026-04-19 Session N: P4 规划 + 开始开发
