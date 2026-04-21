/**
 * MessageSearchDialog — Full-text search across all chat messages.
 *
 * Modal dialog that searches messages via the backend search_messages IPC.
 * Results show session title, message snippet, and timestamp.
 * Clicking a result navigates to that session.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useChatStore } from "../stores/chatStore";
import { useI18n } from "../i18n";
import type { MessageSearchResult } from "../types";
import { cn } from "../lib/utils";
import {
  Search,
  X,
  MessageSquare,
  Clock,
  Loader2,
  ArrowRight,
} from "lucide-react";

/** Debounce delay for search input (ms). */
const DEBOUNCE_MS = 300;

export function MessageSearchDialog() {
  const open = useUIStore((s) => s.messageSearchOpen);
  const setOpen = useUIStore((s) => s.setMessageSearchOpen);
  const setActiveSession = useChatStore((s) => s.setActiveSession);
  const sessions = useChatStore((s) => s.sessions);
  const searchMessages = useChatStore((s) => s.searchMessages);
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) {return;}
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setOpen]);

  // Debounced search
  const doSearch = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const r = await searchMessages(q);
        setResults(r);
      } catch {
        setResults([]);
      }
      setLoading(false);
    },
    [searchMessages],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIndex(0);
      if (debounceRef.current) {clearTimeout(debounceRef.current);}
      debounceRef.current = setTimeout(() => doSearch(value), DEBOUNCE_MS);
    },
    [doSearch],
  );

  // Navigate to session
  const navigateToResult = useCallback(
    (result: MessageSearchResult) => {
      const session = sessions.find(
        (s) => s.id === result.sessionId,
      );
      if (session) {
        setActiveSession(session.id);
      }
      setOpen(false);
    },
    [sessions, setActiveSession, setOpen],
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        navigateToResult(results[selectedIndex]!);
      }
    },
    [results, selectedIndex, navigateToResult],
  );

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) {return;}
    const selected = listRef.current.querySelector("[data-selected='true']");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // Group results by session for display
  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { sessionTitle: string; items: MessageSearchResult[] }
    >();
    for (const r of results) {
      const existing = map.get(r.sessionId);
      if (existing) {
        existing.items.push(r);
      } else {
        map.set(r.sessionId, {
          sessionTitle: r.sessionTitle,
          items: [r],
        });
      }
    }
    return Array.from(map.values());
  }, [results]);

  if (!open) {return null;}

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Dialog */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={18} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("messageSearchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" />}
          {query.length >= 2 && !loading && results.length > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {results.length} {t("messageSearchResults")}
            </span>
          )}
          <button
            onClick={() => setOpen(false)}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <X size={14} />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
          {query.length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("messageSearchMinChars")}
            </div>
          )}
          {query.length >= 2 && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("messageSearchNoResults")}
            </div>
          )}
          {grouped.map((group) => (
            <div key={group.items[0]!.sessionId}>
              {/* Session header */}
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground">
                <MessageSquare size={12} />
                <span className="truncate">{group.sessionTitle}</span>
                <span className="ml-auto text-[10px]">
                  {group.items.length} {t("messages")}
                </span>
              </div>
              {/* Messages in group */}
              {group.items.map((result) => {
                const globalIndex = results.indexOf(result);
                const isSelected = globalIndex === selectedIndex;
                return (
                  <button
                    key={result.message.id}
                    data-selected={isSelected}
                    onClick={() => navigateToResult(result)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "text-foreground hover:bg-accent/50",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={10} />
                          {new Date(result.message.createdAt).toLocaleString()}
                        </span>
                        <span className="ml-2 uppercase">
                          {result.message.role}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-sm">
                        {result.snippet}
                      </div>
                    </div>
                    {isSelected && (
                      <ArrowRight
                        size={14}
                        className="mt-1 shrink-0 text-muted-foreground"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">↑↓</kbd>{" "}
            {t("messageSearchNavigate")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">↵</kbd>{" "}
            {t("messageSearchOpen")}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">esc</kbd>{" "}
            {t("messageSearchClose")}
          </span>
        </div>
      </div>
    </div>
  );
}
