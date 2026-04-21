import { useState, useRef, useEffect } from "react";
import { useI18n } from "../../i18n";
import { useSettingsStore } from "../../stores/settingsStore";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../../lib/utils";

/**
 * ModelSelector — compact model picker for the MessageInput action bar.
 * Shows current model with provider color dot; opens a dropdown on click.
 */
export function ModelSelector() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const models = useSettingsStore((s) => s.models);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);

  // Close on outside click
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

  // Close on Escape
  useEffect(() => {
    if (!open) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
          open ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
        aria-label={t("a11y.selectModel")}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={cn("h-2 w-2 rounded-full shrink-0", selectedModel.color)} />
        <span className="max-w-[120px] truncate">{selectedModel.name}</span>
        <ChevronDown size={11} className={cn("shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-popover shadow-lg z-50 py-1 overflow-hidden"
          role="listbox"
          aria-label={t("a11y.selectModel")}
        >
          {models.map((model) => {
            const isActive = model.id === selectedModel.id;
            return (
              <button
                key={model.id}
                onClick={() => {
                  setSelectedModel(model);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                  isActive ? "bg-accent/50 text-foreground" : "text-popover-foreground hover:bg-accent/30",
                )}
                role="option"
                aria-selected={isActive}
              >
                <span className={cn("h-2 w-2 rounded-full shrink-0", model.color)} />
                <span className="flex-1 truncate font-medium">{model.name}</span>
                <span className="text-muted-foreground text-[10px]">{model.provider}</span>
                {isActive && <Check size={12} className="text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
