import { useThemeCycle, resolveTheme } from "../../hooks/useTheme";
import { useI18n } from "../../i18n";
import { useUIStore } from "../../stores/uiStore";
import { useChatStore } from "../../stores/chatStore";
import { useNavigate, useLocation } from "react-router-dom";
import { Sun, Moon, Monitor, PanelLeftClose, PanelLeft, Settings, FolderCog, Columns2, FolderOpen, Terminal, Eye, Pencil } from "lucide-react";
import { useCallback } from "react";
import { cn } from "../../lib/utils";
import { isTauriRuntime } from "../../lib/ipc";

/**
 * TopBar — inspired by CodePilot's UnifiedTopBar.
 *
 * Slim h-12 bar with:
 *   Left:   sidebar toggle, session title, working dir
 *   Right:  panel toggles, locale, settings, theme
 *
 * Model selector and mode tabs are moved to the MessageInput action bar
 * (CodePilot pattern).
 */
export function TopBar() {
  const { locale, setLocale, t } = useI18n();
  const { theme, cycleTheme } = useThemeCycle();
  const resolvedTheme = resolveTheme(theme);
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const splitViewActive = useUIStore((s) => s.splitViewActive);
  const toggleSplitView = useUIStore((s) => s.toggleSplitView);
  const activeSession = useChatStore((s) => s.activeSession());

  const isChat = location.pathname !== "/settings";

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 bg-background px-3"
      role="toolbar"
      aria-label={t("a11y.topBarToolbar")}
      data-tauri-drag-region
    >
      {/* Left section */}
      <div className="flex min-w-0 shrink items-center gap-1.5" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button
          onClick={toggleSidebar}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label={t("a11y.sidebarToggle")}
          aria-pressed={sidebarOpen}
        >
          {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeft size={15} />}
        </button>

        {/* Session title */}
        {isChat && activeSession && (
          <>
            <h2 className="max-w-[200px] truncate text-sm font-medium text-foreground/80">
              {activeSession.title || t("newChat")}
            </h2>
            <span className="text-xs text-muted-foreground/60">/</span>
          </>
        )}

        {/* Working directory */}
        {isChat && (
          <div className="hidden lg:block">
            <WorkingDirSelector />
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right section */}
      <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {/* Panel toggles — only on chat page */}
        {isChat && (
          <>
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
            <button
              onClick={() => toggleRightPanel("editor")}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent",
                rightPanel === "editor"
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              title="Editor"
              aria-label={t("a11y.toggleEditor")}
              aria-pressed={rightPanel === "editor"}
            >
              <Pencil size={14} />
            </button>
            <div className="mx-1 h-4 w-px bg-border/40" />
          </>
        )}

        <button
          onClick={() => setLocale(locale === "en" ? "zh" : "en")}
          className="flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setSessionWorkingDir = useChatStore((s) => s.setSessionWorkingDir);

  const handlePickFolder = useCallback(async () => {
    if (!isTauriRuntime()) {
      const path = window.prompt("Enter working directory path:", workingDir || "~"); // eslint-disable-line no-alert
      if (path) {
        setWorkingDir(path.trim());
        if (activeSessionId) {
          setSessionWorkingDir(activeSessionId, path.trim());
        }
      }
      return;
    }

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Select Working Directory" });
      if (selected && typeof selected === "string") {
        setWorkingDir(selected);
        if (activeSessionId) {
          setSessionWorkingDir(activeSessionId, selected);
        }
      }
    } catch {
      // User cancelled or dialog not available
    }
  }, [workingDir, setWorkingDir, activeSessionId, setSessionWorkingDir]);

  const displayDir = workingDir
    ? workingDir.split("/").slice(-2).join("/")
    : t("noDirSelected");

  return (
    <button
      onClick={handlePickFolder}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors max-w-[180px]",
        workingDir
          ? "text-foreground/80 hover:bg-accent"
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
