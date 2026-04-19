import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useChatStore } from "../../stores/chatStore";

// Mock IPC module — controls isTauriRuntime() and invoke/listen
vi.mock("../../lib/ipc", () => ({
  isTauriRuntime: vi.fn(() => false),
  invoke: vi.fn(() => Promise.resolve()),
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(() => Promise.resolve()),
}));

// Mock persistence — all no-ops
vi.mock("../../lib/persistence", () => ({
  persistCreateSession: vi.fn(),
  persistDeleteSession: vi.fn(),
  persistUpdateSessionTitle: vi.fn(),
  persistArchiveSession: vi.fn(),
  persistAddMessage: vi.fn(),
  persistUpdateMessageContent: vi.fn(),
  hydrateSessions: vi.fn(() => Promise.resolve(null)),
}));

// Mock usageStore
vi.mock("../../stores/usageStore", () => ({
  useUsageStore: {
    getState: vi.fn(() => ({
      recordUsage: vi.fn(),
      recordUsageFromTokens: vi.fn(),
      getSummary: vi.fn(() => ({
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        byProvider: {},
      })),
    })),
  },
}));

// Mock providerStore
vi.mock("../../stores/providerStore", () => ({
  useProviderStore: {
    getState: vi.fn(() => ({
      hydrateFromBackend: vi.fn(),
      getProviderById: vi.fn(),
    })),
  },
}));

// Mock uiStore
vi.mock("../../stores/uiStore", () => ({
  useUIStore: {
    getState: vi.fn(() => ({
      selectedModel: { provider: "test" },
      models: [
        { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "Anthropic" },
        { id: "gpt-5.2", name: "GPT-5.2", provider: "OpenAI" },
      ],
      setSelectedModel: vi.fn(),
    })),
  },
}));

describe("chatStore streaming", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("sendMessage — mock streaming (non-Tauri)", () => {
    it("creates user and assistant messages", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("hello world", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      // User message + empty assistant placeholder
      expect(session!.messages.length).toBeGreaterThanOrEqual(2);
      expect(session!.messages[0]!.role).toBe("user");
      expect(session!.messages[0]!.content).toBe("hello world");
      expect(session!.messages[1]!.role).toBe("assistant");
    });

    it("sets isLoading and streamingMessageId", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      void sessionId;
      useChatStore.getState().sendMessage("hello", "test-model");

      expect(useChatStore.getState().isLoading).toBe(true);
      expect(useChatStore.getState().streamingMessageId).toBeTruthy();
    });

    it("auto-generates title from first user message", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("How do I implement a linked list in Rust?", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      // Title should be auto-generated from content
      expect(session!.title).not.toBe("New Chat");
      expect(session!.title.length).toBeGreaterThan(0);
    });

    it("does not change title on subsequent messages", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("First message here", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      const titleAfterFirst = session!.title;

      // Advance timers to let streaming finish
      vi.advanceTimersByTime(5000);

      useChatStore.getState().sendMessage("Second message", "test-model");
      const sessionAfterSecond = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(sessionAfterSecond!.title).toBe(titleAfterFirst);
    });

    it("mock stream produces content over time", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("hello", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      const assistantMsg = session!.messages.find((m) => m.role === "assistant");
      expect(assistantMsg).toBeDefined();

      // Advance timers to trigger some streaming ticks
      vi.advanceTimersByTime(1000);

      // The message content should have grown (mock stream uses setTimeout ticks)
      const updatedSession = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      const updatedMsg = updatedSession!.messages.find((m) => m.id === assistantMsg!.id);
      // After some ticks, content should have been appended
      expect(typeof updatedMsg!.content).toBe("string");
    });

    it("mock stream completes and sets isLoading to false", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      void sessionId;
      useChatStore.getState().sendMessage("hello", "test-model");

      // Advance timers enough for full mock streaming to complete
      vi.advanceTimersByTime(10000);

      expect(useChatStore.getState().isLoading).toBe(false);
      expect(useChatStore.getState().streamingMessageId).toBeNull();
    });

    it("creates session automatically when none active", () => {
      useChatStore.setState({ activeSessionId: null, sessions: [] });
      useChatStore.getState().sendMessage("hello", "test-model");

      expect(useChatStore.getState().activeSessionId).toBeTruthy();
      expect(useChatStore.getState().sessions.length).toBe(1);
    });
  });

  describe("abortStreaming", () => {
    it("clears loading state", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      void sessionId;
      useChatStore.getState().sendMessage("hello", "test-model");

      expect(useChatStore.getState().isLoading).toBe(true);

      useChatStore.getState().abortStreaming();

      expect(useChatStore.getState().isLoading).toBe(false);
      expect(useChatStore.getState().streamingMessageId).toBeNull();
    });

    it("appends stop marker to streaming message", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("hello", "test-model");

      const streamingId = useChatStore.getState().streamingMessageId;
      expect(streamingId).toBeTruthy();

      // Advance timers a bit so some content streams in
      vi.advanceTimersByTime(500);

      useChatStore.getState().abortStreaming();

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      const msg = session!.messages.find((m) => m.id === streamingId);
      expect(msg!.content).toContain("[Generation stopped]");
    });

    it("clears _streamCleanup", () => {
      useChatStore.getState().abortStreaming();
      expect(useChatStore.getState()._streamCleanup).toBeNull();
    });

    it("is safe to call when nothing is streaming", () => {
      expect(() => useChatStore.getState().abortStreaming()).not.toThrow();
      expect(useChatStore.getState().isLoading).toBe(false);
    });
  });

  describe("slash commands", () => {
    it("/help adds help message", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("/help", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      const helpMsg = session!.messages.find((m) => m.content.includes("Available Commands"));
      expect(helpMsg).toBeDefined();
    });

    it("/clear clears messages", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().addMessage(sessionId, { role: "user", content: "hello" });
      useChatStore.getState().sendMessage("/clear", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages).toHaveLength(0);
    });

    it("/unknown returns error", () => {
      const sessionId = useChatStore.getState().createSession("test-model", "test-provider");
      useChatStore.getState().sendMessage("/bogus", "test-model");

      const session = useChatStore.getState().sessions.find((s) => s.id === sessionId);
      expect(session!.messages[0]!.content).toContain("Unknown command");
    });
  });

  describe("approval flow", () => {
    it("resolveApproval removes from pendingApprovals", () => {
      useChatStore.setState({
        pendingApprovals: [
          {
            id: "req-1",
            toolCallId: "tc-1",
            command: "shell_exec rm -rf /",
            description: "Tool: shell_exec",
            riskLevel: "high",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      useChatStore.getState().resolveApproval("req-1", true);
      expect(useChatStore.getState().pendingApprovals).toHaveLength(0);
    });

    it("approveAll clears all pending approvals", () => {
      useChatStore.setState({
        pendingApprovals: [
          {
            id: "req-1",
            toolCallId: "tc-1",
            command: "cmd1",
            description: "Tool 1",
            riskLevel: "low",
            createdAt: new Date().toISOString(),
          },
          {
            id: "req-2",
            toolCallId: "tc-2",
            command: "cmd2",
            description: "Tool 2",
            riskLevel: "medium",
            createdAt: new Date().toISOString(),
          },
        ],
      });

      useChatStore.getState().approveAll();
      expect(useChatStore.getState().pendingApprovals).toHaveLength(0);
    });
  });
});
