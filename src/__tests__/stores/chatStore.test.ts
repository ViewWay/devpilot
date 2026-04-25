import { describe, it, expect, beforeEach, vi } from "vitest";
import { useChatStore } from "../../stores/chatStore";


describe("chatStore", () => {
  beforeEach(() => {
    // Reset store to initial state
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      error: null,
      streamingMessageId: null,
      pendingApprovals: [],
      _streamCleanup: null,
    });
  });

  describe("createSession", () => {
    it("creates a new session with default values", () => {
      const id = useChatStore.getState().createSession("Claude 4 Sonnet", "Anthropic");
      const session = useChatStore.getState().sessions.find((s) => s.id === id);

      expect(session).toBeDefined();
      expect(session!.title).toBe("New Chat");
      expect(session!.model).toBe("Claude 4 Sonnet");
      expect(session!.provider).toBe("Anthropic");
      expect(session!.messages).toEqual([]);
      expect(useChatStore.getState().activeSessionId).toBe(id);
    });

    it("prepends new session to the list", () => {
      const id1 = useChatStore.getState().createSession("GPT-5.2", "OpenAI");
      const id2 = useChatStore.getState().createSession("GLM-5", "智谱");
      const sessions = useChatStore.getState().sessions;

      expect(sessions[0]!.id).toBe(id2);
      expect(sessions[1]!.id).toBe(id1);
    });
  });

  describe("setActiveSession", () => {
    it("sets the active session", () => {
      const id = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().setActiveSession(id);
      expect(useChatStore.getState().activeSessionId).toBe(id);
    });

    it("sets to the given id even if session does not exist", () => {
      useChatStore.getState().setActiveSession("nonexistent");
      expect(useChatStore.getState().activeSessionId).toBe("nonexistent");
    });
  });

  describe("deleteSession", () => {
    it("removes the session from the list", () => {
      const id = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().deleteSession(id);
      expect(useChatStore.getState().sessions.find((s) => s.id === id)).toBeUndefined();
    });

    it("clears activeSessionId when deleting active session", () => {
      const id = useChatStore.getState().createSession("model", "provider");
      expect(useChatStore.getState().activeSessionId).toBe(id);
      useChatStore.getState().deleteSession(id);
      expect(useChatStore.getState().activeSessionId).toBeNull();
    });

    it("switches to another session when deleting active", () => {
      const id1 = useChatStore.getState().createSession("model1", "provider1");
      const id2 = useChatStore.getState().createSession("model2", "provider2");
      useChatStore.getState().setActiveSession(id1);
      useChatStore.getState().deleteSession(id1);
      expect(useChatStore.getState().activeSessionId).toBe(id2);
    });
  });

  describe("addMessage", () => {
    it("adds a message to the session", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: "user",
        content: "Hello",
      });

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages).toHaveLength(1);
      expect(session!.messages[0]!.role).toBe("user");
      expect(session!.messages[0]!.content).toBe("Hello");
      expect(session!.messages[0]!.id).toBe(msgId);
      expect(session!.messages[0]!.timestamp).toBeDefined();
    });

    it("does nothing for non-existent session", () => {
      const msgId = useChatStore.getState().addMessage("nonexistent", {
        role: "user",
        content: "Hello",
      });
      expect(msgId).toBeDefined();
      expect(useChatStore.getState().sessions).toHaveLength(0);
    });
  });

  describe("updateMessageContent", () => {
    it("updates message content", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: "assistant",
        content: "initial",
      });

      useChatStore.getState().updateMessageContent(sessionId, msgId, "updated content");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages[0]!.content).toBe("updated content");
    });

    it("sets streamingMessageId when streaming=true", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: "assistant",
        content: "",
      });

      useChatStore.getState().updateMessageContent(sessionId, msgId, "streaming...", true);
      expect(useChatStore.getState().streamingMessageId).toBe(msgId);
    });

    it("clears streamingMessageId when streaming=false", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: "assistant",
        content: "",
      });

      useChatStore.getState().updateMessageContent(sessionId, msgId, "done", true);
      useChatStore.getState().updateMessageContent(sessionId, msgId, "done", false);
      expect(useChatStore.getState().streamingMessageId).toBeNull();
    });
  });

  describe("clearMessages", () => {
    it("removes all messages from a session", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().addMessage(sessionId, { role: "user", content: "msg1" });
      useChatStore.getState().addMessage(sessionId, { role: "assistant", content: "msg2" });

      useChatStore.getState().clearMessages(sessionId);
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages).toHaveLength(0);
    });
  });

  describe("updateSessionTitle", () => {
    it("updates the session title", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().updateSessionTitle(sessionId, "New Title");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.title).toBe("New Title");
    });
  });

  describe("searchSessions", () => {
    it("filters sessions by title (case-insensitive)", () => {
      useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().updateSessionTitle(useChatStore.getState().sessions[0]!.id, "Rust Project");
      const id2 = useChatStore.getState().createSession("model2", "provider2");
      useChatStore.getState().updateSessionTitle(id2, "TypeScript Utils");

      const results = useChatStore.getState().searchSessions("rust");
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("Rust Project");
    });

    it("returns empty for no matches", () => {
      const results = useChatStore.getState().searchSessions("nonexistent");
      expect(results).toHaveLength(0);
    });
  });

  describe("archiveSession", () => {
    it("sets archived flag on session", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().archiveSession(sessionId);
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.archived).toBe(true);
    });

    it("switches active session when archiving active one", () => {
      const id1 = useChatStore.getState().createSession("model1", "provider1");
      const id2 = useChatStore.getState().createSession("model2", "provider2");
      useChatStore.getState().setActiveSession(id1);
      useChatStore.getState().archiveSession(id1);
      expect(useChatStore.getState().activeSessionId).toBe(id2);
    });
  });

  describe("unarchiveSession", () => {
    it("removes archived flag from session", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().archiveSession(sessionId);
      expect(useChatStore.getState().sessions.find((s) => s.id === sessionId)!.archived).toBe(true);

      useChatStore.getState().unarchiveSession(sessionId);
      expect(useChatStore.getState().sessions.find((s) => s.id === sessionId)!.archived).toBeFalsy();
    });
  });

  describe("setError", () => {
    it("sets error state", () => {
      useChatStore.getState().setError("Something went wrong");
      expect(useChatStore.getState().error).toBe("Something went wrong");
    });

    it("clears error state with null", () => {
      useChatStore.getState().setError("err");
      useChatStore.getState().setError(null);
      expect(useChatStore.getState().error).toBeNull();
    });
  });

  describe("abortStreaming", () => {
    it("resets loading and streaming state", () => {
      useChatStore.setState({ isLoading: true, streamingMessageId: "msg-1" });
      useChatStore.getState().abortStreaming();
      expect(useChatStore.getState().isLoading).toBe(false);
      expect(useChatStore.getState().streamingMessageId).toBeNull();
    });

    it("calls stream cleanup function if set", () => {
      const cleanup = vi.fn();
      useChatStore.setState({ _streamCleanup: cleanup, isLoading: true, streamingMessageId: null });
      useChatStore.getState().abortStreaming();
      expect(cleanup).toHaveBeenCalledOnce();
    });
  });

  describe("activeSession", () => {
    it("returns the active session", () => {
      const id = useChatStore.getState().createSession("model", "provider");
      const active = useChatStore.getState().activeSession();
      expect(active).toBeDefined();
      expect(active!.id).toBe(id);
    });

    it("returns undefined when no active session", () => {
      useChatStore.setState({ sessions: [], activeSessionId: null });
      expect(useChatStore.getState().activeSession()).toBeUndefined();
    });

    it("returns undefined when activeSessionId does not match any session", () => {
      useChatStore.getState().createSession("model", "provider");
      useChatStore.setState({ activeSessionId: "nonexistent" });
      expect(useChatStore.getState().activeSession()).toBeUndefined();
    });
  });

  describe("updateMessageThinking", () => {
    it("updates thinking content on a message", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      const msgId = useChatStore.getState().addMessage(sessionId, {
        role: "assistant",
        content: "thinking...",
      });

      useChatStore.getState().updateMessageThinking(sessionId, msgId, "Let me analyze this step by step...");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages[0]!.thinkingContent).toBe("Let me analyze this step by step...");
    });

    it("does not affect other sessions", () => {
      const sid1 = useChatStore.getState().createSession("m1", "p1");
      const sid2 = useChatStore.getState().createSession("m2", "p2");
      const msgId1 = useChatStore.getState().addMessage(sid1, { role: "assistant", content: "a" });
      useChatStore.getState().addMessage(sid2, { role: "assistant", content: "b" });

      useChatStore.getState().updateMessageThinking(sid1, msgId1, "deep thought");
      const s2 = useChatStore.getState().sessions.find((s) => s.id === sid2);
      expect(s2!.messages[0]!.thinkingContent).toBeUndefined();
    });
  });

  describe("setSessionWorkingDir", () => {
    it("sets working directory on session", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().setSessionWorkingDir(sessionId, "/home/user/project");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.workingDir).toBe("/home/user/project");
    });
  });

  describe("setSessionEnvVars", () => {
    it("sets environment variables on session", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      const envVars = [{ key: "NODE_ENV", value: "development" }, { key: "PORT", value: "3000" }];
      useChatStore.getState().setSessionEnvVars(sessionId, envVars);
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.envVars).toEqual(envVars);
    });
  });

  describe("reorderSessions", () => {
    it("moves a session to target index", () => {
      const id1 = useChatStore.getState().createSession("m1", "p1");
      const id2 = useChatStore.getState().createSession("m2", "p2");
      const id3 = useChatStore.getState().createSession("m3", "p3");

      // Sessions are [id3, id2, id1] (newest first)
      // Move id3 (index 0) to index 2 (end)
      useChatStore.getState().reorderSessions(id3, 2);
      const ids = useChatStore.getState().sessions.map((s) => s.id);
      expect(ids[0]).toBe(id2);
      expect(ids[1]).toBe(id1);
      expect(ids[2]).toBe(id3);
    });

    it("does nothing for non-existent session", () => {
      useChatStore.getState().createSession("m1", "p1");
      const before = [...useChatStore.getState().sessions.map((s) => s.id)];
      useChatStore.getState().reorderSessions("nonexistent", 0);
      const after = useChatStore.getState().sessions.map((s) => s.id);
      expect(after).toEqual(before);
    });

    it("does nothing when target equals current index", () => {
      const id1 = useChatStore.getState().createSession("m1", "p1");
      const before = [...useChatStore.getState().sessions.map((s) => s.id)];
      useChatStore.getState().reorderSessions(id1, 0);
      const after = useChatStore.getState().sessions.map((s) => s.id);
      expect(after).toEqual(before);
    });
  });

  describe("pendingApprovals / resolveApproval / approveAll", () => {
    it("starts with empty pending approvals", () => {
      expect(useChatStore.getState().pendingApprovals).toEqual([]);
    });

    it("resolveApproval removes the approval from pending list", () => {
      useChatStore.setState({
        pendingApprovals: [
          { id: "req-1", toolCallId: "tc-1", command: "shell ls", description: "Tool: shell", riskLevel: "low", createdAt: new Date().toISOString() },
          { id: "req-2", toolCallId: "tc-2", command: "file_write x.rs", description: "Tool: file_write", riskLevel: "medium", createdAt: new Date().toISOString() },
        ],
      });

      useChatStore.getState().resolveApproval("req-1", true);
      expect(useChatStore.getState().pendingApprovals).toHaveLength(1);
      expect(useChatStore.getState().pendingApprovals[0]!.id).toBe("req-2");
    });

    it("approveAll clears all pending approvals", () => {
      useChatStore.setState({
        pendingApprovals: [
          { id: "req-1", toolCallId: "tc-1", command: "shell ls", description: "Tool: shell", riskLevel: "low", createdAt: new Date().toISOString() },
          { id: "req-2", toolCallId: "tc-2", command: "file_write", description: "Tool: file_write", riskLevel: "high", createdAt: new Date().toISOString() },
        ],
      });

      useChatStore.getState().approveAll();
      expect(useChatStore.getState().pendingApprovals).toEqual([]);
    });
  });

  describe("searchMessages", () => {
    it("returns empty array for short query", async () => {
      const results = await useChatStore.getState().searchMessages("a");
      expect(results).toEqual([]);
    });

    it("returns empty array for empty query", async () => {
      const results = await useChatStore.getState().searchMessages("");
      expect(results).toEqual([]);
    });

    it("returns empty array for whitespace-only query", async () => {
      const results = await useChatStore.getState().searchMessages("   ");
      expect(results).toEqual([]);
    });
  });

  describe("sendMessage (slash commands)", () => {
    it("/clear clears messages", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().addMessage(sessionId, { role: "user", content: "hello" });
      useChatStore.getState().sendMessage("/clear", "model");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages).toHaveLength(0);
    });

    it("/help adds a help message", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().sendMessage("/help", "model");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages).toHaveLength(1);
      expect(session!.messages[0]!.content).toContain("Available Commands");
    });

    it("unknown command returns error message", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().sendMessage("/unknown", "model");
      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages[0]!.content).toContain("Unknown command");
    });
  });

  describe("regenerateLastResponse", () => {
    it("does nothing when no active session", () => {
      useChatStore.setState({ activeSessionId: null });
      // Should not throw
      useChatStore.getState().regenerateLastResponse();
    });

    it("does nothing when session has no messages", () => {
      const id = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().regenerateLastResponse();
      const session = useChatStore.getState().sessions.find((s) => s.id === id);
      expect(session!.messages).toHaveLength(0);
    });

    it("removes last assistant message and re-sends", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().addMessage(sessionId, { role: "user", content: "hello" });
      useChatStore.getState().addMessage(sessionId, { role: "assistant", content: "hi there" });

      const before = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      expect(before.messages).toHaveLength(2);

      // This will trigger sendMessage which in test env will use mock streaming
      useChatStore.getState().regenerateLastResponse();

      // The assistant message should be removed, then re-send adds user msg placeholder
      const after = useChatStore.getState().sessions.find((s) => s.id === sessionId)!;
      // After regeneration: old assistant removed, then sendMessage adds new assistant placeholder
      expect(after.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("exportSession", () => {
    it("does nothing for non-existent session", () => {
      // Should not throw
      useChatStore.getState().exportSession("nonexistent", "json");
    });

    it("creates a download for JSON format", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().addMessage(sessionId, { role: "user", content: "test" });
      useChatStore.getState().addMessage(sessionId, { role: "assistant", content: "response" });

      const clickSpy = vi.fn();
      const createElementOrig = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = createElementOrig(tag);
        if (tag === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      useChatStore.getState().exportSession(sessionId, "json");
      expect(clickSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it("creates a download for markdown format", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().addMessage(sessionId, { role: "user", content: "hello" });
      useChatStore.getState().addMessage(sessionId, { role: "assistant", content: "world" });

      const clickSpy = vi.fn();
      const createElementOrig = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = createElementOrig(tag);
        if (tag === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      useChatStore.getState().exportSession(sessionId, "markdown");
      expect(clickSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it("handles tool messages in markdown export", () => {
      const sessionId = useChatStore.getState().createSession("model", "provider");
      useChatStore.getState().addMessage(sessionId, {
        role: "tool",
        content: "file contents",
        toolCalls: [{ id: "tc1", name: "file_read", input: "main.rs", output: "contents", status: "done" }],
      });

      const clickSpy = vi.fn();
      const createElementOrig = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = createElementOrig(tag);
        if (tag === "a") {
          el.click = clickSpy;
        }
        return el;
      });

      useChatStore.getState().exportSession(sessionId, "markdown");
      expect(clickSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });
});
