import { useEffect, useState, useCallback } from "react";
import {
  GitBranch,
  GitCommit,
  History,
  FileText,
  ChevronRight,
  Download,
  Upload,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useGitStore, type GitFileStatus } from "../../stores/gitStore";
import { useUIStore } from "../../stores/uiStore";
import { useI18n } from "../../i18n";
import { cn } from "../../lib/utils";

// ── Status Icon ────────────────────────────────────────────

function statusIcon(status: GitFileStatus) {
  switch (status) {
    case "modified":
      return <span className="text-yellow-500 text-xs font-mono">M</span>;
    case "added":
      return <span className="text-green-500 text-xs font-mono">A</span>;
    case "deleted":
      return <span className="text-red-500 text-xs font-mono">D</span>;
    case "renamed":
      return <span className="text-blue-500 text-xs font-mono">R</span>;
    case "untracked":
      return <span className="text-gray-400 text-xs font-mono">?</span>;
    case "unmerged":
      return <span className="text-purple-500 text-xs font-mono">U</span>;
    case "ignored":
      return <span className="text-gray-600 text-xs font-mono">!</span>;
  }
}

// ── Status Tab ─────────────────────────────────────────────

function StatusTab() {
  const { t } = useI18n();
  const status = useGitStore((s) => s.status);
  const loading = useGitStore((s) => s.loading);
  const commit = useGitStore((s) => s.commit);
  const stashSave = useGitStore((s) => s.stashSave);
  const stashPop = useGitStore((s) => s.stashPop);
  const refreshStatus = useGitStore((s) => s.refreshStatus);
  const setSelectedDiffFile = useGitStore((s) => s.setSelectedDiffFile);
  const setActiveTab = useGitStore((s) => s.setActiveTab);
  const setShowStagedDiff = useGitStore((s) => s.setShowStagedDiff);

  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) {
      return;
    }
    setCommitting(true);
    try {
      await commit(commitMsg.trim());
      setCommitMsg("");
    } finally {
      setCommitting(false);
    }
  }, [commit, commitMsg]);

  const handleStashSave = useCallback(async () => {
    await stashSave();
  }, [stashSave]);

  const handleStashPop = useCallback(async () => {
    await stashPop();
  }, [stashPop]);

  const handleFileClick = useCallback(
    (path: string) => {
      setSelectedDiffFile(path);
      setShowStagedDiff(false);
      setActiveTab("diff");
    },
    [setSelectedDiffFile, setShowStagedDiff, setActiveTab],
  );

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t("gitNoRepo")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Branch header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border text-xs text-muted-foreground">
        <GitBranch size={12} />
        <span className="font-medium">
          {status.branch || "HEAD detached"}
        </span>
        <span className="text-muted-foreground">
          ({status.entries.length} {t("gitChanged")})
        </span>
        <div className="flex-1" />
        <button
          onClick={() => refreshStatus()}
          className="p-1 rounded hover:bg-accent/50"
          title={t("refresh")}
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {status.entries.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            {t("gitClean")}
          </div>
        ) : (
          status.entries.map((entry, i) => (
            <button
              key={`${entry.path}-${i}`}
              onClick={() => handleFileClick(entry.path)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left"
            >
              <span className="w-4 text-center">{statusIcon(entry.status)}</span>
              <span className="truncate flex-1 font-mono text-xs">
                {entry.path}
              </span>
              <ChevronRight size={10} className="text-muted-foreground shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* Commit input */}
      <div className="border-t border-border p-2 space-y-2">
        <textarea
          value={commitMsg}
          onChange={(e) => setCommitMsg(e.target.value)}
          placeholder={t("gitCommitPlaceholder")}
          className="w-full resize-none rounded-md border border-border bg-input px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleCommit();
            }
          }}
        />
        <div className="flex gap-1">
          <button
            onClick={handleCommit}
            disabled={!commitMsg.trim() || committing || loading}
            className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          >
            <GitCommit size={12} />
            {committing ? "..." : t("gitCommit")}
          </button>
          <button
            onClick={handleStashSave}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
            title={t("gitStashSave")}
          >
            <Download size={12} />
          </button>
          <button
            onClick={handleStashPop}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
            title={t("gitStashPop")}
          >
            <Upload size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Log Tab ────────────────────────────────────────────────

function LogTab() {
  const { t } = useI18n();
  const logEntries = useGitStore((s) => s.logEntries);

  if (logEntries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t("gitNoCommits")}
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full">
      {logEntries.map((entry) => (
        <div
          key={entry.hash}
          className="px-3 py-2 border-b border-border hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-primary">
              {entry.short_hash}
            </span>
            <span className="text-xs text-muted-foreground">{entry.author}</span>
            <span className="text-xs text-muted-foreground ml-auto">
              {entry.time}
            </span>
          </div>
          <div className="text-xs mt-0.5 truncate">{entry.message}</div>
        </div>
      ))}
    </div>
  );
}

// ── Diff Tab ───────────────────────────────────────────────

function DiffTab() {
  const { t } = useI18n();
  const diffUnstaged = useGitStore((s) => s.diffUnstaged);
  const diffStaged = useGitStore((s) => s.diffStaged);
  const selectedDiffFile = useGitStore((s) => s.selectedDiffFile);
  const showStagedDiff = useGitStore((s) => s.showStagedDiff);
  const setShowStagedDiff = useGitStore((s) => s.setShowStagedDiff);
  const refreshDiff = useGitStore((s) => s.refreshDiff);
  const setSelectedDiffFile = useGitStore((s) => s.setSelectedDiffFile);

  useEffect(() => {
    refreshDiff();
  }, [refreshDiff]);

  const diffs = showStagedDiff ? diffStaged : diffUnstaged;

  // If a file is selected, show only that file's diff
  const displayDiffs = selectedDiffFile
    ? diffs.filter((d) => d.path === selectedDiffFile)
    : diffs;

  if (diffs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        {t("gitNoChanges")}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
        <button
          onClick={() => setShowStagedDiff(false)}
          className={cn(
            "px-2 py-0.5 rounded",
            !showStagedDiff
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          {t("gitUnstaged")}
        </button>
        <button
          onClick={() => setShowStagedDiff(true)}
          className={cn(
            "px-2 py-0.5 rounded",
            showStagedDiff
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
        >
          {t("gitStaged")}
        </button>
        <div className="flex-1" />
        {selectedDiffFile && (
          <button
            onClick={() => setSelectedDiffFile(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto font-mono text-xs">
        {displayDiffs.map((diff) => (
          <div key={diff.path}>
            {/* File header */}
            <div
              className="sticky top-0 bg-background/90 backdrop-blur px-3 py-1 border-b border-border font-sans cursor-pointer hover:bg-accent/30"
              onClick={() =>
                setSelectedDiffFile(
                  selectedDiffFile === diff.path ? null : diff.path,
                )
              }
            >
              <span className="text-primary">{diff.path}</span>
              <span className="text-muted-foreground ml-2">
                ({diff.hunks.reduce((acc, h) => acc + h.lines.length, 0)}{" "}
                {t("gitLines")})
              </span>
            </div>

            {/* Hunks */}
            {diff.hunks.map((hunk, hi) => (
              <div key={hi} className="border-b border-border/30">
                {/* Hunk header */}
                <div className="px-3 py-0.5 bg-muted/30 text-muted-foreground">
                  @@ -{hunk.old_start} +{hunk.new_start} @@
                </div>
                {/* Lines */}
                {hunk.lines.map((line, li) => (
                  <div
                    key={li}
                    className={cn(
                      "px-3 whitespace-pre",
                      line.kind === "add" && "bg-green-500/10 text-green-400",
                      line.kind === "delete" && "bg-red-500/10 text-red-400",
                      line.kind === "context" && "text-muted-foreground",
                    )}
                  >
                    <span className="inline-block w-8 text-right text-muted-foreground/50 mr-2">
                      {line.old_line ?? ""}
                    </span>
                    <span className="inline-block w-8 text-right text-muted-foreground/50 mr-2">
                      {line.new_line ?? ""}
                    </span>
                    <span>
                      {line.kind === "add"
                        ? "+"
                        : line.kind === "delete"
                          ? "-"
                          : " "}
                    </span>
                    {line.content}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main GitPanel ──────────────────────────────────────────

export function GitPanel() {
  const { t } = useI18n();
  const activeTab = useGitStore((s) => s.activeTab);
  const setActiveTab = useGitStore((s) => s.setActiveTab);
  const refresh = useGitStore((s) => s.refresh);
  const error = useGitStore((s) => s.error);
  const clearError = useGitStore((s) => s.clearError);
  const loading = useGitStore((s) => s.loading);
  const workingDir = useUIStore((s) => s.workingDir);

  // Load git data on mount and when workingDir changes
  useEffect(() => {
    if (workingDir) {
      refresh();
    }
  }, [workingDir, refresh]);

  const tabs = [
    { key: "status" as const, icon: FileText, label: t("gitStatus") },
    { key: "log" as const, icon: History, label: t("gitLog") },
    { key: "diff" as const, icon: GitCommit, label: t("gitDiff") },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              activeTab === key
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon size={12} />
            <span>{label}</span>
          </button>
        ))}
        <div className="flex-1" />
        {loading && (
          <RefreshCw size={12} className="animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Error bar */}
      {error && (
        <div className="flex items-center gap-2 bg-destructive/10 text-destructive px-3 py-1.5 text-xs">
          <AlertCircle size={12} />
          <span className="flex-1 truncate">{error}</span>
          <button onClick={clearError} className="hover:text-foreground">
            ×
          </button>
        </div>
      )}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "status" && <StatusTab />}
        {activeTab === "log" && <LogTab />}
        {activeTab === "diff" && <DiffTab />}
      </div>
    </div>
  );
}
