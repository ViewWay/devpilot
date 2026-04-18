import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";
import { useChatStore } from "../../stores/chatStore";

// Mock module-level stores before importing the component
vi.mock("../../stores/chatStore", async () => {
  const actual = await vi.importActual("../../stores/chatStore");
  return {
    ...actual,
    useChatStore: actual.useChatStore,
  };
});

describe("MessageInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      sessions: [],
      activeSessionId: null,
      isLoading: false,
      streamingMessageId: null,
    });
  });

  it("renders textarea", async () => {
    const { MessageInput } = await import("../../components/chat/MessageInput");
    renderWithProviders(<MessageInput />);
    expect(screen.getByPlaceholderText(/message/i)).toBeInTheDocument();
  });

  it("updates textarea value on input", async () => {
    const { MessageInput } = await import("../../components/chat/MessageInput");
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);

    const textarea = screen.getByPlaceholderText(/message/i);
    await user.type(textarea, "Hello world");
    expect(textarea).toHaveValue("Hello world");
  });

  it("shows slash command autocomplete when typing /", async () => {
    const { MessageInput } = await import("../../components/chat/MessageInput");
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);

    const textarea = screen.getByPlaceholderText(/message/i);
    await user.type(textarea, "/");

    await waitFor(() => {
      expect(screen.getByText(/help/i)).toBeInTheDocument();
    });
  });

  it("filters slash commands as user types", async () => {
    const { MessageInput } = await import("../../components/chat/MessageInput");
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);

    const textarea = screen.getByPlaceholderText(/message/i);
    await user.type(textarea, "/cl");

    // /clear should appear (the command itself, not the description)
    await waitFor(() => {
      const commands = screen.getAllByText(/clear/i);
      expect(commands.some((el) => el.textContent === "/clear")).toBe(true);
    });
    // /help should NOT appear
    expect(screen.queryByText(/^\/help$/)).not.toBeInTheDocument();
  });

  it("hides slash commands when typing space after command", async () => {
    const { MessageInput } = await import("../../components/chat/MessageInput");
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);

    const textarea = screen.getByPlaceholderText(/message/i);
    await user.type(textarea, "/help ");

    // Commands should be hidden after space
    await waitFor(() => {
      expect(screen.queryByText(/clear/i)).not.toBeInTheDocument();
    });
  });

  it("does not show commands for regular text input", async () => {
    const { MessageInput } = await import("../../components/chat/MessageInput");
    const user = userEvent.setup();
    renderWithProviders(<MessageInput />);

    const textarea = screen.getByPlaceholderText(/message/i);
    await user.type(textarea, "hello");

    expect(screen.queryByText(/help/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/clear/i)).not.toBeInTheDocument();
  });
});
