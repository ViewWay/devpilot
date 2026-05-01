# AI Agent 前端竞品综合分析报告

> 分析对象：CodePilot (cc-haha) + Codex CLI + OpenCode
> 目标：提取最佳实践，落地到 DevPilot (Tauri 2 + React 19)

---

## 三仓技术栈总览

| 维度      | CodePilot            | Codex CLI             | OpenCode          |
| --------- | -------------------- | --------------------- | ----------------- |
| 语言      | TypeScript           | Rust                  | Go                |
| UI 框架   | React 18 + Tauri 2   | ratatui (TUI)         | BubbleTea (TUI)   |
| 状态管理  | Zustand 5            | 事件驱动              | Elm Architecture  |
| Markdown  | marked + DOMPurify   | pulldown-cmark        | Glamour           |
| 代码高亮  | Shiki 4 (WASM)       | syntect (250+语言)    | Chroma            |
| Diff 视图 | react-diff-viewer    | diffy (unified)       | 自研 side-by-side |
| 图表      | Mermaid 11 (全屏)    | 无                    | 无                |
| 流式控制  | 50ms setTimeout 节流 | Smooth/CatchUp 双模式 | pubsub 增量       |
| 权限      | 内联审批卡片         | 队列化模态覆盖层      | 阻塞式 channel    |
| 主题      | CSS 变量             | catppuccin 32主题     | 10主题 40+ token  |
| 虚拟滚动  | 无                   | 无                    | viewport + 缓存   |

---

## 6 大可落地设计（按优先级排序）

### 1. ToolCallGroup 分组折叠 (CodePilot)

**现状 DevPilot**: 每个工具调用独立渲染，连续 5 个工具调用占满屏幕
**CodePilot 做法**: 连续工具合并为一组，折叠显示摘要

- AgentToolGroup: 树形时间线（竖线+圆点+状态标签）
- ToolCallGroupMulti: "Read 3 files, Edited 2 files" 折叠摘要
- ToolCallTree: parentToolUseId 递归子调用

**落地方案**: 新建 ToolCallGroup.tsx，在 MessageList 中检测连续 tool 消息合并

### 2. Permission Dialog 内联 Diff (CodePilot + Codex + OpenCode)

**现状 DevPilot**: 审批弹窗只显示工具名 + 原始 JSON
**竞品做法**:

- CodePilot: Edit/Write 审批直接显示 react-diff-viewer
- Codex: approval_overlay.rs 模态覆盖 + 快捷键 y/a/n/e
- OpenCode: 按工具类型差异化内容（Bash=命令, Edit=side-by-side diff）

**落地方案**: ApprovalOverlay 中加 DiffPreview 组件，安装 react-diff-viewer-continued

### 3. ThinkingBlock 折叠 + 动画 (CodePilot + Codex)

**现状 DevPilot**: 思考内容直接展示在消息中
**竞品做法**:

- CodePilot: 默认折叠，80字预览，活跃时 CSS 光标动画 + 省略号
- Codex: shimmer.rs RGB sweep 动画 (sin 曲线驱动)

**落地方案**: AssistantMessage 中 thinkingContent 用 Collapsible 包裹，加 pulse 动画

### 4. 流式渲染双模式 (Codex)

**现状 DevPilot**: 60fps rAF 节流
**Codex 做法**: Smooth(打字机1行/tick) + CatchUp(积压时批量刷新)

- 进入 CatchUp: 队列>=8行 或 最老行>=120ms
- 退出 CatchUp: 队列<=2 且 最老行<=40ms
- 保留 raw source 用于窗口 resize 重绘

**落地方案**: chatStore 的流式节流升级为双模式

### 5. Mermaid 全屏预览 + 缩放 (CodePilot)

**现状 DevPilot**: Mermaid 内联渲染
**CodePilot 做法**: 全屏 Modal + 缩放控制(50%-300%) + 拖拽平移 + Ctrl+滚轮

**落地方案**: MermaidRenderer 加全屏 Modal + CSS transform scale

### 6. 工具参数摘要渲染 (OpenCode)

**现状 DevPilot**: 工具调用显示工具名 + 展开/折叠原始 JSON
**OpenCode 做法**: renderToolParams() 为每个工具提取关键参数摘要

- Bash: 只显示命令文本
- Edit: 显示文件路径 + 行范围
- Grep: 显示 pattern + 文件数
- Task: 递归嵌套子调用（缩进3格）

**落地方案**: ToolCallView 中每个 renderer 加参数摘要提取逻辑

---

## 实施优先级

| 优先级 | 功能                        | 工作量 | 影响               |
| ------ | --------------------------- | ------ | ------------------ |
| P0     | ToolCallGroup 分组折叠      | 2h     | 大幅减少消息流噪音 |
| P0     | Permission Dialog Diff 预览 | 1.5h   | 安全审批体验核心   |
| P1     | ThinkingBlock 折叠动画      | 1h     | 视觉体验提升       |
| P1     | 工具参数摘要渲染            | 1.5h   | 信息密度优化       |
| P2     | 流式双模式                  | 2h     | 高速流式体验       |
| P2     | Mermaid 全屏预览            | 1h     | 图表查看体验       |
