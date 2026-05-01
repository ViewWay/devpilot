# CodePilot (cc-haha) 前端架构学习报告

> 源码位置: /Users/yimiliya/github/vibecoding/cc-haha/desktop/src/
> 142 个 TS/TSX 文件，用于对比学习改进 DevPilot

---

## 1. 技术栈对比

| 维度      | CodePilot                             | DevPilot              |
| --------- | ------------------------------------- | --------------------- |
| 桌面框架  | Tauri 2 + Vite 6                      | Tauri 2 + Vite        |
| React     | 18.3                                  | 19                    |
| 状态管理  | Zustand 5.0.3                         | Zustand               |
| 样式      | Tailwind CSS 4 + CSS 变量             | Tailwind 4 + CSS 变量 |
| 代码高亮  | Shiki 4 (WASM) + prism-react-renderer | Shiki                 |
| Markdown  | marked 15 + DOMPurify                 | react-markdown        |
| Diff 视图 | react-diff-viewer-continued           | 无                    |
| 图表      | Mermaid 11 (全屏预览+缩放)            | Mermaid               |
| 图标      | Material Symbols Outlined             | Lucide                |
| 构建      | Bun + Vite                            | npm + Vite            |
| 测试      | Vitest + Testing Library              | Vitest                |

---

## 2. 核心架构亮点

### 2.1 Per-Session State Map

每个会话独立状态快照，支持多标签页同时活跃：

```ts
sessions: Record<string, PerSessionState>;
```

### 2.2 UIMessage 扁平化联合类型

将服务端嵌套 content blocks 扁平化为有序数组，极大简化渲染：

```ts
type UIMessage =
  | { type: "user_text"; content: string }
  | { type: "assistant_text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_use"; toolName: string; toolUseId: string; input: unknown }
  | {
      type: "tool_result";
      toolUseId: string;
      content: unknown;
      isError: boolean;
    }
  | { type: "permission_request"; requestId: string; toolName: string };
```

### 2.3 ToolCallGroup 三层渲染

1. **AgentToolGroup** — Agent 工具树形时间线（竖线+圆点+状态标签）
2. **ToolCallGroupMulti** — 混合工具折叠摘要（"Read 3 files, Edited 2 files"）
3. **ToolCallTree** — 递归子工具调用（parentToolUseId 关联）

### 2.4 流式节流（模块级变量）

```ts
let pendingDelta = ''
let flushTimer = null
// content_delta 累积文本，50ms 节流刷新到 Zustand
case 'content_delta':
  pendingDelta += msg.text
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      update(s => ({ streamingText: s.streamingText + text }))
    }, 50)
  }
```

### 2.5 Permission Dialog Diff 预览

Edit/Write 操作审批时直接内联显示 react-diff-viewer diff，
三个操作级别：Allow / Allow for Session / Deny

### 2.6 自研 WebSocketManager

单例类，多连接管理：

- 每 session 独立 WebSocket
- 自动重连（指数退避，最大 30s）
- 心跳 ping（30s 间隔）
- 消息队列（连接中缓冲，连接后发送）

### 2.7 i18n 极简方案

纯 Record 字典 + Zustand 订阅 locale，类型安全从 en 字典自动推导：

```ts
export const en = { 'sidebar.newSession': 'New session', ... }
export const zh = { 'sidebar.newSession': '新建会话', ... }
```

---

## 3. DevPilot 应借鉴的 6 个设计

1. **ToolCallGroup 分组折叠** — 连续工具调用合并为一组，摘要显示
2. **Permission Dialog 内联 Diff** — 审批时直接展示代码变更 diff
3. **ThinkingBlock 可折叠** — 思考链默认折叠，80字预览，活跃时光标动画
4. **Mermaid 全屏预览** — 缩放控制(50%-300%)、拖拽平移、Ctrl+滚轮
5. **Session Tab 持久化** — localStorage 保存打开标签，启动恢复
6. **Agent 树形时间线** — Agent 工具的竖线+圆点+状态标签布局

---

## 4. DevPilot 已有优势

1. **React 19** — 更好的并发特性
2. **react-virtuoso** — 虚拟滚动（CodePilot 没有）
3. **流式 60fps rAF 节流** — 比 CodePilot 的 50ms setTimeout 更精细
4. **Code splitting** — 11 个重型组件 React.lazy（CodePilot 没有）
5. **14 个内置工具** — 完整工具注册系统
6. **Agent 配置文件** — .devpilot/agents/\*.md 自定义 Agent
7. **Skills 系统** — SKILL.md 加载 + 市场安装
8. **CI/CD 完善** — quality gate + security audit + dependabot
