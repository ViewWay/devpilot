import { useEffect, useState, useCallback } from "react";
import { invoke } from "../../lib/ipc";
import { useChatStore } from "../../stores/chatStore";
import { useI18n } from "../../i18n";

interface ContextSizeResult {
  tokens: number;
  limit: number;
}

/**
 * ContextSizeBar — compact horizontal bar showing context window usage.
 *
 * Color thresholds:
 *   < 50% → green (var(--color-success))
 *   50-80% → yellow (var(--color-warning))
 *   > 80% → red (var(--color-error))
 *
 * Displays "X.Xk / YYYk tokens".
 */
export function ContextSizeBar({ sessionId }: { sessionId?: string }) {
  const { t } = useI18n();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const [size, setSize] = useState<ContextSizeResult | null>(null);

  const sid = sessionId ?? activeSessionId;

  const refresh = useCallback(async () => {
    if (!sid) { return; }
    try {
      const result = await invoke<ContextSizeResult>("get_context_size", {
        sessionId: sid,
      });
      setSize(result);
    } catch {
      // silently ignore — non-critical UI
    }
  }, [sid]);

  // Refresh on mount and when session changes
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Expose refresh for parent components to trigger after stream-done
  // We store it on the window for simple external access
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("context-size-refresh", handler);
    return () => window.removeEventListener("context-size-refresh", handler);
  }, [refresh]);

  if (!size || size.limit === 0) { return null; }

  const ratio = size.tokens / size.limit;
  const pct = Math.min(ratio * 100, 100);

  // Color determination
  let colorVar: string;
  if (ratio < 0.5) {
    colorVar = "var(--color-success)";
  } else if (ratio < 0.8) {
    colorVar = "var(--color-warning)";
  } else {
    colorVar = "var(--color-error)";
  }

  const formatK = (n: number): string => {
    if (n >= 1000) {
      const val = n / 1000;
      return val % 1 === 0 ? `${val.toFixed(0)}k` : `${val.toFixed(1)}k`;
    }
    return String(n);
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex-1 h-1.5 rounded-full bg-[var(--color-surface-container)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: colorVar,
            minWidth: size.tokens > 0 ? "2px" : "0",
          }}
        />
      </div>
      <span
        className="text-[10px] font-mono whitespace-nowrap transition-colors"
        style={{ color: colorVar }}
      >
        {formatK(size.tokens)} / {formatK(size.limit)} {t("contextSize.tokens")}
      </span>
    </div>
  );
}

/**
 * Dispatch a custom event to refresh all ContextSizeBar instances.
 * Call this after stream-done events and on session switch.
 */
export function refreshContextSize() {
  window.dispatchEvent(new CustomEvent("context-size-refresh"));
}
