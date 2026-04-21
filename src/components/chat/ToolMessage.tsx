import { Wrench } from "lucide-react";
import { useI18n } from "../../i18n";
import { ToolCallList } from "./ToolCallView";
import type { Message } from "../../types";

type ToolMessageProps = {
  message: Message;
};

/**
 * ToolMessage — renders a tool call message with icon, content preview,
 * and expandable tool call details.
 */
export function ToolMessage({ message }: ToolMessageProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-start gap-3" role="article" aria-label={t("a11y.toolMessage")}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-container)]">
        <Wrench size={12} className="text-[var(--color-text-secondary)]" />
      </div>
      <div className="min-w-0 flex-1">
        {message.content && (
          <div className="rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-surface-container)]/30 px-3 py-2 text-xs leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
            {message.content}
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallList toolCalls={message.toolCalls} />
        )}
      </div>
    </div>
  );
}
