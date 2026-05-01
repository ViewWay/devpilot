/**
 * StreamController — Streaming rendering pipeline inspired by Codex TUI.
 *
 * Architecture:
 *   delta → MarkdownStreamCollector (newline-gated commit)
 *        → StreamCore (full source retention + re-render)
 *        → AdaptiveChunkingPolicy (two-gear emission: smooth / catch-up)
 *        → tick() → emits committed lines to consumer
 *
 * Key design principles borrowed from Codex:
 * 1. **Newline gating** — only commit markdown source at newline boundaries
 *    to avoid mid-word/mid-tag rendering flicker.
 * 2. **Source retention** — keep full raw markdown for re-render on resize.
 * 3. **Two-gear emission** — Smooth (1 line/tick) for steady streaming,
 *    CatchUp (all queued) for burst catch-up after tool calls.
 * 4. **Revision-based invalidation** — track revision number so consumers
 *    can skip redundant renders.
 */

// ─── MarkdownStreamCollector ────────────────────────────────

/**
 * Collects streaming deltas and commits complete markdown source
 * only at newline boundaries. This prevents partial-line markdown
 * (like `**bol` → `**bold**` flicker).
 */
export class MarkdownStreamCollector {
  private buffer = "";
  /** Length of source that has been committed (starts after last \n). */
  private committedLen = 0;

  /** Push a new delta from the LLM stream. Returns true if a new commit is available. */
  pushDelta(delta: string): boolean {
    this.buffer += delta;
    // Check if we have a newline past the committed point
    const idx = this.buffer.indexOf("\n", this.committedLen);
    if (idx !== -1) {
      // Commit up to and including the newline
      this.committedLen = idx + 1;
      return true;
    }
    return false;
  }

  /** Get the committed markdown source (up to last newline boundary). */
  get committedSource(): string {
    return this.buffer.slice(0, this.committedLen);
  }

  /** Get the uncommitted tail (partial line being built). */
  get pendingTail(): string {
    return this.buffer.slice(this.committedLen);
  }

  /** Full raw source including uncommitted tail. */
  get fullSource(): string {
    return this.buffer;
  }

  /** Force-commit everything (e.g. on stream end). Returns the final source. */
  finalize(): string {
    this.committedLen = this.buffer.length;
    return this.buffer;
  }

  /** Reset for reuse. */
  reset(): void {
    this.buffer = "";
    this.committedLen = 0;
  }
}

// ─── QueuedLine ─────────────────────────────────────────────

export interface QueuedLine {
  /** The markdown text of this line (may be empty for blank lines). */
  text: string;
  /** Revision number when this line was enqueued. */
  revision: number;
  /** Whether this line is part of the streaming tail (for cursor positioning). */
  isStreaming: boolean;
}

// ─── AdaptiveChunkingPolicy ─────────────────────────────────

export type ChunkingMode = "smooth" | "catchUp";

/**
 * Two-gear emission policy with hysteresis:
 * - **Smooth**: emit 1 line per tick — steady, readable streaming.
 * - **CatchUp**: emit all queued lines — burst after tool calls or long pauses.
 *
 * Switches to CatchUp when queue depth > threshold (e.g. after tool result).
 * Switches back to Smooth when queue is drained below threshold.
 */
export class AdaptiveChunkingPolicy {
  private mode: ChunkingMode = "smooth";
  private readonly smoothThreshold: number;
  private readonly catchUpThreshold: number;

  constructor(smoothThreshold = 3, catchUpThreshold = 8) {
    this.smoothThreshold = smoothThreshold;
    this.catchUpThreshold = catchUpThreshold;
  }

  /** Decide emission count based on current queue depth. */
  decide(queueDepth: number): { mode: ChunkingMode; emitCount: number } {
    // Hysteresis: only switch modes at different thresholds
    if (this.mode === "smooth" && queueDepth > this.catchUpThreshold) {
      this.mode = "catchUp";
    } else if (this.mode === "catchUp" && queueDepth <= this.smoothThreshold) {
      this.mode = "smooth";
    }

    return {
      mode: this.mode,
      emitCount: this.mode === "catchUp" ? queueDepth : Math.min(1, queueDepth),
    };
  }

  /** Force switch to catch-up mode (e.g. after stream-done for final flush). */
  forceCatchUp(): void {
    this.mode = "catchUp";
  }

  /** Reset for reuse. */
  reset(): void {
    this.mode = "smooth";
  }
}

// ─── StreamController ───────────────────────────────────────

export interface StreamSnapshot {
  /** Current committed markdown content for rendering. */
  content: string;
  /** Whether the stream is still active. */
  isStreaming: boolean;
  /** Current revision (increments on each commit). */
  revision: number;
  /** Current chunking mode. */
  mode: ChunkingMode;
  /** Number of lines queued but not yet emitted. */
  queuedDepth: number;
}

/**
 * Core stream controller that coordinates:
 * 1. Delta collection via MarkdownStreamCollector
 * 2. Line queueing with revision tracking
 * 3. Adaptive emission via AdaptiveChunkingPolicy
 * 4. Source retention for re-render
 */
export class StreamController {
  private collector = new MarkdownStreamCollector();
  private policy = new AdaptiveChunkingPolicy();
  private queue: QueuedLine[] = [];
  private _revision = 0;
  private _isStreaming = false;
  private _committedContent = "";
  private _previousLineCount = 0;

  /** Push a streaming delta from the LLM. */
  pushDelta(delta: string): void {
    this._isStreaming = true;
    const hadCommit = this.collector.pushDelta(delta);
    if (hadCommit) {
      this._onCommit();
    }
  }

  /** Called when the collector commits new source at a newline boundary. */
  private _onCommit(): void {
    this._revision++;
    const source = this.collector.committedSource;
    this._committedContent = source;

    // Compute new lines since last commit
    const lines = source.split("\n");
    // lines.length - 1 because the last element after split may be empty
    const totalLines = source.endsWith("\n") ? lines.length - 1 : lines.length;
    const newLines = totalLines - this._previousLineCount;

    for (let i = 0; i < newLines; i++) {
      const lineIdx = this._previousLineCount + i;
      this.queue.push({
        text: lines[lineIdx] ?? "",
        revision: this._revision,
        isStreaming: true,
      });
    }
    this._previousLineCount = totalLines;
  }

  /**
   * Run one tick of the emission policy.
   * Returns emitted lines that the consumer should render,
   * and the current snapshot.
   */
  tick(): { emitted: QueuedLine[]; snapshot: StreamSnapshot } {
    const { emitCount } = this.policy.decide(this.queue.length);
    const emitted = this.queue.splice(0, emitCount);

    return {
      emitted,
      snapshot: this.getSnapshot(),
    };
  }

  /**
   * Finalize the stream — flush any remaining uncommitted content.
   * Returns the complete final markdown source.
   */
  finalize(): string {
    this._isStreaming = false;
    this.policy.forceCatchUp();

    // Force commit any remaining content
    if (this.collector.pendingTail.length > 0) {
      this._revision++;
      const source = this.collector.finalize();
      this._committedContent = source;

      // Enqueue remaining lines
      const lines = source.split("\n");
      const totalLines = source.endsWith("\n") ? lines.length - 1 : lines.length;
      for (let i = this._previousLineCount; i < totalLines; i++) {
        this.queue.push({
          text: lines[i] ?? "",
          revision: this._revision,
          isStreaming: false,
        });
      }
      this._previousLineCount = totalLines;
    } else {
      this.collector.finalize();
    }

    // Flush all remaining queued lines
    this.queue.splice(0);
    return this._committedContent;
  }

  /** Get current stream state snapshot. */
  getSnapshot(): StreamSnapshot {
    // Include pending tail for rendering if stream is active
    const content = this._isStreaming
      ? this.collector.fullSource
      : this._committedContent;

    return {
      content,
      isStreaming: this._isStreaming,
      revision: this._revision,
      mode: this.policy.decide(this.queue.length).mode,
      queuedDepth: this.queue.length,
    };
  }

  /** The committed content (safe for rendering — no partial markdown tags). */
  get committedContent(): string {
    return this._committedContent;
  }

  /** Full source including uncommitted tail (for live preview). */
  get fullSource(): string {
    return this.collector.fullSource;
  }

  /** Whether stream is active. */
  get isStreaming(): boolean {
    return this._isStreaming;
  }

  /** Current revision number. */
  get revision(): number {
    return this._revision;
  }

  /** Force catch-up mode (e.g. when switching tabs back to this stream). */
  forceCatchUp(): void {
    this.policy.forceCatchUp();
  }

  /** Reset for reuse. */
  reset(): void {
    this.collector.reset();
    this.policy.reset();
    this.queue = [];
    this._revision = 0;
    this._isStreaming = false;
    this._committedContent = "";
    this._previousLineCount = 0;
  }
}
