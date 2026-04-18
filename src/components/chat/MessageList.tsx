import { Bot, Wrench, Copy, Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  model?: string;
  timestamp: string;
}

const mockMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content: "帮我分析一下 Codex CLI 的 Rust 架构设计，重点关注 Agent 引擎和工具系统",
    timestamp: "10:23",
  },
  {
    id: "2",
    role: "assistant",
    content: `Codex CLI 采用 **80+ crate** 的 Rust workspace 架构，核心设计模式：

## Agent 引擎

\`\`\`rust
pub(crate) struct Session {
    pub(crate) conversation_id: ThreadId,
    pub(super) tx_event: Sender<Event>,
    pub(super) agent_status: watch::Sender<AgentStatus>,
    pub(super) state: Mutex<SessionState>,
    pub(super) mailbox: Mailbox,
}
\`\`\`

关键设计模式：
- **Event Bus** — \`Sender<Event>\` 驱动 UI 更新和状态流转
- **Mailbox** — Agent 间通过 mpsc + watch 通信
- **Agent Registry** — spawn slot reservation，类似信号量并发控制

## 工具系统

工具注册采用 **双层映射**：
1. API 侧 (\`ToolSpec\`) 发给 LLM 做函数调用
2. 本地侧 (\`ToolHandlerKind\`) 路由到具体处理函数

\`\`\`rust
pub enum ToolHandlerKind {
    Shell, ShellCommand, ApplyPatch,
    DynamicTool, Mcp, McpResource,
    SpawnAgentV1, SpawnAgentV2,
}
\`\`\`

## 沙盒架构

| 平台 | 实现 | 隔离方式 |
|------|------|---------|
| macOS | seatbelt | sandbox-exec profile |
| Linux | bwrap + landlock | namespace + seccomp |
| Windows | restricted token | private desktop |

这个架构可以大量复用到 DevPilot 的 Tauri 后端。`,
    model: "Claude 4 Sonnet",
    timestamp: "10:24",
  },
  {
    id: "3",
    role: "tool",
    content: "📄 file_read: core/src/session/session.rs (read 234/466 lines)\n🔧 shell: cargo check → 0 errors, 0 warnings",
    timestamp: "10:24",
  },
];

export function MessageList() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-6">
          {mockMessages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 text-sm leading-relaxed text-user-bubble-foreground">
          {message.content}
          <div className="mt-1 text-right text-[10px] text-user-bubble-foreground/60">{message.timestamp}</div>
        </div>
      </div>
    );
  }

  if (isTool) {
    return (
      <div className="flex items-start gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
          <Wrench size={12} className="text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary">
        <Bot size={12} className="text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm leading-relaxed text-assistant-bubble-foreground">
          <RenderMarkdown content={message.content} />
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          {message.model && <span>{message.model}</span>}
          {message.model && <span>·</span>}
          <span>{message.timestamp}</span>
        </div>
      </div>
    </div>
  );
}

function RenderMarkdown({ content }: { content: string }) {
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="prose-sm">
      {parts.map((part, i) => {
        if (part.startsWith("```")) {
          return <CodeBlock key={i} raw={part} />;
        }
        return <InlineMarkdown key={i} text={part} />;
      })}
    </div>
  );
}

function CodeBlock({ raw }: { raw: string }) {
  const [copied, setCopied] = useState(false);
  const lines = raw.slice(3, -3).split("\n");
  const lang = lines[0]?.trim() || "";
  const code = lines.slice(1).join("\n").trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{lang || "code"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function InlineMarkdown({ text }: { text: string }) {
  // Split by lines, handle headings, bold, lists, tables
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <br key={i} />;
        if (trimmed.startsWith("## "))
          return <h3 key={i} className="mt-3 mb-1 text-sm font-semibold">{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith("### "))
          return <h4 key={i} className="mt-2 mb-1 text-xs font-semibold">{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith("- "))
          return <li key={i} className="ml-3 text-xs list-disc">{renderInline(trimmed.slice(2))}</li>;
        if (trimmed.startsWith("| ")) return <TableLine key={i} text={trimmed} isHeader={isTableHeader(lines, i)} />;
        return <p key={i} className="text-sm">{renderInline(trimmed)}</p>;
      })}
    </>
  );
}

function renderInline(text: string): React.ReactNode {
  // Bold
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {p}
      </strong>
    ) : (
      // Inline code
      renderCode(p, i)
    ),
  );
}

function renderCode(text: string, baseKey: number): React.ReactNode {
  const parts = text.split(/`(.*?)`/g);
  if (parts.length <= 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <code key={`${baseKey}-${i}`} className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
        {p}
      </code>
    ) : (
      <span key={`${baseKey}-${i}`}>{p}</span>
    ),
  );
}

function TableLine({ text, isHeader }: { text: string; isHeader: boolean }) {
  const cells = text.split("|").filter(Boolean).map((c) => c.trim());
  return (
    <div className={cn("grid gap-2 text-xs py-0.5", cells.length === 3 ? "grid-cols-3" : cells.length === 2 ? "grid-cols-2" : "grid-cols-4")}>
      {cells.map((cell, i) => (
        <span key={i} className={isHeader ? "font-semibold text-muted-foreground" : ""}>
          {renderInline(cell)}
        </span>
      ))}
    </div>
  );
}

function isTableHeader(lines: string[], index: number): boolean {
  const next = lines[index + 1]?.trim();
  return !!next && /^\|[\s-|]+\|$/.test(next);
}
