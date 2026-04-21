import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useUIStore } from "../../stores/uiStore";
import { useChatStore } from "../../stores/chatStore";

// Mock the IPC layer
vi.mock("../../lib/ipc", () => ({
  isTauriRuntime: () => false,
  invoke: vi.fn().mockResolvedValue([]),
}));

// Mock tabStore
vi.mock("../../stores/tabStore", () => ({
  useTabStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      tabs: [],
      activeTabId: null,
      openTab: vi.fn(),
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
  GALLERY_TAB_ID: "__gallery__",
  BRIDGE_TAB_ID: "__bridge__",
}));

describe("CommandPalette", () => {
  beforeEach(() => {
    useUIStore.setState({ commandPaletteOpen: false });
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      streamingMessageId: null,
    });
  });

  it("does not render when closed", async () => {
    const { CommandPalette } = await import("../../components/CommandPalette");
    renderWithProviders(<CommandPalette />);

    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument();
  });

  it("renders when commandPaletteOpen is true", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    const { CommandPalette } = await import("../../components/CommandPalette");
    renderWithProviders(<CommandPalette />);

    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument();
  });

  it("shows command items when open", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    const { CommandPalette } = await import("../../components/CommandPalette");
    renderWithProviders(<CommandPalette />);

    // Should show at least the core commands
    expect(screen.getByText(/new chat/i)).toBeInTheDocument();
    expect(screen.getByText(/toggle sidebar/i)).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("filters commands by query", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    const { CommandPalette } = await import("../../components/CommandPalette");
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    const input = screen.getByPlaceholderText(/type a command/i);
    await user.type(input, "sidebar");

    // Should show sidebar command
    expect(screen.getByText(/toggle sidebar/i)).toBeInTheDocument();
    // Should not show new chat
    expect(screen.queryByText(/new chat/i)).not.toBeInTheDocument();
  });

  it("shows no results message when query matches nothing", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    const { CommandPalette } = await import("../../components/CommandPalette");
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    const input = screen.getByPlaceholderText(/type a command/i);
    await user.type(input, "zzzzzznonexistent");

    expect(screen.getByText(/no results found/i)).toBeInTheDocument();
  });

  it("closes when clicking backdrop", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    const { CommandPalette } = await import("../../components/CommandPalette");
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    // Click the backdrop (the outer overlay div with bg-black/50)
    const backdrop = document.querySelector(".bg-black\\/50");
    if (backdrop) {
      await user.click(backdrop as HTMLElement);
    }

    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
  });

  it("executes command when clicked", async () => {
    useUIStore.setState({
      commandPaletteOpen: true,
      sidebarOpen: true,
    });
    const { CommandPalette } = await import("../../components/CommandPalette");
    const user = userEvent.setup();
    renderWithProviders(<CommandPalette />);

    // Click on "Toggle Sidebar" command
    const sidebarBtn = screen.getByText(/toggle sidebar/i);
    await user.click(sidebarBtn);

    // Should close palette and toggle sidebar
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    expect(useUIStore.getState().sidebarOpen).toBe(false);
  });

  it("shows session items when sessions exist", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    useChatStore.setState({
      sessions: [
        {
          id: "test-1",
          title: "My Test Session",
          model: "gpt-4",
          provider: "openai",
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "test-2",
          title: "Another Session",
          model: "gpt-4",
          provider: "openai",
          messages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      activeSessionId: "test-1",
    });

    const { CommandPalette } = await import("../../components/CommandPalette");
    renderWithProviders(<CommandPalette />);

    // Only non-active sessions should appear
    expect(screen.getByText("Another Session")).toBeInTheDocument();
  });

  it("displays footer with i18n hints", async () => {
    useUIStore.setState({ commandPaletteOpen: true });
    const { CommandPalette } = await import("../../components/CommandPalette");
    renderWithProviders(<CommandPalette />);

    // Footer should have translated text (EN by default)
    expect(screen.getByText("navigate")).toBeInTheDocument();
    expect(screen.getByText("select")).toBeInTheDocument();
    expect(screen.getByText("close")).toBeInTheDocument();
  });
});
