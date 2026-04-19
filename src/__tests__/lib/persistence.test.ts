import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock dependencies ────────────────────────────────────────

const mockInvoke = vi.fn();
const mockIsTauriRuntime = vi.fn();

vi.mock("../../lib/ipc", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
  isTauriRuntime: () => mockIsTauriRuntime(),
}));

vi.mock("../../lib/errors", () => ({
  reportError: vi.fn(),
}));

vi.mock("../../stores/toastStore", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import {
  persistCreateSession,
  persistDeleteSession,
  persistUpdateSessionTitle,
  persistArchiveSession,
  persistAddMessage,
  persistUpdateMessageContent,
  hydrateSessions,
} from "../../lib/persistence";

import { reportError } from "../../lib/errors";

// ── Helpers ──────────────────────────────────────────────────

/** Configure mocks for "not in Tauri runtime" (default browser mode). */
function setBrowserMode() {
  mockIsTauriRuntime.mockReturnValue(false);
}

/** Configure mocks for "Tauri runtime" mode. */
function setTauriMode() {
  mockIsTauriRuntime.mockReturnValue(true);
}

// ── Tests ────────────────────────────────────────────────────

describe("persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockReset();
    mockIsTauriRuntime.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  // ── No-op tests (browser / non-Tauri runtime) ────────────

  describe("no-ops when not in Tauri runtime", () => {
    beforeEach(() => setBrowserMode());

    it("persistCreateSession does not invoke and does not throw", async () => {
      await persistCreateSession("s1", "title", "gpt-4", "openai");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("persistDeleteSession does not invoke and does not throw", async () => {
      await persistDeleteSession("s1");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("persistUpdateSessionTitle does not invoke and does not throw", async () => {
      await persistUpdateSessionTitle("s1", "new title");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("persistArchiveSession does not invoke and does not throw", async () => {
      await persistArchiveSession("s1", true);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("persistAddMessage does not invoke and does not throw", async () => {
      await persistAddMessage("s1", "m1", "user", "hello");
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("persistUpdateMessageContent does not invoke and does not throw", async () => {
      // Note: persistUpdateMessageContent does NOT have isTauriRuntime guard,
      // it always calls invoke. But in browser mode invoke will use the mock.
      // We verify it doesn't throw an uncaught error.
      mockInvoke.mockResolvedValue(null);
      await expect(
        persistUpdateMessageContent("s1", "m1", "updated content"),
      ).resolves.toBeUndefined();
    });

    it("hydrateSessions returns null", async () => {
      const result = await hydrateSessions();
      expect(result).toBeNull();
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  // ── Tauri runtime — successful invoke calls ──────────────

  describe("Tauri runtime — successful invocations", () => {
    beforeEach(() => {
      setTauriMode();
      mockInvoke.mockResolvedValue(undefined);
    });

    it("persistCreateSession calls invoke with correct args", async () => {
      await persistCreateSession("s1", "My Chat", "gpt-4", "openai");
      expect(mockInvoke).toHaveBeenCalledWith("create_session", {
        id: "s1",
        title: "My Chat",
        model: "gpt-4",
        provider: "openai",
      });
    });

    it("persistDeleteSession calls invoke with correct args", async () => {
      await persistDeleteSession("s1");
      expect(mockInvoke).toHaveBeenCalledWith("delete_session", { id: "s1" });
    });

    it("persistUpdateSessionTitle calls invoke with correct args", async () => {
      await persistUpdateSessionTitle("s1", "Updated Title");
      expect(mockInvoke).toHaveBeenCalledWith("update_session_title", {
        id: "s1",
        title: "Updated Title",
      });
    });

    it("persistArchiveSession(true) calls set_setting with 'true'", async () => {
      await persistArchiveSession("s1", true);
      expect(mockInvoke).toHaveBeenCalledWith("set_setting", {
        key: "session.s1.archived",
        value: "true",
      });
    });

    it("persistArchiveSession(false) calls set_setting with 'false'", async () => {
      await persistArchiveSession("s1", false);
      expect(mockInvoke).toHaveBeenCalledWith("set_setting", {
        key: "session.s1.archived",
        value: "false",
      });
    });

    it("persistAddMessage calls invoke with correct args (with model)", async () => {
      await persistAddMessage("s1", "m1", "assistant", "response", "gpt-4");
      expect(mockInvoke).toHaveBeenCalledWith("add_message", {
        sessionId: "s1",
        id: "m1",
        role: "assistant",
        content: "response",
        model: "gpt-4",
      });
    });

    it("persistAddMessage passes null when model is omitted", async () => {
      await persistAddMessage("s1", "m1", "user", "hello");
      expect(mockInvoke).toHaveBeenCalledWith("add_message", {
        sessionId: "s1",
        id: "m1",
        role: "user",
        content: "hello",
        model: null,
      });
    });

    it("persistUpdateMessageContent calls invoke with correct args", async () => {
      await persistUpdateMessageContent("s1", "m1", "updated");
      expect(mockInvoke).toHaveBeenCalledWith("update_message_content", {
        messageId: "m1",
        content: "updated",
      });
    });
  });

  // ── Error handling ───────────────────────────────────────

  describe("error handling", () => {
    beforeEach(() => setTauriMode());

    it("persistCreateSession catches invoke error and reports", async () => {
      mockInvoke.mockRejectedValue(new Error("db fail"));
      await persistCreateSession("s1", "t", "m", "p");
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.create_session",
      );
    });

    it("persistDeleteSession catches invoke error and reports", async () => {
      mockInvoke.mockRejectedValue(new Error("db fail"));
      await persistDeleteSession("s1");
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.delete_session",
      );
    });

    it("persistUpdateSessionTitle catches invoke error and reports", async () => {
      mockInvoke.mockRejectedValue(new Error("db fail"));
      await persistUpdateSessionTitle("s1", "t");
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.update_session_title",
      );
    });

    it("persistArchiveSession catches invoke error and reports", async () => {
      mockInvoke.mockRejectedValue(new Error("db fail"));
      await persistArchiveSession("s1", true);
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.archive_session",
      );
    });

    it("persistAddMessage catches invoke error and reports", async () => {
      mockInvoke.mockRejectedValue(new Error("db fail"));
      await persistAddMessage("s1", "m1", "user", "hello");
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.add_message",
      );
    });

    it("persistUpdateMessageContent catches invoke error and reports", async () => {
      mockInvoke.mockRejectedValue(new Error("db fail"));
      await persistUpdateMessageContent("s1", "m1", "hello");
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.update_message_content",
      );
    });
  });

  // ── hydrateSessions ──────────────────────────────────────

  describe("hydrateSessions", () => {
    it("returns hydrated sessions with messages", async () => {
      setTauriMode();

      // Mock list_sessions
      mockInvoke.mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
        if (cmd === "list_sessions") {
          return [
            {
              id: "s1",
              title: "Chat 1",
              model: "gpt-4",
              provider: "openai",
              workingDir: null,
              mode: "code",
              createdAt: "2025-01-01T00:00:00Z",
              updatedAt: "2025-01-01T01:00:00Z",
            },
          ];
        }
        if (cmd === "get_setting") {
          // session.s1.archived
          return { key: "session.s1.archived", value: "false" };
        }
        if (cmd === "get_session_messages") {
          return [
            {
              id: "m1",
              sessionId: "s1",
              role: "user",
              content: "hello",
              model: null,
              toolCalls: null,
              toolCallId: null,
              tokenInput: 5,
              tokenOutput: 0,
              costUsd: 0,
              createdAt: "2025-01-01T00:01:00Z",
            },
            {
              id: "m2",
              sessionId: "s1",
              role: "assistant",
              content: "world",
              model: "gpt-4",
              toolCalls: null,
              toolCallId: null,
              tokenInput: 5,
              tokenOutput: 10,
              costUsd: 0.001,
              createdAt: "2025-01-01T00:01:05Z",
            },
          ];
        }
        return null;
      });

      const result = await hydrateSessions();

      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);

      const session = result![0];
      expect(session.id).toBe("s1");
      expect(session.title).toBe("Chat 1");
      expect(session.model).toBe("gpt-4");
      expect(session.provider).toBe("openai");
      expect(session.archived).toBe(false);
      expect(session.createdAt).toBe("2025-01-01T00:00:00Z");
      expect(session.updatedAt).toBe("2025-01-01T01:00:00Z");

      expect(session.messages).toHaveLength(2);
      expect(session.messages[0]).toEqual({
        id: "m1",
        role: "user",
        content: "hello",
        model: undefined,
        timestamp: "2025-01-01T00:01:00Z",
      });
      expect(session.messages[1]).toEqual({
        id: "m2",
        role: "assistant",
        content: "world",
        model: "gpt-4",
        timestamp: "2025-01-01T00:01:05Z",
      });
    });

    it("marks session as archived when setting is 'true'", async () => {
      setTauriMode();

      mockInvoke.mockImplementation((cmd: string, _args?: Record<string, unknown>) => {
        if (cmd === "list_sessions") {
          return [
            {
              id: "s2",
              title: "Archived Chat",
              model: "claude",
              provider: "anthropic",
              workingDir: null,
              mode: "code",
              createdAt: "2025-02-01T00:00:00Z",
              updatedAt: "2025-02-01T01:00:00Z",
            },
          ];
        }
        if (cmd === "get_setting") {
          return { key: "session.s2.archived", value: "true" };
        }
        if (cmd === "get_session_messages") {
          return [];
        }
        return null;
      });

      const result = await hydrateSessions();
      expect(result).not.toBeNull();
      expect(result![0].archived).toBe(true);
      expect(result![0].messages).toEqual([]);
    });

    it("treats missing archive setting as not archived", async () => {
      setTauriMode();

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "list_sessions") {
          return [
            {
              id: "s3",
              title: "Chat",
              model: "gpt-4",
              provider: "openai",
              workingDir: null,
              mode: "code",
              createdAt: "2025-01-01T00:00:00Z",
              updatedAt: "2025-01-01T00:00:00Z",
            },
          ];
        }
        if (cmd === "get_setting") {
          return null; // no setting found
        }
        if (cmd === "get_session_messages") {
          return [];
        }
        return null;
      });

      const result = await hydrateSessions();
      expect(result).not.toBeNull();
      expect(result![0].archived).toBe(false);
    });

    it("returns null when list_sessions throws", async () => {
      setTauriMode();
      mockInvoke.mockRejectedValue(new Error("db connection lost"));

      const result = await hydrateSessions();
      expect(result).toBeNull();
      expect(reportError).toHaveBeenCalledWith(
        expect.any(Error),
        "persistence.hydrateSessions",
      );
    });

    it("handles empty sessions list", async () => {
      setTauriMode();
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === "list_sessions") {
          return [];
        }
        return null;
      });

      const result = await hydrateSessions();
      expect(result).toEqual([]);
    });
  });
});
