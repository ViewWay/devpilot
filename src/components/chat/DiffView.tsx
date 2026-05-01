/**
 * DiffView component — visualizes file changes from apply_patch tool results.
 *
 * Renders a unified diff view showing old vs new content,
 * with color-coded additions (green) and deletions (red).
 * Uses Myers diff algorithm (from lib/diff.ts) and Shiki syntax highlighting.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileEdit } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  computeUnifiedDiff,
  countChanges,
  type DiffLine,
} from "../../lib/diff";
import { type HighlightedToken } from "../../lib/shiki";
import { useDiffHighlight } from "../../hooks/useDiffHighlight";

/** Font style flags matching Shiki's FontStyle */
const FONT_STYLE_ITALIC = 1;
const FONT_STYLE_BOLD = 2;
const FONT_STYLE_UNDERLINE = 4;

/** Props for the DiffView component */
export interface DiffViewProps {
  /** The file path being modified */
  filePath: string;
  /** The old content (before patch) */
  oldContent: string;
  /** The new content (after patch) */
  newContent: string;
  /** Whether to start expanded */
  defaultExpanded?: boolean;
}

/**
 * Render a single Shiki token as a <span> with dual-theme CSS variable colors.
 * The actual color applied depends on the active theme (dark/light) via CSS.
 */
function TokenSpan({ token }: { token: HighlightedToken }) {
  // Build inline style with CSS variables for both themes
  const style: React.CSSProperties = {};

  if (token.colorDark || token.colorLight) {
    // Use CSS variables that CodeBlockInner's global styles resolve
    style.color = "var(--shiki-dark, inherit)";
  }

  // Font style
  if (token.fontStyle) {
    if (token.fontStyle & FONT_STYLE_ITALIC) {style.fontStyle = "italic";}
    if (token.fontStyle & FONT_STYLE_BOLD) {style.fontWeight = "bold";}
    if (token.fontStyle & FONT_STYLE_UNDERLINE) {style.textDecoration = "underline";}
  }

  const hasStyle =
    token.colorDark || token.colorLight || (token.fontStyle && token.fontStyle !== 0);

  if (!hasStyle) {
    return <>{token.content}</>;
  }

  // We set dark/light colors as CSS custom properties on the span
  // and use global theme selectors to pick the right one
  const customVars: Record<string, string> = {};
  if (token.colorDark) {customVars["--shiki-dark"] = token.colorDark;}
  if (token.colorLight) {customVars["--shiki-light"] = token.colorLight;}

  return (
    <span
      style={{
        ...customVars,
        color: "var(--shiki-dark)",
        ...style,
      }}
      className="[.light_&]:!text-[var(--shiki-light)]"
    >
      {token.content}
    </span>
  );
}

/**
 * Render tokenized line content.
 * Falls back to plain string if no tokens are provided.
 */
function renderLineContent(
  content: string,
  tokens: HighlightedToken[] | undefined,
): React.ReactNode {
  if (!tokens || tokens.length === 0) {
    return content;
  }

  // Reconstruct from tokens to ensure accurate highlighting
  return (
    <>
      {tokens.map((token, i) => (
        <TokenSpan key={i} token={token} />
      ))}
    </>
  );
}

/** Single diff line component with syntax highlighting */
function DiffLineView({
  line,
  oldTokens,
  newTokens,
}: {
  line: DiffLine;
  oldTokens: HighlightedToken[][];
  newTokens: HighlightedToken[][];
}) {
  const bgColor =
    line.type === "add"
      ? "bg-success/10"
      : line.type === "remove"
        ? "bg-error/10"
        : "";

  const prefix =
    line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  // Pick the right token array based on line type
  let lineTokens: HighlightedToken[] | undefined;
  if (line.type === "remove" && line.oldLineNo !== undefined) {
    lineTokens = oldTokens[line.oldLineNo - 1];
  } else if (line.type === "add" && line.newLineNo !== undefined) {
    lineTokens = newTokens[line.newLineNo - 1];
  } else if (line.type === "context") {
    // Context lines appear in both; prefer new (or old, they're identical)
    const idx = line.newLineNo !== undefined ? line.newLineNo - 1 : line.oldLineNo !== undefined ? line.oldLineNo - 1 : -1;
    lineTokens = idx >= 0 ? (newTokens[idx] ?? oldTokens[idx]) : undefined;
  }

  return (
    <div className={cn("flex font-mono text-[11px] leading-[18px]", bgColor)}>
      <span className="w-10 shrink-0 select-none text-right text-muted-foreground/50 pr-2">
        {line.oldLineNo ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none text-right text-muted-foreground/50 pr-2 border-r border-border">
        {line.newLineNo ?? ""}
      </span>
      <span
        className={cn(
          "w-4 shrink-0 select-none text-center",
          line.type === "add"
            ? "text-success"
            : line.type === "remove"
              ? "text-error"
              : "",
        )}
      >
        {prefix}
      </span>
      <span
        className={cn(
          "flex-1 whitespace-pre-wrap break-all pl-1",
          line.type === "context" && "text-foreground/70",
        )}
      >
        {renderLineContent(line.content, lineTokens)}
      </span>
    </div>
  );
}

/**
 * DiffView — displays a visual diff of file changes with syntax highlighting.
 *
 * @example
 * ```tsx
 * <DiffView
 *   filePath="src/main.ts"
 *   oldContent="const x = 1;"
 *   newContent="const x = 2;"
 * />
 * ```
 */
export function DiffView({
  filePath,
  oldContent,
  newContent,
  defaultExpanded = true,
}: DiffViewProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Compute diff hunks using Myers algorithm from lib/diff.ts
  const hunks = useMemo(
    () => computeUnifiedDiff(oldContent, newContent),
    [oldContent, newContent],
  );

  const { added, removed } = useMemo(() => countChanges(hunks), [hunks]);

  // Syntax highlighting via Shiki
  const { oldTokens, newTokens, loading } = useDiffHighlight(
    oldContent,
    newContent,
    filePath,
  );

  const fileName = filePath.split("/").pop() ?? filePath;

  if (hunks.length === 0) {
    return null;
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/50"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        )}
        <FileEdit size={14} className="shrink-0 text-secondary" />
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {fileName}
        </span>
        <span className="flex items-center gap-2 text-[10px]">
          <span className="rounded-full bg-success/20 px-1.5 py-0.5 text-success">
            +{added}
          </span>
          <span className="rounded-full bg-error/20 px-1.5 py-0.5 text-error">
            -{removed}
          </span>
        </span>
      </button>

      {/* Diff content */}
      {expanded && (
        <div
          className={cn(
            "border-t border-border overflow-x-auto",
            loading && "opacity-60",
          )}
        >
          {/* File path label */}
          <div className="sticky top-0 z-10 border-b border-border bg-muted/30 px-3 py-1">
            <span className="text-[10px] text-muted-foreground">
              {filePath}
            </span>
          </div>

          {/* Shiki theme styles for diff tokens */}
          <style>{`
            .dark .diff-view-tokens span[style*="--shiki-dark"] {
              color: var(--shiki-dark) !important;
            }
            .diff-view-tokens span[style*="--shiki-light"] {
              color: var(--shiki-light) !important;
            }
          `}</style>

          {/* Hunks */}
          <div className="diff-view-tokens">
            {hunks.map((hunk, idx) => (
              <div key={idx}>
                {/* Hunk header */}
                <div className="bg-secondary/5 px-3 py-1 text-[10px] text-secondary/70 font-mono">
                  {hunk.header}
                </div>
                {/* Lines */}
                {hunk.lines.map((line, lineIdx) => (
                  <DiffLineView
                    key={lineIdx}
                    line={line}
                    oldTokens={oldTokens}
                    newTokens={newTokens}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact diff inline view — shows a summary of changes in a single line.
 * Useful for displaying in message bubbles.
 */
export function DiffSummary({
  filePath,
  oldContent,
  newContent,
}: Omit<DiffViewProps, "defaultExpanded">) {
  const hunks = useMemo(
    () => computeUnifiedDiff(oldContent, newContent),
    [oldContent, newContent],
  );

  const { added, removed } = useMemo(() => countChanges(hunks), [hunks]);
  const fileName = filePath.split("/").pop() ?? filePath;

  if (hunks.length === 0) {
    return null;
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-0.5 text-[11px]">
      <FileEdit size={11} className="text-secondary" />
      <span className="text-foreground/80">{fileName}</span>
      <span className="text-success">+{added}</span>
      <span className="text-error">-{removed}</span>
    </span>
  );
}
