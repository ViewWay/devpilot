import { create } from "zustand";
import { invoke } from "../lib/ipc";
import { useUIStore } from "./uiStore";

// ── Types ────────────────────────────────────────────────

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "unmerged"
  | "ignored";

export interface GitStatusEntry {
  path: string;
  status: GitFileStatus;
}

export interface GitStatusResult {
  branch: string | null;
  entries: GitStatusEntry[];
}

export type DiffLineKind = "context" | "add" | "delete";

export interface GitDiffLine {
  old_line: number | null;
  new_line: number | null;
  content: string;
  kind: DiffLineKind;
}

export interface GitDiffHunk {
  old_start: number;
  new_start: number;
  lines: GitDiffLine[];
}

export interface GitDiffResult {
  path: string;
  hunks: GitDiffHunk[];
}

export interface GitLogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  time: string;
}

export interface GitBranch {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

// ── Store State ──────────────────────────────────────────

interface GitState {
  /** Whether a git operation is in progress. */
  loading: boolean;
  /** Last error message (null if none). */
  error: string | null;

  // Status
  status: GitStatusResult | null;

  // Diff
  diffUnstaged: GitDiffResult[];
  diffStaged: GitDiffResult[];
  /** Currently selected file for diff view. */
  selectedDiffFile: string | null;
  /** Whether to show staged or unstaged diff. */
  showStagedDiff: boolean;

  // Log
  logEntries: GitLogEntry[];

  // Branches
  branches: GitBranch[];

  // Active tab
  activeTab: "status" | "log" | "diff";
}

interface GitActions {
  /** Refresh all git data (status + log + branches). */
  refresh: () => Promise<void>;

  /** Refresh only status. */
  refreshStatus: () => Promise<void>;

  /** Refresh only diff. */
  refreshDiff: () => Promise<void>;

  /** Refresh only log. */
  refreshLog: () => Promise<void>;

  /** Refresh only branches. */
  refreshBranches: () => Promise<void>;

  /** Commit all changes with the given message. */
  commit: (message: string) => Promise<string>;

  /** Switch to an existing branch. */
  switchBranch: (branch: string) => Promise<void>;

  /** Create a new branch from HEAD. */
  createBranch: (branch: string) => Promise<void>;

  /** Stash save. */
  stashSave: (message?: string) => Promise<void>;

  /** Stash pop. */
  stashPop: () => Promise<void>;

  /** Set selected diff file. */
  setSelectedDiffFile: (path: string | null) => void;

  /** Toggle staged/unstaged diff. */
  setShowStagedDiff: (show: boolean) => void;

  /** Set active tab. */
  setActiveTab: (tab: "status" | "log" | "diff") => void;

  /** Clear error. */
  clearError: () => void;
}

/** Helper: get the current repo path from uiStore. */
function getRepoPath(): string {
  return useUIStore.getState().workingDir || ".";
}

export const useGitStore = create<GitState & GitActions>()((set, get) => ({
  loading: false,
  error: null,
  status: null,
  diffUnstaged: [],
  diffStaged: [],
  selectedDiffFile: null,
  showStagedDiff: false,
  logEntries: [],
  branches: [],
  activeTab: "status",

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const repoPath = getRepoPath();
      const [status, logEntries, branches] = await Promise.all([
        invoke<GitStatusResult>("git_status", { repoPath }),
        invoke<GitLogEntry[]>("git_log", { repoPath, maxCount: 50 }),
        invoke<GitBranch[]>("git_branches", { repoPath }),
      ]);
      set({ status, logEntries, branches, loading: false });
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  refreshStatus: async () => {
    try {
      const repoPath = getRepoPath();
      const status = await invoke<GitStatusResult>("git_status", { repoPath });
      set({ status });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  refreshDiff: async () => {
    try {
      const repoPath = getRepoPath();
      const [diffUnstaged, diffStaged] = await Promise.all([
        invoke<GitDiffResult[]>("git_diff_unstaged", { repoPath }),
        invoke<GitDiffResult[]>("git_diff_staged", { repoPath }),
      ]);
      set({ diffUnstaged, diffStaged });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  refreshLog: async () => {
    try {
      const repoPath = getRepoPath();
      const logEntries = await invoke<GitLogEntry[]>("git_log", {
        repoPath,
        maxCount: 50,
      });
      set({ logEntries });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  refreshBranches: async () => {
    try {
      const repoPath = getRepoPath();
      const branches = await invoke<GitBranch[]>("git_branches", { repoPath });
      set({ branches });
    } catch (e: unknown) {
      set({ error: String(e) });
    }
  },

  commit: async (message: string) => {
    set({ loading: true, error: null });
    try {
      const repoPath = getRepoPath();
      const hash = await invoke<string>("git_commit", { repoPath, message });
      // Refresh after commit
      await get().refresh();
      return hash;
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
      throw e;
    }
  },

  switchBranch: async (branch: string) => {
    set({ loading: true, error: null });
    try {
      const repoPath = getRepoPath();
      await invoke<void>("git_switch_branch", { repoPath, branch });
      await get().refresh();
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  createBranch: async (branch: string) => {
    set({ loading: true, error: null });
    try {
      const repoPath = getRepoPath();
      await invoke<void>("git_create_branch", { repoPath, branch });
      await get().refreshBranches();
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  stashSave: async (message?: string) => {
    set({ loading: true, error: null });
    try {
      const repoPath = getRepoPath();
      await invoke<void>("git_stash_save", { repoPath, message: message ?? null });
      await get().refresh();
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  stashPop: async () => {
    set({ loading: true, error: null });
    try {
      const repoPath = getRepoPath();
      await invoke<void>("git_stash_pop", { repoPath });
      await get().refresh();
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  setSelectedDiffFile: (path) => set({ selectedDiffFile: path }),
  setShowStagedDiff: (show) => set({ showStagedDiff: show }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clearError: () => set({ error: null }),
}));
