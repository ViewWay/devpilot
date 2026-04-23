# Phase 11 Implementation Plan / 功能实现计划

## Overview

DevPilot v0.4.0 已完成 P0-P10（12 Rust crates, 24k 行后端 + 95 TS 文件前端, 474 FE + 61 BE tests）。
本阶段对照需求文档 `/docs/research/devpilot-requirements.md` 的 P1/P2 功能，补齐核心缺口。

## Current State Summary

| Dimension          | Count           | Status      |
| ------------------ | --------------- | ----------- |
| Rust crates        | 12 (24k+ lines) | All passing |
| Frontend files     | 95 TS/TSX       | All passing |
| Zustand stores     | 17              | Complete    |
| IPC commands       | 86+             | Complete    |
| Frontend tests     | 474 (35 files)  | All passing |
| Backend tests      | 61 (--lib)      | All passing |
| cargo build/clippy | OK              | Clean       |
| tsc --noEmit       | OK              | Clean       |

## Gap Analysis (需求 vs 已完成)

### P1 Enhancements — 缺口清单

| ID    | Feature                            | Status                       | Complexity | Priority |
| ----- | ---------------------------------- | ---------------------------- | ---------- | -------- |
| P1-01 | Code Index (tree-sitter + BM25)    | MISSING                      | High       | Critical |
| P1-02 | Symbol Search (Cmd+Shift+O)        | MISSING                      | Medium     | High     |
| P1-05 | Provider Failover                  | Partial (retry in openai.rs) | Low        | Medium   |
| P1-06 | Git Panel (status/diff/log/commit) | MISSING                      | Medium     | High     |
| P1-07 | Global Hotkey (Cmd+Shift+A)        | MISSING                      | Low        | Low      |
| P1-08 | Image Generation Gallery           | DONE (P2)                    | -          | -        |
| P1-09 | Font/Size Config                   | DONE (P8)                    | -          | -        |
| P1-10 | Data Import/Export                 | DONE (P7)                    | -          | -        |
| P1-11 | Claude Code Session Import         | DONE (P10)                   | -          | -        |

### P2 Advanced — 缺口清单

| ID    | Feature                      | Status                 | Complexity | Priority |
| ----- | ---------------------------- | ---------------------- | ---------- | -------- |
| P2-01 | Bridge Remote Control        | DONE (devpilot-bridge) | -          | -        |
| P2-02 | Agent Workflow Orchestration | MISSING                | High       | P2       |
| P2-05 | Plugin System                | MISSING                | High       | P3       |
| P2-08 | Conversation Branching       | MISSING                | Medium     | P2       |
| P2-10 | Model Comparison             | MISSING                | Medium     | P3       |
| P2-12 | Multi-Window                 | MISSING                | Medium     | P3       |

---

## Phase 11 Plan: Core Gap Fill (P1-06 + P1-05 + P1-01)

优先做 **实用功能补全**：Git 面板 > 供应商故障转移 > 代码库索引。

### P11-A: Git Panel (P1-06) — Critical/High

**Goal:** 可视化 Git 操作面板：status/diff/log/commit/stash

#### Step 1: devpilot-git crate (Rust)

- Complexity: Medium
- Files: `crates/devpilot-git/Cargo.toml`, `crates/devpilot-git/src/lib.rs`, etc.
- Dependencies: `git2` (already in Cargo.toml)
- Operations:
  - `git_status()` — working tree status (modified/added/deleted/untracked)
  - `git_diff()` — unstaged diff, staged diff
  - `git_log()` — commit history (hash, message, author, time)
  - `git_commit()` — stage all + commit with message
  - `git_stash()` / `git_stash_pop()` — stash operations
  - `git_branches()` — list/create/switch branches
- Verification: `cargo test -p devpilot-git`

#### Step 2: Git IPC commands

- Complexity: Low
- Files: `src-tauri/src/commands/git.rs`, update `commands/mod.rs`
- Commands: `git_status`, `git_diff`, `git_log`, `git_commit`, `git_stash`, `git_branches`
- Verification: `cargo build`

#### Step 3: Frontend GitPanel component

- Complexity: Medium
- Files: `src/components/panels/GitPanel.tsx`, `src/stores/gitStore.ts`
- UI: Tabbed panel (Status | Log | Diff)
  - Status tab: file list with status icons, stage/unstage, commit input
  - Log tab: commit history list
  - Diff tab: file diff viewer (reuse DiffView.tsx)
- Verification: `tsc --noEmit` + manual

#### Step 4: Git i18n + integration

- Complexity: Low
- Files: `src/i18n/en.ts`, `src/i18n/zh.ts`, `src/components/panels/RightPanelTabs.tsx`
- Add Git tab to right panel tabs
- Verification: All builds pass

---

### P11-B: Provider Failover (P1-05) — Medium

**Goal:** 主模型失败自动切备用模型

#### Step 1: Failover logic in devpilot-llm

- Complexity: Low
- Files: `crates/devpilot-llm/src/failover.rs`
- Logic: Chain of providers per request, try next on transient error
- Config: ProviderGroup { primary, fallbacks[] }
- Verification: Unit tests with mock providers

#### Step 2: Failover config in provider settings

- Complexity: Low
- Files: `crates/devpilot-protocol/src/types.rs`, frontend `providerStore.ts`
- Add fallback_providers field to Provider
- Verification: `cargo test`

#### Step 3: Failover UI indicator

- Complexity: Low
- Files: `src/components/chat/ChatPanel.tsx` or `TopBar.tsx`
- Show badge when using fallback provider
- Verification: Visual check

---

### P11-C: Code Index + Symbol Search (P1-01 + P1-02) — High Complexity

**Goal:** tree-sitter AST 解析 + BM25 关键词索引 + 符号定义搜索

#### Step 1: devpilot-index crate skeleton

- Complexity: High
- Files: `crates/devpilot-index/Cargo.toml`, `src/lib.rs`, `src/bm25.rs`, `src/symbol.rs`, `src/parser.rs`
- Dependencies: `tree-sitter`, `tree-sitter-rust`, `tree-sitter-typescript`, `tree-sitter-python`
- Core:
  - `parse_file()` — tree-sitter parse → extract symbols (fn, struct, class, impl, etc.)
  - `build_index()` — scan project files, build symbol table + BM25 inverted index
  - `search_symbols()` — keyword/substring search across symbols
  - `search_content()` — BM25 content search
- Verification: `cargo test -p devpilot-index`

#### Step 2: Index IPC commands

- Complexity: Low
- Files: `src-tauri/src/commands/index.rs`
- Commands: `index_project`, `search_symbols`, `search_content`, `index_status`

#### Step 3: Frontend SymbolSearch popup

- Complexity: Medium
- Files: `src/components/SymbolSearchPopup.tsx`
- UI: Cmd+Shift+O popup, search results with file:line, click to preview
- Verification: Manual test

---

## Risk Assessment

| Risk                             | Probability | Impact | Mitigation                       |
| -------------------------------- | ----------- | ------ | -------------------------------- |
| tree-sitter crate compat issues  | Medium      | Medium | Pin versions, test parsing early |
| git2 performance on large repos  | Low         | Medium | Async + limit result count       |
| BM25 index size for big projects | Medium      | Low    | Lazy indexing, .gitignore filter |
| Frontend panel overflow          | Low         | Low    | Tabs, virtual scrolling          |

## Success Criteria

- [ ] Git panel: status/diff/log/commit all working
- [ ] Failover: auto-switch to backup provider on error
- [ ] Code index: symbol search finds definitions across project
- [ ] All existing tests still pass (474 FE + 61 BE)
- [ ] cargo build/clippy/tsc all clean

## Estimated Effort

| Phase            | Steps   | Estimate      |
| ---------------- | ------- | ------------- |
| P11-A Git Panel  | 4 steps | 2-3 hours     |
| P11-B Failover   | 3 steps | 1 hour        |
| P11-C Code Index | 3 steps | 3-4 hours     |
| **Total**        |         | **6-8 hours** |

## Recommended Execution Order

```
P11-A (Git Panel)     → Most visible user value, medium complexity
    ↓
P11-B (Failover)      → Quick win, low complexity
    ↓
P11-C (Code Index)    → Highest complexity, core differentiator
```
