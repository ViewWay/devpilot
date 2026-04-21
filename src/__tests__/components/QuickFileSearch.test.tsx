import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useUIStore } from "../../stores/uiStore";
import { useChatStore } from "../../stores/chatStore";

// Mock the IPC layer
const mockInvoke = vi.fn().mockResolvedValue([]);
vi.mock("../../lib/ipc", () => ({
  isTauriRuntime: () => false,
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

describe("QuickFileSearch", () => {
  beforeEach(() => {
    useUIStore.setState({ quickFileSearchOpen: false });
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      streamingMessageId: null,
    });
    mockInvoke.mockReset().mockResolvedValue([]);
  });

  it("does not render when closed", async () => {
    const { QuickFileSearch } = await import("../../components/QuickFileSearch");
    renderWithProviders(<QuickFileSearch />);

    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it("renders when quickFileSearchOpen is true", async () => {
    useUIStore.setState({ quickFileSearchOpen: true });
    const { QuickFileSearch } = await import("../../components/QuickFileSearch");
    renderWithProviders(<QuickFileSearch />);

    // Should have a search input
    const input = screen.getByPlaceholderText(/search/i);
    expect(input).toBeInTheDocument();
  });

  it("has file and content search mode buttons", async () => {
    useUIStore.setState({ quickFileSearchOpen: true });
    const { QuickFileSearch } = await import("../../components/QuickFileSearch");
    renderWithProviders(<QuickFileSearch />);

    // Should have mode buttons for files and content
    expect(screen.getByText(/by name/i)).toBeInTheDocument();
    expect(screen.getByText(/by content/i)).toBeInTheDocument();
  });

  it("shows no working dir warning when no session", async () => {
    useUIStore.setState({ quickFileSearchOpen: true });
    const { QuickFileSearch } = await import("../../components/QuickFileSearch");
    renderWithProviders(<QuickFileSearch />);

    expect(screen.getByText(/set a working directory/i)).toBeInTheDocument();
  });

  it("closes when clicking backdrop", async () => {
    useUIStore.setState({ quickFileSearchOpen: true });
    const { QuickFileSearch } = await import("../../components/QuickFileSearch");
    renderWithProviders(<QuickFileSearch />);

    // Click the backdrop
    const backdrop = document.querySelector(".bg-black\\/50");
    if (backdrop) {
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    await waitFor(() => {
      expect(useUIStore.getState().quickFileSearchOpen).toBe(false);
    });
  });

  it("switches mode when clicking content tab", async () => {
    useUIStore.setState({ quickFileSearchOpen: true });
    const { QuickFileSearch } = await import("../../components/QuickFileSearch");
    const user = userEvent.setup();
    renderWithProviders(<QuickFileSearch />);

    const contentBtn = screen.getByText(/by content/i);
    await user.click(contentBtn);

    // The button should now be active (bg-accent class)
    expect(contentBtn.className).toContain("bg-accent");
  });
});
