import { useState, useCallback, useMemo } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";
import { Plus, X, Variable } from "lucide-react";

/**
 * Compact inline editor for per-session environment variables.
 * Renders as a collapsible row below the chat input, similar to
 * the SystemPromptEditorSlim pattern.
 */
export function EnvVarsEditor({ sessionId }: { sessionId?: string | null }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  const session = useChatStore((s) =>
    s.sessions.find((sess) => sess.id === (sessionId ?? s.activeSessionId)),
  );
  const setSessionEnvVars = useChatStore((s) => s.setSessionEnvVars);

  const envVars = useMemo(() => session?.envVars ?? [], [session?.envVars]);
  const sid = sessionId ?? useChatStore.getState().activeSessionId;

  const handleAdd = useCallback(() => {
    if (!sid) { return; }
    const updated = [...envVars, { key: "", value: "" }];
    setSessionEnvVars(sid, updated);
  }, [sid, envVars, setSessionEnvVars]);

  const handleRemove = useCallback(
    (index: number) => {
      if (!sid) { return; }
      const updated = envVars.filter((_, i) => i !== index);
      setSessionEnvVars(sid, updated.length > 0 ? updated : []);
    },
    [sid, envVars, setSessionEnvVars],
  );

  const handleChange = useCallback(
    (index: number, field: "key" | "value", val: string) => {
      if (!sid) { return; }
      const updated = [...envVars];
      const existing = updated[index];
      if (!existing) { return; }
      updated[index] = field === "key"
        ? { key: val, value: existing.value }
        : { key: existing.key, value: val };
      setSessionEnvVars(sid, updated);
    },
    [sid, envVars, setSessionEnvVars],
  );

  if (!sid) { return null; }

  const activeCount = envVars.filter((v) => v.key.trim()).length;

  return (
    <div className="border-t border-[var(--color-border)]/40">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center gap-1.5 px-3 py-1 text-[11px] transition-colors",
          "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
        )}
      >
        <Variable size={11} />
        <span className="font-medium">{t("envVars") ?? "Environment Variables"}</span>
        {activeCount > 0 && !open && (
          <span className="rounded-full bg-[var(--color-brand)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-brand)]">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-1 px-3 pb-2">
          {envVars.map((ev, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="text"
                value={ev.key}
                onChange={(e) => handleChange(i, "key", e.target.value)}
                placeholder="KEY"
                spellCheck={false}
                className={cn(
                  "w-[35%] shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5",
                  "text-[11px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]",
                )}
              />
              <span className="text-[10px] text-[var(--color-text-tertiary)]">=</span>
              <input
                type="text"
                value={ev.value}
                onChange={(e) => handleChange(i, "value", e.target.value)}
                placeholder="value"
                spellCheck={false}
                className={cn(
                  "flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5",
                  "text-[11px] font-mono text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)]",
                  "focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]",
                )}
              />
              <button
                onClick={() => handleRemove(i)}
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                  "text-[var(--color-text-tertiary)] hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]",
                  "transition-colors",
                )}
                title={t("remove") ?? "Remove"}
              >
                <X size={11} />
              </button>
            </div>
          ))}

          <button
            onClick={handleAdd}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px]",
              "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]",
              "transition-colors",
            )}
          >
            <Plus size={11} />
            <span>{t("addEnvVar") ?? "Add variable"}</span>
          </button>
        </div>
      )}
    </div>
  );
}
