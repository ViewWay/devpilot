import { describe, it, expect, beforeEach } from "vitest";
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
      // Should still return an id, but no session affected
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
      // Should switch to id2 (first non-archived)
      expect(useChatStore.getState().activeSessionId).toBe(id2);
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
});
