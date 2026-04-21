import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeBlock } from "../../components/chat/CodeBlock";

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

// Mock useI18n to return identity function
vi.mock("../../i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe("CodeBlock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders code content", () => {
    render(<CodeBlock code='console.log("hello")' lang="typescript" />);
    expect(screen.getByRole("region", { name: /codeBlockRegion/i })).toBeInTheDocument();
  });

  it("displays language label (lowercase via uppercase CSS class)", () => {
    render(<CodeBlock code="fn main() {}" lang="rust" />);
    // The span uses CSS text-transform: uppercase, actual text is lowercase
    expect(screen.getByText("rust")).toBeInTheDocument();
  });

  it("falls back to 'code' label when no language is provided", () => {
    render(<CodeBlock code="some text" />);
    expect(screen.getByText("code")).toBeInTheDocument();
  });

  it("has a copy button", () => {
    render(<CodeBlock code="test code" lang="python" />);
    const copyButton = screen.getByRole("button", { name: /copyCode/i });
    expect(copyButton).toBeInTheDocument();
  });

  it("copies code to clipboard on copy click", () => {
    render(<CodeBlock code="test code" lang="python" />);
    const copyButton = screen.getByRole("button", { name: /copyCode/i });
    fireEvent.click(copyButton);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("test code");
  });

  it("shows copied state after clicking copy", () => {
    render(<CodeBlock code="test code" lang="python" />);
    const copyButton = screen.getByRole("button", { name: /copyCode/i });
    fireEvent.click(copyButton);
    expect(screen.getByText("copied")).toBeInTheDocument();
  });

  it("renders with Suspense fallback (lazy loading)", () => {
    render(<CodeBlock code="test" lang="js" />);
    // Should show the outer container immediately
    const region = screen.getByRole("region", { name: /codeBlockRegion/i });
    expect(region).toBeInTheDocument();
  });
});
