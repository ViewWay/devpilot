import { useState } from "react";
import { Copy, Check, RefreshCw } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";
import { toast } from "../../stores/toastStore";
import { useI18n } from "../../i18n";

type MessageActionBarProps = {
  /** Text content to copy to clipboard. */
  content: string;
  /** Message ID for the regenerate callback. */
  messageId?: string;
  /** Show regenerate button (typically only for the last assistant message). */
  showRegenerate?: boolean;
};

/**
 * MessageActionBar — hover-revealed action buttons for a message.
 * Provides copy-to-clipboard and regenerate response actions.
 */
export function MessageActionBar({ content, showRegenerate }: MessageActionBarProps) {
  const [copied, setCopied] = useState(false);
  const { t } = useI18n();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success(t("copied"));
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      toast.error(t("errorGeneric"));
    }
  };

  const handleRegenerate = () => {
    useChatStore.getState().regenerateLastResponse();
  };

  return (
    <div
      className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
      role="group"
      aria-label={t("a11y.messageActions")}
    >
      <button
        onClick={handleCopy}
        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
        title={t("copy")}
        aria-label={t("a11y.copyMessage")}
      >
        {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
      </button>
      {showRegenerate && (
        <button
          onClick={handleRegenerate}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] transition-colors"
          title={t("a11y.regenerateMessage")}
          aria-label={t("a11y.regenerateMessage")}
        >
          <RefreshCw size={12} />
        </button>
      )}
    </div>
  );
}
