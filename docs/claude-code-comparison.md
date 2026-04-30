# DevPilot vs Claude Code 对标分析

> 基于 claude-code-best/claude-code (65万行 TypeScript, 59+ 工具) 反编译仓库
> 生成时间: 2026-04-30

## 差距总览

| 维度       | Claude Code                 | DevPilot 当前                         | 差距        |
| ---------- | --------------------------- | ------------------------------------- | ----------- |
| 工具数量   | 59+ 个                      | 4 个 (bash/file_read/file_write/todo) | 🔴 巨大     |
| Agent 系统 | AgentTool + Task 树 + Swarm | AgentTool + Task 树 (基础)            | 🟡 中等     |
| 权限模型   | 6级模式 + 规则引擎          | 3级模式 (plan/auto/manual)            | 🟡 中等     |
| MCP 集成   | stdio/SSE/WS + 动态发现     | stdio 基础                            | 🟡 中等     |
| 上下文管理 | 多层 compact + 1M 支持      | 单层 compact                          | 🟡 中等     |
| Web 能力   | Fetch + Search + Browser    | 无                                    | 🔴 缺失     |
| LSP        | goToDef/refs/hover/diag     | 无                                    | 🔴 缺失     |
| 编辑器     | Monaco 只读                 | 无                                    | 🔴 缺失     |
| Git 可视化 | CLI (通过 Bash)             | GitPanel 基础                         | 🟢 已有框架 |
| 调度系统   | Cron + /loop + 持久化       | Cron 基础                             | 🟡 中等     |
| 文件编辑   | diff/patch 精确替换         | 无                                    | 🔴 缺失     |

## 优先级排序（按用户价值）

### P0: 立即可做（1-2 天）— 补齐基础工具

1. **FileEditTool** — 字符串精确替换编辑
   - Claude Code 方式: `old_string` + `new_string` + `replace_all`
   - DevPilot: 前端 Monaco 已有，缺 Tauri 后端 `file_edit` IPC
   - 影响: 用户无法在聊天中让 AI 改文件

2. **GrepTool / GlobTool** — 代码搜索
   - Claude Code: ripgrep 封装，支持 regex + glob + 多种输出模式
   - DevPilot: devpilot-search 已有 `search_files` IPC，但没暴露给 AI 作为工具
   - 影响: AI 无法在项目里搜索代码

3. **TodoWriteTool 完善** — 前端 UI 联动
   - Claude Code: 完整的 todo 列表 UI + spinner + 进度
   - DevPilot: 后端 `todo_write` 已有，缺前端 ChatPanel 中的 todo 展示

### P1: 核心体验（3-5 天）— 对齐 Claude Code 核心能力

4. **WebFetchTool** — URL 内容抓取
   - Claude Code: fetch URL → HTML→Markdown → 小模型摘要
   - DevPilot: 可用 Rust `reqwest` + `html2text` 实现

5. **Agent 子代理增强** — AgentTool 改进
   - Claude Code: 支持 `.claude/agents/` 目录自定义 agent
   - DevPilot: agent_type 已有，需增加 agent 配置文件加载

6. **Plan 模式增强** — EnterPlanMode/ExitPlanMode
   - Claude Code: 独立的 plan→explore→present→implement 流程
   - DevPilot: plan mode 已有但太简单，缺 interview phase

7. **权限规则引擎** — 细粒度权限控制
   - Claude Code: `.claude/settings.json` 中的 allow/deny 规则
   - DevPilot: 只有 3 级全局模式，无法按工具/路径设规则

### P2: 差异化（1 周）— DevPilot 桌面端优势

8. **LSPTool** — LSP 桥接
   - Claude Code: 支持 goToDefinition/refs/hover/workspaceSymbol 等 8 种操作
   - DevPilot: 桌面端优势，可以长期跑 LSP server，不用每次启动

9. **Monaco 编辑器写回** — 真正的代码编辑
   - Claude Code: 终端界面，只能通过工具改文件
   - DevPilot: 桌面端可以做真正的多 tab 编辑 + 保存

10. **WebBrowserTool** — 浏览器自动化
    - Claude Code: Computer Use MCP
    - DevPilot: 可用 Tauri WebView 做轻量版

### P3: 深度功能（持续迭代）

11. **多层 Context Compact** — 精细化上下文管理
    - Claude Code: auto-compact + micro-compact + snip-compact + session-memory-compact
    - DevPilot: 只有一层 compact

12. **Skill 系统** — 可安装/卸载的技能包
    - Claude Code: `/skill` 命令 + bundled skills + 社区搜索
    - DevPilot: skill 加载已有，缺搜索和社区

13. **Agent Swarm** — 多 agent 协作
    - Claude Code: SendMessage + TeamCreate + ListPeers
    - DevPilot: SharedBlackboard 已有，缺 agent 间直接通信

14. **NotebookEditTool** — Jupyter 支持
    - Claude Code: .ipynb 单元格编辑
    - DevPilot: 桌面端可以做更好的 notebook 渲染

## 关键借鉴点

### 1. FileEditTool 的 prompt 设计（最值得学）

```
- 必须先 Read 再 Edit（防误改）
- old_string 必须在文件中唯一
- replace_all 参数支持全局替换
- 最小唯一匹配：2-4 行足够
```

### 2. Compact 多层策略

```
auto-compact: 上下文超阈值时自动触发
micro-compact: 按消息级别精简（保留关键信息）
snip-compact: 裁剪过长的工具输出
session-memory-compact: 会话记忆提取
```

### 3. 权限模型

```
default: 询问用户
plan: 只读工具自动，写操作需确认
acceptEdits: 文件编辑自动通过
auto: 全部自动（仅内部）
bypassPermissions: 跳过所有权限检查
dontAsk: 不询问（信任所有）
```

### 4. Agent 配置文件

```
.claude/agents/reviewer.md:
---
description: Code review specialist
tools: [Read, Grep, Glob]
model: claude-sonnet-4
---
You are a code reviewer...
```

这种设计让用户可以自定义 agent，非常适合 DevPilot 的桌面端定位。

## 下一步行动

建议按 P0 → P1 顺序推进，先补 FileEditTool + GrepTool + WebFetchTool 这三个最基础的工具，
DevPilot 就能从"能聊天"变成"能干活"。
