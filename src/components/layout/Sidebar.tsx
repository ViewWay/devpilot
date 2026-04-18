import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useI18n } from "../../i18n";
import { useChatStore, relativeTime } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { cn } from "../../lib/utils";
import {
  Plus,
  Search,
  Settings,
  Image,
  Clock,
  MoreHorizontal,
  Trash2,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Pencil,
  Archive,
} from "lucide-react";

export function Sidebar() {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const collapsed = useUIStore((s) => !s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const createSession = useChatStore((s) => s.createSession);
  const selectedModel = useUIStore((s) => s.selectedModel);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  const isDragging = useRef(false);

  // Drag to resize
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !sidebarRef.current) return;
      const newWidth = Math.max(200, Math.min(400, ev.clientX));
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, []);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center border-r border-border bg-sidebar py-3 px-1.5 gap-2">
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t("recentChats")}
        >
          <PanelLeft size={16} />
        </button>
        <button
          onClick={() => createSession(selectedModel.name, selectedModel.provider)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t("newChat")}
        >
          <Plus size={16} />
        </button>
        <div className="mt-auto flex flex-col gap-1">
          <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("gallery")}>
            <Image size={16} />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("settings")}>
            <Settings size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={sidebarRef}
      className="relative flex h-full flex-col border-r border-border bg-sidebar transition-all duration-200 ease-in-out"
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <h1 className="text-sm font-semibold text-foreground tracking-tight">DevPilot</h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => createSession(selectedModel.name, selectedModel.provider)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t("newChat")}
          >
            <Plus size={15} />
          </button>
          <button
            onClick={toggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t("scToggleSidebar")}
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchChats")}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      {/* Session list */}
      <SessionList searchQuery={searchQuery} />

      {/* Bottom actions */}
      <div className="mt-auto flex items-center border-t border-border px-3 py-2 gap-1">
        <button className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Clock size={13} />
          <span>{t("scheduler")}</span>
        </button>
        <button className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Image size={13} />
          <span>{t("gallery")}</span>
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("settings")}>
          <Settings size={13} />
        </button>
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors"
      />
    </div>
  );
}

function SessionList({ searchQuery }: { searchQuery: string }) {
  const { t } = useI18n();
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const updateSessionTitle = useChatStore((s) => s.updateSessionTitle);
  const archiveSession = useChatStore((s) => s.archiveSession);
  const searchSessions = useChatStore((s) => s.searchSessions);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpenId]);

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  const handleRename = (id: string) => {
    if (renameValue.trim()) {
      updateSessionTitle(id, renameValue.trim());
    }
    setRenamingId(null);
  };

  const filtered = (searchQuery ? searchSessions(searchQuery) : sessions).filter((s) => !s.archived);

  // Group by time period
  const groups = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 86400_000);
    const weekStart = new Date(todayStart.getTime() - 7 * 86400_000);

    const groups: { label: string; sessions: typeof filtered }[] = [
      { label: t("today"), sessions: [] },
      { label: t("yesterday"), sessions: [] },
      { label: t("previous7Days"), sessions: [] },
      { label: t("older"), sessions: [] },
    ];

    for (const session of filtered) {
      const date = new Date(session.updatedAt);
      if (date >= todayStart) {
        groups[0]!.sessions.push(session);
      } else if (date >= yesterdayStart) {
        groups[1]!.sessions.push(session);
      } else if (date >= weekStart) {
        groups[2]!.sessions.push(session);
      } else {
        groups[3]!.sessions.push(session);
      }
    }

    return groups.filter((g) => g.sessions.length > 0);
  }, [filtered]);

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1">
      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <MessageSquare size={24} className="mb-2 opacity-40" />
          <span className="text-xs">{t("noSessions")}</span>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className="mb-2">
            <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </div>
            {group.sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <div
                  key={session.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  onClick={() => setActiveSession(session.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuOpenId(menuOpenId === session.id ? null : session.id);
                  }}
                >
                  <MessageSquare size={13} className="shrink-0 opacity-60" />
                  <div className="min-w-0 flex-1">
                    {renamingId === session.id ? (
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => handleRename(session.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(session.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded bg-background px-1 py-0 text-xs outline-none ring-1 ring-primary"
                      />
                    ) : (
                      <div className="truncate text-xs font-medium">{session.title}</div>
                    )}
                    <div className="text-[10px] opacity-60">{relativeTime(session.updatedAt)}</div>
                  </div>
                  <div className="relative" ref={menuOpenId === session.id ? menuRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === session.id ? null : session.id);
                      }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
                    >
                      <MoreHorizontal size={12} />
                    </button>
                    {menuOpenId === session.id && (
                      <div className="absolute right-0 top-6 z-50 w-40 rounded-lg border border-border bg-popover p-1 shadow-lg">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenamingId(session.id);
                            setRenameValue(session.title);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                        >
                          <Pencil size={12} /> {t("rename")}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            archiveSession(session.id);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors hover:bg-accent"
                        >
                          <Archive size={12} /> {t("archive")}
                        </button>
                        <div className="my-1 h-px bg-border" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(session.id);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-destructive transition-colors hover:bg-destructive/10"
                        >
                          <Trash2 size={12} /> {t("delete")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}
