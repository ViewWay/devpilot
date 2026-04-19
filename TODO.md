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

- [ ] **Router 路由系统** — 页面切换 (chat / scheduler / gallery / settings)
- [ ] **SchedulerPanel** — 定时任务 CRUD、启用/禁用、执行历史
- [ ] **GalleryPanel** — 图片生成 (prompt → provider)、浏览、下载
- [ ] **SettingsPage 扩展** — Bridge 通知配置、Sandbox 策略配置
- [ ] **IPC 层扩展** — ipc.ts 新增 scheduler/bridge/media invoke 调用
- [ ] **i18n 补全** — 所有新面板的中英文翻译
- [ ] **Zustand stores** — schedulerStore, mediaStore, bridgeStore

## Phase 4: E2E & Polish (Planned)

- [ ] Tauri app build & smoke test
- [ ] Integration tests across crate boundaries
- [ ] Performance profiling (streaming latency)
- [ ] Accessibility audit

## Code Stats (as of 2026-04-19)

| Component                | Lines      | Tests   |
| ------------------------ | ---------- | ------- |
| Rust backend (10 crates) | 10,473     | 155     |
| src-tauri (IPC layer)    | 1,264      | —       |
| React frontend (TS/TSX)  | 7,420      | —       |
| **Total**                | **19,157** | **155** |

## Priority Order

1. Frontend routing + SchedulerPanel + GalleryPanel
2. SettingsPage extension (Bridge + Sandbox)
3. IPC layer + Zustand stores for new features
4. E2E testing
