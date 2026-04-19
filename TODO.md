# DevPilot TODO

## Backend Crates (10-crate architecture)

### Completed

- [x] **devpilot-protocol** — 470 lines, 34 tests, shared types
- [x] **devpilot-llm** — 2,785 lines, 2 tests, multi-provider LLM client
- [x] **devpilot-store** — 858 lines, 6 tests, SQLite persistence
- [x] **devpilot-tools** — 1,835 lines, 28 tests, tool registry + 4 built-in tools
- [x] **devpilot-core** — 1,311 lines, 16 tests, agent loop + session + event bus
- [x] **devpilot-sandbox** — 728 lines, 17 tests, sandboxed command execution
- [x] **devpilot-search** — 581 lines, 14 tests, fuzzy filename + regex content search
- [x] **devpilot-scheduler** — 562 lines, 12 tests, cron task scheduler
- [x] **devpilot-bridge** — 799 lines, 12 tests, IM/notification integrations
- [x] **devpilot-media** — 544 lines, 8 tests, image generation

### In Progress

- [ ] **src-tauri integration** — Wire all 10 crates into Tauri IPC commands

### Planned

- [ ] **Frontend integration** — Connect React UI to new backend features
- [ ] **E2E testing** — Integration tests across crate boundaries

## Code Stats (as of 2026-04-19)

| Component                | Lines      | Tests   |
| ------------------------ | ---------- | ------- |
| Rust backend (10 crates) | 10,473     | 155     |
| src-tauri (IPC layer)    | ~640       | —       |
| React frontend (TS/TSX)  | 7,420      | —       |
| **Total**                | **18,533** | **155** |

## Priority Order

1. src-tauri integration (wire new crates into IPC)
2. Frontend integration (settings UI, bridge panel, scheduler UI)
3. E2E testing
