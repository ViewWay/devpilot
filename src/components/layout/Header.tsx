import { useTheme } from "../../hooks/useTheme";
import { Sun, Moon, PanelLeftClose, PanelLeft } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n";

const models = [
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI" },
  { id: "glm-5", name: "GLM-5", provider: "智谱" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek" },
  { id: "qwen-max", name: "通义千问 Max", provider: "阿里云" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google" },
  { id: "ollama-llama4", name: "Llama 4 (local)", provider: "Ollama" },
];

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { toggleTheme, theme } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedModel, setSelectedModel] = useState(models[0]!);

  return (
    <header className="flex h-12 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4">
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
      >
        {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <select
        value={selectedModel.id}
        onChange={(e) => {
          const m = models.find((m) => m.id === e.target.value);
          if (m) setSelectedModel(m);
        }}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] px-2 py-1 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
      >
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} ({m.provider})
          </option>
        ))}
      </select>

      <div className="flex rounded-md border border-[var(--color-border)] text-sm">
        {(["code", "plan", "ask"] as const).map((mode) => (
          <button
            key={mode}
            className="px-3 py-1 capitalize text-[var(--color-text-secondary)] first:rounded-l-md last:rounded-r-md hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            {t(`mode.${mode}`)}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className="rounded-md px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)]"
        >
          {locale === "en" ? "中" : "EN"}
        </button>
        <button
          onClick={toggleTheme}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
