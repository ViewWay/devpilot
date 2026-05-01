/**
 * useStreamRenderer — React hook that integrates StreamController with
 * the component lifecycle for smooth streaming markdown rendering.
 *
 * Provides:
 * - StreamController instance per message (ref-stable)
 * - Rendering content (committed + pending tail) with newline gating
 * - Tick-based emission at ~60fps via requestAnimationFrame
 * - Automatic cleanup on unmount or stream end
 */

import { useRef, useState, useCallback, useEffect } from "react";
import {
  StreamController,
  type ChunkingMode,
} from "../lib/streamController";

export interface StreamRenderState {
  /** Markdown content to render (committed + tail for live preview). */
  content: string;
  /** Whether the stream is actively receiving deltas. */
  isStreaming: boolean;
  /** Revision counter — changes when content meaningfully updates. */
  revision: number;
  /** Current emission mode. */
  mode: ChunkingMode;
  /** Lines buffered but not yet rendered. */
  queuedDepth: number;
}

const INITIAL_STATE: StreamRenderState = {
  content: "",
  isStreaming: false,
  revision: 0,
  mode: "smooth",
  queuedDepth: 0,
};

/**
 * Hook for managing a single message's streaming render lifecycle.
 *
 * Usage:
 * ```tsx
 * const { renderState, pushDelta, finalize, controller } = useStreamRenderer();
 *
 * // On stream-chunk event:
 * pushDelta(delta);
 *
 * // On stream-done event:
 * finalize();
 * ```
 */
export function useStreamRenderer() {
  const controllerRef = useRef<StreamController>(new StreamController());
  const rafIdRef = useRef<number | null>(null);
  const [renderState, setRenderState] = useState<StreamRenderState>(INITIAL_STATE);

  // Tick loop — runs at ~60fps while streaming
  const tick = useCallback(() => {
    const controller = controllerRef.current;
    const { emitted, snapshot } = controller.tick();

    if (emitted.length > 0 || snapshot.revision !== renderState.revision) {
      setRenderState({
        content: snapshot.content,
        isStreaming: snapshot.isStreaming,
        revision: snapshot.revision,
        mode: snapshot.mode,
        queuedDepth: snapshot.queuedDepth,
      });
    }

    // Continue ticking while streaming or queue has items
    if (snapshot.isStreaming || snapshot.queuedDepth > 0) {
      rafIdRef.current = requestAnimationFrame(tick);
    } else {
      rafIdRef.current = null;
    }
  }, [renderState.revision]);

  /** Push a streaming delta. */
  const pushDelta = useCallback(
    (delta: string) => {
      controllerRef.current.pushDelta(delta);
      // Start tick loop if not already running
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(tick);
      }
    },
    [tick],
  );

  /** Finalize the stream and return the complete source. */
  const finalize = useCallback((): string => {
    const finalSource = controllerRef.current.finalize();
    // One final tick to flush remaining content
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
    }
    setRenderState({
      content: finalSource,
      isStreaming: false,
      revision: controllerRef.current.revision,
      mode: "smooth",
      queuedDepth: 0,
    });
    rafIdRef.current = null;
    return finalSource;
  }, []);

  /** Reset for a new stream (e.g. regenerating response). */
  const reset = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    controllerRef.current.reset();
    setRenderState(INITIAL_STATE);
  }, []);

  /** Force immediate render of all queued content. */
  const flushImmediate = useCallback(() => {
    controllerRef.current.forceCatchUp();
    const { snapshot } = { snapshot: controllerRef.current.getSnapshot() };
    const finalSource = controllerRef.current.isStreaming
      ? controllerRef.current.fullSource
      : controllerRef.current.committedContent;
    setRenderState({
      content: finalSource,
      isStreaming: snapshot.isStreaming,
      revision: snapshot.revision,
      mode: "catchUp",
      queuedDepth: 0,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return {
    renderState,
    pushDelta,
    finalize,
    reset,
    flushImmediate,
    controller: controllerRef.current,
  };
}
