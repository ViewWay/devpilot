# AI Agent 前端技术栈全景图

> 基于 CodeSheep 前端开发学习路线 + AI Agent 专项补充

---

## 一、通用编程基础

### 1.1 数据结构和算法

- 字符串、数组、链表
- 堆、栈、队列
- 树（AST、虚拟 DOM 树）、哈希、图
- 查找、排序、递归、贪心、分治
- 动态规划、回溯

### 1.2 网络协议

- ARP/RARP、IP/ICMP
- TCP/UDP、DNS、HTTP/HTTPS
- WebSocket、SSE（Server-Sent Events）
- HTTP/2 多路复用、HTTP/3 QUIC

### 1.3 设计模式

- 单例、工厂、代理、策略
- 模板方法、观察者、适配器
- 责任链（中间件链）、装饰器、发布订阅

### 1.4 基本开发工具

- IDE/编辑器：VSCode、WebStorm
- 版本控制：Git
- 浏览器 DevTools：Network、Performance、Memory、Lighthouse
- API 调试：Postman、curl、httpie

---

## 二、前端三件套：HTML + CSS + JavaScript

### 2.1 HTML

**常用标签和属性**

- 链接、列表、图片、表格、表单、区块
- id、class、style、title、data-\* 属性

**HTML5 新特性**

- Canvas 绘画
- Audio/Video 多媒体
- Datalist/Output 新表单
- Header/Footer/Article/Aside/Nav 语义标签
- 内联 SVG
- localStorage / sessionStorage
- WebSocket
- contentEditable（富文本编辑基础）
- MutationObserver（DOM 变更监听）

### 2.2 CSS

**布局与定位**

- static / relative / fixed / absolute / sticky
- float → flexbox → grid（三阶段演进）
- Container Queries（CSS 新特性）

**盒模型**

- content → padding → border → margin
- box-sizing: border-box vs content-box

**样式进阶**

- 边框、背景、渐变
- 文本和字体（Web Fonts、variable fonts）
- 2D/3D transform
- transition / animation / @keyframes
- 媒体查询 / 暗色模式 prefers-color-scheme
- CSS Custom Properties (变量)
- CSS Layers / @layer

### 2.3 JavaScript 核心

**基础语法**

- 变量（var/let/const）、数据类型、操作符
- 作用域（词法作用域、闭包）
- 条件、循环、迭代器（for...of）
- 模板字符串、解构赋值、展开运算符

**函数**

- 函数声明 vs 函数表达式
- 箭头函数（this 绑定差异）
- 闭包（词法捕获、内存管理）
- call / apply / bind
- 高阶函数、柯里化

**面向对象**

- 原型链、构造函数
- class 语法糖、extends / super
- 继承：原型链、构造、组合、寄生组合
- Mixin 模式

**异步编程（Agent 核心依赖）**

- Callback → Promise → async/await 三阶段
- Promise.all / allSettled / race / any
- AbortController（请求中断/取消）
- AsyncIterator / AsyncGenerator
- 微任务（Promise.then）vs 宏任务（setTimeout）

**ES6+ 新特性**

- 块级绑定 let/const
- 解构、Symbol
- Class、Set/Map/WeakMap/WeakSet
- Iterator/Generator
- Proxy/Reflect（响应式系统基础）
- Module（ESM import/export）
- 可选链 ?.、空值合并 ??
- Top-level await

**BOM**

- window / screen / location / navigator / history
- Cookie / Storage API
- Clipboard API（剪贴板读写）
- IntersectionObserver（懒加载核心）

**引用类型**

- Object / Array / Map / Set / WeakMap / WeakSet
- String / Number / Boolean
- Math / Date / RegExp
- ArrayBuffer / TypedArray / DataView（二进制处理）

---

## 三、DOM 操作与事件

### 3.1 DOM 操作

- 节点增删改查
- 动态脚本/样式注入
- DocumentFragment（批量 DOM 操作优化）
- 虚拟 DOM（React/Vue 核心概念）

### 3.2 事件系统

- 事件流：捕获 → 目标 → 冒泡
- 事件对象、事件委托
- 自定义事件（CustomEvent / EventTarget）
- 鼠标/键盘/焦点/滚轮/触摸/拖拽事件
- ResizeObserver / MutationObserver

### 3.3 网络请求

- XMLHttpRequest（传统）
- Fetch API（现代标准）
- WebSocket / SSE（实时双向/单向通信）
- Request/Response/Headers 对象
- CORS / 同源策略

---

## 四、前端生态工具库

### 4.1 数据可视化

- ECharts、AntV、D3.js、Highcharts
- Mermaid（流程图/时序图渲染）
- KaTeX / MathJax（数学公式渲染）

### 4.2 UI 框架 / 组件库

- Bootstrap、Semantic UI、Foundation
- Element Plus、Ant Design、Material UI
- Radix UI（无样式原子组件）
- Shadcn/ui（可复制组件方案）

### 4.3 编辑器

- TinyMCE、CKEditor（富文本）
- Monaco Editor（VSCode 同源代码编辑器）
- CodeMirror 6（轻量代码编辑）
- Slate.js、ProseMirror（可扩展富文本框架）
- Lexical（Meta 出品）

### 4.4 动画

- Animate.css、GSAP、mo.js
- Framer Motion（React 动画库）
- React Spring（物理弹簧动画）
- Lottie（AE 导出动画）

### 4.5 实用工具库

- Lodash / Radash（工具函数）
- Day.js / date-fns（日期处理，替代 Moment）
- Zod / Joi（Schema 校验）
- clsx / cva / tailwind-merge（样式工具）
- immer（不可变数据操作）
- nanoid（ID 生成）

### 4.6 终端模拟

- xterm.js（浏览器终端模拟器）
- node-pty（伪终端，后端配合）

---

## 五、前端工程化

### 5.1 打包工具

- Webpack（老牌，生态最全）
- Rollup（库打包首选）
- Vite（ESM 开发服务器 + Rollup 生产构建）
- esbuild / SWC（超高速编译）
- Turbopack（Next.js 内置）

### 5.2 构建工具

- Gulp、Grunt（流式任务）
- Make / Just（通用任务运行器）

### 5.3 CSS 工程化

- Sass / Less / Stylus（预处理）
- PostCSS（后处理，autoprefixer 等）
- CSS Modules（作用域隔离）
- Tailwind CSS / Windi CSS（原子化）
- CSS-in-JS：styled-components、Emotion、vanilla-extract

### 5.4 代码规范

- ESLint（代码检查）
- Prettier（格式化）
- Stylelint（CSS 检查）
- commitlint（提交信息规范）
- husky + lint-staged（Git hooks）

### 5.5 测试

- Jest（测试框架）
- Vitest（Vite 原生测试）
- React Testing Library（组件测试）
- Playwright / Cypress（E2E 测试）
- Storybook（组件文档/视觉回归）

### 5.6 CI/CD

- GitHub Actions
- 覆盖率报告（Istanbul / c8）
- 依赖安全审计（npm audit / cargo-audit）
- 自动发布（语义版本、Changelog 生成）

---

## 六、组件化开发框架

### 6.1 React

- JSX / TSX 语法
- 函数组件 + Hooks（useState/useEffect/useRef/useMemo/useCallback）
- Context / useReducer（轻量状态）
- Suspense / lazy（代码分割）
- React 19 新特性：use() hook、Server Components
- React Router / TanStack Router（路由）
- Zustand / Jotai / Valtio（状态管理）
- Redux Toolkit / RTK Query（重量级状态）
- React Query / SWR（服务端状态）
- Next.js（SSR/SSG/ISR 全栈框架）

### 6.2 Vue

- SFC（单文件组件）+ Composition API
- vue-router（路由）
- Pinia（状态管理，替代 Vuex）
- Nuxt.js（SSR）
- 组件：注册、Prop、事件、插槽、动态/异步组件

### 6.3 Angular

- TypeScript 原生
- Angular Router / NgRx / RxJS
- DI（依赖注入）、模块化

### 6.4 Svelte

- 编译时框架（无虚拟 DOM）
- SvelteKit（全栈）

---

## 七、Node.js 全栈

- 文件操作（fs / fs/promises）
- 网络操作（http / https / net）
- 流处理（Stream / Pipeline）
- 进程管理（child_process / cluster / worker_threads）
- 模块系统（CommonJS → ESM）
- 包管理：npm / yarn / pnpm
- Web 框架：Express / Fastify / Koa / Hono
- 全栈框架：Next.js / Nuxt / SvelteKit / Remix

---

## 八、前端性能优化

### 8.1 性能指标

- FP（首次绘制）
- FCP（首次内容绘制）
- FMP（首次有效绘制）
- LCP（最大内容绘制）
- FID / INP（交互响应延迟）
- CLS（累积布局偏移）
- TTI（可交互时间）
- TBT（总阻塞时间）

### 8.2 性能测试/监控工具

- WebPageTest、Lighthouse
- Chrome DevTools Performance / Coverage
- Web Vitals 扩展

### 8.3 优化方案

**网络层面**

- 请求合并、资源压缩（gzip/brotli）
- CDN 分发、HTTP 缓存策略
- 预加载 preload / prefetch / preconnect

**渲染层面**

- 关键渲染路径优化
- CSS 放头部、JS 放底部 / defer / async
- 代码分割、Tree Shaking
- 图片优化（WebP/AVIF、响应式图片）

**DOM 层面**

- 虚拟滚动（react-virtuoso / tanstack-virtual）
- 懒加载（IntersectionObserver）
- 防抖 / 节流
- requestAnimationFrame / requestIdleCallback

---

## 九、多端 / 跨端 / 融合

### 9.1 移动端 / 小程序

- React Native、Weex
- Taro、uni-app、Chameleon
- Flutter（Dart 语言）
- 微信/支付宝/字节小程序原生开发

### 9.2 桌面应用

- Electron（Chromium + Node.js）
- **Tauri**（系统 WebView + Rust 后端，DevPilot 选用）
- NW.js

### 9.3 前沿方向

- PWA（Service Worker / Web App Manifest）
- WebAssembly（高性能计算）
- Web Components（Shadow DOM / Custom Elements）
- WebGPU（GPU 计算/渲染）

---

## 十、AI Agent 前端专项

### 10.1 消息渲染层

**Markdown 渲染**

- react-markdown / marked / remark
- rehype 插件生态（代码高亮、数学公式、GFM 表格）

**代码高亮**

- Shiki（VSCode 同款，支持所有语言）
- Prism.js（轻量）
- Monaco Editor 嵌入（完整 IDE 体验）

**富内容渲染**

- Mermaid（流程图/时序图/甘特图）
- KaTeX / MathJax（LaTeX 数学公式）
- Diff Viewer（代码变更可视化：react-diff-viewer）
- JSON 树形查看器
- HTML/SVG 预览沙箱
- 文件附件预览（PDF/图片/音视频）

### 10.2 实时交互层

**流式输出渲染**

- SSE（Server-Sent Events）逐字/逐块渲染
- WebSocket 双向实时通信
- ReadableStream / TextDecoder 流式解码
- 打字机效果（逐字动画）

**中断与取消**

- AbortController（主动取消流式请求）
- 取消队列管理
- 重试机制（指数退避）

**虚拟滚动**

- react-virtuoso / @tanstack/react-virtual
- 海量消息列表（万级消息不卡顿）
- 动态高度消息项支持

### 10.3 输入体验层

**富文本输入**

- Mention (@) 触发（提及模型/文件/命令）
- Slash Commands (/help, /model, /clear)
- 多行输入 + Shift+Enter 换行
- 自动补全（LSP 式智能提示）

**多模态输入**

- 文件拖拽/粘贴上传
- 图片粘贴 → OCR/视觉识别
- 语音输入（Web Speech API / Whisper API）
- 截图工具集成
- 屏幕录制/共享

### 10.4 Agent 特有组件

**工具调用可视化**

- Shell 执行结果（终端输出、退出码、耗时）
- 文件读写（Diff 视图、编辑前后对比）
- 搜索结果（文件列表 + 匹配高亮）
- Web 抓取（URL + 摘要）
- Patch 应用（增删改行高亮）

**任务管理**

- 任务树（父子关系、多级展开）
- 状态追踪（pending/in_progress/completed/failed/cancelled）
- 进度条/步骤指示器
- 子 Agent 并行任务面板

**Plan 模式**

- 规划步骤列表（可编辑/排序）
- 执行 vs 规划模式切换
- 步骤验证/确认流程
- 方案对比展示

**审批系统**

- 危险操作确认弹窗
- 批量审批（Allow All）
- 审批历史记录
- 策略配置（自动允许/始终询问）

**思考链展示**

- Chain of Thought 折叠面板
- 推理过程逐步展示
- 思考耗时统计
- Reasoning Effort 可视化

**Token / 用量统计**

- 实时 token 计数（输入/输出）
- 会话累计用量
- 费用估算
- 模型上下文窗口使用率
- 压缩触发提示

### 10.5 会话管理

**会话生命周期**

- 创建/切换/删除/归档/恢复
- 会话标题自动生成
- 会话搜索（全文检索）
- 会话导出（JSON / Markdown）
- 会话导入/分叉（Fork）

**消息操作**

- 重新生成（Regenerate）
- 编辑已发送消息 + 重新提交
- 消息复制/删除
- 消息分支（同一消息的不同回复）

**上下文管理**

- Context Window 可视化（用量条）
- 自动压缩（Compaction）触发通知
- 系统提示词编辑器
- 工作目录选择
- 环境变量配置

### 10.6 终端 / 编辑器集成

**终端模拟**

- xterm.js（浏览器内完整终端）
- 配色方案/字体自定义
- 多终端标签
- 终端 ↔ Agent 联动

**代码编辑**

- Monaco Editor（语法高亮、智能补全、错误标记）
- 多标签文件编辑
- Diff 编辑模式
- LSP 协议通信（Language Server Protocol）

### 10.7 状态管理（Agent 场景）

**异步状态**

- React Query / SWR（服务端缓存、自动重验证）
- 乐观更新（Optimistic UI）
- 后台数据同步

**复杂会话状态**

- Zustand（轻量原子状态）
- 消息树结构（支持分支/回退）
- 不可变数据（immer）
- 大对象持久化（IndexedDB / SQLite via Tauri）

**跨窗口/跨组件通信**

- Event Bus（事件总线）
- BroadcastChannel API
- Tauri IPC（Rust ↔ Frontend）
- MCP（Model Context Protocol）工具通信

### 10.8 安全与沙箱

**内容安全**

- Content Security Policy (CSP)
- DOMPurify（XSS 防护，Markdown HTML 转义）
- iframe 沙箱（代码预览/执行隔离）
- nonce-based 安全策略

**数据安全**

- 敏感信息过滤（API Key 脱敏显示）
- 端到端加密（本地模型场景）
- 安全存储（Tauri 系统密钥链 / OS Keychain）
- pre-push hook（Secret 扫描）

### 10.9 国际化与无障碍

**i18n**

- react-i18next / 自建 i18n 系统
- 多语言资源管理（EN / ZH / ...）
- 动态语言切换
- RTL 布局支持

**无障碍 (a11y)**

- ARIA 标签/角色
- 键盘导航（Tab/Enter/Escape）
- 屏幕阅读器兼容
- 高对比度模式

---

## 十一、技能系统集成

### 11.1 技能市场

- 技能浏览/搜索/安装/卸载
- 技能分类标签
- 版本管理与更新提示

### 11.2 插件架构

- MCP Server 注册与发现
- 动态工具注册
- 插件沙箱隔离
- 配置界面生成

---

## 十二、开发者体验 (DX)

### 12.1 命令面板

- Cmd+K 快捷触发
- 模糊搜索
- 最近使用记录

### 12.2 键盘优先

- 全键盘操作流程
- 快捷键自定义
- Vim 模式（终端/编辑器）

### 12.3 调试工具

- Agent 执行日志
- 工具调用链追踪
- 性能 Profiler
- 网络请求检查器
