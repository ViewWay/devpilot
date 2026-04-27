# DevPilot 产品需求规范 (PRD v2)

> 版本: 2.0 | 更新: 2026-04-27 | 状态: 规划中

## 1. 产品概述

DevPilot 是一款多模型 AI 编码代理桌面客户端，基于 **Tauri 2 (Rust) + React 19** 构建。
对标产品: Claude Code (CLI), Cursor, Windsurf。

### 1.1 技术栈

| 层     | 技术                         |
| ------ | ---------------------------- |
| 桌面壳 | Tauri 2 (Rust)               |
| 前端   | React 19 + TypeScript + Vite |
| 样式   | Tailwind CSS 4 + Radix UI    |
| 数据库 | SQLite (rusqlite)            |
| 终端   | xterm.js + portable-pty      |
| 编辑器 | Monaco Editor                |
| 高亮   | Shiki                        |
| 状态   | Zustand                      |

### 1.2 架构

```
devpilot/
├── crates/               # Rust 后端 (17 crates)
│   ├── devpilot-core/    # 会话、代理循环、事件总线、压缩 (3099行)
│   ├── devpilot-llm/     # 多Provider LLM客户端 (7747行)
│   ├── devpilot-tools/   # 工具注册、Shell、文件操作、Hook (7596行)
│   ├── devpilot-store/   # SQLite持久化、配置 (4864行)
│   ├── devpilot-protocol/ # 共享类型 (1201行)
│   ├── devpilot-git/     # Git集成 git2 (1163行)
│   ├── devpilot-agent/   # 子代理、任务管理 (638行)
│   ├── devpilot-mcp/     # MCP插件系统 (1503行)
│   ├── devpilot-media/   # 图片生成 (1473行)
│   ├── devpilot-bridge/  # IM桥接 Telegram/Feishu等 (1028行)
│   ├── devpilot-sandbox/ # 沙盒执行 (799行)
│   ├── devpilot-search/  # 模糊+内容搜索 (581行)
│   ├── devpilot-memory/  # 人格/记忆管理 (844行)
│   ├── devpilot-index/   # tree-sitter符号索引 (743行)
│   ├── devpilot-remote/  # WebSocket移动端 (614行)
│   └── devpilot-scheduler/ # 定时任务 (826行)
├── src-tauri/            # Tauri入口、IPC命令 (21个命令文件)
├── src/                  # React前端
│   ├── app/              # 6个页面
│   ├── components/       # 35聊天 + 7布局组件
│   ├── stores/           # 21个Zustand store
│   ├── hooks/            # 自定义hooks
│   ├── lib/              # 业务逻辑
│   └── i18n/             # EN + CN (855 keys)
└── docs/                 # 文档
```

## 2. 功能需求清单

### 2.1 核心代理 (Core Agent)

| #   | 功能                | 优先级 | 状态    | 目标版本 | 验收标准                      |
| --- | ------------------- | ------ | ------- | -------- | ----------------------------- |
| C01 | Agent Loop 流式推理 | P0     | done    | 0.5.0    | 支持多轮对话+流式输出+中断    |
| C02 | 多Provider LLM      | P0     | done    | 0.5.0    | OpenAI/Anthropic/GLM/Ollama等 |
| C03 | 工具系统            | P0     | done    | 0.5.0    | Shell/文件读写/搜索/MCP调用   |
| C04 | 权限审批门          | P0     | done    | 0.5.0    | Plan/Auto/Manual三档+风险评估 |
| C05 | Hook系统            | P1     | done    | 0.5.5    | 工具执行前后Hook+用户自定义   |
| C06 | 子代理系统          | P1     | partial | 0.6.7    | 任务派发+进度追踪+结果回收    |
| C07 | LLM上下文压缩       | P1     | partial | 0.6.9    | 规则截断+LLM摘要+自动触发     |
| C08 | Web工具集           | P2     | todo    | 0.7.0    | WebSearch/WebFetch/WebBrowser |
| C09 | LSP集成             | P2     | todo    | 0.7.2    | 跳转定义/引用/诊断            |
| C10 | Todo工具            | P2     | todo    | 0.7.3    | 代理可管理待办列表            |

### 2.2 Git 集成

| #   | 功能                                             | 优先级 | 状态 | 目标版本 | 验收标准                     |
| --- | ------------------------------------------------ | ------ | ---- | -------- | ---------------------------- |
| G01 | 基础操作 status/log/diff/commit                  | P0     | done | 0.5.0    | git2原生实现                 |
| G02 | 分支管理                                         | P0     | done | 0.5.0    | 创建/切换/列表/删除          |
| G03 | 远程操作 fetch/pull/push                         | P0     | done | 0.5.0    | 支持多远程                   |
| G04 | Stash                                            | P1     | done | 0.5.5    | save/pop/list/apply          |
| G05 | Worktree                                         | P1     | done | 0.5.5    | 创建/列表/删除               |
| G06 | 高级操作 blame/diff_commits/revert/discard/merge | P1     | done | 0.5.5    | 全部git2实现                 |
| G07 | Git UI面板                                       | P2     | todo | 0.7.7    | 独立面板显示暂存区+差异+提交 |
| G08 | GitHub集成                                       | P2     | todo | 0.7.9    | PR/Issue/CodeReview          |

### 2.3 代码预览/编辑

| #   | 功能                 | 优先级 | 状态 | 目标版本 | 验收标准                    |
| --- | -------------------- | ------ | ---- | -------- | --------------------------- |
| E01 | 语法高亮 (Shiki)     | P0     | done | 0.5.0    | lazy-load多语言             |
| E02 | Monaco编辑器         | P1     | done | 0.5.0    | 代码编辑+diff模式           |
| E03 | DiffView (对话内)    | P1     | done | 0.5.0    | LCS差异+着色                |
| E04 | 文件树浏览器         | P1     | todo | 0.6.0    | 可折叠+图标+工作区检测      |
| E05 | 外部编辑器打开       | P1     | todo | 0.6.1    | VS Code/vim+$EDITOR检测     |
| E06 | DiffView重写 (Myers) | P2     | todo | 0.6.2    | Rust similar crate+虚拟滚动 |
| E07 | 内联Diff渲染         | P2     | todo | 0.6.4    | 对话内彩色内联diff+行号     |
| E08 | PDF/Slide预览        | P3     | todo | 0.8.2    | 应用内PDF查看器             |

### 2.4 UI/UX

| #   | 功能             | 优先级 | 状态 | 目标版本 | 验收标准                       |
| --- | ---------------- | ------ | ---- | -------- | ------------------------------ |
| U01 | 双面板/分屏      | P1     | done | 0.5.5    | 拖拽排序+会话切换              |
| U02 | 侧边栏           | P1     | done | 0.5.5    | cc-haha设计系统                |
| U03 | 斜杠命令(基础)   | P1     | todo | 0.6.5    | /help /clear /compact /model   |
| U04 | 斜杠命令(高级)   | P2     | todo | 0.6.6    | /doctor /context /stats /usage |
| U05 | 键盘快捷键       | P1     | todo | 0.7.4    | 可自定义+vim模式基础           |
| U06 | 命令面板 (Cmd+K) | P2     | todo | 0.7.5    | 模糊搜索+最近文件              |
| U07 | 主题系统         | P2     | todo | 0.8.4    | 深色/浅色/自定义+编辑器同步    |
| U08 | 动画/过渡        | P3     | todo | 0.9.2    | 微交互+流畅过渡                |

### 2.5 多平台/桥接

| #   | 功能           | 优先级 | 状态    | 目标版本 | 验收标准                             |
| --- | -------------- | ------ | ------- | -------- | ------------------------------------ |
| M01 | IM桥接 (5平台) | P1     | done    | 0.5.5    | Telegram/Feishu/Discord/WeChat/Slack |
| M02 | MCP插件市场    | P1     | done    | 0.5.5    | 远程目录+安装+诊断                   |
| M03 | 移动端配对     | P2     | partial | 0.8.5    | WebSocket远程+会话镜像               |
| M04 | 远程SSH会话    | P3     | todo    | -        | SSH连接+远程代理执行                 |

### 2.6 高级功能

| #   | 功能        | 优先级 | 状态 | 目标版本 | 验收标准                     |
| --- | ----------- | ------ | ---- | -------- | ---------------------------- |
| A01 | 插件系统    | P2     | todo | 0.7.6    | 加载/卸载插件+插件API        |
| A02 | Agent编辑器 | P2     | todo | 0.6.8    | 创建/编辑自定义代理          |
| A03 | 语音系统    | P3     | todo | 0.8.0    | TTS输出+Whisper STT          |
| A04 | 会话恢复    | P2     | todo | 0.7.7    | 崩溃恢复+快照                |
| A05 | 多文件附件  | P2     | todo | 0.7.9    | 拖拽多文件+图片+PDF          |
| A06 | 项目管理    | P2     | todo | 0.8.3    | 项目列表+工作区切换+项目设置 |

## 3. 非功能需求

| 类别   | 指标        | 目标               |
| ------ | ----------- | ------------------ |
| 性能   | 冷启动      | < 2秒              |
| 性能   | 流式首Token | < 500ms            |
| 性能   | 内存占用    | < 200MB (空闲)     |
| 性能   | Diff渲染    | 10K行 < 1秒        |
| 可靠性 | 崩溃恢复    | 自动保存+会话快照  |
| 可用性 | i18n        | EN + CN 完整覆盖   |
| 安全   | 工具审批    | 所有危险操作需确认 |
| 安全   | 沙盒        | 可选沙盒执行       |

## 4. 约束

- Rust 编译目标: macOS (aarch64/x86_64), Windows, Linux
- 最低系统: macOS 12+, Windows 10+, Ubuntu 20.04+
- Rust edition: 2021
- Node: >= 18
- 不使用 Electron，纯 Tauri 原生
