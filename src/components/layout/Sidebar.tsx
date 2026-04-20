import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../i18n";
import { useChatStore, relativeTime } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";
import { cn } from "../../lib/utils";
import type { MessageSearchResult } from "../../types";
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
  Download,
  Radio,
  X,
  Loader2,
  FileText,
} from "lucide-react";

export function Sidebar() {
  const { t } = useI18n();
  const navigate = useNavigate();
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
      if (!isDragging.current || !sidebarRef.current) {return;}
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
      <nav
        className="flex h-full flex-col items-center border-r border-border/40 bg-sidebar/80 backdrop-blur-sm py-3 px-1.5 gap-2"
        aria-label={t("a11y.sidebarNav")}
      >
        <button
          onClick={toggleSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t("recentChats")}
          aria-label={t("a11y.expandSidebar")}
        >
          <PanelLeft size={16} />
        </button>
        <button
          onClick={() => createSession(selectedModel.name, selectedModel.provider)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={t("newChat")}
          aria-label={t("a11y.newSession")}
        >
          <Plus size={16} />
        </button>
        <div className="mt-auto flex flex-col gap-1">
          <button onClick={() => navigate("/gallery")} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("gallery")} aria-label={t("gallery")}>
            <Image size={16} />
          </button>
          <button onClick={() => navigate("/bridge")} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("bridge")} aria-label={t("bridge")}>
            <Radio size={16} />
          </button>
          <button onClick={() => navigate("/settings")} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("settings")} aria-label={t("settings")}>
            <Settings size={16} />
          </button>
        </div>
      </nav>
    );
  }

  return (
    <nav
      ref={sidebarRef}
      className="relative flex h-full flex-col border-r border-border/40 bg-sidebar/80 backdrop-blur-sm transition-all duration-200 ease-in-out animate-in slide-in-from-left md:animate-none"
      style={{ width: `${width}px` }}
      aria-label={t("a11y.sidebarNav")}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <h1 className="text-sm font-semibold text-foreground tracking-tight">DevPilot</h1>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => createSession(selectedModel.name, selectedModel.provider)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t("newChat")}
            aria-label={t("a11y.newSession")}
          >
            <Plus size={15} />
          </button>
          <button
            onClick={toggleSidebar}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={t("scToggleSidebar")}
            aria-label={t("a11y.collapseSidebar")}
          >
            <PanelLeftClose size={15} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-1.5">
          <Search size={13} className="shrink-0 text-muted-foreground" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchChats")}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            aria-label={t("a11y.searchChatsLabel")}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Session list / Search results */}
      {searchQuery.length >= 3 ? (
        <MessageSearchResults
          query={searchQuery}
          onSelectSession={(id: string) => {
            // Navigate to the session
            const { splitViewActive, secondarySessionId, setSecondarySession } = useUIStore.getState();
            const activeId = useChatStore.getState().activeSessionId;
            const setActive = useChatStore.getState().setActiveSession;
            if (splitViewActive) {
              if (id !== activeId && id !== secondarySessionId) {
                setSecondarySession(id);
              } else if (id === secondarySessionId) {
                setActive(id);
                if (secondarySessionId && activeId) {
                  setSecondarySession(activeId);
                }
              }
            } else {
              setActive(id);
            }
            if (window.innerWidth < 768) {
              useUIStore.getState().setSidebarOpen(false);
            }
            setSearchQuery("");
          }}
        />
      ) : (
        <SessionList searchQuery={searchQuery} />
      )}

      {/* Bottom actions */}
      <div className="mt-auto flex items-center border-t border-border/40 px-3 py-2 gap-1">
        <button onClick={() => navigate("/scheduler")} className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Clock size={13} />
          <span>{t("scheduler")}</span>
        </button>
        <button onClick={() => navigate("/gallery")} className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Image size={13} />
          <span>{t("gallery")}</span>
        </button>
        <button onClick={() => navigate("/bridge")} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("bridge")}>
          <Radio size={13} />
        </button>
        <button onClick={() => navigate("/settings")} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" title={t("settings")}>
          <Settings size={13} />
        </button>
      </div>

      {/* Resize handle — desktop only */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/40 transition-colors hidden md:block"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />
    </nav>
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
  const exportSession = useChatStore((s) => s.exportSession);
  const searchSessions = useChatStore((s) => s.searchSessions);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpenId) {return;}
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

  // Close mobile sidebar on session select
  const handleSelectSession = (id: string) => {
    const { splitViewActive, secondarySessionId, setSecondarySession } = useUIStore.getState();
    if (splitViewActive) {
      // In split view: if clicking the session that's already active, do nothing.
      // If clicking the secondary session, swap it to primary.
      // Otherwise, set the clicked session as secondary.
      if (id === activeSessionId) {
        // Already primary — do nothing
      } else if (id === secondarySessionId) {
        // It's the secondary — swap primary and secondary
        setActiveSession(id);
        if (secondarySessionId && activeSessionId) {
          // The old primary becomes secondary
          setSecondarySession(activeSessionId);
        }
      } else {
        // New session — set as secondary
        setSecondarySession(id);
      }
    } else {
      setActiveSession(id);
    }
    if (window.innerWidth < 768) {
      useUIStore.getState().setSidebarOpen(false);
    }
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
  }, [filtered, t]);

  const archivedSessions = sessions.filter((s) => s.archived);
  const splitViewActive = useUIStore((s) => s.splitViewActive);
  const secondarySessionId = useUIStore((s) => s.secondarySessionId);

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1" role="list" aria-label={t("a11y.sidebarNav")}>
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
              const isSecondary = splitViewActive && session.id === secondarySessionId;
              return (
                <div
                  key={session.id}
                  role="listitem"
                  className={cn(
                    "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : isSecondary
                        ? "bg-primary/10 text-foreground border border-primary/30"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                  onClick={() => handleSelectSession(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleSelectSession(session.id);
                    }
                  }}
                  tabIndex={0}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={`${session.title}, ${relativeTime(session.updatedAt)}${isActive ? ` (${t("a11y.activeSession")})` : ""}`}
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
                          if (e.key === "Enter") {handleRename(session.id);}
                          if (e.key === "Escape") {setRenamingId(null);}
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full rounded bg-background px-1 py-0 text-xs outline-none ring-1 ring-primary"
                        aria-label={t("rename")}
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
                      aria-label={t("a11y.sessionMenu")}
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
                        <div className="px-2 py-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Download size={12} /> {t("exportAs")}
                          </div>
                          <div className="ml-5 mt-0.5 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                exportSession(session.id, "json");
                                setMenuOpenId(null);
                              }}
                              className="rounded px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
                            >
                              {t("exportJson")}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                exportSession(session.id, "markdown");
                                setMenuOpenId(null);
                              }}
                              className="rounded px-1.5 py-0.5 text-xs text-foreground transition-colors hover:bg-accent"
                            >
                              {t("exportMarkdown")}
                            </button>
                          </div>
                        </div>
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
      {/* Archived sessions */}
      {archivedSessions.length > 0 && (
        <div className="mt-3 mb-2">
          <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {t("archived")}
          </div>
          {archivedSessions.map((session) => (
            <div
              key={session.id}
              role="listitem"
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors opacity-60 hover:opacity-100 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              onClick={() => handleSelectSession(session.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectSession(session.id);
                }
              }}
              tabIndex={0}
              aria-label={`${session.title}, ${relativeTime(session.updatedAt)}`}
            >
              <Archive size={13} className="shrink-0 opacity-60" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{session.title}</div>
                <div className="text-[10px] opacity-60">{relativeTime(session.updatedAt)}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Unarchive: set archived = false
                  useChatStore.setState(s => ({
                    sessions: s.sessions.map(sess =>
                      sess.id === session.id ? { ...sess, archived: false } : sess
                    ),
                  }));
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
                title={t("unarchive")}
                aria-label={t("a11y.unarchiveSession")}
              >
                <MessageSquare size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Message Search Results ──────────────────────────────────────

function MessageSearchResults({
  query,
  onSelectSession,
}: {
  query: string;
  onSelectSession: (sessionId: string) => void;
}) {
  const { t } = useI18n();
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchMessages = useChatStore((s) => s.searchMessages);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }

    // Debounce search: 300ms
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      searchMessages(query.trim())
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, searchMessages]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (results.length === 0 && query.trim().length >= 3) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Search size={20} className="mb-2 opacity-40" />
        <span className="text-xs">{t("noResults") ?? "No results found"}</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-1" role="list" aria-label="Search results">
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {results.length} {t("results") ?? "results"}
      </div>
      {results.map((result) => (
        <div
          key={result.message.id}
          role="listitem"
          className="group flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors text-muted-foreground hover:bg-accent/50 hover:text-foreground"
          onClick={() => onSelectSession(result.sessionId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectSession(result.sessionId);
            }
          }}
          tabIndex={0}
          aria-label={`${result.sessionTitle}: ${result.snippet}`}
        >
          <FileText size={13} className="mt-0.5 shrink-0 opacity-60" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{result.sessionTitle}</div>
            <div className="line-clamp-2 text-[10px] opacity-60">{result.snippet}</div>
            <div className="mt-0.5 text-[10px] opacity-40">
              {result.message.role} · {relativeTime(result.message.createdAt)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
