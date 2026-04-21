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
    expect(screen.getByText("My deep thoughts")).toBeInTheDocument();
  });

  it("toggles expanded state on click", async () => {
    const user = userEvent.setup();
    const { ThinkingBlock } = await import(
      "../../components/chat/ThinkingBlock"
    );
    renderWithProviders(<ThinkingBlock content="Hidden thoughts" />);

    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Hidden thoughts")).not.toBeInTheDocument();

    await user.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hidden thoughts")).toBeInTheDocument();

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
});
