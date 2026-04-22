import { create } from "zustand";

/**
 * Update info returned by the Tauri updater plugin.
 */
export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

/**
 * Discriminated union for the update lifecycle state.
 */
export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo }
  | { status: "downloading"; progress: number }
  | { status: "installing" }
  | { status: "error"; message: string }
  | { status: "up-to-date" };

interface UpdateStoreState {
  /** Current update lifecycle state. */
  state: UpdateState;
  /** Whether the user has dismissed the update banner this session. */
  dismissed: boolean;

  // Actions
  setState: (state: UpdateState) => void;
  dismiss: () => void;
  reset: () => void;
}

const INITIAL_STATE: UpdateState = { status: "idle" };

export const useUpdateStore = create<UpdateStoreState>((set) => ({
  state: INITIAL_STATE,
  dismissed: false,

  setState: (state) => set({ state }),
  dismiss: () => set({ dismissed: true }),
  reset: () => set({ state: INITIAL_STATE, dismissed: false }),
}));
