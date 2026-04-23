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
  Plus,
  Trash2,
  ArrowDown,
  ArrowUp,
  GitMerge,
  FolderTree,
  Check,
  X,
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
  const addFiles = useGitStore((s) => s.addFiles);
  const addAll = useGitStore((s) => s.addAll);
  const setSelectedDiffFile = useGitStore((s) => s.setSelectedDiffFile);
  const setActiveTab = useGitStore((s) => s.setActiveTab);
  const setShowStagedDiff = useGitStore((s) => s.setShowStagedDiff);

  const [commitMsg, setCommitMsg] = useState("");
  const [committing, setCommitting] = useState(false);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) {return;}
    setCommitting(true);
    try {
      await commit(commitMsg.trim());
      setCommitMsg("");
    } finally {
      setCommitting(false);
    }
  }, [commit, commitMsg]);

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
          <>
            {/* Stage all button */}
            <div className="flex items-center gap-1 px-3 py-1 border-b border-border/50">
              <button
                onClick={() => addAll()}
                disabled={loading}
                className="flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent/50 disabled:opacity-50"
                title={t("gitStageAll")}
              >
                <Plus size={10} />
                {t("gitStageAll")}
              </button>
            </div>
            {status.entries.map((entry, i) => (
              <div
                key={`${entry.path}-${i}`}
                className="flex items-center gap-1 px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors"
              >
                <span className="w-4 text-center">{statusIcon(entry.status)}</span>
                <button
                  onClick={() => handleFileClick(entry.path)}
                  className="truncate flex-1 font-mono text-xs text-left"
                >
                  {entry.path}
                </button>
                <button
                  onClick={() => addFiles([entry.path])}
                  disabled={loading}
                  className="p-0.5 rounded hover:bg-accent/50 shrink-0"
                  title={t("gitStageFile")}
                >
                  <Plus size={10} />
                </button>
                <ChevronRight size={10} className="text-muted-foreground shrink-0" />
              </div>
            ))}
          </>
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
            onClick={() => stashSave()}
            disabled={loading}
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
            title={t("gitStashSave")}
          >
            <Download size={12} />
          </button>
          <button
            onClick={() => stashPop()}
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
            {diff.hunks.map((hunk, hi) => (
              <div key={hi} className="border-b border-border/30">
                <div className="px-3 py-0.5 bg-muted/30 text-muted-foreground">
                  @@ -{hunk.old_start} +{hunk.new_start} @@
                </div>
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

// ── Branches Tab ───────────────────────────────────────────

function BranchesTab() {
  const { t } = useI18n();
  const branches = useGitStore((s) => s.branches);
  const worktrees = useGitStore((s) => s.worktrees);
  const status = useGitStore((s) => s.status);
  const loading = useGitStore((s) => s.loading);
  const switchBranch = useGitStore((s) => s.switchBranch);
  const createBranch = useGitStore((s) => s.createBranch);
  const fetchRemote = useGitStore((s) => s.fetch);
  const pullRemote = useGitStore((s) => s.pull);
  const pushRemote = useGitStore((s) => s.push);
  const addWorktree = useGitStore((s) => s.addWorktree);
  const removeWorktree = useGitStore((s) => s.removeWorktree);
  const refreshWorktrees = useGitStore((s) => s.refreshWorktrees);

  const [newBranch, setNewBranch] = useState("");
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [showNewWorktree, setShowNewWorktree] = useState(false);
  const [wtName, setWtName] = useState("");
  const [wtPath, setWtPath] = useState("");

  useEffect(() => {
    refreshWorktrees();
  }, [refreshWorktrees]);

  const handleCreateBranch = useCallback(async () => {
    if (!newBranch.trim()) {return;}
    await createBranch(newBranch.trim());
    setNewBranch("");
    setShowNewBranch(false);
  }, [createBranch, newBranch]);

  const handleFetch = useCallback(async () => {
    await fetchRemote();
  }, [fetchRemote]);

  const handlePull = useCallback(async () => {
    await pullRemote();
  }, [pullRemote]);

  const handlePush = useCallback(async () => {
    await pushRemote();
  }, [pushRemote]);

  const localBranches = branches.filter((b) => !b.is_remote);
  const remoteBranches = branches.filter((b) => b.is_remote);

  return (
    <div className="flex flex-col h-full">
      {/* Remote actions toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
        <button
          onClick={handleFetch}
          disabled={loading}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
          title={t("gitFetch")}
        >
          <ArrowDown size={11} />
          {t("gitFetch")}
        </button>
        <button
          onClick={handlePull}
          disabled={loading}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
          title={t("gitPull")}
        >
          <ArrowDown size={11} />
          {t("gitPull")}
        </button>
        <button
          onClick={handlePush}
          disabled={loading}
          className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50 disabled:opacity-50"
          title={t("gitPush")}
        >
          <ArrowUp size={11} />
          {t("gitPush")}
        </button>
        <div className="flex-1" />
        <button
          onClick={() => setShowNewBranch(!showNewBranch)}
          className="p-1 rounded hover:bg-accent/50"
          title={t("gitNewBranch")}
        >
          <Plus size={12} />
        </button>
      </div>

      {/* New branch input */}
      {showNewBranch && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border">
          <input
            value={newBranch}
            onChange={(e) => setNewBranch(e.target.value)}
            placeholder={t("gitBranchNamePlaceholder")}
            className="flex-1 rounded border border-border bg-input px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === "Enter") {handleCreateBranch();}
              if (e.key === "Escape") {setShowNewBranch(false);}
            }}
            autoFocus
          />
          <button
            onClick={handleCreateBranch}
            disabled={!newBranch.trim() || loading}
            className="p-1 rounded hover:bg-accent/50"
          >
            <Check size={12} />
          </button>
          <button
            onClick={() => setShowNewBranch(false)}
            className="p-1 rounded hover:bg-accent/50"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {/* Current branch indicator */}
        {status?.branch && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-accent/20 border-b border-border text-xs">
            <GitBranch size={12} className="text-primary" />
            <span className="font-medium text-primary">{status.branch}</span>
            <span className="text-muted-foreground">({t("gitCurrent")})</span>
          </div>
        )}

        {/* Local branches */}
        <div className="px-3 py-1 text-xs text-muted-foreground font-medium border-b border-border/50">
          {t("gitLocalBranches")} ({localBranches.length})
        </div>
        {localBranches.map((b) => (
          <button
            key={b.name}
            onClick={() => !b.is_current && switchBranch(b.name)}
            disabled={b.is_current || loading}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-accent/50 transition-colors text-left disabled:opacity-50",
              b.is_current && "bg-accent/10",
            )}
          >
            <GitBranch size={10} className={b.is_current ? "text-primary" : "text-muted-foreground"} />
            <span className={b.is_current ? "text-primary font-medium" : ""}>
              {b.name}
            </span>
            {b.is_current && (
              <span className="ml-auto text-primary">
                <Check size={10} />
              </span>
            )}
          </button>
        ))}

        {/* Remote branches */}
        {remoteBranches.length > 0 && (
          <>
            <div className="px-3 py-1 text-xs text-muted-foreground font-medium border-b border-border/50 border-t border-t-border mt-1">
              {t("gitRemoteBranches")} ({remoteBranches.length})
            </div>
            {remoteBranches.map((b) => (
              <div
                key={b.name}
                className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground"
              >
                <GitBranch size={10} />
                <span className="truncate">{b.name}</span>
              </div>
            ))}
          </>
        )}

        {/* Worktrees */}
        {worktrees.length > 0 && (
          <>
            <div className="flex items-center gap-1 px-3 py-1 text-xs text-muted-foreground font-medium border-b border-border/50 border-t border-t-border mt-1">
              <FolderTree size={10} />
              {t("gitWorktrees")} ({worktrees.length})
              <div className="flex-1" />
              <button
                onClick={() => setShowNewWorktree(!showNewWorktree)}
                className="p-0.5 rounded hover:bg-accent/50"
                title={t("gitAddWorktree")}
              >
                <Plus size={10} />
              </button>
            </div>
            {worktrees.map((wt, i) => (
              <div
                key={`${wt.path}-${i}`}
                className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent/30"
              >
                <FolderTree size={10} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{wt.branch || wt.path.split("/").pop()}</div>
                  <div className="text-muted-foreground truncate text-[10px]">{wt.path}</div>
                </div>
                {wt.is_main && (
                  <span className="text-primary text-[10px] shrink-0">{t("gitMain")}</span>
                )}
                {!wt.is_main && (
                  <button
                    onClick={() => removeWorktree(wt.branch || wt.path.split("/").pop() || "")}
                    disabled={loading}
                    className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive shrink-0"
                    title={t("gitRemoveWorktree")}
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {/* New worktree form */}
        {showNewWorktree && (
          <div className="px-3 py-2 border-t border-border space-y-1">
            <input
              value={wtName}
              onChange={(e) => setWtName(e.target.value)}
              placeholder={t("gitWorktreeNamePlaceholder")}
              className="w-full rounded border border-border bg-input px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              value={wtPath}
              onChange={(e) => setWtPath(e.target.value)}
              placeholder={t("gitWorktreePathPlaceholder")}
              className="w-full rounded border border-border bg-input px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-1">
              <button
                onClick={async () => {
                  if (wtName.trim() && wtPath.trim()) {
                    await addWorktree(wtName.trim(), wtPath.trim());
                    setWtName("");
                    setWtPath("");
                    setShowNewWorktree(false);
                  }
                }}
                disabled={!wtName.trim() || !wtPath.trim() || loading}
                className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
              >
                <Check size={10} />
                {t("gitCreate")}
              </button>
              <button
                onClick={() => setShowNewWorktree(false)}
                className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent/50"
              >
                {t("gitCancel")}
              </button>
            </div>
          </div>
        )}
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

  useEffect(() => {
    if (workingDir) {
      refresh();
    }
  }, [workingDir, refresh]);

  const tabs = [
    { key: "status" as const, icon: FileText, label: t("gitStatus") },
    { key: "log" as const, icon: History, label: t("gitLog") },
    { key: "diff" as const, icon: GitCommit, label: t("gitDiff") },
    { key: "branches" as const, icon: GitMerge, label: t("gitBranches") },
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
        {activeTab === "branches" && <BranchesTab />}
      </div>
    </div>
  );
}
