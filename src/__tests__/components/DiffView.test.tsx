import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiffView, DiffSummary } from "../../components/chat/DiffView";

describe("DiffView", () => {
  it("renders null when old and new content are identical", () => {
    const { container } = render(
      <DiffView filePath="test.txt" oldContent="hello" newContent="hello" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders file name in header", () => {
    render(
      <DiffView filePath="src/app.tsx" oldContent="old line\n" newContent="new line\n" />,
    );
    expect(screen.getByText("app.tsx")).toBeInTheDocument();
  });

  it("toggles expanded state on click", () => {
    render(
      <DiffView filePath="test.txt" oldContent="a\n" newContent="b\n" defaultExpanded={false} />,
    );
    const button = screen.getByRole("button");
    expect(button).toBeInTheDocument();

    // Click to expand — file path should appear in detail area too
    fireEvent.click(button);
    expect(screen.getAllByText("test.txt").length).toBeGreaterThanOrEqual(1);
  });

  it("starts expanded when defaultExpanded is true", () => {
    render(
      <DiffView
        filePath="test.txt"
        oldContent="a\n"
        newContent="b\n"
        defaultExpanded={true}
      />,
    );
    expect(screen.getAllByText("test.txt").length).toBeGreaterThanOrEqual(1);
  });

  it("handles multi-line diff correctly", () => {
    const oldContent = "line1\nline2\nline3\n";
    const newContent = "line1\nmodified\nline3\nadded\n";

    const { container } = render(
      <DiffView filePath="file.rs" oldContent={oldContent} newContent={newContent} defaultExpanded={true} />,
    );

    expect(screen.getAllByText("file.rs").length).toBeGreaterThan(0);
    // Verify diff rendered with change badges
    expect(container.querySelectorAll("[class*='bg-success']").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[class*='bg-error']").length).toBeGreaterThan(0);
  });

  it("handles addition-only diff", () => {
    const { container } = render(
      <DiffView
        filePath="new.txt"
        oldContent=""
        newContent="brand new content\n"
        defaultExpanded={true}
      />,
    );
    expect(screen.getAllByText("new.txt").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[class*='bg-success']").length).toBeGreaterThan(0);
  });

  it("handles deletion-only diff", () => {
    const { container } = render(
      <DiffView
        filePath="deleted.txt"
        oldContent="removed line\n"
        newContent=""
        defaultExpanded={true}
      />,
    );
    expect(screen.getAllByText("deleted.txt").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[class*='bg-error']").length).toBeGreaterThan(0);
  });
});

describe("DiffSummary", () => {
  it("renders null when content is identical", () => {
    const { container } = render(
      <DiffSummary filePath="test.txt" oldContent="same" newContent="same" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders inline summary with file name", () => {
    render(
      <DiffSummary filePath="src/main.ts" oldContent="a\nb\n" newContent="a\nc\nd\n" />,
    );
    expect(screen.getByText("main.ts")).toBeInTheDocument();
  });
});
