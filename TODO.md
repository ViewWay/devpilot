# DevPilot TODO

## 项目概况

- **版本**: 0.3.0 (开发中)
- **后端**: 10 Rust crates, 159 tests, 全部通过
- **前端**: 49 TS/TSX 文件, ~9,500 行
- **IPC**: 42 个 Tauri 命令已注册
- **编译**: cargo build OK, cargo clippy OK, tsc OK

---

## Phase 1: 核心可用性 (P0)

- [x] **P0-1** 数据库持久化: store.open_default() 路径已兼容 macOS dirs::data_dir() = Tauri app_data_dir
- [x] **P0-2** Agent Loop 集成: send_message_stream 调用 Agent::run(), EventBus→Tauri event bridge 完成
- [x] **P0-3** Tool Approval 前端 UI: ApprovalQueue 集成到 ChatPanel, resolveApproval + approveAll 完成
- [x] **P0-4** Tool Call 渲染: MessageList 支持 tool messages + ToolCallView + ToolCallList
- [x] **P0-5** Tauri Capabilities: capabilities/default.json 添加 fs/shell/dialog 权限

## Phase 2: Provider 管理 (P1)

- [x] **P1-1** Provider CRUD IPC: 持久化 providers 表 (list/get/upsert/delete + apiKey 参数)
- [x] **P1-2** API Key 加密: AES-256-GCM + 机器特定密钥派生
- [x] **P1-3** CSP 更新: tauri.conf.json 添加 DeepSeek/Qwen/Ollama 等 15+ 域名
- [x] **P1-4** Provider 水合: 启动时从 DB 加载 provider + 恢复加密 API key

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
- [x] devpilot-store (1,200行, 10 tests) — SQLite持久化 + AES加密
- [x] devpilot-tools (1,835行, 28 tests) — 工具注册+4内置工具
- [x] devpilot-core (1,311行, 16 tests) — Agent引擎+Session+EventBus
- [x] devpilot-sandbox (728行, 17 tests) — 沙箱执行策略
- [x] devpilot-search (581行, 14 tests) — 文件搜索
- [x] devpilot-scheduler (562行, 12 tests) — Cron调度器
- [x] devpilot-bridge (799行, 6 tests) — IM通知桥接
- [x] devpilot-media (544行, 8 tests) — 图像生成

### Tauri IPC (42命令)

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

### 前端 (49文件, ~9,500行)

- [x] ChatPanel + MessageList + MessageInput + CodeBlock + ToolCallView
- [x] ApprovalOverlay → ApprovalQueue (工具审批 UI)
- [x] Sidebar (含归档区) + TopBar (动态模型选择器)
- [x] SettingsPage (Provider/Model/Bridge/Scheduler/Media)
- [x] SchedulerPage + GalleryPage
- [x] TerminalPanel + PreviewPanel + FileTree
- [x] i18n (EN + CN) 全覆盖
- [x] 流式中止 + 竞态修复
- [x] Provider 持久化 + 加密 API key 水合

### Phase 1 + Phase 2 Agent Loop + Provider (本次 Session)

- [x] AppState 添加 Agent + EventBus
- [x] send_message_stream 改用 Agent::run() 替代直接 LLM 调用
- [x] CoreEvent→Tauri event bridge (chunk/tool-start/tool-result/approval/done/error/compacted)
- [x] chatStore 监听所有流式事件
- [x] ApprovalQueue 集成到 ChatPanel
- [x] Tool Call 渲染 (端到端)
- [x] Tauri capabilities (fs/shell/dialog)
- [x] CSP 更新 (15+ Provider 域名)
- [x] Provider CRUD IPC (5 命令)
- [x] API Key AES-256-GCM 加密
- [x] Provider 水合 (从 DB 加载 + API key 解密)
