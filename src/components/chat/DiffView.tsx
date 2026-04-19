/**
 * DiffView component — visualizes file changes from apply_patch tool results.
 *
 * Renders a unified diff view showing old vs new content,
 * with color-coded additions (green) and deletions (red).
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileEdit } from "lucide-react";
import { cn } from "../../lib/utils";

/** A single diff line */
interface DiffLine {
  type: "context" | "add" | "remove";
  oldLineNo?: number;
  newLineNo?: number;
  content: string;
}

/** A hunk of changes */
interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

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

interface DiffEntry {
  type: "context" | "add" | "remove";
  oldIdx: number;
  newIdx: number;
  line: string;
}

/**
 * Compute unified diff hunks from old and new content.
 *
 * Uses a simple longest-common-subsequence approach for diffing.
 */
function computeUnifiedDiff(oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  // Initialize DP table with explicit zeros
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    const row: number[] = [];
    for (let j = 0; j <= n; j++) {
      row.push(0);
    }
    dp.push(row);
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1;
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
      }
    }
  }

  // Backtrack to find diff
  const diff: DiffEntry[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diff.unshift({ type: "context", oldIdx: i, newIdx: j, line: oldLines[i - 1]! });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (dp[i]![j - 1]!) >= (dp[i - 1]![j]!))) {
      diff.unshift({ type: "add", oldIdx: -1, newIdx: j, line: newLines[j - 1]! });
      j--;
    } else if (i > 0) {
      diff.unshift({ type: "remove", oldIdx: i, newIdx: -1, line: oldLines[i - 1]! });
      i--;
    }
  }

  // Group into hunks with context
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  const contextLines = 3;
  let hunkStart = 0;

  for (let idx = 0; idx < diff.length; idx++) {
    const entry = diff[idx]!;
    if (entry.type !== "context") {
      // Found a change — look back for context
      const start = Math.max(0, idx - contextLines);
      if (!currentHunk || start > hunkStart + contextLines * 2 + 2) {
        // Start a new hunk
        if (currentHunk) {
          hunks.push(currentHunk);
        }
        currentHunk = {
          header: `@@ changes @@`,
          lines: [],
        };
        hunkStart = start;
      }

      // Add context before this change if at hunk start
      if (currentHunk && currentHunk.lines.length === 0) {
        for (let ci = start; ci < idx; ci++) {
          const d = diff[ci]!;
          currentHunk.lines.push({
            type: "context",
            oldLineNo: d.oldIdx > 0 ? d.oldIdx : undefined,
            newLineNo: d.newIdx > 0 ? d.newIdx : undefined,
            content: d.line,
          });
        }
      }

      // Add the change
      if (currentHunk) {
        currentHunk.lines.push({
          type: entry.type,
          oldLineNo: entry.oldIdx > 0 ? entry.oldIdx : undefined,
          newLineNo: entry.newIdx > 0 ? entry.newIdx : undefined,
          content: entry.line,
        });

        // Add trailing context
        let endIdx = idx + 1;
        while (endIdx < diff.length && diff[endIdx]!.type === "context" && endIdx - idx <= contextLines) {
          const cd = diff[endIdx]!;
          currentHunk.lines.push({
            type: "context",
            oldLineNo: cd.oldIdx > 0 ? cd.oldIdx : undefined,
            newLineNo: cd.newIdx > 0 ? cd.newIdx : undefined,
            content: cd.line,
          });
          endIdx++;
        }
      }
    }
  }

  if (currentHunk) {
    hunks.push(currentHunk);
  }

  // If no hunks but content differs, fallback
  if (hunks.length === 0 && oldText !== newText) {
    hunks.push({
      header: "@@ full replacement @@",
      lines: [
        ...oldLines.map((line, idx) => ({
          type: "remove" as const,
          oldLineNo: idx + 1,
          content: line,
        })),
        ...newLines.map((line, idx) => ({
          type: "add" as const,
          newLineNo: idx + 1,
          content: line,
        })),
      ],
    });
  }

  return hunks;
}

/** Count additions and removals */
function countChanges(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") {
        added++;
      }
      if (line.type === "remove") {
        removed++;
      }
    }
  }
  return { added, removed };
}

/** Single diff line component */
function DiffLineView({ line }: { line: DiffLine }) {
  const bgColor =
    line.type === "add"
      ? "bg-green-500/10"
      : line.type === "remove"
        ? "bg-red-500/10"
        : "";

  const textColor =
    line.type === "add"
      ? "text-green-400"
      : line.type === "remove"
        ? "text-red-400"
        : "text-foreground/70";

  const prefix =
    line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  return (
    <div className={cn("flex font-mono text-[11px] leading-[18px]", bgColor)}>
      <span className="w-10 shrink-0 select-none text-right text-muted-foreground/50 pr-2">
        {line.oldLineNo ?? ""}
      </span>
      <span className="w-10 shrink-0 select-none text-right text-muted-foreground/50 pr-2 border-r border-border">
        {line.newLineNo ?? ""}
      </span>
      <span className={cn("w-4 shrink-0 select-none text-center", textColor)}>
        {prefix}
      </span>
      <span className={cn("flex-1 whitespace-pre-wrap break-all pl-1", textColor)}>
        {line.content}
      </span>
    </div>
  );
}

/**
 * DiffView — displays a visual diff of file changes.
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
        <FileEdit size={14} className="shrink-0 text-blue-400" />
        <span className="flex-1 truncate text-xs font-medium text-foreground">
          {fileName}
        </span>
        <span className="flex items-center gap-2 text-[10px]">
          <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-green-400">
            +{added}
          </span>
          <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-red-400">
            -{removed}
          </span>
        </span>
      </button>

      {/* Diff content */}
      {expanded && (
        <div className="border-t border-border overflow-x-auto">
          {/* File path label */}
          <div className="sticky top-0 z-10 border-b border-border bg-muted/30 px-3 py-1">
            <span className="text-[10px] text-muted-foreground">
              {filePath}
            </span>
          </div>

          {/* Hunks */}
          {hunks.map((hunk, idx) => (
            <div key={idx}>
              {/* Hunk header */}
              <div className="bg-blue-500/5 px-3 py-1 text-[10px] text-blue-400/70 font-mono">
                {hunk.header}
              </div>
              {/* Lines */}
              {hunk.lines.map((line, lineIdx) => (
                <DiffLineView key={lineIdx} line={line} />
              ))}
            </div>
          ))}
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
      <FileEdit size={11} className="text-blue-400" />
      <span className="text-foreground/80">{fileName}</span>
      <span className="text-green-400">+{added}</span>
      <span className="text-red-400">-{removed}</span>
    </span>
  );
}
