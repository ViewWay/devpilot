/**
 * PresetSelector — Dropdown to select a conversation preset.
 *
 * When a preset is selected, it applies:
 *  - systemPrompt to settingsStore
 *  - mode to settingsStore
 *  - model/provider to settingsStore (if preset has them)
 *  - temperature to settingsStore (if applicable)
 */

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Settings2, Star } from "lucide-react";
import { usePresetStore, type Preset } from "../../stores/presetStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import { PresetManagerDialog } from "./PresetManagerDialog";

export function PresetSelector() {
  const { t } = useI18n();
  const presets = usePresetStore((s) => s.presets);
  const [open, setOpen] = useState(false);
  const [showManager, setShowManager] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Current active preset id (tracked in settings)
  const activePresetId = useSettingsStore((s) => s.activePresetId);
  const setActivePresetId = useSettingsStore((s) => s.setActivePresetId);
  const setSystemPrompt = useSettingsStore((s) => s.setSystemPrompt);
  const setActiveMode = useSettingsStore((s) => s.setActiveMode);

  // Close on outside click
  useEffect(() => {
    if (!open) { return; }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Load presets on mount
  useEffect(() => {
    usePresetStore.getState().fetchPresets();
  }, []);

  const activePreset = presets.find((p) => p.id === activePresetId);

  const applyPreset = (preset: Preset) => {
    setActivePresetId(preset.id);
    if (preset.systemPrompt) { setSystemPrompt(preset.systemPrompt); }
    setActiveMode(preset.mode);
    setOpen(false);
  };

  const clearPreset = () => {
    setActivePresetId(null);
    setSystemPrompt("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
          activePresetId
            ? "border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5 text-[var(--color-brand)]"
            : "border-[var(--color-border)]/50 bg-muted/30 text-muted-foreground hover:text-foreground",
        )}
      >
        <Star size={10} />
        <span className="max-w-[80px] truncate">
          {activePreset ? activePreset.name : t("presetNone")}
        </span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-1 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border shadow-lg py-1"
          style={{
            background: "var(--color-surface)",
            borderColor: "var(--color-border)",
          }}
        >
          {/* Clear selection */}
          <button
            onClick={clearPreset}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors",
              !activePresetId
                ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                : "text-muted-foreground hover:bg-accent/50",
            )}
          >
            <Star size={11} />
            {t("presetNone")}
          </button>

          <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />

          {/* Built-in presets */}
          {presets.filter((p) => p.builtIn).map((preset) => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={cn(
                "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors",
                activePresetId === preset.id
                  ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                  : "hover:bg-accent/50",
              )}
            >
              <Star size={11} className="shrink-0" />
              <span className="truncate">{preset.name}</span>
              <span className="ml-auto text-[9px] text-muted-foreground uppercase">{preset.mode}</span>
            </button>
          ))}

          {/* Custom presets */}
          {presets.filter((p) => !p.builtIn).length > 0 && (
            <>
              <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />
              <div className="px-3 py-0.5 text-[9px] text-muted-foreground uppercase tracking-wider">
                {t("presetCustom")}
              </div>
              {presets.filter((p) => !p.builtIn).map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors",
                    activePresetId === preset.id
                      ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                      : "hover:bg-accent/50",
                  )}
                >
                  <Settings2 size={11} className="shrink-0" />
                  <span className="truncate">{preset.name}</span>
                  <span className="ml-auto text-[9px] text-muted-foreground uppercase">{preset.mode}</span>
                </button>
              ))}
            </>
          )}

          {/* Manage button */}
          <div className="my-1 border-t" style={{ borderColor: "var(--color-border)" }} />
          <button
            onClick={() => { setOpen(false); setShowManager(true); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors"
          >
            <Settings2 size={11} />
            {t("presetManage")}
          </button>
        </div>
      )}

      {/* Preset manager dialog */}
      {showManager && (
        <PresetManagerDialog onClose={() => setShowManager(false)} />
      )}
    </div>
  );
}
