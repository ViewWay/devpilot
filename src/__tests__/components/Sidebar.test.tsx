import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";

// Mock the IPC layer so searchMessages returns empty results
vi.mock("../../lib/ipc", () => ({
  isTauriRuntime: () => false,
  invoke: vi.fn().mockResolvedValue([]),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      streamingMessageId: null,
    });
    useUIStore.setState({ sidebarOpen: true });
  });

  it("renders the sidebar with new chat button", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    renderWithProviders(<Sidebar />);

    // Should have a new chat button
    expect(screen.getByRole("button", { name: /new|chat/i })).toBeInTheDocument();
  });

  it("creates a new session when clicking new chat button", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    const newChatBtn = screen.getByRole("button", { name: /new|chat/i });
    await user.click(newChatBtn);

    expect(useChatStore.getState().sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("displays session list after creating sessions", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    // Create two sessions
    await user.click(screen.getByRole("button", { name: /new|chat/i }));
    await user.click(screen.getByRole("button", { name: /new|chat/i }));

    // Should show session items (they have "New Chat" title)
    const sessions = screen.getAllByText(/New Chat/i);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it("shows search input", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    renderWithProviders(<Sidebar />);

    // Sidebar should have a search box
    const searchInput = screen.getByPlaceholderText(/search/i);
    expect(searchInput).toBeInTheDocument();
  });

  it("filters sessions when typing short search query (local filter)", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();

    // Pre-create sessions with different titles
    const id1 = useChatStore.getState().createSession("Claude 4 Sonnet", "Anthropic");
    const id2 = useChatStore.getState().createSession("GPT-5.2", "OpenAI");
    useChatStore.getState().updateSessionTitle(id1, "Rust Project");
    useChatStore.getState().updateSessionTitle(id2, "Python Scripts");

    renderWithProviders(<Sidebar />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    // Type "Ru" (2 chars) — stays in local session filter mode (< 3 chars threshold)
    await user.type(searchInput, "Ru");

    // Should show "Rust Project" but not "Python Scripts"
    expect(screen.getByText("Rust Project")).toBeInTheDocument();
    expect(screen.queryByText("Python Scripts")).not.toBeInTheDocument();
  });

  it("shows clear button when search query is entered", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "test");

    // Should show the X clear button
    const clearButton = searchInput.parentElement!.querySelector("button");
    expect(clearButton).toBeInTheDocument();
  });
});
