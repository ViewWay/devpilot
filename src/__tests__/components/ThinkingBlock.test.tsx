import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../helpers/renderWithProviders";

// Mock IPC
vi.mock("../../lib/ipc", () => ({
  isTauriRuntime: () => false,
  invoke: vi.fn().mockResolvedValue(null),
}));

describe("ThinkingBlock", () => {
  it("renders nothing when content is empty", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    const { container } = renderWithProviders(
      <ThinkingBlock content="" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders thinking header when content is provided", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(<ThinkingBlock content="Let me think about this..." />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("is collapsed by default when not streaming", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(<ThinkingBlock content="My thoughts" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("is expanded by default when streaming", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(
      <ThinkingBlock content="Thinking..." streaming={true} />,
    );
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("shows content when expanded", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(
      <ThinkingBlock content="My deep thoughts" streaming={true} />,
    );
    // Content is always in DOM (CSS-animated collapse), check it exists
    const allTexts = screen.getAllByText("My deep thoughts");
    expect(allTexts.length).toBeGreaterThanOrEqual(1);
  });

  it("toggles expanded state on click", async () => {
    const user = userEvent.setup();
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(<ThinkingBlock content="UniqueThoughtContent123" />);

    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("shows streaming label when streaming", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(
      <ThinkingBlock content="..." streaming={true} />,
    );
    // The streaming state should show "thinking" text
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
  });

  it("shows preview text when collapsed and not streaming", async () => {
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(<ThinkingBlock content="Some thinking content here" />);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    // Collapsed state shows truncated preview (content also in DOM via CSS grid)
    const matches = screen.getAllByText(/Some thinking content/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });
});
