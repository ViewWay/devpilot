import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AssistantMessage } from "../../components/chat/AssistantMessage";
import type { Message } from "../../types";

// Mock i18n
vi.mock("../../i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// Mock settings store
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: () => ({ fontSize: 14 }),
}));

// Mock sub-components
vi.mock("../../components/chat/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

vi.mock("../../components/chat/MessageActionBar", () => ({
  MessageActionBar: ({ showRegenerate }: { showRegenerate?: boolean }) => (
    <div data-testid="action-bar">{showRegenerate ? "regenerate" : "copy"}</div>
  ),
}));

vi.mock("../../components/chat/ThinkingBlock", () => ({
  ThinkingBlock: ({ content }: { content: string }) => (
    <div data-testid="thinking-block">{content}</div>
  ),
}));

vi.mock("../../components/chat/StreamingIndicator", () => ({
  StreamingIndicator: () => <div data-testid="streaming-indicator" />,
}));

vi.mock("../../components/chat/SourcesList", () => ({
  SourcesList: ({ sources }: { sources: Array<{ index: number; title?: string }> }) => (
    <div data-testid="sources-list">{sources.map((s) => s.title ?? `source-${s.index}`).join(",")}</div>
  ),
}));

const baseMessage: Message = {
  id: "msg-2",
  role: "assistant",
  content: "This is the **assistant** response",
  timestamp: "10:31",
  model: "claude-4-sonnet",
};

describe("AssistantMessage", () => {
  it("renders message content via MarkdownRenderer", () => {
    render(<AssistantMessage message={baseMessage} />);
    const md = screen.getByTestId("markdown");
    expect(md).toBeInTheDocument();
    expect(md.textContent).toContain("assistant");
  });

  it("renders model name and timestamp", () => {
    render(<AssistantMessage message={baseMessage} />);
    expect(screen.getByText("claude-4-sonnet")).toBeInTheDocument();
    expect(screen.getByText("10:31")).toBeInTheDocument();
  });

  it("has article role with aria-label", () => {
    render(<AssistantMessage message={baseMessage} />);
    const article = screen.getByRole("article", { name: /assistantMessage/i });
    expect(article).toBeInTheDocument();
  });

  it("renders thinking block when thinkingContent is present", () => {
    const msg: Message = { ...baseMessage, thinkingContent: "Hmm, let me think..." };
    render(<AssistantMessage message={msg} />);
    const thinking = screen.getByTestId("thinking-block");
    expect(thinking).toBeInTheDocument();
    expect(thinking.textContent).toContain("Hmm, let me think...");
  });

  it("does not render thinking block when thinkingContent is absent", () => {
    render(<AssistantMessage message={baseMessage} />);
    expect(screen.queryByTestId("thinking-block")).not.toBeInTheDocument();
  });

  it("renders streaming indicator when streaming is true", () => {
    const msg: Message = { ...baseMessage, streaming: true };
    render(<AssistantMessage message={msg} />);
    expect(screen.getByTestId("streaming-indicator")).toBeInTheDocument();
  });

  it("does not render streaming indicator when streaming is false", () => {
    render(<AssistantMessage message={baseMessage} />);
    expect(screen.queryByTestId("streaming-indicator")).not.toBeInTheDocument();
  });

  it("renders sources list when citations are present", () => {
    const msg: Message = {
      ...baseMessage,
      citations: [{ index: 1, title: "src1" }, { index: 2, title: "src2" }],
    };
    render(<AssistantMessage message={msg} />);
    const sources = screen.getByTestId("sources-list");
    expect(sources).toBeInTheDocument();
    expect(sources.textContent).toContain("src1");
    expect(sources.textContent).toContain("src2");
  });

  it("shows regenerate in action bar when isLast is true", () => {
    render(<AssistantMessage message={baseMessage} isLast={true} />);
    const actionBar = screen.getByTestId("action-bar");
    expect(actionBar.textContent).toBe("regenerate");
  });

  it("does not show regenerate when isLast is false (default)", () => {
    render(<AssistantMessage message={baseMessage} />);
    const actionBar = screen.getByTestId("action-bar");
    expect(actionBar.textContent).toBe("copy");
  });

  it("renders without model name if model is undefined", () => {
    const msg: Message = { ...baseMessage, model: undefined };
    render(<AssistantMessage message={msg} />);
    expect(screen.queryByText("claude-4-sonnet")).not.toBeInTheDocument();
    expect(screen.getByText("10:31")).toBeInTheDocument();
  });
});
