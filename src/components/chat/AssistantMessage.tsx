import { Bot } from "lucide-react";
import { useI18n } from "../../i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { ThinkingBlock } from "./ThinkingBlock";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageActionBar } from "./MessageActionBar";
import { StreamingIndicator } from "./StreamingIndicator";
import type { Message } from "../../types";

type AssistantMessageProps = {
  message: Message;
  /** Whether this is the last assistant message (enables regenerate). */
  isLast?: boolean;
};

/**
 * AssistantMessage — renders an AI response with thinking block,
 * markdown content, streaming indicator, model info, and action bar.
 */
export function AssistantMessage({ message, isLast = false }: AssistantMessageProps) {
  const { t } = useI18n();
  const fontSize = useSettingsStore((s) => s.fontSize);

  return (
    <div className="group flex items-start gap-3" role="article" aria-label={t("a11y.assistantMessage")}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--color-brand)]">
        <Bot size={12} className="text-primary-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {/* Thinking/reasoning block */}
        {message.thinkingContent && (
          <ThinkingBlock content={message.thinkingContent} streaming={message.streaming} />
        )}

        {/* Main content */}
        <MarkdownRenderer content={message.content} fontSize={fontSize} />
        {message.streaming && <StreamingIndicator />}

        {/* Footer: actions + metadata */}
        <div className="flex items-center gap-2 text-[10px] text-[var(--color-text-secondary)]">
          <MessageActionBar
            content={message.content}
            showRegenerate={isLast}
          />
          {message.model && <span>{message.model}</span>}
          {message.model && <span>·</span>}
          <span>{message.timestamp}</span>
        </div>
      </div>
    </div>
  );
}
