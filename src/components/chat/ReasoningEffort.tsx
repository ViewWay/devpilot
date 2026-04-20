import { useState, useRef, useEffect } from "react";
import { useI18n } from "../../i18n";
import { useUIStore } from "../../stores/uiStore";
import { cn } from "../../lib/utils";
import { Brain } from "lucide-react";

const EFFORT_PRESETS = [
  { value: 0, labelKey: "reasoningShallow", labelShort: "low" },
  { value: 33, labelKey: "reasoningEffort", labelShort: "med" },
  { value: 66, labelKey: "reasoningEffort", labelShort: "high" },
  { value: 100, labelKey: "reasoningDeep", labelShort: "max" },
] as const;

/**
 * ReasoningEffort — compact reasoning effort control for the MessageInput action bar.
 * Click to cycle through low/med/high/max presets.
 */
export function ReasoningEffort() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reasoningEffort = useUIStore((s) => s.reasoningEffort);
  const setReasoningEffort = useUIStore((s) => s.setReasoningEffort);

  // Find closest preset for display
  const closest = EFFORT_PRESETS.reduce((prev, curr) =>
    Math.abs(curr.value - reasoningEffort) < Math.abs(prev.value - reasoningEffort) ? curr : prev,
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
          open ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label={t("a11y.reasoningEffortBtn")}
        aria-expanded={open}
        title={t("reasoningEffort")}
      >
        <Brain size={12} />
        <span className="font-medium uppercase text-[10px]">{closest.labelShort}</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border border-border bg-popover shadow-lg z-50 py-1">
          {EFFORT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => {
                setReasoningEffort(preset.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors",
                Math.abs(preset.value - reasoningEffort) < 17
                  ? "bg-accent/50 text-foreground"
                  : "text-popover-foreground hover:bg-accent/30",
              )}
            >
              <span className="font-medium">{t(preset.labelKey)}</span>
              <span className="text-[10px] text-muted-foreground">{preset.value}%</span>
            </button>
          ))}
          {/* Custom slider */}
          <div className="border-t border-border/50 px-3 py-2 mt-1">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
              <span>Custom</span>
              <span>{reasoningEffort}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={reasoningEffort}
              onChange={(e) => setReasoningEffort(Number(e.target.value))}
              className="w-full h-1 rounded-full appearance-none bg-border accent-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
