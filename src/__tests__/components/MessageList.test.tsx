import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useChatStore } from "../../stores/chatStore";

vi.mock("../../stores/chatStore", async () => {
  const actual = await vi.importActual("../../stores/chatStore");
  return {
    ...actual,
    useChatStore: actual.useChatStore,
  };
});

describe("MessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      streamingMessageId: null,
    });
  });

  it("shows empty state when no session is active", async () => {
    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    expect(screen.getByText("DevPilot")).toBeInTheDocument();
  });

  it("shows empty state when session has no messages", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test Session",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    expect(screen.getByText("DevPilot")).toBeInTheDocument();
  });

  it("renders user messages", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test Session",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: "m1",
              role: "user",
              content: "Hello, how are you?",
              timestamp: "10:00",
            },
          ],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    expect(screen.getByText("Hello, how are you?")).toBeInTheDocument();
  });

  it("renders assistant messages with markdown", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test Session",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: "m1",
              role: "user",
              content: "Explain Rust",
              timestamp: "10:00",
            },
            {
              id: "m2",
              role: "assistant",
              content: "Rust is a **systems programming language** focused on safety.",
              model: "Claude 4 Sonnet",
              timestamp: "10:01",
            },
          ],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    // Markdown renders "systems programming language" in a <strong> tag
    expect(screen.getByText("systems programming language")).toBeInTheDocument();
    // Model name should be displayed
    expect(screen.getByText("Claude 4 Sonnet")).toBeInTheDocument();
  });

  it("renders tool messages", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test Session",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            {
              id: "m1",
              role: "user",
              content: "Read the file",
              timestamp: "10:00",
            },
            {
              id: "m2",
              role: "tool",
              content: "📄 file_read: test.rs (42 lines)",
              timestamp: "10:01",
            },
          ],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    expect(screen.getByText(/file_read/)).toBeInTheDocument();
  });

  it("renders multiple messages in order", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test Session",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            { id: "m1", role: "user", content: "First", timestamp: "10:00" },
            { id: "m2", role: "assistant", content: "Second", timestamp: "10:01" },
            { id: "m3", role: "user", content: "Third", timestamp: "10:02" },
          ],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("shows streaming cursor on streaming message", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test Session",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            { id: "m1", role: "user", content: "Hello", timestamp: "10:00" },
            {
              id: "m2",
              role: "assistant",
              content: "Generating...",
              timestamp: "10:01",
              streaming: true,
            },
          ],
        },
      ],
      activeSessionId: "s1",
      streamingMessageId: "m2",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    const { container } = renderWithProviders(<MessageList />);
    // Streaming message should have an animated cursor (pulse class)
    const cursor = container.querySelector(".animate-pulse");
    expect(cursor).toBeInTheDocument();
  });

  it("renders messages for a specific sessionId prop", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Session 1",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            { id: "m1", role: "user", content: "Message in S1", timestamp: "10:00" },
          ],
        },
        {
          id: "s2",
          title: "Session 2",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            { id: "m2", role: "user", content: "Message in S2", timestamp: "10:00" },
          ],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList sessionId="s2" />);
    expect(screen.getByText("Message in S2")).toBeInTheDocument();
    expect(screen.queryByText("Message in S1")).not.toBeInTheDocument();
  });

  it("renders thinking content when present", async () => {
    useChatStore.setState({
      sessions: [
        {
          id: "s1",
          title: "Test",
          model: "test-model",
          provider: "test-provider",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messages: [
            { id: "m1", role: "user", content: "Think", timestamp: "10:00" },
            {
              id: "m2",
              role: "assistant",
              content: "The answer is 42.",
              timestamp: "10:01",
              thinkingContent: "Let me reason through this...",
            },
          ],
        },
      ],
      activeSessionId: "s1",
    });

    const { MessageList } = await import("../../components/chat/MessageList");
    renderWithProviders(<MessageList />);
    // The ThinkingBlock is collapsed by default (not streaming), so content is hidden
    // but the main assistant message content is visible
    expect(screen.getByText("The answer is 42.")).toBeInTheDocument();
    // The thinking toggle button should be present (i18n resolves: showThinking → "Show thinking")
    expect(screen.getByText("Show thinking")).toBeInTheDocument();
  });
});
