import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ToolCallView, ToolCallList } from "../../components/chat/ToolCallView";
import type { ToolCall } from "../../types";

// Mock useI18n
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

const baseToolCall: ToolCall = {
  id: "tc-1",
  name: "shell_exec",
  input: "ls -la",
  output: "file1.txt\nfile2.txt",
  status: "done",
  duration: 150,
};

describe("ToolCallView", () => {
  it("renders tool name and input", () => {
    render(<ToolCallView toolCall={baseToolCall} />);
    expect(screen.getByText("shell_exec")).toBeInTheDocument();
    expect(screen.getByText("ls -la")).toBeInTheDocument();
  });

  it("renders duration when provided", () => {
    render(<ToolCallView toolCall={baseToolCall} />);
    expect(screen.getByText("150ms")).toBeInTheDocument();
  });

  it("formats duration in seconds when >= 1000ms", () => {
    const tc = { ...baseToolCall, duration: 2500 };
    render(<ToolCallView toolCall={tc} />);
    expect(screen.getByText("2.5s")).toBeInTheDocument();
  });

  it("does not render duration when undefined", () => {
    const tc = { ...baseToolCall, duration: undefined };
    render(<ToolCallView toolCall={tc} />);
    expect(screen.queryByText(/ms$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/s$/)).not.toBeInTheDocument();
  });

  it("shows toggle button collapsed by default", () => {
    render(<ToolCallView toolCall={baseToolCall} />);
    const toggle = screen.getByRole("button", { name: /toolCallToggle/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("expands on toggle click and shows output", () => {
    render(<ToolCallView toolCall={baseToolCall} />);
    const toggle = screen.getByRole("button", { name: /toolCallToggle/i });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    // Output is inside a <pre> with whitespace, so check the pre element
    const pre = document.querySelector("pre");
    expect(pre).toBeInTheDocument();
    expect(pre?.textContent).toContain("file1.txt");
    expect(pre?.textContent).toContain("file2.txt");
  });

  it("collapses on second toggle click", () => {
    render(<ToolCallView toolCall={baseToolCall} />);
    const toggle = screen.getByRole("button", { name: /toolCallToggle/i });

    fireEvent.click(toggle); // expand
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle); // collapse
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("shows running state spinner when status is running and no output", () => {
    const tc: ToolCall = { ...baseToolCall, status: "running", output: undefined };
    render(<ToolCallView toolCall={tc} />);
    const toggle = screen.getByRole("button", { name: /toolCallToggle/i });
    fireEvent.click(toggle);

    expect(screen.getByText("Running...")).toBeInTheDocument();
  });

  it("renders error status with error styling", () => {
    const tc: ToolCall = { ...baseToolCall, status: "error", output: "Command not found" };
    render(<ToolCallView toolCall={tc} />);
    const toggle = screen.getByRole("button", { name: /toolCallToggle/i });
    fireEvent.click(toggle);

    expect(screen.getByText("Command not found")).toBeInTheDocument();
  });

  it("has region role for accessibility", () => {
    render(<ToolCallView toolCall={baseToolCall} />);
    expect(screen.getByRole("region", { name: /toolCallRegion/i })).toBeInTheDocument();
  });
});

describe("ToolCallList", () => {
  it("renders multiple tool calls", () => {
    const toolCalls: ToolCall[] = [
      { id: "tc-1", name: "shell_exec", input: "ls", status: "done" },
      { id: "tc-2", name: "file_read", input: "/tmp/test.txt", status: "running" },
      { id: "tc-3", name: "file_write", input: "/tmp/out.txt", status: "error", output: "Permission denied" },
    ];

    render(<ToolCallList toolCalls={toolCalls} />);

    expect(screen.getByText("shell_exec")).toBeInTheDocument();
    expect(screen.getByText("file_read")).toBeInTheDocument();
    expect(screen.getByText("file_write")).toBeInTheDocument();
  });

  it("renders empty list without errors", () => {
    const { container } = render(<ToolCallList toolCalls={[]} />);
    // Renders a wrapper div with no children
    expect(container.querySelector(".space-y-1\\.5")).toBeInTheDocument();
  });
});
