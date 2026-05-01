# 前端基础技术学习路线

> 来源：CodeSheep 前端开发学习路线大梳理

---

## 一、通用编程基础

### 1.1 数据结构和算法

**数据结构**

- 字符串、数组、链表
- 堆、栈、队列
- 树、哈希、图

**算法**

- 查找、排序、校验
- 递归、贪心、分治
- 动态规划、回溯

### 1.2 网络协议

**TCP/IP 协议栈**

- ARP/RARP
- IP/ICMP
- TCP/UDP
- DNS/HTTP/HTTPS

### 1.3 设计模式

- 单例、工厂、代理、策略
- 模板方法、观察者、适配器
- 责任链、装饰器

### 1.4 基本开发工具

- **IDE/编辑器**: WebStorm, VSCode, Sublime
- **版本控制**: SVN, Git
- **浏览器**: Chrome, Firefox, Safari

---

## 二、祖传三件套：HTML + CSS + JavaScript

### 2.1 HTML

**常用标签**

- 链接、列表、图片、表格、表单、区块、布局、框架

**常用属性**

- id, class, style, title

**HTML5 新特性**

- 绘画元素: `<canvas>`
- 多媒体元素: `<audio>`, `<video>`
- 新表单元素: `<datalist>`, `<output>`
- 语义/结构元素: `<header>`, `<footer>`, `<article>`, `<aside>`, `<nav>`
- 内联 SVG
- Web 存储: `localStorage`, `sessionStorage`
- WebSocket

### 2.2 CSS

**布局与定位**

- static / relative / fixed / absolute / sticky
- float / flex / grid

**盒模型**

- content → padding → border → margin

**样式**

- 边框、背景、渐变
- 文本和字体
- 2D/3D 转换
- 过渡、动画

### 2.3 JavaScript 核心

**基础语法**

- 变量、数据类型、关键字
- 操作符、作用域
- 条件、循环、语句

**函数**

- 函数声明 vs 函数表达式
- 箭头函数、匿名函数
- 闭包
- call() / apply() / bind()
- Function() 构造器

**面向对象**

- 构造器模式、原型模式
- 原型链继承、构造继承、组合继承
- 寄生继承、寄生组合继承

**BOM**

- window / screen / location / navigator / history
- 弹框、计时、Cookie

**引用类型**

- Object / Boolean / Number / String
- Math / Array / Date / RegExp

---

## 三、DOM 与事件

### 3.1 DOM 操作

- 动态脚本、动态样式
- DOM 增删改查

### 3.2 事件系统

- 事件流、事件对象
- 冒泡/捕获、事件委托
- 鼠标/键盘/焦点/滚轮/文本事件

### 3.3 网络请求

- Ajax / Fetch API

### 3.4 ES6+ 新特性

- 块级绑定 (let/const)
- 解构赋值、Symbol
- Class 语法糖
- Set / Map
- Promise / async-await（异步编程）
- Iterator / Generator
- Proxy / Reflect
- Module（ESM 模块）
- 字符串/数值/函数/数组/对象/正则扩展

---

## 四、前端生态工具库

### 4.1 数据可视化

- ECharts, AntV, D3.js, Highcharts

### 4.2 UI 框架

- Bootstrap, Semantic UI, Foundation, Layout

### 4.3 组件库

- Element, iView, Ant Design, Material UI

### 4.4 编辑器

- TinyMCE, UEditor, CKEditor, Draft.js, Slate.js

### 4.5 动画

- Animate.css, Animate.js, mo.js

### 4.6 实用工具库

- Mock.js, UnderScore, Lodash
- Moment.js（日期处理）
- Font Awesome, Iconfont（字体/图标）

---

## 五、前端工程化

### 5.1 打包工具

- Webpack, Rollup, Snowpack

### 5.2 构建工具

- Gulp, Grunt

### 5.3 CSS 预处理

- Sass, Less, PostCSS

### 5.4 代码规范

- ESLint（代码检查）
- Prettier（格式化）

### 5.5 测试

- Jest, Mocha

---

## 六、组件化开发框架

### 6.1 Vue.js

- vue-router（路由）
- Vuex（状态管理）
- axios（HTTP 请求）
- Nuxt.js（SSR 服务端渲染）
- 组件：注册、Prop、事件、插槽、动态/异步组件

### 6.2 React

- React Router（路由）
- Redux（状态管理）
- Next.js（SSR）

### 6.3 Angular

- Angular Router
- NgRx（状态管理）
- RxJS, DI, TypeScript 原生

---

## 七、Node.js 全栈

- 文件操作（fs）
- 网络操作（http）
- 异步编程
- 进程管理
- 模块系统（CommonJS / ESM）
- 包管理器：npm, yarn, pnpm

---

## 八、前端性能优化

### 8.1 性能指标

- FP（首次绘制）
- FCP（首次内容绘制）
- FMP（首次有效绘制）
- TTI（可交互时间）

### 8.2 性能测试/监控工具

- WebPageTest, Lighthouse, Chrome DevTools Performance

### 8.3 优化方案

**网络层面**

- 请求优化、资源优化、压缩

**渲染层面**

- 缓存策略、CSS/JS 优化

**DOM 层面**

- 懒加载

---

## 九、多端 / 跨端 / 融合

### 9.1 移动端 / 小程序

- React Native, Weex
- Taro, uni-app, Chameleon
- Flutter

### 9.2 桌面应用

- Electron
- NW.js

### 9.3 前沿方向

- PWA（渐进式 Web 应用）
- WebAssembly
- Web Components
