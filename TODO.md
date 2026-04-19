# DevPilot TODO

## 项目概况

- **版本**: 0.3.0 (开发中)
- **后端**: 10 Rust crates, 155 tests, 全部通过
- **前端**: 49 TS/TSX 文件, ~9,000 行
- **IPC**: 37 个 Tauri 命令已注册
- **编译**: cargo build OK, cargo clippy OK

---

## Phase 1: 核心可用性 (P0)

- [x] **P0-1** 数据库持久化: store.open_default() 路径已兼容 macOS dirs::data_dir() = Tauri app_data_dir
- [x] **P0-2** Agent Loop 集成: send_message_stream 调用 Agent::run(), EventBus→Tauri event bridge 完成
- [>] **P0-3** Tool Approval 前端 UI: 审批面板 (事件监听已就绪, ApprovalOverlay组件已有, 需集成到ChatPanel)
- [ ] **P0-4** Tool Call 渲染: MessageList 支持 tool_use/tool_result ContentBlock (事件监听已就绪)
- [ ] **P0-5** Tauri Capabilities: 添加 fs/shell/dialog 权限

## Phase 2: Provider 管理 (P1)

- [ ] **P1-1** Provider CRUD IPC: 持久化 providers 表 (create/update/delete/list)
- [ ] **P1-2** API Key 加密: AES-256-GCM 或 OS keyring
- [ ] **P1-3** CSP 更新: tauri.conf.json 添加 DeepSeek/Qwen/Ollama 域名
- [ ] **P1-4** Provider 水合: 启动时从 DB 加载 provider 到 providerStore

## Phase 3: 高级功能 (P2)

- [ ] **P2-1** 上下文压缩: 接入 devpilot-core compact_messages
- [ ] **P2-2** Checkpoint / Rewind: checkpoint 持久化 + rewind 逻辑
- [ ] **P2-3** MCP Client: stdio/sse transport, tool discovery
- [ ] **P2-4** 流式使用量追踪: stream_done 后持久化 usage

## Phase 4: 打磨 (P3)

- [ ] **P3-1** 前端测试补充: LLM 交互/流式/persistence 测试
- [ ] **P3-2** i18n 完善: 所有 UI 文本中英文覆盖
- [ ] **P3-3** 错误处理统一: toast + tracing
- [ ] **P3-4** E2E 测试: Tauri 集成测试

---

## 已完成模块

### Rust Crates (10)

- [x] devpilot-protocol (470行, 34 tests) — 共享类型
- [x] devpilot-llm (2,785行, 34 tests) — 多Provider LLM客户端
- [x] devpilot-store (867行, 6 tests) — SQLite持久化
- [x] devpilot-tools (1,835行, 28 tests) — 工具注册+4内置工具
- [x] devpilot-core (1,311行, 16 tests) — Agent引擎+Session+EventBus
- [x] devpilot-sandbox (728行, 17 tests) — 沙箱执行策略
- [x] devpilot-search (581行, 14 tests) — 文件搜索
- [x] devpilot-scheduler (562行, 12 tests) — Cron调度器
- [x] devpilot-bridge (799行, 6 tests) — IM通知桥接
- [x] devpilot-media (544行, 8 tests) — 图像生成

### Tauri IPC (37命令)

- [x] Session CRUD (5)
- [x] Message CRUD (3)
- [x] Settings (3)
- [x] Usage (1)
- [x] LLM send_message/stream/check/list (4)
- [x] Tools list/execute/approval (4)
- [x] Sandbox execute/policy (2)
- [x] Search (1)
- [x] Scheduler CRUD+pause/resume (5)
- [x] Bridge CRUD+send+enable/disable (6)
- [x] Media generate/providers (2)

### 前端 (49文件, ~9,000行)

- [x] ChatPanel + MessageList + MessageInput + CodeBlock + ToolCallView
- [x] Sidebar (含归档区) + TopBar (动态模型选择器)
- [x] SettingsPage (Provider/Model/Bridge/Scheduler/Media)
- [x] SchedulerPage + GalleryPage
- [x] TerminalPanel + PreviewPanel + FileTree
- [x] i18n (EN + CN) 全覆盖
- [x] 流式中止 + 竞态修复

### Phase 1 Agent Loop 集成 (本次 Session)

- [x] AppState 添加 Agent + EventBus
- [x] start_event_bridge() — EventBus → Tauri app.emit() 桥接
- [x] send_message_stream 改用 Agent::run() 替代直接 LLM 调用
- [x] CoreEvent re-export
- [x] chatStore 添加 stream-tool-start/stream-tool-result/stream-approval 事件监听
- [x] IPC resolve_tool_approval 类型修正 (request: { requestId, approved })
- [ ] ApprovalOverlay 集成到 ChatPanel (当前自动批准)
- [ ] Tool Call 渲染验证 (端到端)
