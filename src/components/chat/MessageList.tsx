import { Bot, User, Wrench } from "lucide-react";
import type { Message } from "@/types";

const mockMessages: Message[] = [
  {
    id: "1",
    role: "user",
    content: "帮我分析一下 Codex CLI 的架构设计",
    timestamp: "10:23",
  },
  {
    id: "2",
    role: "assistant",
    content: `Codex CLI 的架构采用 **Rust workspace** 模式，核心模块包括：

\`\`\`rust
// 核心数据结构
pub(crate) struct Session {
    pub(crate) conversation_id: ThreadId,
    pub(super) tx_event: Sender<Event>,
    pub(super) agent_status: watch::Sender<AgentStatus>,
    pub(super) state: Mutex<SessionState>,
}
\`\`\`

主要 crate：
- **core/** — Session 管理、Agent 引擎、Compact 压缩
- **tools/** — 工具注册、Shell、Apply Patch、MCP
- **sandboxing/** — 沙盒执行（seatbelt/bwrap/landlock）
- **apply-patch/** — Patch 解析和应用
- **file-search/** — 模糊文件搜索（nucleo）

总计 **80+ crates**，是一个相当庞大的项目。`,
    model: "claude-4-sonnet",
    timestamp: "10:23",
  },
  {
    id: "3",
    role: "tool",
    content: "file_read: /Users/dev/codex-rs/core/src/session.rs (466 lines)",
    timestamp: "10:24",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "分析完成。Session 的核心设计模式是 **Event Bus + Mailbox**：\n\n1. **Event Bus** (`tx_event: Sender<Event>`) 驱动 UI 更新\n2. **Mailbox** 实现 Agent 间消息传递\n3. **Agent Registry** 管理多 Agent spawn/生命周期",
    model: "claude-4-sonnet",
    timestamp: "10:24",
  },
];

export function MessageList() {
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {mockMessages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
      </div>
    </div>
  );
}

// TODO: Replace hand-rolled markdown with react-markdown + Shiki (PRD §3.1)
function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]">
          {isTool ? (
            <Wrench size={14} className="text-white" />
          ) : (
            <Bot size={14} className="text-white" />
          )}
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-[var(--color-accent)] text-white"
            : isTool
              ? "border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
              : "bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]"
        }`}
      >
        {message.content.split("```").map((part, i) => {
          if (i % 2 === 1) {
            const lines = part.split("\n");
            const lang = lines[0]?.trim() || "";
            const code = lines.slice(1).join("\n").trim();
            return (
              <pre
                key={i}
                className="my-2 overflow-x-auto rounded-lg bg-[var(--color-bg-primary)] p-3 text-xs"
              >
                {lang && (
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                    {lang}
                  </div>
                )}
                <code>{code}</code>
              </pre>
            );
          }
          return (
            <span key={i}>
              {part.split("\n").map((line, j) => {
                const parts = line.split(/\*\*(.*?)\*\*/g);
                return (
                  <span key={j}>
                    {j > 0 && <br />}
                    {parts.map((p, k) =>
                      k % 2 === 1 ? (
                        <strong key={k} className="font-semibold">
                          {p}
                        </strong>
                      ) : (
                        <span key={k}>{p}</span>
                      ),
                    )}
                  </span>
                );
              })}
            </span>
          );
        })}
        <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
          {message.model && <span>{message.model}</span>}
          <span>{message.timestamp}</span>
        </div>
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-tertiary)]">
          <User size={14} className="text-[var(--color-text-secondary)]" />
        </div>
      )}
    </div>
  );
}
