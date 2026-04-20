import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useUIStore } from "../stores/uiStore";
import { useChatStore } from "../stores/chatStore";
import { useI18n } from "../i18n";
import {
  Search,
  FileText,
  Loader2,
  X,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "../lib/utils";
import { isTauriRuntime, invoke } from "../lib/ipc";

// ── Types ──────────────────────────────────────────────────

type SearchMode = "files" | "content";

interface FileSearchResult {
  path: string;
  lineNumber: number | null;
  lineContent: string | null;
  score: number | null;
}

// ── Component ──────────────────────────────────────────────

export function QuickFileSearch() {
  const open = useUIStore((s) => s.quickFileSearchOpen);
  const setOpen = useUIStore((s) => s.setQuickFileSearchOpen);
  const activeSession = useChatStore((s) =>
    s.sessions.find((sess) => sess.id === s.activeSessionId),
  );
  const workingDir = activeSession?.workingDir;
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("files");
  const [results, setResults] = useState<FileSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      abortRef.current?.abort();
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !query.trim() || !workingDir) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      if (!isTauriRuntime()) {
        // Mock results for browser dev mode
        setResults([
          { path: "src/main.tsx", lineNumber: null, lineContent: null, score: 0.95 },
          { path: "src/App.tsx", lineNumber: null, lineContent: null, score: 0.85 },
          { path: "src/lib/utils.ts", lineNumber: null, lineContent: null, score: 0.7 },
        ]);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await invoke<FileSearchResult[]>("searchFiles", {
          req: {
            query,
            mode,
            root: workingDir,
            maxResults: 50,
          },
        });
        if (!controller.signal.aborted) {
          setResults(res || []);
        }
      } catch (err) {
        console.error("File search failed:", err);
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, mode, workingDir, open]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleOpenFile = useCallback(
    (path: string) => {
      // Open file in preview panel
      useUIStore.getState().setPreviewFile(path);
      useUIStore.getState().toggleRightPanel("preview");
      setOpen(false);
    },
    [setOpen],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[selectedIndex]) {
        e.preventDefault();
        handleOpenFile(results[selectedIndex].path);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === "Tab") {
        e.preventDefault();
        setMode((m) => (m === "files" ? "content" : "files"));
      }
    },
    [results, selectedIndex, setOpen, handleOpenFile],
  );

  const handleCopyPath = useCallback(
    async (path: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(path);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    },
    [],
  );

  // Extract just the filename for display
  const getFileName = (path: string) => {
    const parts = path.split("/");
    return parts[parts.length - 1];
  };

  // Get the directory part
  const getDirPath = (path: string) => {
    const parts = path.split("/");
    parts.pop();
    return parts.join("/");
  };

  const resultSummary = useMemo(() => {
    if (results.length === 0) { return ""; }
    if (mode === "files") {
      return t("quickFileSearchResultsCount").replace("{count}", String(results.length));
    }
    const uniqueFiles = new Set(results.map((r) => r.path)).size;
    return t("quickFileSearchContentResultsCount")
      .replace("{count}", String(results.length))
      .replace("{files}", String(uniqueFiles));
  }, [results, mode, t]);

  if (!open) { return null; }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("quickFileSearchPlaceholder")}
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 size={14} className="shrink-0 animate-spin text-muted-foreground" />}
          {query && (
            <button
              onClick={() => setQuery("")}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}

          {/* Mode toggle */}
          <div className="flex shrink-0 rounded-md border border-border">
            <button
              onClick={() => setMode("files")}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium transition-colors",
                mode === "files"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("quickFileSearchByName")}
            </button>
            <button
              onClick={() => setMode("content")}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium transition-colors",
                mode === "content"
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("quickFileSearchByContent")}
            </button>
          </div>
        </div>

        {/* No working dir warning */}
        {!workingDir && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t("quickFileSearchNoWorkingDir")}
          </div>
        )}

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto">
          {workingDir && query && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {t("noResults")}
            </div>
          )}

          {results.map((result, i) => (
            <button
              key={`${result.path}-${result.lineNumber ?? i}`}
              onClick={() => handleOpenFile(result.path)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={cn(
                "flex w-full items-start gap-3 px-4 py-2 text-left transition-colors",
                i === selectedIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground hover:bg-accent/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 shrink-0",
                  i === selectedIndex ? "text-primary" : "text-muted-foreground",
                )}
              >
                <FileText size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {getFileName(result.path)}
                  </span>
                  <span className="shrink-0 truncate text-[10px] text-muted-foreground">
                    {getDirPath(result.path)}
                  </span>
                  {result.score !== null && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {Math.round(result.score * 100)}%
                    </span>
                  )}
                </div>
                {result.lineContent && (
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    <span className="mr-1 text-muted-foreground/60">
                      {result.lineNumber !== null &&
                        t("quickFileSearchLine").replace("{line}", String(result.lineNumber))}
                    </span>
                    {result.lineContent}
                  </div>
                )}
              </div>
              {i === selectedIndex && (
                <button
                  onClick={(e) => handleCopyPath(result.path, e)}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  title={t("quickFileSearchCopyPath")}
                >
                  {copiedPath === result.path ? (
                    <Check size={12} className="text-green-400" />
                  ) : (
                    <Copy size={12} />
                  )}
                </button>
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          {resultSummary && <span className="font-medium">{resultSummary}</span>}
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">↵</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">tab</kbd> switch mode
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border bg-muted/50 px-1">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
