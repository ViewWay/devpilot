import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelSelector } from "../../components/chat/ModelSelector";
import { useUIStore } from "../../stores/uiStore";

// Mock useI18n
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const defaultModels = [
  { id: "claude-4-sonnet", name: "Claude 4 Sonnet", provider: "anthropic", color: "bg-orange-500" },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", color: "bg-green-500" },
  { id: "deepseek-r1", name: "DeepSeek R1", provider: "deepseek", color: "bg-blue-500" },
];

describe("ModelSelector", () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedModel: defaultModels[0],
      models: defaultModels,
    });
  });

  it("renders with the currently selected model name", () => {
    render(<ModelSelector />);
    // Model name appears in the toggle button
    const elements = screen.getAllByText("Claude 4 Sonnet");
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it("has a button to toggle the dropdown", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
  });

  it("opens dropdown on click", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("shows all models in dropdown", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);

    // All three model names should be visible (use getAllByText since selected model appears twice)
    expect(screen.getAllByText("Claude 4 Sonnet").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek R1")).toBeInTheDocument();
  });

  it("marks active model as selected", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);

    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(options[1]).toHaveAttribute("aria-selected", "false");
    expect(options[2]).toHaveAttribute("aria-selected", "false");
  });

  it("selects a model on click", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);

    // Click on GPT-4o
    const gptOption = screen.getByRole("option", { name: /gpt-4o/i });
    fireEvent.click(gptOption);

    // Store should update
    expect(useUIStore.getState().selectedModel.id).toBe("gpt-4o");
  });

  it("shows provider labels for each model", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);

    expect(screen.getByText("anthropic")).toBeInTheDocument();
    expect(screen.getByText("openai")).toBeInTheDocument();
    expect(screen.getByText("deepseek")).toBeInTheDocument();
  });

  it("closes dropdown after selecting a model", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    const gptOption = screen.getByRole("option", { name: /gpt-4o/i });
    fireEvent.click(gptOption);

    // Dropdown should close
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes dropdown on Escape key", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes dropdown on outside click", () => {
    render(<ModelSelector />);
    const button = screen.getByRole("button", { name: /selectModel/i });
    fireEvent.click(button);
    expect(screen.queryByRole("listbox")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
