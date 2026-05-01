import { useRef, useCallback } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
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
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Determine the id of the last assistant message in the session
  let lastAssistantId: string | undefined;
  if (session) {
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const msg = session.messages[i]!;
      if (msg.role === "assistant") {
        lastAssistantId = msg.id;
        break;
      }
    }
  }

  const itemContent = useCallback(
    (index: number) => {
      if (!session) { return null; }
      const msg = session.messages[index];
      if (!msg) { return null; }
      if (msg.role === "user") {
        return (
          <div className="py-4">
            <UserMessage message={msg} />
          </div>
        );
      }
      if (msg.role === "tool") {
        return (
          <div className="py-4">
            <ToolMessage message={msg} />
          </div>
        );
      }
      return (
        <div className="py-4">
          <AssistantMessage
            message={msg}
            isLast={msg.id === lastAssistantId}
          />
        </div>
      );
    },
    [session, lastAssistantId],
  );

  if (!session || session.messages.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1" role="log" aria-live="polite" aria-label={t("a11y.messageLog")}>
      <Virtuoso
        ref={virtuosoRef}
        data={session.messages}
        itemContent={itemContent}
        followOutput={"smooth"}
        initialTopMostItemIndex={
          session.messages.length > 0
            ? { index: session.messages.length - 1, align: "end" }
            : 0
        }
        increaseViewportBy={{ top: 200, bottom: 200 }}
        components={{
          Footer: () => <div className="h-4" />,
        }}
        className="h-full"
        style={{ overflowY: "auto" }}
      />
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
