# DevPilot Development Log

## 2026-04-19 Session

### Phase 1: devpilot-sandbox

**Goal:** Sandboxed command execution with resource limits and filesystem access control.

**Implementation:**

- `SandboxPolicy` with 3 presets (default/permissive/strict)
- `SandboxedCommand` builder — validates commands against policy before execution
- `FsRule` system with first-match-wins semantics (Read/Write/Deny)
- Network policy, resource limits, size limits

**Issues & Fixes:**

1. **Lifetime issue** — `SandboxedCommand` originally borrowed `&'a SandboxPolicy`, but `new()` returned temporary. Fixed by making policy fully owned (no lifetime parameter).
2. **FsRule strict policy** — `Deny "/"` was placed after `Write "/tmp/sandbox"`, blocking the allowed path. Fixed with first-match-wins: rules checked in order, first match determines outcome.
3. **Default policy missing /home** — test expected `/home/user/code` to be allowed but no rule covered it. Added `FsRule::Read("/home/")` to default policy.

**Result:** 728 lines, 17 tests, commit `f2e3d15`

---

### Phase 2: devpilot-search

**Goal:** File search engine with fuzzy filename matching and regex content search.

**Implementation:**

- `SearchEngine` — async search dispatching to file/content modes
- `fuzzy_match()` — character sequence scoring (consecutive bonus, word boundary bonus, coverage bonus, length penalty)
- `search_file()` — regex line-by-line matching with async buffered reader
- `glob_to_regex()` — simple glob → regex conversion for file filtering
- Concurrent content search with tokio semaphore

**Issues & Fixes:**

1. **Glob char pattern typo** — `'{' '}'` missing `|` separator → `'{' | '}'`
2. **Fuzzy word_boundary test** — `fuzzy_match("r", "xyzabc")` returns `None` because "xyzabc" has no 'r'. Changed to `fuzzy_match("r", "parser")`.
3. **Test relative paths** — `cargo test` runs from `target/` dir, relative paths like `crates/devpilot-search/src` don't resolve. Fixed with `CARGO_MANIFEST_DIR` + double `.parent()` traversal.
4. **Missing tempfile dev-dependency** — content.rs tests use `tempfile::NamedTempFile`. Added `tempfile = "3"` to `[dev-dependencies]`.

**Result:** 581 lines, 14 tests, commit `904e161`

---

### Phase 3: devpilot-scheduler

**Goal:** Cron task scheduler with async execution loop.

**Implementation:**

- `Scheduler` — async loop: find soonest task, sleep, fire due tasks, repeat
- `TaskDef` — cron expression, max executions, pause/resume, execution tracking
- `TaskAction` — ShellCommand, HttpRequest, Custom (extensible)
- `TaskCallback` — external handler for task execution events

**Issues & Fixes:**

1. **Schedule not Default** — `cron::Schedule` doesn't implement `Default`, so `TaskDef` couldn't derive it. Fixed by removing `#[derive(Default)]` and storing `cron_expr: String` instead of `Schedule` directly. Schedule parsed on-demand via `fn schedule(&self)`.
2. **Unused imports** — `TaskAction`, `TaskId` imported but unused after refactor. Fixed by `cargo clippy --fix`.

**Result:** 562 lines, 12 tests, commit `aa2cdd6`

---

### Workspace Totals After This Session

| Metric   | Before  | After   |
| -------- | ------- | ------- |
| Crates   | 5       | 8       |
| Rust LOC | ~7,200  | 9,853   |
| Tests    | 58      | 101     |
| Commits  | bd61612 | aa2cdd6 |

All quality gates passing: `cargo fmt`, `cargo clippy -D warnings`, `cargo test --workspace`.
