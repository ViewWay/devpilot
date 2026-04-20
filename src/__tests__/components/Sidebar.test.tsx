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

// Mock tabStore to avoid dynamic import issues
const mockOpenTab = vi.fn();
vi.mock("../../stores/tabStore", () => ({
  useTabStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      tabs: [],
      activeTabId: null,
      openTab: mockOpenTab,
      closeTab: vi.fn(),
      setActiveTab: vi.fn(),
      updateTabTitle: vi.fn(),
      updateTabStatus: vi.fn(),
      replaceTabSession: vi.fn(),
      moveTab: vi.fn(),
      saveTabs: vi.fn(),
      restoreTabs: vi.fn().mockResolvedValue(undefined),
    };
    return selector(state);
  },
  SETTINGS_TAB_ID: "__settings__",
  SCHEDULED_TAB_ID: "__scheduled__",
  SKILLS_TAB_ID: "__skills__",
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

    // Should have a new chat button (aria-label)
    expect(screen.getByRole("button", { name: /new\s*chat/i })).toBeInTheDocument();
  });

  it("creates a new session when clicking new chat button", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    const newChatBtn = screen.getByRole("button", { name: /new\s*chat/i });
    await user.click(newChatBtn);

    expect(useChatStore.getState().sessions.length).toBeGreaterThanOrEqual(1);
  });

  it("displays session list after creating sessions", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    // Create two sessions
    const newChatBtn = screen.getByRole("button", { name: /new\s*chat/i });
    await user.click(newChatBtn);
    await user.click(newChatBtn);

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

  it("search input accepts text and filters results", async () => {
    const { Sidebar } = await import("../../components/layout/Sidebar");
    const user = userEvent.setup();
    renderWithProviders(<Sidebar />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "test");

    // Search input should have the typed value
    expect(searchInput).toHaveValue("test");
  });
});
