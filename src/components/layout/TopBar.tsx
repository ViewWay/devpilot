import { useTheme } from "../../hooks/useTheme";
import { useI18n } from "../../i18n";
import { Sun, Moon, PanelLeftClose, PanelLeft, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

const models = [
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic", color: "bg-orange-500" },
  { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI", color: "bg-emerald-500" },
  { id: "glm-5", name: "GLM-5", provider: "智谱", color: "bg-blue-500" },
  { id: "deepseek-v3", name: "DeepSeek V3", provider: "DeepSeek", color: "bg-violet-500" },
  { id: "qwen-max", name: "通义千问 Max", provider: "阿里云", color: "bg-purple-500" },
  { id: "gemini-3-pro", name: "Gemini 3 Pro", provider: "Google", color: "bg-red-500" },
  { id: "ollama-llama4", name: "Llama 4 (local)", provider: "Ollama", color: "bg-gray-500" },
];

const modes = [
  { id: "code", label: "Code", labelZh: "编码" },
  { id: "plan", label: "Plan", labelZh: "规划" },
  { id: "ask", label: "Ask", labelZh: "提问" },
] as const;

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export function TopBar({ sidebarOpen, onToggleSidebar }: TopBarProps) {
  const { locale, setLocale } = useI18n();
  const { toggleTheme, theme } = useTheme();
  const [selectedModel, setSelectedModel] = useState(models[0]!);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [activeMode, setActiveMode] = useState<string>("code");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-sm">
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
      </button>

      {/* Model Selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
          className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
        >
          <span className={cn("h-2 w-2 rounded-full", selectedModel.color)} />
          <span className="max-w-[140px] truncate">{selectedModel.name}</span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </button>

        {modelDropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
            {models.map((m) => (
              <button
                key={m.id}
                onClick={() => { setSelectedModel(m); setModelDropdownOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                  selectedModel.id === m.id && "bg-accent",
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", m.color)} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[10px] text-muted-foreground">{m.provider}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-border" />

      {/* Mode Tabs */}
      <div className="flex rounded-md border border-input text-xs">
        {modes.map((mode) => (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className={cn(
              "px-2.5 py-1 capitalize transition-colors first:rounded-l-md last:rounded-r-md",
              activeMode === mode.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {locale === "zh" ? mode.labelZh : mode.label}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Right Controls */}
      <div className="flex items-center gap-1">
        {/* i18n toggle */}
        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className="flex h-7 items-center rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {locale === "en" ? "中文" : "EN"}
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
}
