import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useUIStore } from "../stores/uiStore";
import { useChatStore } from "../stores/chatStore";
import { useI18n } from "../i18n";
import {
  MessageSquarePlus, Settings, Sun, Moon, Monitor,
  PanelLeft, FolderOpen, Terminal, Eye,
  ArrowRight, Hash, Command, Search,
} from "lucide-react";
import { cn } from "../lib/utils";

interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  category: "command" | "session" | "file";
  action: () => void;
  shortcut?: string;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const toggleMessageSearch = useUIStore((s) => s.toggleMessageSearch);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const createSession = useChatStore((s) => s.createSession);
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const themeNext = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const themeLabel = theme === "system" ? t("themeSystem") : theme === "dark" ? t("themeDark") : t("themeLight");
  const themeIcon = useMemo(() =>
    theme === "system" ? <Monitor size={16} /> : theme === "dark" ? <Moon size={16} /> : <Sun size={16} />,
    [theme]
  );

  const isMac = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
  const mod = isMac ? "⌘" : "Ctrl";

  const commands: PaletteItem[] = useMemo(() => [
    {
      id: "new-chat",
      label: t("commandPaletteNewChat"),
      description: t("commandPaletteNewChatDesc"),
      icon: <MessageSquarePlus size={16} />,
      category: "command",
      action: () => { createSession(selectedModel.id, selectedModel.provider); setOpen(false); },
      shortcut: `${mod} N`,
    },
    {
      id: "toggle-sidebar",
      label: t("commandPaletteToggleSidebar"),
      icon: <PanelLeft size={16} />,
      category: "command",
      action: () => { toggleSidebar(); setOpen(false); },
      shortcut: `${mod} B`,
    },
    {
      id: "toggle-files",
      label: t("commandPaletteToggleFiles"),
      icon: <FolderOpen size={16} />,
      category: "command",
      action: () => { toggleRightPanel("files"); setOpen(false); },
      shortcut: `${mod} E`,
    },
    {
      id: "toggle-terminal",
      label: t("commandPaletteToggleTerminal"),
      icon: <Terminal size={16} />,
      category: "command",
      action: () => { toggleRightPanel("terminal"); setOpen(false); },
      shortcut: `${mod} J`,
    },
    {
      id: "toggle-preview",
      label: t("commandPaletteTogglePreview"),
      icon: <Eye size={16} />,
      category: "command",
      action: () => { toggleRightPanel("preview"); setOpen(false); },
    },
    {
      id: "switch-theme",
      label: t("commandPaletteSwitchTheme"),
      description: `${themeLabel} → ${themeNext === "system" ? t("themeSystem") : themeNext === "dark" ? t("themeDark") : t("themeLight")}`,
      icon: themeIcon,
      category: "command",
      action: () => { setTheme(themeNext); setOpen(false); },
    },
    {
      id: "open-settings",
      label: t("settings"),
      description: t("commandPaletteOpenSettingsDesc"),
      icon: <Settings size={16} />,
      category: "command",
      action: () => { setActiveView("settings"); setOpen(false); },
    },
    {
      id: "search-messages",
      label: t("messageSearchTitle"),
      description: t("messageSearchDesc"),
      icon: <Search size={16} />,
      category: "command",
      action: () => { setOpen(false); toggleMessageSearch(); },
      shortcut: `${mod} ⇧ F`,
    },
  ], [t, selectedModel, themeLabel, themeNext, themeIcon, mod,
    createSession, toggleSidebar, toggleRightPanel, setTheme, setActiveView, setOpen,
    toggleMessageSearch]);

  const sessionItems: PaletteItem[] = useMemo(() =>
    sessions
      .filter((s) => s.id !== activeSessionId)
      .slice(0, 5)
      .map((s) => ({
        id: `session-${s.id}`,
        label: s.title || t("newChat"),
        description: s.messages?.length ? `${s.messages.length} ${t("messages")}` : "",
        icon: <Hash size={16} />,
        category: "session" as const,
        action: () => { setActiveSession(s.id); setOpen(false); },
      })),
    [sessions, activeSessionId, t, setActiveSession, setOpen]);

  const allItems = useMemo(() => [...commands, ...sessionItems], [commands, sessionItems]);

  const filtered = useMemo(() => {
    if (!query.trim()) {return allItems;}
    const q = query.toLowerCase();
    return allItems.filter((item) => item.label.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q));
  }, [allItems, query]);

  // Reset selected index when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    }
  }, [filtered, selectedIndex]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) {return null;}

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Command size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("commandPalettePlaceholder")}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("commandPaletteNoResults")}
            </div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              onClick={item.action}
              onMouseEnter={() => setSelectedIndex(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                i === selectedIndex ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50",
              )}
            >
              <span className={cn("shrink-0", i === selectedIndex ? "text-primary" : "text-muted-foreground")}>
                {item.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{item.label}</div>
                {item.description && (
                  <div className="truncate text-[11px] text-muted-foreground">{item.description}</div>
                )}
              </div>
              {item.shortcut && (
                <kbd className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {item.shortcut}
                </kbd>
              )}
              {i === selectedIndex && (
                <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">↵</kbd> select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
