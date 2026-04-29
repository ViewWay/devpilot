import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { useTabStore, SETTINGS_TAB_ID, SCHEDULED_TAB_ID, SKILLS_TAB_ID, GALLERY_TAB_ID, BRIDGE_TAB_ID, REMOTE_TAB_ID } from "../../stores/tabStore";
import { Package, ImageIcon, Radio, Smartphone, ChevronDown, Upload, FolderOpen } from "lucide-react";
import { SESSION_TEMPLATES } from "../../lib/sessionTemplates";
import type { SessionTemplate } from "../../lib/sessionTemplates";
import { isTauriRuntime } from "../../lib/ipc";

type TimeGroup = "today" | "yesterday" | "last7days" | "last30days" | "older";

const TIME_GROUP_ORDER: TimeGroup[] = ["today", "yesterday", "last7days", "last30days", "older"];

export function Sidebar() {
  const { t } = useI18n();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const createSession = useChatStore((s) => s.createSession);
  const importSessions = useChatStore((s) => s.importSessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setSessionWorkingDir = useChatStore((s) => s.setSessionWorkingDir);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const workingDir = useUIStore((s) => s.workingDir);
  const setWorkingDir = useUIStore((s) => s.setWorkingDir);
  const openTab = useTabStore((s) => s.openTab);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) { return; }
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [contextMenu]);

  // Close template menu on outside click
  useEffect(() => {
    if (!templateMenuOpen) { return; }
    const close = (e: MouseEvent) => {
      if (templateMenuRef.current && !templateMenuRef.current.contains(e.target as Node)) {
        setTemplateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [templateMenuOpen]);

  // Close template menu when sidebar closes
  useEffect(() => {
    if (!templateMenuOpen || sidebarOpen) { return; }
    setTemplateMenuOpen(false);
  }, [templateMenuOpen, sidebarOpen]);

  // Close context menu when sidebar closes
  useEffect(() => {
    if (!contextMenu || sidebarOpen) { return; }
    setContextMenu(null);
  }, [contextMenu, sidebarOpen]);

  const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    setContextMenu({ id, x: e.clientX, y: e.clientY });
  }, []);

  const timeGroupLabels: Record<TimeGroup, string> = {
    today: t("today"),
    yesterday: t("yesterday"),
    last7days: t("previous7Days"),
    last30days: t("previous30Days"),
    older: t("older"),
  };

  return (
    <aside
      className="sidebar-panel relative h-full flex flex-col bg-[var(--color-surface-sidebar)] border-r border-[var(--color-border)] select-none"
      data-state={sidebarOpen ? "open" : "closed"}
      aria-label="Sidebar"
    >
      {/* Header — logo + collapse toggle */}
      <div className="px-3 pb-2 pt-3">
        <div className={`flex ${sidebarOpen ? "items-center justify-between gap-3" : "flex-col items-center gap-2"}`}>
          <div className={`flex min-w-0 items-center ${sidebarOpen ? "gap-2.5" : "justify-center"}`}>
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0 bg-[var(--color-brand)] text-white text-xs font-bold"
            >
              DP
            </span>
            <span
              className={`sidebar-copy ${sidebarOpen ? "sidebar-copy--visible" : "sidebar-copy--hidden"} text-[13px] font-semibold tracking-tight text-[var(--color-text-primary)]`}
              style={{ fontFamily: "var(--font-headline)" }}
            >
              DevPilot
            </span>
          </div>
          <div className={`flex items-center ${sidebarOpen ? "gap-1.5" : "flex-col gap-2"}`}>
            <button
              type="button"
              onClick={toggleSidebar}
              data-testid={sidebarOpen ? "sidebar-collapse-button" : "sidebar-expand-button"}
              className={`sidebar-toggle-button ${sidebarOpen ? "sidebar-toggle-button--open h-8 w-8" : "sidebar-toggle-button--collapsed h-8 w-8"} flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]`}
              aria-label={sidebarOpen ? t("a11y.collapseSidebar") : t("a11y.expandSidebar")}
              title={sidebarOpen ? t("a11y.collapseSidebar") : t("a11y.expandSidebar")}
            >
              <SidebarToggleIcon collapsed={!sidebarOpen} />
            </button>
          </div>
        </div>
      </div>

      {/* New Session + Scheduled buttons */}
      <div className={`px-3 pb-3 flex flex-col ${sidebarOpen ? "gap-0.5" : "items-center gap-2"}`}>
        {/* New Chat with template dropdown */}
        <div ref={templateMenuRef} className="relative">
          <div className="flex">
            <button
              onClick={() => {
                const id = createSession(selectedModel.name, selectedModel.provider);
                openTab(id, t("newChat"), "session");
              }}
              aria-label={t("newChat")}
              title={!sidebarOpen ? t("newChat") : undefined}
              className={`
                flex items-center rounded-[var(--radius-md)] transition-all duration-200
                ${!sidebarOpen ? "h-10 w-10 justify-center px-0 py-0" : "gap-2.5 px-3 py-2 text-sm"}
                text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]
              `}
            >
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
                <PlusIcon />
              </span>
              <span className={`sidebar-copy ${!sidebarOpen ? "sidebar-copy--hidden" : "sidebar-copy--visible"}`}>
                {t("newChat")}
              </span>
            </button>
            {sidebarOpen && (
              <button
                onClick={() => setTemplateMenuOpen((v) => !v)}
                aria-label={t("templatePicker")}
                className={`
                  flex items-center justify-center rounded-[var(--radius-md)] transition-all duration-200
                  px-1.5 py-2 text-sm
                  ${templateMenuOpen
                    ? "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]"
                  }
                `}
              >
                <ChevronDown size={14} className={`transition-transform duration-150 ${templateMenuOpen ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>

          {/* Template dropdown menu */}
          {templateMenuOpen && sidebarOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg overflow-hidden"
              role="menu"
              aria-label={t("templatePicker")}
            >
              <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)] border-b border-[var(--color-border)]/40">
                {t("templatePicker")}
              </div>
              <div className="max-h-[320px] overflow-y-auto py-1">
                {SESSION_TEMPLATES.map((tmpl) => (
                  <TemplateMenuItem
                    key={tmpl.id}
                    template={tmpl}
                    t={t}
                    onSelect={() => {
                      setTemplateMenuOpen(false);
                      const id = createSession(selectedModel.name, selectedModel.provider);
                      openTab(id, t(tmpl.nameKey), "session");
                      // Set the system prompt from the template
                      if (tmpl.systemPrompt) {
                        useSettingsStore.getState().setSystemPrompt(tmpl.systemPrompt);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Import sessions button */}
        {sidebarOpen && (
          <button
            onClick={async () => {
              setImportStatus(null);
              const result = await importSessions();
              if (result) {
                setImportStatus(t("sessionsImportedBadge"));
                setTimeout(() => setImportStatus(null), 3000);
              }
            }}
            className={`
              flex items-center rounded-[var(--radius-md)] transition-all duration-200
              gap-2 px-3 py-1.5 text-xs w-full
              text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-secondary)]
            `}
          >
            <Upload size={13} />
            <span>{t("importSessions")}</span>
            {importStatus && (
              <span className="ml-auto text-[10px] text-[var(--color-brand)]">{importStatus}</span>
            )}
          </button>
        )}
        {/* Open Project Folder */}
        <NavItem
          active={false}
          collapsed={!sidebarOpen}
          label={t("openProject")}
          onClick={async () => {
            try {
              if (isTauriRuntime()) {
                const { open } = await import("@tauri-apps/plugin-dialog");
                const selected = await open({ directory: true, multiple: false, title: "Open Project Folder" });
                if (selected && typeof selected === "string") {
                  setWorkingDir(selected);
                  if (activeSessionId) {
                    setSessionWorkingDir(activeSessionId, selected);
                  }
                  // Open files panel to show project contents
                  useUIStore.getState().setRightPanel("files");
                }
              } else {
                const path = window.prompt("Enter project directory path:", workingDir || "~"); // eslint-disable-line no-alert
                if (path) {
                  setWorkingDir(path.trim());
                  if (activeSessionId) {
                    setSessionWorkingDir(activeSessionId, path.trim());
                  }
                  useUIStore.getState().setRightPanel("files");
                }
              }
            } catch { /* user cancelled */ }
          }}
          icon={<FolderOpen size={18} />}
        >
          {workingDir ? workingDir.split("/").slice(-2).join("/") : t("openProject")}
        </NavItem>
        <NavItem
          active={activeTabId === SCHEDULED_TAB_ID}
          collapsed={!sidebarOpen}
          label={t("scheduler")}
          onClick={() => openTab(SCHEDULED_TAB_ID, t("scheduler"), "scheduled")}
          icon={<ClockIcon />}
        >
          {t("scheduler")}
        </NavItem>
        <NavItem
          active={activeTabId === SKILLS_TAB_ID}
          collapsed={!sidebarOpen}
          label={t("skills")}
          onClick={() => openTab(SKILLS_TAB_ID, t("skills"), "skills")}
          icon={<Package size={18} />}
        >
          {t("skills")}
        </NavItem>
        <NavItem
          active={activeTabId === GALLERY_TAB_ID}
          collapsed={!sidebarOpen}
          label={t("gallery")}
          onClick={() => openTab(GALLERY_TAB_ID, t("gallery"), "gallery")}
          icon={<ImageIcon size={18} />}
        >
          {t("gallery")}
        </NavItem>
        <NavItem
          active={activeTabId === BRIDGE_TAB_ID}
          collapsed={!sidebarOpen}
          label={t("bridge")}
          onClick={() => openTab(BRIDGE_TAB_ID, t("bridge"), "bridge")}
          icon={<Radio size={18} />}
        >
          {t("bridge")}
        </NavItem>
        <NavItem
          active={activeTabId === REMOTE_TAB_ID}
          collapsed={!sidebarOpen}
          label={t("remote")}
          onClick={() => openTab(REMOTE_TAB_ID, t("remote"), "remote")}
          icon={<Smartphone size={18} />}
        >
          {t("remote")}
        </NavItem>
      </div>

      {/* Search + Session list — only when open */}
      {sidebarOpen ? (
        <>
          <div className="sidebar-section sidebar-section--visible flex-none px-3 pb-2">
            <input
              id="sidebar-search"
              type="text"
              placeholder={t("searchChats")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] outline-none transition-colors focus:border-[var(--color-border-focus)]"
            />
          </div>

          <div className="sidebar-section sidebar-section--visible flex-1 min-h-0">
            <div className="flex-1 overflow-y-auto px-3">
              <SidebarSessionList
                searchQuery={searchQuery}
                activeTabId={activeTabId}
                onContextMenu={handleContextMenu}
                timeGroupLabels={timeGroupLabels}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1" aria-hidden="true" />
      )}

      {/* Bottom — Settings */}
      <div className={`border-t border-[var(--color-border)] p-3 ${sidebarOpen ? "" : "flex justify-center"}`}>
        <NavItem
          active={activeTabId === SETTINGS_TAB_ID}
          collapsed={!sidebarOpen}
          label={t("settings")}
          onClick={() => openTab(SETTINGS_TAB_ID, t("settings"), "settings")}
          icon={<span className="material-symbols-outlined text-[18px]">settings</span>}
        >
          {t("settings")}
        </NavItem>
      </div>

      {/* Context menu */}
      {contextMenu && sidebarOpen && (
        <SidebarContextMenu
          sessionId={contextMenu.id}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </aside>
  );
}

/* ─── Session list ─────────────────────────────────────────── */

function SidebarSessionList({
  searchQuery,
  activeTabId,
  onContextMenu,
  timeGroupLabels,
}: {
  searchQuery: string;
  activeTabId: string | null;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  timeGroupLabels: Record<TimeGroup, string>;
}) {
  const { t } = useI18n();
  const sessions = useChatStore((s) => s.sessions);
  const searchSessions = useChatStore((s) => s.searchSessions);
  const openTab = useTabStore((s) => s.openTab);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const reorderSessions = useChatStore((s) => s.reorderSessions);

  // Drag-and-drop state (flat index across all groups)
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = searchQuery ? searchSessions(searchQuery) : sessions;
    result = result.filter((s) => !s.archived);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((s) => s.title.toLowerCase().includes(q));
    }
    return result;
  }, [sessions, searchQuery, searchSessions]);

  const timeGroups = useMemo(() => groupByTime(filtered), [filtered]);

  // Build a flat ordered list of session IDs for reordering
  const flatSessionIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of TIME_GROUP_ORDER) {
      const items = timeGroups.get(group);
      if (items) {
        for (const item of items) {
          ids.push(item.id);
        }
      }
    }
    return ids;
  }, [timeGroups]);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetId(targetId);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedId && draggedId !== targetId) {
      const fromIndex = flatSessionIds.indexOf(draggedId);
      const toIndex = flatSessionIds.indexOf(targetId);
      if (fromIndex !== -1 && toIndex !== -1) {
        // Find the actual session index in the full sessions array
        const allSessions = sessions;
        const fromSessionIndex = allSessions.findIndex((s) => s.id === draggedId);
        const toSessionIndex = allSessions.findIndex((s) => s.id === targetId);
        if (fromSessionIndex !== -1 && toSessionIndex !== -1) {
          reorderSessions(draggedId, toSessionIndex);
        }
      }
    }
    setDraggedId(null);
    setDropTargetId(null);
  }, [draggedId, flatSessionIds, sessions, reorderSessions]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
  }, []);

  if (filtered.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-xs text-[var(--color-text-tertiary)]">
        {searchQuery ? t("noMatching") : t("noSessions")}
      </div>
    );
  }

  return (
    <>
      {TIME_GROUP_ORDER.map((group) => {
        const items = timeGroups.get(group);
        if (!items || items.length === 0) { return null; }
        return (
          <div key={group} className="mb-1">
            <div className="px-2 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-[var(--color-text-tertiary)]">
              {timeGroupLabels[group]}
            </div>
            {items.map((session) => (
              <SidebarSessionItem
                key={session.id}
                id={session.id}
                title={session.title}
                updatedAt={session.updatedAt}
                isActive={session.id === activeTabId}
                isDragged={draggedId === session.id}
                isDropTarget={dropTargetId === session.id}
                onClick={() => {
                  setActiveSession(session.id);
                  openTab(session.id, session.title, "session");
                }}
                onContextMenu={(e) => onContextMenu(e, session.id)}
                onDragStart={() => setDraggedId(session.id)}
                onDragOver={(e) => handleDragOver(e, session.id)}
                onDrop={(e) => handleDrop(e, session.id)}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

/* ─── Single session item ──────────────────────────────────── */

function SidebarSessionItem({
  id,
  title,
  updatedAt,
  isActive,
  isDragged,
  isDropTarget,
  onClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  id: string;
  title: string;
  updatedAt: string;
  isActive: boolean;
  isDragged: boolean;
  isDropTarget: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const updateSessionTitle = useChatStore((s) => s.updateSessionTitle);
  const dragNodeRef = useRef<HTMLDivElement>(null);

  const handleFinishRename = useCallback(() => {
    if (renameValue.trim()) {
      updateSessionTitle(id, renameValue.trim());
    }
    setRenaming(false);
    setRenameValue("");
  }, [id, renameValue, updateSessionTitle]);

  if (renaming) {
    return (
      <input
        autoFocus
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onBlur={handleFinishRename}
        onKeyDown={(e) => {
          if (e.key === "Enter") { handleFinishRename(); }
          if (e.key === "Escape") { setRenaming(false); setRenameValue(""); }
        }}
        className="ml-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border-focus)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none"
      />
    );
  }

  return (
    <div
      ref={dragNodeRef}
      draggable
      onDragStart={(e) => {
        // Set drag image to the element itself
        if (dragNodeRef.current) {
          e.dataTransfer.setDragImage(dragNodeRef.current, 0, 0);
        }
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`
        rounded-[var(--radius-md)] transition-all duration-150
        ${isDropTarget ? "ring-1 ring-[var(--color-brand)] ring-offset-1 ring-offset-[var(--color-surface-sidebar)]" : ""}
        ${isDragged ? "opacity-40" : ""}
      `}
    >
      <button
        onClick={onClick}
        onContextMenu={onContextMenu}
        className={`
          group w-full rounded-[var(--radius-md)] py-1.5 pl-4 pr-3 text-left text-sm transition-colors duration-200 cursor-grab active:cursor-grabbing
          ${isActive
            ? "bg-[var(--color-surface-selected)] text-[var(--color-text-primary)]"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          }
        `}
      >
        <span className="flex items-center gap-2">
          <span
            className="h-1 w-1 flex-shrink-0 rounded-full"
            style={{
              backgroundColor: isActive ? "var(--color-brand)" : "var(--color-text-tertiary)",
              opacity: isActive ? 1 : 0.5,
            }}
          />
          <span className="flex-1 truncate">{title || "Untitled"}</span>
          <span className="flex-shrink-0 text-[10px] text-[var(--color-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">
            {formatRelativeTime(updatedAt)}
          </span>
        </span>
      </button>
    </div>
  );
}

/* ─── Template menu item ───────────────────────────────────── */

function TemplateMenuItem({
  template,
  t,
  onSelect,
}: {
  template: SessionTemplate;
  t: (key: string) => string;
  onSelect: () => void;
}) {
  return (
    <button
      role="menuitem"
      onClick={onSelect}
      className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors duration-150 hover:bg-[var(--color-surface-hover)]"
    >
      <span className="flex-shrink-0 text-base leading-5 mt-0.5">{template.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-[var(--color-text-primary)] truncate">
          {t(template.nameKey)}
        </div>
        {template.descKey && (
          <div className="mt-0.5 text-[11px] text-[var(--color-text-tertiary)] leading-tight line-clamp-2">
            {t(template.descKey)}
          </div>
        )}
      </div>
    </button>
  );
}

/* ─── Context menu ─────────────────────────────────────────── */

function SidebarContextMenu({
  sessionId,
  x,
  y,
  onClose,
}: {
  sessionId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const deleteSession = useChatStore((s) => s.deleteSession);
  const updateSessionTitle = useChatStore((s) => s.updateSessionTitle);
  const archiveSession = useChatStore((s) => s.archiveSession);
  const exportSession = useChatStore((s) => s.exportSession);
  const closeTab = useTabStore((s) => s.closeTab);
  const sessions = useChatStore((s) => s.sessions);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  if (renaming) {
    return (
      <div
        className="fixed z-50 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2"
        style={{ left: x, top: y, boxShadow: "var(--shadow-dropdown)" }}
      >
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => {
            if (renameValue.trim()) {
              updateSessionTitle(sessionId, renameValue.trim());
            }
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (renameValue.trim()) {
                updateSessionTitle(sessionId, renameValue.trim());
              }
              onClose();
            }
            if (e.key === "Escape") { onClose(); }
          }}
          className="w-48 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs text-[var(--color-text-primary)] outline-none"
        />
      </div>
    );
  }

  return (
    <div
      className="fixed z-50 min-w-[140px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] py-1"
      style={{ left: x, top: y, boxShadow: "var(--shadow-dropdown)" }}
    >
      <button
        onClick={() => {
          const session = sessions.find((s) => s.id === sessionId);
          setRenaming(true);
          setRenameValue(session?.title || "");
        }}
        className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        {t("rename")}
      </button>
      <button
        onClick={() => {
          archiveSession(sessionId);
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        {t("archive")}
      </button>

      {/* Export sub-items */}
      <div className="my-1 border-t border-[var(--color-border)]" />
      <button
        onClick={() => {
          exportSession(sessionId, "markdown");
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        {t("exportMarkdown")}
      </button>
      <button
        onClick={() => {
          exportSession(sessionId, "json");
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        {t("exportJson")}
      </button>
      <div className="my-1 border-t border-[var(--color-border)]" />

      <button
        onClick={() => {
          deleteSession(sessionId);
          closeTab(sessionId);
          onClose();
        }}
        className="w-full px-3 py-1.5 text-left text-xs text-[var(--color-error)] transition-colors hover:bg-[var(--color-surface-hover)]"
      >
        {t("delete")}
      </button>
    </div>
  );
}

/* ─── Shared components ────────────────────────────────────── */

function NavItem({
  active,
  collapsed,
  label,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  collapsed: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={collapsed ? label : undefined}
      className={`
        flex items-center rounded-[var(--radius-md)] transition-all duration-200
        ${collapsed ? "h-10 w-10 justify-center px-0 py-0" : "w-full gap-2.5 px-3 py-2 text-sm"}
        ${active
          ? "bg-[var(--color-surface-selected)] font-medium text-[var(--color-text-primary)] shadow-[0_8px_24px_rgba(15,23,42,0.08)]"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
        }
      `}
    >
      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className={`sidebar-copy ${collapsed ? "sidebar-copy--hidden" : "sidebar-copy--visible"}`}>
        {children}
      </span>
    </button>
  );
}

/* ─── Icons ────────────────────────────────────────────────── */

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function SidebarToggleIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width={collapsed ? 16 : 14}
      height={collapsed ? 16 : 14}
      viewBox="0 0 14 14"
      fill="none"
      className={`sidebar-toggle-icon ${collapsed ? "sidebar-toggle-icon--collapsed" : "sidebar-toggle-icon--open"}`}
      aria-hidden="true"
    >
      <path
        d={collapsed ? "M5 3 9 7l-4 4" : "M9 3 5 7l4 4"}
        className="sidebar-toggle-chevron"
      />
    </svg>
  );
}

/* ─── Utilities ────────────────────────────────────────────── */

function groupByTime(sessions: Array<{ id: string; title: string; updatedAt: string }>): Map<TimeGroup, Array<{ id: string; title: string; updatedAt: string }>> {
  const groups = new Map<TimeGroup, Array<{ id: string; title: string; updatedAt: string }>>();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const sevenDaysAgo = startOfToday - 7 * 86400000;
  const thirtyDaysAgo = startOfToday - 30 * 86400000;

  for (const session of sessions) {
    const ts = new Date(session.updatedAt).getTime();
    let group: TimeGroup;
    if (ts >= startOfToday) { group = "today"; }
    else if (ts >= startOfYesterday) { group = "yesterday"; }
    else if (ts >= sevenDaysAgo) { group = "last7days"; }
    else if (ts >= thirtyDaysAgo) { group = "last30days"; }
    else { group = "older"; }

    if (!groups.has(group)) { groups.set(group, []); }
    groups.get(group)!.push(session);
  }

  return groups;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) { return "now"; }
  if (min < 60) { return `${min}m`; }
  const hr = Math.floor(min / 60);
  if (hr < 24) { return `${hr}h`; }
  const day = Math.floor(hr / 24);
  if (day < 30) { return `${day}d`; }
  return `${Math.floor(day / 30)}mo`;
}
