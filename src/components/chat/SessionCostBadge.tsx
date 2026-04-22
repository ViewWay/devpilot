import { useUsageStore } from "../../stores/usageStore";
import { useChatStore } from "../../stores/chatStore";
import { useI18n } from "../../i18n";

/**
 * SessionCostBadge — compact cost display for the current session.
 * Shows "X tokens · $Y.YYYY" for the active session.
 */
export function SessionCostBadge() {
  const { t } = useI18n();
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const records = useUsageStore((s) => s.records);

  if (!activeSessionId) {
    return null;
  }

  const sessionRecords = records.filter((r) => r.sessionId === activeSessionId);
  if (sessionRecords.length === 0) {
    return null;
  }

  const totalTokens = sessionRecords.reduce(
    (sum, r) => sum + r.inputTokens + r.outputTokens,
    0,
  );
  const totalCost = sessionRecords.reduce((sum, r) => sum + r.estimatedCost, 0);

  const costStr = totalCost < 0.01 ? `<$0.01` : `$${totalCost.toFixed(2)}`;

  return (
    <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-[var(--color-text-secondary)] opacity-60 hover:opacity-100 transition-opacity">
      <span>{totalTokens.toLocaleString()} {t("tokens")}</span>
      <span>·</span>
      <span className="font-medium">{costStr}</span>
    </div>
  );
}
