# DevPilot vs cc-haha 架构差距分析报告

> 审查日期: 2026-04-22
> cc-haha: ~/github/vibecoding/cc-haha/desktop/src/
> DevPilot: ~/.openclaw/workspace/devpilot/src/

---

## 1. CSS 设计系统

| 维度                                                                      | 状态          | 说明                                                                     |
| ------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ |
| @font-face (Inter, Manrope, JetBrains Mono, Material Symbols)             | 已对齐        | 5 个 @font-face 完全一致，均使用 self-hosted woff2                       |
| @theme 色彩 token (primary, surface, outline, error 等)                   | 已对齐        | 所有色值完全匹配（light/dark 双主题）                                    |
| @theme 语义别名 (--color-border, --color-card, --color-popover 等)        | DevPilot 独有 | DevPilot 在 @theme 块内额外添加了 7 个 shadcn 风格语义别名，cc-haha 没有 |
| :root / [data-theme="light"] 布局尺寸 (sidebar-width, titlebar-height 等) | 已对齐        | 6 个布局变量完全一致                                                     |
| :root 表面/边框/文本/阴影/按钮/玻璃态/代码/Diff/Terminal 别名             | 已对齐        | 全部 ~80 个 CSS 变量值完全匹配                                           |
| [data-theme="dark"] 暗色主题完整变量集                                    | 已对齐        | 全部变量值完全匹配                                                       |
| .material-symbols-outlined 基础样式                                       | 已对齐        | font-variation-settings 等属性一致                                       |
| base styles (\* box-sizing, html/body/#root, ::selection)                 | 已对齐        |                                                                          |
| Tauri drag region                                                         | 已对齐        |                                                                          |
| .custom-shadow / .glass-panel                                             | 已对齐        |                                                                          |
| .sidebar-shell / .sidebar-panel / .sidebar-toggle-\*                      | 已对齐        | 全部 sidebar 动画 CSS 一致                                               |
| .sidebar-toggle-chevron / .sidebar-copy / .sidebar-section                | 已对齐        |                                                                          |
| @media (prefers-reduced-motion)                                           | 已对齐        |                                                                          |
| .markdown-prose 表格样式                                                  | 已对齐        |                                                                          |
| ::-webkit-scrollbar                                                       | 已对齐        |                                                                          |
| @keyframes (shimmer, spin, pulse-dot, progress-fill)                      | 已对齐        |                                                                          |
| .animate-\* 工具类                                                        | 已对齐        |                                                                          |
| .cfg-input (设置页输入框)                                                 | DevPilot 独有 | DevPilot 额外添加了配置页输入框样式                                      |
| 文件路径                                                                  | 部分对齐      | cc-haha: `theme/globals.css`; DevPilot: `src/index.css`                  |

**结论**: CSS 设计系统 **95%+ 已对齐**，核心 token 体系完全一致。仅差：文件路径不同、DevPilot 有额外 shadcn 语义别名和 .cfg-input。

---

## 2. 组件架构 — components/shared/

| 组件                    | cc-haha                                            | DevPilot                                        | 状态          |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------- | ------------- |
| Button.tsx              | 有 (primary/secondary/danger/ghost, 使用 CSS 变量) | 无 shared/ 目录                                 | 缺失          |
| Modal.tsx               | 有 (ESC 关闭, overlay, 动画)                       | 无                                              | 缺失          |
| Dropdown.tsx            | 有 (泛型, 左右对齐)                                | 无                                              | 缺失          |
| CopyButton.tsx          | 有 (clipboard API)                                 | 无                                              | 缺失          |
| Input.tsx               | 有 (设计系统对齐)                                  | 无                                              | 缺失          |
| Textarea.tsx            | 有 (设计系统对齐)                                  | 无                                              | 缺失          |
| Spinner.tsx             | 有                                                 | 无                                              | 缺失          |
| Toast.tsx               | 有 (在 uiStore 管理状态)                           | 有 ToastContainer.tsx (在 toastStore 管理状态)  | 部分对齐      |
| UpdateChecker.tsx       | 有 (使用 updateStore + i18n)                       | 有 UpdateChecker.tsx (自包含状态 + lucide 图标) | 部分对齐      |
| DirectoryPicker.tsx     | 有 (Tauri dialog)                                  | 无                                              | 缺失          |
| ProjectContextChip.tsx  | 有 (工作目录显示)                                  | 无                                              | 缺失          |
| ErrorBoundary.tsx       | 无                                                 | 有                                              | DevPilot 独有 |
| CommandPalette.tsx      | 无                                                 | 有                                              | DevPilot 独有 |
| OnboardingWizard.tsx    | 无                                                 | 有                                              | DevPilot 独有 |
| QuickFileSearch.tsx     | 无                                                 | 有                                              | DevPilot 独有 |
| MessageSearchDialog.tsx | 无                                                 | 有                                              | DevPilot 独有 |

**结论**: DevPilot **完全没有 components/shared/ 目录**。cc-haha 的 11 个共享基础组件中 7 个完全缺失。DevPilot 的 Toast 和 UpdateChecker 实现方式不同（自包含 vs store 驱动）。

---

## 3. Store 架构

| Store           | cc-haha                             | DevPilot                                     | 状态          | 说明                                                                |
| --------------- | ----------------------------------- | -------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| tabStore        | 有                                  | 有                                           | 已对齐        |                                                                     |
| providerStore   | 有                                  | 有                                           | 部分对齐      | cc-haha 从 settingsStore 获取模型; DevPilot 自包含 DEFAULT_MODELS   |
| uiStore         | 有 (主题+侧边栏+toast+modal+view)   | 有 (主题+侧边栏+模型+mode+面板+split+搜索+…) | 部分对齐      | DevPilot uiStore 职责更广，包含 model/mode/reasoning/panel/split 等 |
| chatStore       | 有 (WebSocket 实时通信, 850行)      | 有 (本地持久化 + Tauri IPC, 1499行)          | 部分对齐      | 架构完全不同: cc-haha=WS实时; DevPilot=本地+IPC                     |
| skillStore      | 有                                  | 有                                           | 已对齐        |                                                                     |
| sessionStore    | 有 (独立, 从 API 获取 session 列表) | 无 (session 数据在 chatStore 内)             | 缺失          | DevPilot 没有 sessionStore                                          |
| settingsStore   | 有 (权限/模型/locale/effort)        | 无 (分散在 uiStore/其他)                     | 缺失          | DevPilot 没有独立 settingsStore                                     |
| updateStore     | 有 (独立 Zustand store)             | 无 (状态内嵌在 UpdateChecker 组件)           | 缺失          |                                                                     |
| adapterStore    | 有                                  | 无 (有 bridgeStore 替代)                     | 缺失/替代     | bridgeStore 功能类似但更广                                          |
| teamStore       | 有 (344行, Agent Team 完整实现)     | 无                                           | 缺失          |                                                                     |
| agentStore      | 有 (agent 定义管理)                 | 无                                           | 缺失          |                                                                     |
| taskStore       | 有 (cron task CRUD)                 | 无 (有 schedulerStore 替代)                  | 缺失/替代     |                                                                     |
| cliTaskStore    | 有                                  | 无 (有 schedulerStore 替代)                  | 缺失/替代     |                                                                     |
| hahaOAuthStore  | 有                                  | 无                                           | 缺失          | DevPilot 无 OAuth 需求                                              |
| toastStore      | 无 (toast 在 uiStore)               | 有 (独立 store)                              | DevPilot 独有 |                                                                     |
| checkpointStore | 无                                  | 有                                           | DevPilot 独有 |                                                                     |
| mcpStore        | 无                                  | 有                                           | DevPilot 独有 | MCP Server 管理                                                     |
| usageStore      | 无                                  | 有                                           | DevPilot 独有 | Token 用量追踪                                                      |
| memoryStore     | 无                                  | 有                                           | DevPilot 独有 | Persona 文件 + Daily Memory                                         |
| mediaStore      | 无                                  | 有                                           | DevPilot 独有 | 图片生成记录                                                        |
| onboardingStore | 无                                  | 有                                           | DevPilot 独有 | 首次启动向导                                                        |
| shortcutStore   | 无                                  | 有                                           | DevPilot 独有 | 键盘快捷键配置                                                      |

**结论**: Store 层差异显著。cc-haha 有 14 个 store，DevPilot 有 15 个 store。交集仅 5 个（tab, provider, ui, chat, skill），且 chat/ui 实现方式不同。cc-haha 缺失的 3 个核心 store（settingsStore, sessionStore, updateStore）影响较大。

---

## 4. Chat 组件对照

| 功能/组件                      | cc-haha                                              | DevPilot                               | 状态          |
| ------------------------------ | ---------------------------------------------------- | -------------------------------------- | ------------- |
| MessageList                    | 有 (buildRenderItems 分组逻辑)                       | 有 (ReactMarkdown 直接渲染)            | 部分对齐      |
| ThinkingBlock                  | 有                                                   | 有                                     | 已对齐        |
| ChatInput / MessageInput       | 有 (622行, slash commands, 附件, git info)           | 有 (474行, slash commands, 附件)       | 部分对齐      |
| DiffViewer / DiffView          | 有 (DiffViewer.tsx)                                  | 有 (DiffView.tsx)                      | 部分对齐      |
| ToolCallBlock / ToolCallView   | 有 (ToolCallBlock + ToolCallGroup + ToolResultBlock) | 有 (ToolCallView 单组件)               | 部分对齐      |
| CodeViewer / CodeBlock         | 有 (CodeViewer.tsx, shiki)                           | 有 (CodeBlock + CodeBlockInner, shiki) | 部分对齐      |
| UserMessage                    | 有 (独立组件)                                        | 无 (在 MessageList 内联)               | 缺失          |
| AssistantMessage               | 有 (独立组件, 完整 markdown 渲染)                    | 无 (在 MessageList 内联)               | 缺失          |
| MermaidRenderer                | 有 (mermaid 图表, 361行)                             | 无                                     | 缺失          |
| ImageGalleryModal              | 有 (图片浏览)                                        | 无                                     | 缺失          |
| InlineImageGallery             | 有 (消息内图片网格)                                  | 无                                     | 缺失          |
| AttachmentGallery              | 有 (附件预览)                                        | 无                                     | 缺失          |
| PermissionDialog               | 有 (工具权限审批)                                    | 有 (ApprovalOverlay)                   | 部分对齐      |
| ComputerUsePermissionModal     | 有 (311行, 完整 GUI 控制)                            | 无                                     | 缺失          |
| AskUserQuestion                | 有 (268行, 多问题多选项)                             | 无                                     | 缺失          |
| StreamingIndicator             | 有 (流式输出指示器)                                  | 无 (内联处理)                          | 缺失          |
| TerminalChrome                 | 有 (终端输出外框)                                    | 无                                     | 缺失          |
| SessionTaskBar                 | 有 (会话级任务条)                                    | 无                                     | 缺失          |
| InlineTaskSummary              | 有 (任务摘要卡片)                                    | 无                                     | 缺失          |
| MessageActionBar               | 有 (消息操作按钮)                                    | 无                                     | 缺失          |
| FileSearchMenu                 | 有 (文件搜索 @ 引用)                                 | 无 (有 QuickFileSearch 独立组件)       | 部分对齐      |
| clipboard 工具函数             | 有                                                   | 无                                     | 缺失          |
| composerUtils (slash commands) | 有                                                   | 无 (内联在 MessageInput)               | 部分对齐      |
| SandboxBlock / SandboxRenderer | 无                                                   | 有                                     | DevPilot 独有 |
| ReasoningEffort                | 无                                                   | 有                                     | DevPilot 独有 |
| ModeTabs (Code/Plan/Ask)       | 无                                                   | 有                                     | DevPilot 独有 |
| EnvVarsEditor                  | 无                                                   | 有                                     | DevPilot 独有 |
| CheckpointPanel                | 无                                                   | 有                                     | DevPilot 独有 |
| SessionPanelView               | 无                                                   | 有                                     | DevPilot 独有 |
| ChatPanel                      | 无 (用 ActiveSession page)                           | 有 (会话容器)                          | DevPilot 独有 |

**结论**: cc-haha 的 chat 组件粒度更细（独立 UserMessage/AssistantMessage/ToolCallGroup 等），功能更丰富（Mermaid、ComputerUse、AskUserQuestion、ImageGallery）。DevPilot 倾向将逻辑内联在 MessageList 中。cc-haha 有 10+ 个 chat 子组件 DevPilot 完全缺失。

---

## 5. 路由架构 — ContentRouter

| 路由/页面           | cc-haha                 | DevPilot                  | 状态          |
| ------------------- | ----------------------- | ------------------------- | ------------- |
| EmptySession        | 有 (独立 page)          | 有 (内联在 ContentRouter) | 已对齐        |
| ActiveSession       | 有 (独立 page)          | ChatPanel (组件)          | 部分对齐      |
| Settings            | 有 (Settings page)      | 有 (SettingsPage)         | 已对齐        |
| ScheduledTasks      | 有                      | 有 (SchedulerPage)        | 已对齐        |
| Skills              | 无 (在 Settings 内)     | 有 (SkillsPage)           | DevPilot 独有 |
| Gallery             | 无                      | 有 (GalleryPage)          | DevPilot 独有 |
| Bridge              | 无 (有 AdapterSettings) | 有 (BridgePage)           | DevPilot 独有 |
| AgentTeams          | 有 (AgentTeams page)    | 无                        | 缺失          |
| ToolInspection      | 有                      | 无                        | 缺失          |
| ComputerUseSettings | 有                      | 无                        | 缺失          |
| AdapterSettings     | 有                      | 无                        | 缺失          |
| 路由机制            | tabStore.type 判断      | tabStore.type 判断        | 已对齐        |

**结论**: 路由机制一致（基于 tabStore.type），但页面集合不同。cc-haha 有 Agent/Tool/ComputerUse/Adapter 4 个 DevPilot 缺失的页面；DevPilot 有 Skills/Gallery/Bridge 3 个独有页面。

---

## 6. i18n 架构

| 维度          | cc-haha                              | DevPilot                                | 状态     |
| ------------- | ------------------------------------ | --------------------------------------- | -------- |
| 状态管理      | Zustand store (settingsStore.locale) | React Context (I18nProvider + useState) | 缺失     |
| 类型安全      | TranslationKey 联合类型 (编译时检查) | string (无类型约束)                     | 缺失     |
| 参数插值      | 支持 `{key}` 模板替换                | 不支持                                  | 缺失     |
| 非 React 使用 | 有 `t()` 函数 (直接读 store)         | 无 (只能在组件内用 hook)                | 缺失     |
| locale 持久化 | localStorage (cc-haha-locale)        | localStorage (devpilot-locale)          | 已对齐   |
| 翻译键风格    | 命名空间前缀 ('sidebar.newSession')  | 扁平短键 ('newChat')                    | 部分对齐 |
| en.ts 规模    | 673 行                               | 757 行                                  | 已对齐   |
| zh.ts         | 有                                   | 有                                      | 已对齐   |
| 支持语言      | en, zh                               | en, zh                                  | 已对齐   |

**结论**: i18n **结构差异大**。cc-haha 的 i18n 更成熟：类型安全、参数插值、可在 store 中使用。DevPilot 的 React Context 方案简单但功能弱，缺少 3 个关键能力。

---

## 7. 图标体系

| 维度                              | cc-haha                              | DevPilot                          | 状态          |
| --------------------------------- | ------------------------------------ | --------------------------------- | ------------- |
| Material Symbols Outlined         | 269 处使用, 44 个文件                | 3 处 (仅 CSS 定义 + 1 处 Sidebar) | 缺失          |
| lucide-react                      | 0 处                                 | 3 处引用 (实际使用约 30+ 处)      | DevPilot 独有 |
| Self-hosted Material Symbols 字体 | 有 (material-symbols-outlined.woff2) | 有 (CSS 引用但未使用)             | 部分对齐      |
| 内联 SVG                          | 少量                                 | 无 (全部用 lucide)                | 部分对齐      |

**结论**: 图标体系 **完全不一致**。cc-haha 全面使用 Material Symbols Outlined（自托管字体），DevPilot 全面使用 lucide-react。这是一个需要战略性决策的重大差距。

---

## 总览汇总

| 维度               | 已对齐 | 部分对齐 | 缺失   | DevPilot 独有 |
| ------------------ | ------ | -------- | ------ | ------------- |
| CSS 设计系统       | 18     | 2        | 0      | 2             |
| components/shared/ | 0      | 2        | 7      | 4             |
| Store 架构         | 2      | 3        | 5      | 8             |
| Chat 组件          | 1      | 6        | 12     | 6             |
| 路由架构           | 3      | 2        | 4      | 3             |
| i18n 架构          | 3      | 1        | 4      | 0             |
| 图标体系           | 1      | 1        | 1      | 1             |
| **合计**           | **28** | **17**   | **33** | **24**        |

---

## 对齐 Roadmap 建议 (优先级排序)

### P0 — 架构基础 (影响全局一致性)

1. **创建 components/shared/ 目录** — 迁移 Button, Modal, Dropdown, CopyButton, Input, Textarea, Spinner
2. **图标体系统一决策** — 选择 Material Symbols 或 lucide-react，全项目统一
3. **i18n 升级** — 添加 TranslationKey 类型、参数插值、非 React t() 函数
4. **创建 settingsStore** — 从 uiStore 中分离权限/模型/locale/effort 配置

### P1 — 功能补齐 (用户体验差距)

5. **sessionStore 独立** — 从 chatStore 分离 session 列表管理
6. **updateStore 独立** — 从 UpdateChecker 组件中提取状态
7. **Chat 组件细粒度拆分** — UserMessage, AssistantMessage, StreamingIndicator
8. **AskUserQuestion 组件** — 多问题多选项交互
9. **MermaidRenderer** — 流程图/时序图渲染

### P2 — 高级功能 (可选对齐)

10. **ComputerUsePermissionModal** — GUI 控制权限
11. **ImageGalleryModal + InlineImageGallery** — 图片浏览体验
12. **MessageActionBar** — 消息级操作按钮
13. **AgentTeams 相关** — teamStore + agentStore + AgentTeams 页面
