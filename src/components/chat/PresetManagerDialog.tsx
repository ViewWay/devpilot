/**
 * PresetManagerDialog — CRUD dialog for conversation presets.
 *
 * Features:
 *  - List built-in and custom presets
 *  - Create new preset with name, systemPrompt, mode, model
 *  - Edit custom presets
 *  - Delete custom presets
 */

import { useState, useCallback } from "react";
import { X, Plus, Trash2, Edit3, Save, Star } from "lucide-react";
import { usePresetStore, type Preset } from "../../stores/presetStore";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";

interface PresetManagerDialogProps {
  onClose: () => void;
}

interface EditForm {
  name: string;
  systemPrompt: string;
  mode: "code" | "plan" | "ask";
  temperature: number;
}

const EMPTY_FORM: EditForm = {
  name: "",
  systemPrompt: "",
  mode: "code",
  temperature: 0.7,
};

export function PresetManagerDialog({ onClose }: PresetManagerDialogProps) {
  const { t } = useI18n();
  const presets = usePresetStore((s) => s.presets);
  const createPreset = usePresetStore((s) => s.createPreset);
  const updatePreset = usePresetStore((s) => s.updatePreset);
  const deletePreset = usePresetStore((s) => s.deletePreset);

  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);

  const startEdit = useCallback((preset: Preset) => {
    setCreating(false);
    setEditing(preset.id);
    setForm({
      name: preset.name,
      systemPrompt: preset.systemPrompt,
      mode: preset.mode,
      temperature: preset.temperature,
    });
  }, []);

  const startCreate = useCallback(() => {
    setEditing(null);
    setCreating(true);
    setForm(EMPTY_FORM);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form.name.trim()) { return; }

    if (creating) {
      await createPreset({
        name: form.name.trim(),
        systemPrompt: form.systemPrompt,
        model: "",
        provider: "",
        temperature: form.temperature,
        mode: form.mode,
      });
    } else if (editing) {
      await updatePreset(editing, {
        name: form.name.trim(),
        systemPrompt: form.systemPrompt,
        mode: form.mode,
        temperature: form.temperature,
      });
    }
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  }, [creating, editing, form, createPreset, updatePreset]);

  const handleDelete = useCallback(async (id: string) => {
    await deletePreset(id);
  }, [deletePreset]);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  }, []);

  const builtIn = presets.filter((p) => p.builtIn);
  const custom = presets.filter((p) => !p.builtIn);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) { onClose(); } }}
    >
      <div
        className="w-full max-w-xl max-h-[80vh] rounded-xl border shadow-xl flex flex-col"
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text-primary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="text-sm font-semibold">{t("presetManager")}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={startCreate}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white hover:opacity-90 transition-colors"
              style={{ background: "var(--color-brand)" }}
            >
              <Plus size={12} />
              {t("presetCreate")}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-accent/50 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-4 py-3 space-y-4 flex-1">
          {/* Built-in presets */}
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
              {t("presetBuiltIn")}
            </div>
            <div className="space-y-1">
              {builtIn.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <Star size={12} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium">{preset.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {preset.systemPrompt.slice(0, 80)}
                      {preset.systemPrompt.length > 80 ? "..." : ""}
                    </div>
                  </div>
                  <span className="text-[9px] text-muted-foreground uppercase bg-muted/50 px-1.5 py-0.5 rounded">
                    {preset.mode}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom presets */}
          {custom.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">
                {t("presetCustom")}
              </div>
              <div className="space-y-1">
                {custom.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <Edit3 size={12} className="text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium">{preset.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {preset.systemPrompt.slice(0, 80)}
                        {preset.systemPrompt.length > 80 ? "..." : ""}
                      </div>
                    </div>
                    <span className="text-[9px] text-muted-foreground uppercase bg-muted/50 px-1.5 py-0.5 rounded">
                      {preset.mode}
                    </span>
                    <button
                      onClick={() => startEdit(preset)}
                      className="p-1 rounded hover:bg-accent/50 transition-colors"
                      title={t("edit")}
                    >
                      <Edit3 size={11} />
                    </button>
                    <button
                      onClick={() => handleDelete(preset.id)}
                      className="p-1 rounded hover:bg-error/10 text-error transition-colors"
                      title={t("delete")}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Create / Edit form */}
          {(creating || editing) && (
            <div
              className="rounded-md border p-3 space-y-3"
              style={{ borderColor: "var(--color-brand)" }}
            >
              <div className="text-xs font-medium">
                {creating ? t("presetCreate") : t("presetEdit")}
              </div>

              {/* Name */}
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">{t("presetName")}</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-md border px-2 py-1.5 text-xs outline-none focus:border-[var(--color-brand)]"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                  placeholder={t("presetNamePlaceholder")}
                />
              </div>

              {/* System prompt */}
              <div>
                <label className="text-[10px] text-muted-foreground block mb-1">{t("presetSystemPrompt")}</label>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm((f) => ({ ...f, systemPrompt: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border px-2 py-1.5 text-xs outline-none resize-y focus:border-[var(--color-brand)]"
                  style={{
                    background: "var(--color-surface)",
                    borderColor: "var(--color-border)",
                    color: "var(--color-text-primary)",
                  }}
                  placeholder={t("presetSystemPromptPlaceholder")}
                />
              </div>

              {/* Mode + Temperature row */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] text-muted-foreground block mb-1">{t("presetMode")}</label>
                  <div className="flex gap-1">
                    {(["code", "plan", "ask"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setForm((f) => ({ ...f, mode: m }))}
                        className={cn(
                          "flex-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors",
                          form.mode === m ? "text-white" : "hover:bg-accent/50",
                        )}
                        style={{
                          background: form.mode === m ? "var(--color-brand)" : "transparent",
                          borderColor: "var(--color-border)",
                        }}
                      >
                        {t(m)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-24">
                  <label className="text-[10px] text-muted-foreground block mb-1">{t("presetTemp")}</label>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={form.temperature}
                    onChange={(e) => setForm((f) => ({ ...f, temperature: parseFloat(e.target.value) || 0 }))}
                    className="w-full rounded-md border px-2 py-1 text-xs outline-none focus:border-[var(--color-brand)]"
                    style={{
                      background: "var(--color-surface)",
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-primary)",
                    }}
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={cancelEdit}
                  className="rounded-md border px-3 py-1 text-xs hover:bg-accent/50 transition-colors"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  {t("cancel")}
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim()}
                  className="flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
                  style={{ background: "var(--color-brand)" }}
                >
                  <Save size={11} />
                  {t("save")}
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {custom.length === 0 && !creating && (
            <div className="text-center py-6">
              <div className="text-xs text-muted-foreground mb-2">{t("presetNoCustom")}</div>
              <button
                onClick={startCreate}
                className="text-xs text-[var(--color-brand)] hover:underline"
              >
                {t("presetCreateFirst")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
