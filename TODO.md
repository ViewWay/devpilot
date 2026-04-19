# DevPilot TODO

## Phase 1: Backend Crates ✅ (Complete)

- [x] **devpilot-protocol** — 470 lines, 34 tests
- [x] **devpilot-llm** — 2,785 lines, 2 tests
- [x] **devpilot-store** — 858 lines, 6 tests
- [x] **devpilot-tools** — 1,835 lines, 28 tests
- [x] **devpilot-core** — 1,311 lines, 16 tests
- [x] **devpilot-sandbox** — 728 lines, 17 tests
- [x] **devpilot-search** — 581 lines, 14 tests
- [x] **devpilot-scheduler** — 562 lines, 12 tests
- [x] **devpilot-bridge** — 799 lines, 12 tests
- [x] **devpilot-media** — 544 lines, 8 tests

## Phase 2: src-tauri IPC Integration ✅ (Complete)

- [x] 7 IPC command modules (store, llm, sandbox, search, scheduler, bridge, media)
- [x] AppState with SchedulerState, BridgeManager, MediaState
- [x] 21 Tauri invoke commands registered
- [x] All 155 workspace tests passing, clippy clean

## Phase 3: Frontend Integration (In Progress)

### ✅ Done

- [x] **Router 系统** — react-router-dom 路由 (chat/scheduler/gallery/settings)
- [x] **ActiveView 扩展** — scheduler + gallery 路由类型
- [x] **Sidebar 路由联动** — 底部按钮 navigate + active 高亮
- [x] **Streaming 修复** — 监听器注册提前到 invoke 前，解决竞态
- [x] **Abort 支持** — chatStore.abortStreaming() + stop 按钮
- [x] **归档会话** — 归档区 + 取消归档
- [x] **动态模型选择器** — TopBar 从 providerStore 动态获取模型
- [x] **模型管理 UI** — SettingsPage ProviderCard 增删改查模型

### 🔄 In Progress

- [ ] **SchedulerPanel** — 定时任务 CRUD、启用/禁用、执行历史
- [ ] **GalleryPanel** — 图片生成 (prompt + provider + size)、浏览、下载

### Planned

- [ ] **SettingsPage 扩展** — Bridge 通知配置、Sandbox 策略配置
- [ ] **IPC 层扩展** — ipc.ts 新增 scheduler/bridge/media invoke 调用
- [ ] **i18n 补全** — 新面板完整中英文翻译
- [ ] **Zustand stores** — schedulerStore, mediaStore, bridgeStore

## Phase 4: E2E & Polish (Planned)

- [ ] Tauri app build & smoke test
- [ ] Integration tests across crate boundaries
- [ ] Performance profiling (streaming latency)
- [ ] Accessibility audit

## Code Stats (as of 2026-04-19, commit 2d0328f)

| Component                | Lines      | Tests   |
| ------------------------ | ---------- | ------- |
| Rust backend (10 crates) | 10,473     | 155     |
| src-tauri (IPC layer)    | 1,264      | —       |
| React frontend (TS/TSX)  | 7,814      | —       |
| **Total**                | **19,551** | **155** |

## Priority Order

1. **SchedulerPage** — 完整定时任务管理面板
2. **GalleryPage** — 完整图片生成/浏览面板
3. SettingsPage 扩展 (Bridge + Sandbox)
4. IPC layer + Zustand stores
5. E2E testing
