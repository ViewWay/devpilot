import { useState, useEffect, useCallback } from "react";
import { invoke } from "../../lib/ipc";
import { ChevronDown, Bot } from "lucide-react";
import { useI18n } from "../../i18n";
import { useUIStore } from "../../stores/uiStore";

interface AgentDef {
  agent_type: string;
  description: string;
  model: string | null;
  tools: string[] | null;
  disallowed_tools: string[] | null;
  prompt: string;
}

const BUILTIN_AGENTS: AgentDef[] = [
  {
    agent_type: "general",
    description: "General-purpose coding assistant",
    model: null,
    tools: null,
    disallowed_tools: null,
    prompt: "",
  },
  {
    agent_type: "architect",
    description: "System design & architecture reviewer",
    model: null,
    tools: null,
    disallowed_tools: null,
    prompt: "",
  },
  {
    agent_type: "code_reviewer",
    description: "Code quality & security reviewer",
    model: null,
    tools: null,
    disallowed_tools: null,
    prompt: "",
  },
  {
    agent_type: "test_writer",
    description: "Test generation specialist",
    model: null,
    tools: null,
    disallowed_tools: null,
    prompt: "",
  },
];

export function AgentSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (agentType: string) => void;
}) {
  const { t } = useI18n();
  const workdir = useUIStore((s) => s.workingDir);
  const [agents, setAgents] = useState<AgentDef[]>(BUILTIN_AGENTS);
  const [open, setOpen] = useState(false);

  const loadCustom = useCallback(async () => {
    if (!workdir) { return; }
    try {
      const defs = await invoke<AgentDef[]>("agent_list_definitions", {
        workdir,
      });
      if (defs && defs.length > 0) {
        setAgents([...BUILTIN_AGENTS, ...defs]);
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-empty
    } catch (_e) {}
  }, [workdir]);

  useEffect(() => {
    loadCustom();
  }, [loadCustom]);

  const current = agents.find((a) => a.agent_type === value);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)] hover:text-[var(--color-text-primary)] transition-colors"
        title={current?.description ?? t("selectAgent")}
      >
        <Bot size={12} />
        <span className="max-w-[80px] truncate">
          {current?.agent_type ?? "general"}
        </span>
        <ChevronDown size={10} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden">
            <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]/40">
              {t("agents")}
            </div>
            {agents.map((agent) => (
              <button
                key={agent.agent_type}
                type="button"
                onClick={() => {
                  onChange(agent.agent_type);
                  setOpen(false);
                }}
                className={`w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-container)] transition-colors ${
                  agent.agent_type === value
                    ? "bg-[var(--color-brand)]/10 text-[var(--color-brand)]"
                    : "text-[var(--color-text-secondary)]"
                }`}
              >
                <Bot size={14} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {agent.agent_type}
                  </div>
                  {agent.description && (
                    <div className="text-[10px] text-[var(--color-text-tertiary)] truncate">
                      {agent.description}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
