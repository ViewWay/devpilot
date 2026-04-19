import { create } from "zustand";
import type { CheckpointInfo } from "../types";
import { invoke } from "../lib/ipc";

interface CheckpointState {
  /** Checkpoints for the current session. */
  checkpoints: CheckpointInfo[];
  /** Whether we're loading checkpoints. */
  loading: boolean;
  /** Error message if any. */
  error: string | null;

  /** Load checkpoints for a session. */
  loadCheckpoints: (sessionId: string) => Promise<void>;
  /** Create a new checkpoint. */
  createCheckpoint: (
    sessionId: string,
    messageId: string,
    summary: string,
    tokenCount: number,
  ) => Promise<CheckpointInfo | null>;
  /** Rewind to a checkpoint — returns the number of messages deleted. */
  rewindCheckpoint: (checkpointId: string, sessionId: string) => Promise<number>;
  /** Clear state. */
  clear: () => void;
}

export const useCheckpointStore = create<CheckpointState>((set, get) => ({
  checkpoints: [],
  loading: false,
  error: null,

  loadCheckpoints: async (sessionId: string) => {
    set({ loading: true, error: null });
    try {
      const cps = await invoke<CheckpointInfo[]>("list_checkpoints", { sessionId });
      set({ checkpoints: cps, loading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : "Failed to load checkpoints", loading: false });
    }
  },

  createCheckpoint: async (sessionId, messageId, summary, tokenCount) => {
    try {
      const cp = await invoke<CheckpointInfo>("create_checkpoint", {
        sessionId,
        messageId,
        summary,
        tokenCount,
      });
      // Refresh the list
      await get().loadCheckpoints(sessionId);
      return cp;
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : "Failed to create checkpoint" });
      return null;
    }
  },

  rewindCheckpoint: async (checkpointId, sessionId) => {
    try {
      const deleted = await invoke<number>("rewind_checkpoint", { checkpointId });
      // Refresh the list
      await get().loadCheckpoints(sessionId);
      return deleted;
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : "Failed to rewind" });
      return 0;
    }
  },

  clear: () => set({ checkpoints: [], loading: false, error: null }),
}));
