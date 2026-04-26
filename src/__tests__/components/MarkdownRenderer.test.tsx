import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarkdownRenderer } from "../../components/chat/MarkdownRenderer";

// Mock heavy sub-components — must match import paths as seen from the component module
vi.mock("../../components/chat/CodeBlock", () => ({
  CodeBlock: ({ code }: { code: string; lang?: string }) => (
    <div data-testid="code-block">{code}</div>
  ),
}));

vi.mock("../../components/chat/SandboxBlock", () => ({
  SandboxBlock: ({ code }: { code: string }) => (
    <div data-testid="sandbox-block">{code}</div>
  ),
}));

vi.mock("../../components/chat/MermaidRenderer", () => ({
  MermaidRenderer: ({ chart }: { chart: string }) => (
    <div data-testid="mermaid">{chart}</div>
  ),
}));

describe("MarkdownRenderer", () => {
  it("renders plain text", () => {
    render(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders inline code", () => {
    render(<MarkdownRenderer content="Use `console.log` for debugging" />);
    expect(screen.getByText("console.log")).toBeInTheDocument();
  });

  it("renders code blocks via CodeBlock component", () => {
    render(<MarkdownRenderer content={"```typescript\nconst x = 1;\n```"} />);
    expect(screen.getByTestId("code-block")).toBeInTheDocument();
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });

  it("renders mermaid code blocks via MermaidRenderer", () => {
    render(<MarkdownRenderer content={"```mermaid\ngraph TD\nA-->B\n```"} />);
    expect(screen.getByTestId("mermaid")).toBeInTheDocument();
  });

  it("renders html code blocks via SandboxBlock", () => {
    render(<MarkdownRenderer content={"```html\n<div>hi</div>\n```"} />);
    expect(screen.getByTestId("sandbox-block")).toBeInTheDocument();
  });

  it("renders bold text", () => {
    render(<MarkdownRenderer content="This is **bold** text" />);
    const strong = screen.getByText("bold");
    expect(strong).toBeInTheDocument();
    expect(strong.tagName).toBe("STRONG");
  });

  it("renders italic text", () => {
    render(<MarkdownRenderer content="This is *italic* text" />);
    const em = screen.getByText("italic");
    expect(em).toBeInTheDocument();
    expect(em.tagName).toBe("EM");
  });

  it("renders links", () => {
    render(<MarkdownRenderer content="[DevPilot](https://devpilot.dev)" />);
    const link = screen.getByText("DevPilot");
    expect(link.tagName).toBe("A");
  });

  it("applies custom fontSize", () => {
    const { container } = render(<MarkdownRenderer content="test" fontSize={18} />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.style.fontSize).toBe("18px");
  });

  it("applies custom className", () => {
    const { container } = render(<MarkdownRenderer content="test" className="custom-class" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("custom-class");
  });
});
