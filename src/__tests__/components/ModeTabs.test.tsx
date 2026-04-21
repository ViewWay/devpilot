import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModeTabs } from "../../components/chat/ModeTabs";
import { useUIStore } from "../../stores/uiStore";

// Mock useI18n
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("ModeTabs", () => {
  beforeEach(() => {
    // Reset to default mode
    useUIStore.setState({ activeMode: "code" });
  });

  it("renders all three mode buttons", () => {
    render(<ModeTabs />);
    const radioGroup = screen.getByRole("radiogroup");
    expect(radioGroup).toBeInTheDocument();

    const buttons = screen.getAllByRole("radio");
    expect(buttons).toHaveLength(3);
  });

  it("shows code mode as active by default", () => {
    render(<ModeTabs />);
    const codeButton = screen.getByRole("radio", { name: /code/i });
    expect(codeButton).toHaveAttribute("aria-checked", "true");
  });

  it("switches mode on click", () => {
    render(<ModeTabs />);
    const planButton = screen.getByRole("radio", { name: /plan/i });
    expect(planButton).toHaveAttribute("aria-checked", "false");

    fireEvent.click(planButton);
    expect(planButton).toHaveAttribute("aria-checked", "true");

    // Code should no longer be checked
    const codeButton = screen.getByRole("radio", { name: /code/i });
    expect(codeButton).toHaveAttribute("aria-checked", "false");
  });

  it("updates global store on mode switch", () => {
    render(<ModeTabs />);
    expect(useUIStore.getState().activeMode).toBe("code");

    const askButton = screen.getByRole("radio", { name: /ask/i });
    fireEvent.click(askButton);

    expect(useUIStore.getState().activeMode).toBe("ask");
  });

  it("renders all mode icons", () => {
    render(<ModeTabs />);
    expect(screen.getByText("⚡")).toBeInTheDocument();
    expect(screen.getByText("📋")).toBeInTheDocument();
    expect(screen.getByText("💬")).toBeInTheDocument();
  });
});
