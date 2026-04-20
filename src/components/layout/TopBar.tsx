import { useThemeCycle, resolveTheme } from "../../hooks/useTheme";
import { useI18n } from "../../i18n";
import { useUIStore } from "../../stores/uiStore";
import { useProviderStore } from "../../stores/providerStore";
import { useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, Monitor, PanelLeftClose, PanelLeft, ChevronDown, Settings, FolderOpen, Terminal, Eye, SlidersHorizontal, FolderCog, Columns2 } from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { cn } from "../../lib/utils";
import { isTauriRuntime } from "../../lib/ipc";
import type { ModelInfo } from "../../types";

/** Provider name → tailwind color class for the model dot. */
const PROVIDER_COLOR_MAP: Record<string, string> = {
  Anthropic: "bg-orange-500",
  OpenAI: "bg-emerald-500",
  "智谱 AI": "bg-blue-500",
  智谱: "bg-blue-500",
  DeepSeek: "bg-violet-500",
  "Google AI": "bg-red-500",
  Google: "bg-red-500",
  OpenRouter: "bg-cyan-500",
  "通义千问 (Qwen)": "bg-purple-500",
  通义千问: "bg-purple-500",
  "Ollama (Local)": "bg-gray-500",
  Ollama: "bg-gray-500",
};

const FALLBACK_COLORS = [
  "bg-sky-500",
  "bg-pink-500",
  "bg-teal-500",
  "bg-amber-500",
  "bg-lime-500",
  "bg-indigo-500",
];

function getProviderColor(name: string, index: number): string {
  if (PROVIDER_COLOR_MAP[name]) {
    return PROVIDER_COLOR_MAP[name];
  }
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length] ?? "bg-sky-500";
}

const MODES = ["code", "plan", "ask"] as const;

export function TopBar() {
  const { locale, setLocale, t } = useI18n();
  const { theme, cycleTheme } = useThemeCycle();
  const resolvedTheme = resolveTheme(theme);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const setSelectedModel = useUIStore((s) => s.setSelectedModel);
  const activeMode = useUIStore((s) => s.activeMode);
  const setActiveMode = useUIStore((s) => s.setActiveMode);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const reasoningEffort = useUIStore((s) => s.reasoningEffort);
  const setReasoningEffort = useUIStore((s) => s.setReasoningEffort);
  const splitViewActive = useUIStore((s) => s.splitViewActive);
  const toggleSplitView = useUIStore((s) => s.toggleSplitView);

  // Subscribe to provider store
  const providers = useProviderStore((s) => s.providers);

  // Derive model list dynamically from enabled providers
  const dynamicModels: ModelInfo[] = useMemo(() => {
    const result: ModelInfo[] = [];
    providers.forEach((provider, providerIndex) => {
      if (!provider.enabled) {
        return;
      }
      // Filter out providers with no apiKey (except local/Ollama)
      const isLocal =
        provider.baseUrl.includes("localhost") ||
        provider.baseUrl.includes("127.0.0.1");
      if (!isLocal && !provider.apiKey) {
        return;
      }
      const color = getProviderColor(provider.name, providerIndex);
      for (const model of provider.models) {
        result.push({
          id: model.id,
          name: model.name,
          provider: provider.name,
          color,
        });
      }
    });
    return result;
  }, [providers]);

  // Group models by provider for the dropdown
  const groupedModels = useMemo(() => {
    const groups: { provider: string; color: string; models: ModelInfo[] }[] = [];
    for (const m of dynamicModels) {
      let group = groups.find((g) => g.provider === m.provider);
      if (!group) {
        group = { provider: m.provider, color: m.color, models: [] };
        groups.push(group);
      }
      group.models.push(m);
    }
    return groups;
  }, [dynamicModels]);

  // Auto-select first model if selected model no longer exists in dynamic list
  useEffect(() => {
    if (dynamicModels.length > 0) {
      const exists = dynamicModels.some((m) => m.id === selectedModel.id);
      if (!exists) {
        setSelectedModel(dynamicModels[0]!);
      }
    }
  }, [dynamicModels, selectedModel.id, setSelectedModel]);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [effortOpen, setEffortOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const effortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (effortRef.current && !effortRef.current.contains(e.target as Node)) {
        setEffortOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-background/80 px-2 backdrop-blur-sm overflow-hidden" role="toolbar" aria-label={t("a11y.topBarToolbar")}>
      <button
        onClick={toggleSidebar}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        aria-label={t("a11y.sidebarToggle")}
        aria-pressed={sidebarOpen}
      >
        {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
      </button>

      {/* Model Selector */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
          className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
          aria-label={t("a11y.selectModel")}
          aria-expanded={modelDropdownOpen}
          aria-haspopup="listbox"
        >
          <span className={cn("h-2 w-2 rounded-full", selectedModel.color)} />
          <span className="max-w-[140px] truncate">{selectedModel.name}</span>
          <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
        </button>

        {modelDropdownOpen && (
          <div className="absolute left-0 top-full z-50 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg" role="listbox" aria-label={t("a11y.selectModel")}>
            {groupedModels.length === 0 && (
              <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">
                No models available — configure providers in Settings
              </div>
            )}
            {groupedModels.map((group, gi) => (
              <div key={group.provider}>
                {gi > 0 && <div className="my-1 border-t border-border" />}
                <div className="flex items-center gap-2 px-2.5 py-1">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", group.color)} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.provider}
                  </span>
                  <span className="flex-1 border-b border-border" />
                </div>
                {group.models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedModel(m); setModelDropdownOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                      selectedModel.id === m.id && "bg-accent",
                    )}
                    role="option"
                    aria-selected={selectedModel.id === m.id}
                  >
                    <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", m.color)} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{m.name}</div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Mode Tabs */}
      <div className="flex rounded-md border border-input text-xs" role="radiogroup" aria-label={t("a11y.modeSelector")}>
        {MODES.map((mode) => (
          <button
            key={mode}
            onClick={() => setActiveMode(mode)}
            className={cn(
              "px-2.5 py-1 capitalize transition-colors first:rounded-l-md last:rounded-r-md",
              activeMode === mode
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            role="radio"
            aria-checked={activeMode === mode}
            aria-label={t(`a11y.mode${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}
          >
            {t(mode)}
          </button>
        ))}
      </div>

      {/* Working Directory — hidden on narrow screens */}
      <div className="hidden lg:block">
        <WorkingDirSelector />
      </div>

      {/* Reasoning Effort Slider — hidden on medium screens */}
      <div className="relative hidden md:block" ref={effortRef}>
        <button
          onClick={() => setEffortOpen(!effortOpen)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors",
            effortOpen ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          title={t("reasoningEffort")}
          aria-label={t("a11y.reasoningEffortBtn")}
          aria-expanded={effortOpen}
          aria-pressed={effortOpen}
        >
          <SlidersHorizontal size={12} />
          <span className="hidden sm:inline">{reasoningEffort}%</span>
        </button>
        {effortOpen && (
          <div className="absolute left-1/2 top-full z-50 mt-1 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover p-3 shadow-lg">
            <div className="mb-2 text-xs font-medium text-foreground">{t("reasoningEffort")}</div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">{t("reasoningShallow").split(" — ")[0]}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={reasoningEffort}
                onChange={(e) => setReasoningEffort(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
              />
              <span className="text-[10px] text-muted-foreground">{t("reasoningDeep").split(" — ")[0]}</span>
            </div>
            <div className="mt-1 text-center text-[10px] text-muted-foreground">
              {reasoningEffort < 30 ? t("reasoningShallow") : reasoningEffort < 70 ? "⚖️ Balanced" : t("reasoningDeep")}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel Toggles — only show on chat page */}
      {location.pathname !== "/settings" && (
        <>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => toggleSplitView()}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
                splitViewActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title={t("splitView")}
              aria-label={t("a11y.toggleSplitView")}
              aria-pressed={splitViewActive}
            >
              <Columns2 size={14} />
            </button>
            <button
              onClick={() => toggleRightPanel("files")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
                rightPanel === "files"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Files"
              aria-label={t("a11y.toggleFiles")}
              aria-pressed={rightPanel === "files"}
            >
              <FolderOpen size={14} />
            </button>
            <button
              onClick={() => toggleRightPanel("terminal")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
                rightPanel === "terminal"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Terminal"
              aria-label={t("a11y.toggleTerminal")}
              aria-pressed={rightPanel === "terminal"}
            >
              <Terminal size={14} />
            </button>
            <button
              onClick={() => toggleRightPanel("preview")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
                rightPanel === "preview"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Preview"
              aria-label={t("a11y.togglePreview")}
              aria-pressed={rightPanel === "preview"}
            >
              <Eye size={14} />
            </button>
          </div>
        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className="flex h-7 items-center rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("a11y.switchLanguage")}
        >
          {locale === "en" ? "中文" : "EN"}
        </button>
        <button
          onClick={() => navigate(location.pathname === "/settings" ? "/" : "/settings")}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
            location.pathname === "/settings"
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={t("a11y.openSettings")}
        >
          <Settings size={14} />
        </button>
        <button
          onClick={cycleTheme}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={theme === "system" ? t("themeSystem") : theme === "dark" ? t("themeDark") : t("themeLight")}
          aria-label={t("a11y.toggleTheme")}
        >
          {theme === "system" ? <Monitor size={14} /> : resolvedTheme === "dark" ? <Moon size={14} /> : <Sun size={14} />}
        </button>
      </div>
    </header>
  );
}

/** Working directory selector — opens a native folder dialog in Tauri mode. */
function WorkingDirSelector() {
  const { t } = useI18n();
  const workingDir = useUIStore((s) => s.workingDir);
  const setWorkingDir = useUIStore((s) => s.setWorkingDir);

  const handlePickFolder = useCallback(async () => {
    if (!isTauriRuntime()) {
      // Browser fallback — use a simple inline input instead of prompt
      const path = window.prompt("Enter working directory path:", workingDir || "~"); // eslint-disable-line no-alert
      if (path) {
        setWorkingDir(path.trim());
      }
      return;
    }

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Select Working Directory" });
      if (selected && typeof selected === "string") {
        setWorkingDir(selected);
      }
    } catch {
      // User cancelled or dialog not available — ignore
    }
  }, [workingDir, setWorkingDir]);

  // Shorten display path
  const displayDir = workingDir
    ? workingDir.split("/").slice(-2).join("/")
    : t("noDirSelected");

  return (
    <button
      onClick={handlePickFolder}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors max-w-[180px]",
        workingDir
          ? "bg-accent text-foreground hover:bg-accent/80"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      title={workingDir || t("noDirSelected")}
      aria-label={t("a11y.selectWorkingDir")}
    >
      <FolderCog size={13} className="shrink-0" />
      <span className="truncate">{displayDir}</span>
    </button>
  );
}