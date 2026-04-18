import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { Bot, Wrench, Sparkles, Code, MessageSquare, Zap } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import { ToolCallList } from "./ToolCallView";
import { useChatStore } from "../../stores/chatStore";

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
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-6">
        <Sparkles size={28} className="text-primary" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">DevPilot</h2>
      <p className="text-sm text-muted-foreground mb-8 text-center max-w-md">
        Your AI coding agent. Ask questions, write code, refactor projects — all in one place.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-lg">
        <SuggestionCard icon={<Code size={16} />} title="Debug code" description="Find and fix bugs in your codebase" />
        <SuggestionCard icon={<MessageSquare size={16} />} title="Explain code" description="Understand complex code logic" />
        <SuggestionCard icon={<Zap size={16} />} title="Generate code" description="Create new features from specs" />
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

function MessageBubble({ message }: { message: import("../../types").Message }) {
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
    <div className="flex items-start gap-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary">
        <Bot size={12} className="text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="text-sm leading-relaxed text-assistant-bubble-foreground prose-sm">
          <ReactMarkdown
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
                  <div className="my-2 overflow-x-auto">
                    <table className="w-full text-xs border-collapse border border-border">{children}</table>
                  </div>
                );
              },
              th({ children }) {
                return <th className="border border-border bg-muted/50 px-2.5 py-1.5 text-left font-semibold text-muted-foreground">{children}</th>;
              },
              td({ children }) {
                return <td className="border border-border px-2.5 py-1.5">{children}</td>;
              },
              pre({ children }) {
                return <>{children}</>;
              },
              a({ href, children }) {
                return (
                  <a href={href} className="text-primary underline hover:text-primary/80" target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                );
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
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
