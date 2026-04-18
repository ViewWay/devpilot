import { describe, it, expect, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useChatStore } from "../../stores/chatStore";
import { useUIStore } from "../../stores/uiStore";

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

  it("filters sessions when typing in search", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();

    // Pre-create sessions with different titles
    const id1 = useChatStore.getState().createSession("Claude 4 Sonnet", "Anthropic");
    const id2 = useChatStore.getState().createSession("GPT-5.2", "OpenAI");
    useChatStore.getState().updateSessionTitle(id1, "Rust Project");
    useChatStore.getState().updateSessionTitle(id2, "Python Scripts");

    renderWithProviders(<Sidebar />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "Rust");

    // Should show "Rust Project" but not "Python Scripts"
    expect(screen.getByText("Rust Project")).toBeInTheDocument();
    expect(screen.queryByText("Python Scripts")).not.toBeInTheDocument();
  });
});
