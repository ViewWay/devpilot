import { useI18n } from "../../i18n";
import { useUIStore } from "../../stores/uiStore";
import { cn } from "../../lib/utils";
import type { AgentMode } from "../../types";

const MODES: { key: AgentMode; icon: string }[] = [
  { key: "code", icon: "⚡" },
  { key: "plan", icon: "📋" },
  { key: "ask", icon: "💬" },
];

/**
 * ModeTabs — compact Code/Plan/Ask mode switcher for the MessageInput action bar.
 */
export function ModeTabs() {
  const { t } = useI18n();
  const activeMode = useUIStore((s) => s.activeMode);
  const setActiveMode = useUIStore((s) => s.setActiveMode);

  return (
    <div
      className="flex items-center rounded-md border border-border/50 bg-muted/30 p-0.5"
      role="radiogroup"
      aria-label={t("a11y.modeSelector")}
    >
      {MODES.map(({ key, icon }) => (
        <button
          key={key}
          onClick={() => setActiveMode(key)}
          className={cn(
            "flex items-center gap-1 rounded-sm px-2 py-0.5 text-[11px] font-medium transition-colors",
            activeMode === key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          role="radio"
          aria-checked={activeMode === key}
          aria-label={t(`a11y.mode${key.charAt(0).toUpperCase() + key.slice(1)}` as "a11y.modeCode")}
          title={t(key)}
        >
          <span className="text-[10px]">{icon}</span>
          <span>{t(key)}</span>
        </button>
      ))}
    </div>
  );
}
