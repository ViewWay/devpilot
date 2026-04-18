import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Bot, Wrench, Sparkles, Code, MessageSquare, Zap, Copy, Check, RefreshCw } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { ToolCallList } from "./ToolCallView";
import { ApprovalOverlay } from "./ApprovalOverlay";
import { useChatStore } from "../../stores/chatStore";
import { toast } from "../../stores/toastStore";
import type { Message } from "../../types";
import { useI18n } from "../../i18n";

export function MessageList() {
  const session = useChatStore((s) => s.activeSession());
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [session?.messages.length, session?.messages[session.messages.length - 1]?.content]);

  if (!session || session.messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="space-y-6">
          {session.messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {/* Demo approval overlay — will be driven by real approval queue later */}
          <DemoApproval />
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-6">
        <Sparkles size={28} className="text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">DevPilot</h2>
      <p className="text-sm text-muted-foreground mb-8 text-center max-w-md">
        {t("emptyStateDescription")}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
        <SuggestionCard icon={<Code size={16} />} title={t("emptyStateDebug")} description={t("emptyStateDebugDesc")} />
        <SuggestionCard icon={<MessageSquare size={16} />} title={t("emptyStateExplain")} description={t("emptyStateExplainDesc")} />
        <SuggestionCard icon={<Zap size={16} />} title={t("emptyStateGenerate")} description={t("emptyStateGenerateDesc")} />
      </div>
    </div>
  );
}

function SuggestionCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <button className="flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent hover:border-accent">
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</div>
      <div>
        <div className="text-xs font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{description}</div>
      </div>
    </button>
  );
}

function MessageActions({ content, onRegenerate }: { content: string; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={handleCopy}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        title="Copy"
      >
        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      </button>
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          title="Regenerate"
        >
          <RefreshCw size={12} />
        </button>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isTool = message.role === "tool";

  if (isUser) {
    return (
      <div className="group flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 text-sm leading-relaxed text-user-bubble-foreground">
          {message.content}
          <div className="flex items-center justify-between mt-1">
            <div className="text-[10px] text-user-bubble-foreground/60">{message.timestamp}</div>
            <MessageActions content={message.content} />
          </div>
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
        <div className="min-w-0 flex-1">
          {message.content && (
            <div className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {message.content}
            </div>
          )}
          {message.toolCalls && message.toolCalls.length > 0 && <ToolCallList toolCalls={message.toolCalls} />}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary">
        <Bot size={12} className="text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm leading-relaxed text-assistant-bubble-foreground prose-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              code({ className, children }) {
                const match = /language-(\w+)/.exec(className || "");
                const codeStr = String(children).replace(/\n$/, "");
                const isInline = !match && !codeStr.includes("\n");
                if (isInline) {
                  return <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>;
                }
                return <CodeBlock code={codeStr} lang={match?.[1]} />;
              },
              table({ children }) {
                return (
                  <div className="my-2 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs border-collapse">{children}</table>
                  </div>
                );
              },
              th({ children }) {
                return <th className="border-b border-border bg-muted/50 px-3 py-2 text-left font-semibold text-foreground">{children}</th>;
              },
              td({ children }) {
                return <td className="border-b border-border px-3 py-2 text-muted-foreground">{children}</td>;
              },
              tr({ children }) {
                return <tr className="hover:bg-muted/20 transition-colors">{children}</tr>;
              },
              pre({ children }) {
                return <>{children}</>;
              },
              a({ href, children }) {
                return (
                  <a href={href} className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
              ul({ children }) {
                return <ul className="my-1.5 ml-4 list-disc space-y-1 text-sm marker:text-muted-foreground">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="my-1.5 ml-4 list-decimal space-y-1 text-sm marker:text-muted-foreground">{children}</ol>;
              },
              li({ children }) {
                return <li className="leading-relaxed">{children}</li>;
              },
              blockquote({ children }) {
                return (
                  <blockquote className="my-2 border-l-2 border-primary/40 bg-primary/5 pl-3 py-1 text-sm italic text-muted-foreground">
                    {children}
                  </blockquote>
                );
              },
              h1({ children }) {
                return <h1 className="mt-4 mb-2 text-lg font-bold text-foreground">{children}</h1>;
              },
              h2({ children }) {
                return <h2 className="mt-3 mb-1.5 text-base font-bold text-foreground">{children}</h2>;
              },
              h3({ children }) {
                return <h3 className="mt-2 mb-1 text-sm font-bold text-foreground">{children}</h3>;
              },
              p({ children }) {
                return <p className="my-1 leading-relaxed">{children}</p>;
              },
              hr() {
                return <hr className="my-3 border-border" />;
              },
              input({ checked, disabled }) {
                // GFM task list checkboxes
                return (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    className="mr-1.5 h-3.5 w-3.5 rounded border-border accent-primary"
                  />
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
          {message.streaming && (
            <span className="inline-block h-4 w-0.5 animate-pulse bg-primary ml-0.5 align-text-bottom" />
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <MessageActions content={message.content} onRegenerate={() => {}} />
          {message.model && <span>{message.model}</span>}
          {message.model && <span>·</span>}
          <span>{message.timestamp}</span>
        </div>
      </div>
    </div>
  );
}

/** Temporary demo — shows an approval card so we can see the UI.
 *  In production this will be driven by a real approval queue from the backend. */
function DemoApproval() {
  const [visible, setVisible] = useState(true);

  if (!visible) {return null;}

  return (
    <ApprovalOverlay
      request={{
        id: "demo-1",
        toolCallId: "tc-demo-1",
        command: "rm -rf node_modules && npm install",
        description: "Remove and reinstall all dependencies to fix version conflicts.",
        riskLevel: "medium",
        workingDir: "/home/user/project",
        createdAt: new Date().toLocaleTimeString(),
      }}
      onApprove={() => setVisible(false)}
      onDeny={() => setVisible(false)}
      onAllowAll={() => setVisible(false)}
    />
  );
}
