import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGitStore, type GitStatusResult, type GitLogEntry, type GitBranch, type GitDiffResult, type WorktreeInfo } from "../../stores/gitStore";
import { useUIStore } from "../../stores/uiStore";

// Mock the IPC invoke function
vi.mock("../../lib/ipc", () => ({
  invoke: vi.fn(),
}));

// Import after mock
import { invoke } from "../../lib/ipc";
const mockedInvoke = invoke as ReturnType<typeof vi.fn>;

describe("gitStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useGitStore.setState({
      loading: false,
      error: null,
      status: null,
      diffUnstaged: [],
      diffStaged: [],
      selectedDiffFile: null,
      showStagedDiff: false,
      logEntries: [],
      branches: [],
      worktrees: [],
      activeTab: "status",
    });

    // Reset working dir
    useUIStore.setState({ workingDir: "/tmp/test-repo" });

    // Reset mock
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("starts with loading false", () => {
      expect(useGitStore.getState().loading).toBe(false);
    });

    it("starts with null error", () => {
      expect(useGitStore.getState().error).toBeNull();
    });

    it("starts with null status", () => {
      expect(useGitStore.getState().status).toBeNull();
    });

    it("starts with empty diff arrays", () => {
      expect(useGitStore.getState().diffUnstaged).toEqual([]);
      expect(useGitStore.getState().diffStaged).toEqual([]);
    });

    it("starts with empty log entries", () => {
      expect(useGitStore.getState().logEntries).toEqual([]);
    });

    it("starts with empty branches", () => {
      expect(useGitStore.getState().branches).toEqual([]);
    });

    it("starts with empty worktrees", () => {
      expect(useGitStore.getState().worktrees).toEqual([]);
    });

    it("starts with activeTab status", () => {
      expect(useGitStore.getState().activeTab).toBe("status");
    });

    it("starts with no selected diff file", () => {
      expect(useGitStore.getState().selectedDiffFile).toBeNull();
    });

    it("starts with showStagedDiff false", () => {
      expect(useGitStore.getState().showStagedDiff).toBe(false);
    });
  });

  describe("refreshStatus", () => {
    it("fetches and sets git status", async () => {
      const mockStatus: GitStatusResult = {
        branch: "main",
        entries: [
          { path: "src/main.rs", status: "modified" },
          { path: "README.md", status: "added" },
        ],
      };
      mockedInvoke.mockResolvedValueOnce(mockStatus);

      await useGitStore.getState().refreshStatus();

      expect(mockedInvoke).toHaveBeenCalledWith("git_status", { repoPath: "/tmp/test-repo" });
      expect(useGitStore.getState().status).toEqual(mockStatus);
    });

    it("sets error on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("not a git repo"));

      await useGitStore.getState().refreshStatus();

      expect(useGitStore.getState().error).toContain("not a git repo");
    });
  });

  describe("refreshDiff", () => {
    it("fetches both staged and unstaged diffs", async () => {
      const mockUnstaged: GitDiffResult[] = [
        { path: "src/main.rs", hunks: [] },
      ];
      const mockStaged: GitDiffResult[] = [
        { path: "src/lib.rs", hunks: [] },
      ];
      mockedInvoke
        .mockResolvedValueOnce(mockUnstaged)
        .mockResolvedValueOnce(mockStaged);

      await useGitStore.getState().refreshDiff();

      expect(mockedInvoke).toHaveBeenCalledWith("git_diff_unstaged", { repoPath: "/tmp/test-repo" });
      expect(mockedInvoke).toHaveBeenCalledWith("git_diff_staged", { repoPath: "/tmp/test-repo" });
      expect(useGitStore.getState().diffUnstaged).toEqual(mockUnstaged);
      expect(useGitStore.getState().diffStaged).toEqual(mockStaged);
    });
  });

  describe("refreshLog", () => {
    it("fetches git log entries", async () => {
      const mockLog: GitLogEntry[] = [
        { hash: "abc1234", short_hash: "abc1234", message: "Initial commit", author: "Test", time: "2026-04-24" },
      ];
      mockedInvoke.mockResolvedValueOnce(mockLog);

      await useGitStore.getState().refreshLog();

      expect(mockedInvoke).toHaveBeenCalledWith("git_log", { repoPath: "/tmp/test-repo", maxCount: 50 });
      expect(useGitStore.getState().logEntries).toEqual(mockLog);
    });
  });

  describe("refreshBranches", () => {
    it("fetches branch list", async () => {
      const mockBranches: GitBranch[] = [
        { name: "main", is_current: true, is_remote: false },
        { name: "feature/test", is_current: false, is_remote: false },
        { name: "origin/main", is_current: false, is_remote: true },
      ];
      mockedInvoke.mockResolvedValueOnce(mockBranches);

      await useGitStore.getState().refreshBranches();

      expect(mockedInvoke).toHaveBeenCalledWith("git_branches", { repoPath: "/tmp/test-repo" });
      expect(useGitStore.getState().branches).toEqual(mockBranches);
    });
  });

  describe("refresh (full)", () => {
    it("fetches status, log, and branches in parallel", async () => {
      const mockStatus: GitStatusResult = { branch: "main", entries: [] };
      const mockLog: GitLogEntry[] = [];
      const mockBranches: GitBranch[] = [];

      mockedInvoke
        .mockResolvedValueOnce(mockStatus)
        .mockResolvedValueOnce(mockLog)
        .mockResolvedValueOnce(mockBranches);

      await useGitStore.getState().refresh();

      expect(mockedInvoke).toHaveBeenCalledTimes(3);
      expect(useGitStore.getState().status).toEqual(mockStatus);
      expect(useGitStore.getState().logEntries).toEqual(mockLog);
      expect(useGitStore.getState().branches).toEqual(mockBranches);
      expect(useGitStore.getState().loading).toBe(false);
    });

    it("sets loading true then false on success", async () => {
      mockedInvoke
        .mockResolvedValueOnce({ branch: "main", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const promise = useGitStore.getState().refresh();
      expect(useGitStore.getState().loading).toBe(true);

      await promise;
      expect(useGitStore.getState().loading).toBe(false);
    });

    it("sets error on failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("network error"));

      await useGitStore.getState().refresh();

      expect(useGitStore.getState().error).toContain("network error");
      expect(useGitStore.getState().loading).toBe(false);
    });
  });

  describe("commit", () => {
    it("commits and refreshes", async () => {
      const mockHash = "deadbeef1234";
      mockedInvoke.mockResolvedValueOnce(mockHash);
      // refresh() will call 3 more invokes
      mockedInvoke
        .mockResolvedValueOnce({ branch: "main", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await useGitStore.getState().commit("feat: add new feature");

      expect(mockedInvoke).toHaveBeenCalledWith("git_commit", {
        repoPath: "/tmp/test-repo",
        message: "feat: add new feature",
      });
      expect(result).toBe(mockHash);
    });

    it("sets error on commit failure", async () => {
      mockedInvoke.mockRejectedValueOnce(new Error("nothing to commit"));

      await expect(useGitStore.getState().commit("test")).rejects.toThrow();
      expect(useGitStore.getState().error).toContain("nothing to commit");
    });
  });

  describe("stage/unstage operations", () => {
    it("adds files and refreshes status + diff", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // addFiles
      mockedInvoke.mockResolvedValueOnce({ branch: "main", entries: [] }); // status
      mockedInvoke
        .mockResolvedValueOnce([]) // diff unstaged
        .mockResolvedValueOnce([]); // diff staged

      await useGitStore.getState().addFiles(["src/main.rs", "lib.rs"]);

      expect(mockedInvoke).toHaveBeenCalledWith("git_add_files", {
        repoPath: "/tmp/test-repo",
        paths: ["src/main.rs", "lib.rs"],
      });
    });

    it("unstages files and refreshes status + diff", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // unstageFiles
      mockedInvoke.mockResolvedValueOnce({ branch: "main", entries: [] }); // status
      mockedInvoke
        .mockResolvedValueOnce([]) // diff unstaged
        .mockResolvedValueOnce([]); // diff staged

      await useGitStore.getState().unstageFiles(["src/main.rs"]);

      expect(mockedInvoke).toHaveBeenCalledWith("git_unstage_files", {
        repoPath: "/tmp/test-repo",
        paths: ["src/main.rs"],
      });
    });

    it("adds all files and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // addAll
      mockedInvoke.mockResolvedValueOnce({ branch: "main", entries: [] }); // status
      mockedInvoke
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().addAll();

      expect(mockedInvoke).toHaveBeenCalledWith("git_add_all", {
        repoPath: "/tmp/test-repo",
      });
    });
  });

  describe("branch operations", () => {
    it("switches branch and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // switch
      // refresh calls
      mockedInvoke
        .mockResolvedValueOnce({ branch: "develop", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().switchBranch("develop");

      expect(mockedInvoke).toHaveBeenCalledWith("git_switch_branch", {
        repoPath: "/tmp/test-repo",
        branch: "develop",
      });
      expect(useGitStore.getState().loading).toBe(false);
    });

    it("creates branch and refreshes branches", async () => {
      const mockBranches: GitBranch[] = [
        { name: "main", is_current: true, is_remote: false },
        { name: "new-feature", is_current: false, is_remote: false },
      ];
      mockedInvoke.mockResolvedValueOnce(undefined); // create
      mockedInvoke.mockResolvedValueOnce(mockBranches); // refreshBranches

      await useGitStore.getState().createBranch("new-feature");

      expect(mockedInvoke).toHaveBeenCalledWith("git_create_branch", {
        repoPath: "/tmp/test-repo",
        branch: "new-feature",
      });
    });
  });

  describe("stash operations", () => {
    it("stash saves and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // stash save
      // refresh calls
      mockedInvoke
        .mockResolvedValueOnce({ branch: "main", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().stashSave("WIP: work in progress");

      expect(mockedInvoke).toHaveBeenCalledWith("git_stash_save", {
        repoPath: "/tmp/test-repo",
        message: "WIP: work in progress",
      });
    });

    it("stash pops and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // stash pop
      mockedInvoke
        .mockResolvedValueOnce({ branch: "main", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().stashPop();

      expect(mockedInvoke).toHaveBeenCalledWith("git_stash_pop", {
        repoPath: "/tmp/test-repo",
      });
    });
  });

  describe("remote operations", () => {
    it("fetches from remote and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // fetch
      mockedInvoke
        .mockResolvedValueOnce({ branch: "main", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().fetch("origin");

      expect(mockedInvoke).toHaveBeenCalledWith("git_fetch", {
        repoPath: "/tmp/test-repo",
        remote: "origin",
      });
    });

    it("pulls from remote with branch", async () => {
      useGitStore.setState({ status: { branch: "develop", entries: [] } });
      mockedInvoke.mockResolvedValueOnce(undefined); // pull
      mockedInvoke
        .mockResolvedValueOnce({ branch: "develop", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().pull("origin", "develop");

      expect(mockedInvoke).toHaveBeenCalledWith("git_pull", {
        repoPath: "/tmp/test-repo",
        remote: "origin",
        branch: "develop",
      });
    });

    it("pulls defaults to current branch", async () => {
      useGitStore.setState({ status: { branch: "feature/x", entries: [] } });
      mockedInvoke.mockResolvedValueOnce(undefined);
      mockedInvoke
        .mockResolvedValueOnce({ branch: "feature/x", entries: [] })
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await useGitStore.getState().pull();

      expect(mockedInvoke).toHaveBeenCalledWith("git_pull", {
        repoPath: "/tmp/test-repo",
        remote: "origin",
        branch: "feature/x",
      });
    });

    it("pushes to remote", async () => {
      useGitStore.setState({ status: { branch: "main", entries: [] } });
      mockedInvoke.mockResolvedValueOnce(undefined);

      await useGitStore.getState().push("origin", "main");

      expect(mockedInvoke).toHaveBeenCalledWith("git_push", {
        repoPath: "/tmp/test-repo",
        remote: "origin",
        branch: "main",
      });
      expect(useGitStore.getState().loading).toBe(false);
    });
  });

  describe("worktree operations", () => {
    it("refreshes worktrees", async () => {
      const mockWorktrees: WorktreeInfo[] = [
        { path: "/tmp/main", branch: "main", is_main: true, is_prunable: false },
        { path: "/tmp/feat", branch: "feature", is_main: false, is_prunable: true },
      ];
      mockedInvoke.mockResolvedValueOnce(mockWorktrees);

      await useGitStore.getState().refreshWorktrees();

      expect(mockedInvoke).toHaveBeenCalledWith("git_list_worktrees", {
        repoPath: "/tmp/test-repo",
      });
      expect(useGitStore.getState().worktrees).toEqual(mockWorktrees);
    });

    it("adds worktree and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // add worktree
      mockedInvoke.mockResolvedValueOnce([]); // refreshWorktrees
      mockedInvoke.mockResolvedValueOnce([]); // refreshBranches

      await useGitStore.getState().addWorktree("feat", "/tmp/feat", "feature");

      expect(mockedInvoke).toHaveBeenCalledWith("git_add_worktree", {
        repoPath: "/tmp/test-repo",
        name: "feat",
        path: "/tmp/feat",
        branch: "feature",
      });
    });

    it("removes worktree and refreshes", async () => {
      mockedInvoke.mockResolvedValueOnce(undefined); // remove
      mockedInvoke.mockResolvedValueOnce([]); // refresh

      await useGitStore.getState().removeWorktree("feat");

      expect(mockedInvoke).toHaveBeenCalledWith("git_remove_worktree", {
        repoPath: "/tmp/test-repo",
        name: "feat",
      });
    });
  });

  describe("UI state setters", () => {
    it("sets selected diff file", () => {
      useGitStore.getState().setSelectedDiffFile("src/main.rs");
      expect(useGitStore.getState().selectedDiffFile).toBe("src/main.rs");

      useGitStore.getState().setSelectedDiffFile(null);
      expect(useGitStore.getState().selectedDiffFile).toBeNull();
    });

    it("toggles staged diff view", () => {
      useGitStore.getState().setShowStagedDiff(true);
      expect(useGitStore.getState().showStagedDiff).toBe(true);

      useGitStore.getState().setShowStagedDiff(false);
      expect(useGitStore.getState().showStagedDiff).toBe(false);
    });

    it("sets active tab", () => {
      useGitStore.getState().setActiveTab("log");
      expect(useGitStore.getState().activeTab).toBe("log");

      useGitStore.getState().setActiveTab("diff");
      expect(useGitStore.getState().activeTab).toBe("diff");

      useGitStore.getState().setActiveTab("branches");
      expect(useGitStore.getState().activeTab).toBe("branches");
    });

    it("clears error", () => {
      useGitStore.setState({ error: "some error" });
      expect(useGitStore.getState().error).toBe("some error");

      useGitStore.getState().clearError();
      expect(useGitStore.getState().error).toBeNull();
    });
  });
});
