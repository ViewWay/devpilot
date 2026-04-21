import { useEffect, useRef } from "react";
import { Sparkles, Code, MessageSquare, Zap } from "lucide-react";
import { useSettingsStore } from "../../stores/settingsStore";
import { useChatStore } from "../../stores/chatStore";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolMessage } from "./ToolMessage";
import { useI18n } from "../../i18n";

export function MessageList({ sessionId }: { sessionId?: string } = {}) {
  const { t } = useI18n();
  const session = useChatStore((s) =>
    sessionId
      ? s.sessions.find((sess) => sess.id === sessionId)
      : s.activeSession(),
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  const messageCount = session?.messages.length ?? 0;
  const lastMessageContent = session?.messages[messageCount - 1]?.content;

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messageCount, lastMessageContent]);

  if (!session || session.messages.length === 0) {
    return <EmptyState />;
  }

  // Determine the id of the last assistant message in the session
  let lastAssistantId: string | undefined;
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const msg = session.messages[i]!;
    if (msg.role === "assistant") {
      lastAssistantId = msg.id;
      break;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label={t("a11y.messageLog")}>
      <div className="mx-auto w-full max-w-3xl px-6 py-8 2xl:max-w-4xl">
        <div className="space-y-8">
          {session.messages.map((msg) => {
            if (msg.role === "user") {
              return <UserMessage key={msg.id} message={msg} />;
            }
            if (msg.role === "tool") {
              return <ToolMessage key={msg.id} message={msg} />;
            }
            return (
              <AssistantMessage
                key={msg.id}
                message={msg}
                isLast={msg.id === lastAssistantId}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}

/* ─── Empty State ──────────────────────────────────────────── */

function EmptyState() {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 empty-pattern">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-brand)]/10 mb-6">
        <Sparkles size={28} className="text-[var(--color-brand)]" />
      </div>
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">DevPilot</h2>
      <p className="text-sm text-[var(--color-text-secondary)] mb-8 text-center max-w-md">
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
  const handleClick = () => {
    const model = useSettingsStore.getState().selectedModel.id;
    useChatStore.getState().sendMessage(description, model);
  };
  return (
    <button
      onClick={handleClick}
      className="flex flex-col items-start gap-2 rounded-lg border border-[var(--color-border)]/40 bg-card p-4 text-left transition-colors hover:bg-[var(--color-surface-hover)] hover:border-accent"
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-brand)]/10 text-[var(--color-brand)]">{icon}</div>
      <div>
        <div className="text-xs font-medium text-[var(--color-text-primary)]">{title}</div>
        <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">{description}</div>
      </div>
    </button>
  );
}
