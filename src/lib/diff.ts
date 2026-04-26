/**
 * Myers diff algorithm — O(ND) diff computation.
 *
 * Much faster than the naive O(N*M) LCS approach for typical code diffs
 * where the number of differences D is small relative to the file sizes N, M.
 *
 * Based on: "An O(ND) Difference Algorithm and Its Variations" by Eugene W. Myers (1986).
 */

/** A single diff operation */
export type DiffOp = "equal" | "insert" | "delete";

/** A single diff line */
export interface DiffLine {
  type: "context" | "add" | "remove";
  oldLineNo?: number;
  newLineNo?: number;
  content: string;
}

/** A hunk of changes */
export interface DiffHunk {
  header: string;
  oldStart: number;
  newStart: number;
  oldCount: number;
  newCount: number;
  lines: DiffLine[];
}

/** Raw edit operation from Myers algorithm */
interface Edit {
  op: DiffOp;
  oldIdx: number;
  newIdx: number;
  text: string;
}

/**
 * Myers diff algorithm implementation.
 *
 * Returns a list of edit operations that transform `oldLines` into `newLines`.
 */
export function myersDiff(oldLines: string[], newLines: string[]): Edit[] {
  const n = oldLines.length;
  const m = newLines.length;

  if (n === 0 && m === 0) {return [];}
  if (n === 0) {
    return newLines.map((line, j) => ({ op: "insert" as DiffOp, oldIdx: -1, newIdx: j, text: line }));
  }
  if (m === 0) {
    return oldLines.map((line, i) => ({ op: "delete" as DiffOp, oldIdx: i, newIdx: -1, text: line }));
  }

  // Maximum number of edits
  const maxEdits = n + m;

  // V arrays: V[k] = furthest reaching x on diagonal k
  // We use a Map for sparse storage (diagonals range from -maxEdits to +maxEdits)
  const trace: Map<number, number>[] = [];

  let v = new Map<number, number>();
  v.set(1, 0);

  outer:
  for (let d = 0; d <= maxEdits; d++) {
    const currentV = new Map(v);
    trace.push(currentV);

    const nextV = new Map<number, number>();

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      let y: number;

      // Decide whether to go down (insert) or right (delete)
      if (k === -d || (k !== d && (currentV.get(k - 1) ?? 0) < (currentV.get(k + 1) ?? 0))) {
        // Move down: insert from new
        x = currentV.get(k + 1) ?? 0;
      } else {
        // Move right: delete from old
        x = (currentV.get(k - 1) ?? 0) + 1;
      }

      y = x - k;

      // Extend along diagonal (equal lines)
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++;
        y++;
      }

      nextV.set(k, x);

      if (x >= n && y >= m) {
        trace.push(nextV);
        break outer;
      }
    }

    v = nextV;
  }

  // Backtrack through the trace to find the actual edits
  const edits: Edit[] = [];
  let x = n;
  let y = m;

  for (let d = trace.length - 1; d > 0; d--) {
    const k = x - y;
    const prevV = trace[d - 1]!;

    let prevK: number;
    if (k === -d || (k !== d && (prevV.get(k - 1) ?? 0) < (prevV.get(k + 1) ?? 0))) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }

    const prevX = prevV.get(prevK) ?? 0;
    const prevY = prevX - prevK;

    // Equal lines (diagonal)
    while (x > prevX && y > prevY) {
      x--; y--;
      edits.unshift({ op: "equal", oldIdx: x, newIdx: y, text: oldLines[x]! });
    }

    if (d > 0) {
      if (x === prevX) {
        // Insert
        y--;
        edits.unshift({ op: "insert", oldIdx: -1, newIdx: y, text: newLines[y]! });
      } else {
        // Delete
        x--;
        edits.unshift({ op: "delete", oldIdx: x, newIdx: -1, text: oldLines[x]! });
      }
    }
  }

  // Handle remaining equal lines at the start
  while (x > 0 && y > 0) {
    x--; y--;
    edits.unshift({ op: "equal", oldIdx: x, newIdx: y, text: oldLines[x]! });
  }

  return edits;
}

/** Count additions and removals */
export function countChanges(hunks: DiffHunk[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") {added++;}
      if (line.type === "remove") {removed++;}
    }
  }
  return { added, removed };
}

/**
 * Compute unified diff hunks from old and new content using Myers algorithm.
 *
 * Groups changes into hunks with configurable context lines.
 */
export function computeUnifiedDiff(
  oldText: string,
  newText: string,
  contextLines = 3,
): DiffHunk[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const edits = myersDiff(oldLines, newLines);

  if (edits.length === 0) {return [];}

  // Find change boundaries
  const changes: number[] = [];
  for (let i = 0; i < edits.length; i++) {
    if (edits[i]!.op !== "equal") {
      changes.push(i);
    }
  }

  if (changes.length === 0) {return [];}

  // Group changes into hunks
  const hunks: DiffHunk[] = [];
  let hunkStart = changes[0]!;
  let hunkEnd = changes[0]!;

  for (let ci = 1; ci < changes.length; ci++) {
    const changeIdx = changes[ci]!;

    // If this change is within context range of the previous, merge into same hunk
    if (changeIdx - hunkEnd <= contextLines * 2 + 1) {
      hunkEnd = changeIdx;
    } else {
      // Flush current hunk
      hunks.push(buildHunk(edits, hunkStart, hunkEnd, contextLines, oldLines.length, newLines.length));
      hunkStart = changeIdx;
      hunkEnd = changeIdx;
    }
  }

  // Flush last hunk
  hunks.push(buildHunk(edits, hunkStart, hunkEnd, contextLines, oldLines.length, newLines.length));

  return hunks;
}

function buildHunk(
  edits: Edit[],
  changeStart: number,
  changeEnd: number,
  contextLines: number,
  _oldTotal: number,
  _newTotal: number,
): DiffHunk {
  const hunkEditsStart = Math.max(0, changeStart - contextLines);
  const hunkEditsEnd = Math.min(edits.length - 1, changeEnd + contextLines);

  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  // Calculate starting line numbers by walking edits up to hunkEditsStart
  for (let i = 0; i < hunkEditsStart; i++) {
    const edit = edits[i]!;
    if (edit.op === "equal" || edit.op === "delete") {oldLine++;}
    if (edit.op === "equal" || edit.op === "insert") {newLine++;}
  }

  const oldStart = oldLine + 1;
  const newStart = newLine + 1;
  let oldCount = 0;
  let newCount = 0;

  for (let i = hunkEditsStart; i <= hunkEditsEnd; i++) {
    const edit = edits[i]!;

    switch (edit.op) {
      case "equal":
        lines.push({
          type: "context",
          oldLineNo: oldLine + 1,
          newLineNo: newLine + 1,
          content: edit.text,
        });
        oldLine++;
        newLine++;
        oldCount++;
        newCount++;
        break;
      case "delete":
        lines.push({
          type: "remove",
          oldLineNo: oldLine + 1,
          content: edit.text,
        });
        oldLine++;
        oldCount++;
        break;
      case "insert":
        lines.push({
          type: "add",
          newLineNo: newLine + 1,
          content: edit.text,
        });
        newLine++;
        newCount++;
        break;
    }
  }

  return {
    header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`,
    oldStart,
    newStart,
    oldCount,
    newCount,
    lines,
  };
}

/**
 * Flatten all hunks into a single list of DiffLines.
 * Useful for virtual scrolling where we need a flat index.
 */
export function flattenHunks(hunks: DiffHunk[]): DiffLine[] {
  const result: DiffLine[] = [];
  for (const hunk of hunks) {
    // Add a hunk header marker line
    result.push({
      type: "context",
      content: hunk.header,
      oldLineNo: undefined,
      newLineNo: undefined,
    });
    result.push(...hunk.lines);
  }
  return result;
}
