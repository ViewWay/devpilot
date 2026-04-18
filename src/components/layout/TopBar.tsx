import { useTheme } from "../../hooks/useTheme";
import { useI18n } from "../../i18n";
import { useUIStore } from "../../stores/uiStore";
import { Sun, Moon, PanelLeftClose, PanelLeft, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "../../lib/utils";

const modes = [
  { id: "code", label: "Code", labelZh: "编码" },
  { id: "plan", label: "Plan", labelZh: "规划" },
  { id: "ask", label: "Ask", labelZh: "提问" },
] as const;

export function TopBar() {
  const { locale, setLocale } = useI18n();
  const { toggleTheme, theme } = useTheme();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const setSelectedModel = useUIStore((s) => s.setSelectedModel);
  const models = useUIStore((s) => s.models);
  const activeMode = useUIStore((s) => s.activeMode);
  const setActiveMode = useUIStore((s) => s.setActiveMode);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      <button
        onClick={toggleSidebar}
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

      <div className="flex items-center gap-1">
        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className="flex h-7 items-center rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {locale === "en" ? "中文" : "EN"}
        </button>
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
