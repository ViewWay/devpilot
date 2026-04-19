# DevPilot TODO

## Backend Crates (10-crate architecture)

### Completed

- [x] **devpilot-protocol** — 470 lines, 6 tests, shared types
- [x] **devpilot-llm** — 2,785 lines, 2 tests, multi-provider LLM client
- [x] **devpilot-store** — 801 lines, 6 tests, SQLite persistence
- [x] **devpilot-tools** — 1,835 lines, 28 tests, tool registry + 4 built-in tools
- [x] **devpilot-core** — 1,311 lines, 16 tests, agent loop + session + event bus
- [x] **devpilot-sandbox** — 728 lines, 17 tests, sandboxed command execution
- [x] **devpilot-search** — 581 lines, 14 tests, fuzzy filename + regex content search
- [x] **devpilot-scheduler** — 562 lines, 12 tests, cron task scheduler

### In Progress

- [ ] **devpilot-bridge** — IM/notification integrations (Telegram, Feishu, etc.)
- [ ] **devpilot-media** — Image generation support

### Planned

- [ ] **src-tauri integration** — Wire all new crates into Tauri IPC commands
- [ ] **Frontend integration** — Connect React UI to new backend features

## Code Stats (as of 2026-04-19)

| Component               | Lines      | Tests   |
| ----------------------- | ---------- | ------- |
| Rust backend (8 crates) | 9,853      | 101     |
| src-tauri (IPC layer)   | 646        | —       |
| React frontend (TS/TSX) | 7,420      | —       |
| **Total**               | **17,919** | **101** |

## Priority Order

1. devpilot-bridge
2. devpilot-media
3. src-tauri integration (wire new crates into IPC)
4. Frontend integration (settings UI, bridge panel, scheduler UI)
