# AI 前端开发技术栈

> AI 智能体前端工程师所需技术栈，在通用前端基础上叠加的专项能力

---

## 一、消息渲染层

### 1.1 Markdown 渲染

- react-markdown / marked / remark
- rehype 插件生态（代码高亮、GFM 表格、自动链接）
- 自定义渲染器（覆盖 heading/code/table 等节点）

### 1.2 代码高亮

- Shiki（VSCode 同款引擎，支持所有语言主题）
- Prism.js（轻量级）
- Monaco Editor 嵌入（完整 IDE 语法着色）

### 1.3 富内容渲染

- Mermaid（流程图、时序图、甘特图、类图）
- KaTeX / MathJax（LaTeX 数学公式）
- react-diff-viewer（代码变更 Diff 可视化）
- JSON 树形查看器
- HTML/SVG 预览沙箱
- 文件附件预览（PDF、图片、音视频）

---

## 二、实时交互层

### 2.1 流式输出渲染

- SSE（Server-Sent Events）逐字/逐块推送
- WebSocket 双向实时通信
- ReadableStream / TextDecoder 流式解码
- 打字机效果（逐字动画展示）

### 2.2 中断与取消

- AbortController（主动取消流式请求）
- 取消队列管理
- 重试机制（指数退避策略）

### 2.3 虚拟滚动

- react-virtuoso / @tanstack/react-virtual
- 海量消息列表（万级消息不卡顿）
- 动态高度消息项自适应

---

## 三、输入体验层

### 3.1 智能输入

- Mention (@) 触发（提及模型/文件/命令）
- Slash Commands (/help, /model, /clear, /compact)
- 多行输入 + Shift+Enter 换行
- LSP 式智能补全

### 3.2 多模态输入

- 文件拖拽/粘贴上传
- 图片粘贴 → OCR/视觉识别
- 语音输入（Web Speech API / Whisper API）
- 截图工具集成
- 屏幕录制/共享

---

## 四、Agent 特有组件

### 4.1 工具调用可视化

- Shell 执行（终端输出、退出码、耗时）
- 文件读写（Diff 视图、编辑前后对比）
- 搜索结果（文件列表 + 匹配高亮）
- Web 抓取（URL + 内容摘要）
- Patch 应用（增删改行高亮）
- Todo 列表（任务状态追踪）

### 4.2 任务管理

- 任务树（父子关系、多级展开）
- 状态流转（pending → in_progress → completed/failed/cancelled）
- 进度条 / 步骤指示器
- 子 Agent 并行任务面板

### 4.3 Plan 模式

- 规划步骤列表（可编辑、可排序）
- 执行 vs 规划模式切换
- 步骤验证 / 确认流程
- 方案对比展示

### 4.4 审批系统

- 危险操作确认弹窗
- 批量审批（Allow All）
- 审批历史记录
- 策略配置（自动允许 / 始终询问 / 白名单）

### 4.5 思考链展示

- Chain of Thought 折叠面板
- 推理过程逐步展示
- 思考耗时统计
- Reasoning Effort 可视化（低/中/高）

### 4.6 Token / 用量统计

- 实时 token 计数（输入/输出分离）
- 会话累计用量
- 费用估算（按模型单价）
- 上下文窗口使用率进度条
- 自动压缩（Compaction）触发提示

---

## 五、会话管理

### 5.1 会话生命周期

- 创建 / 切换 / 删除 / 归档 / 恢复
- 会话标题自动生成
- 全文检索搜索
- 导出（JSON / Markdown）
- 导入 / 分叉（Fork）

### 5.2 消息操作

- 重新生成（Regenerate）
- 编辑已发送消息 + 重新提交
- 消息复制 / 删除
- 消息分支（同一消息的不同回复版本）

### 5.3 上下文管理

- Context Window 可视化（用量进度条）
- 系统提示词编辑器
- 工作目录选择
- 环境变量配置
- 技能/Skills 上下文注入

---

## 六、终端与编辑器集成

### 6.1 终端模拟

- xterm.js（浏览器内完整终端）
- 配色方案 / 字体自定义
- 多终端标签
- 终端 ↔ Agent 联动执行

### 6.2 代码编辑

- Monaco Editor（语法高亮、智能补全、错误标记）
- 多标签文件编辑
- Diff 编辑模式
- LSP 协议通信（Language Server Protocol）
- 代码符号索引（Symbol Index）

---

## 七、Agent 状态管理

### 7.1 异步状态

- React Query / SWR（服务端缓存、自动重验证）
- 乐观更新（Optimistic UI）
- 后台数据同步

### 7.2 复杂会话状态

- Zustand / Jotai（轻量原子状态）
- 消息树结构（支持分支 / 回退 / 多版本）
- 不可变数据操作（immer）
- 大对象持久化（IndexedDB / SQLite via Tauri IPC）

### 7.3 跨层通信

- Event Bus（事件总线）
- BroadcastChannel API（跨窗口）
- Tauri IPC / Electron IPC（Rust ↔ Frontend / Node ↔ Frontend）
- MCP（Model Context Protocol）工具通信

---

## 八、多模型 / 多供应商管理

### 8.1 模型配置

- 多供应商配置（OpenAI / Anthropic / DeepSeek / Qwen / GLM / Gemini）
- 模型参数调节（temperature / top_p / max_tokens）
- Reasoning Effort 控制
- 自动 Failover（主备切换）

### 8.2 模式切换

- Code / Plan / Ask 三模式
- Agent 类型选择（通用/架构师/代码审查/测试）
- 自定义 Agent 配置（.devpilot/agents/\*.md）

---

## 九、安全与沙箱

### 9.1 内容安全

- Content Security Policy (CSP)
- DOMPurify（XSS 防护，Markdown HTML 转义）
- iframe 沙箱（代码预览/执行隔离）
- nonce-based 策略

### 9.2 数据安全

- 敏感信息过滤（API Key 脱敏显示）
- 本地数据加密存储
- pre-push hook（Secret 扫描，防止泄露）

---

## 十、国际化与无障碍

### 10.1 i18n

- 多语言资源管理（EN / ZH）
- 动态语言切换
- RTL 布局支持

### 10.2 无障碍 (a11y)

- ARIA 标签/角色
- 键盘导航（Tab / Enter / Escape）
- 屏幕阅读器兼容
- 高对比度模式

---

## 十一、技能系统与插件

### 11.1 技能市场

- 技能浏览 / 搜索 / 安装 / 卸载
- 技能分类标签
- 版本管理与更新提示

### 11.2 插件架构

- MCP Server 注册与发现
- 动态工具注册
- 插件沙箱隔离

---

## 十二、开发者体验 (DX)

### 12.1 命令面板

- Cmd/Ctrl+K 快捷触发
- 模糊搜索
- 最近使用记录

### 12.2 键盘优先

- 全键盘操作流程
- 快捷键自定义
- Vim 模式（终端/编辑器内）

### 12.3 调试工具

- Agent 执行日志查看
- 工具调用链追踪
- 网络/IPC 请求检查器

---

## 十三、桌面应用集成（Tauri / Electron）

### 13.1 Tauri 2

- Rust 后端 IPC 命令
- 系统原生对话框（文件选择、通知）
- 系统托盘 / 菜单栏
- 自动更新
- 窗口管理（多窗口、无边框、透明）

### 13.2 Electron

- 主进程 / 渲染进程通信（ipcMain/ipcRenderer）
- preload 脚本安全隔离
- 自动更新（electron-updater）
- 原生模块（N-API / node-addon）

---

## 十四、CI/CD 与发布

### 14.1 质量门禁

- TypeScript 类型检查
- ESLint + Prettier 代码规范
- 单元测试 + 覆盖率
- Rust cargo clippy + fmt + test

### 14.2 多平台构建

- macOS（Apple Silicon + Intel）
- Windows（NSIS / MSI 安装包）
- Linux（AppImage / deb / rpm）

### 14.3 自动发布

- 语义化版本
- 自动 Changelog 生成
- GitHub Release 发布
- 签名公证（macOS codesign / Windows signing）
