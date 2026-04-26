import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserMessage } from "../../components/chat/UserMessage";
import type { Message } from "../../types";

// Mock i18n
vi.mock("../../i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

// Mock settings store
vi.mock("../../stores/settingsStore", () => ({
  useSettingsStore: () => ({ fontSize: 14 }),
}));

// Mock MessageActionBar
vi.mock("../../components/chat/MessageActionBar", () => ({
  MessageActionBar: ({ content }: { content: string }) => (
    <div data-testid="action-bar">{content}</div>
  ),
}));

const baseMessage: Message = {
  id: "msg-1",
  role: "user",
  content: "Hello, this is a **test** message",
  timestamp: "10:30",
};

describe("UserMessage", () => {
  it("renders message content as markdown", () => {
    render(<UserMessage message={baseMessage} />);
    // Markdown renders **test** as <strong>test</strong>
    const strong = screen.getByText("test");
    expect(strong).toBeInTheDocument();
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders timestamp", () => {
    render(<UserMessage message={baseMessage} />);
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("has article role with aria-label", () => {
    render(<UserMessage message={baseMessage} />);
    const article = screen.getByRole("article", { name: /userMessage/i });
    expect(article).toBeInTheDocument();
  });

  it("renders MessageActionBar with content", () => {
    render(<UserMessage message={baseMessage} />);
    const actionBar = screen.getByTestId("action-bar");
    expect(actionBar).toBeInTheDocument();
    expect(actionBar.textContent).toContain("test");
  });

  it("handles non-string content gracefully", () => {
    const msg: Message = { ...baseMessage, content: "" };
    render(<UserMessage message={msg} />);
    // Should not throw, just renders empty
    expect(screen.getByRole("article")).toBeInTheDocument();
  });

  it("applies user bubble styling", () => {
    render(<UserMessage message={baseMessage} />);
    const article = screen.getByRole("article");
    const bubble = article.querySelector(".bg-user-bubble");
    expect(bubble).toBeInTheDocument();
  });
});
