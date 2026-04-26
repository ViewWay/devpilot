import { create } from "zustand";
import { invoke } from "../lib/ipc";

// ── Types ────────────────────────────────────────────────

export type AgentTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface AgentTask {
  id: string;
  title: string;
  description: string;
  status: AgentTaskStatus;
  parentId: string | null;
  result: string | null;
}

// ── Store State ──────────────────────────────────────────

interface AgentState {
  /** List of agent tasks. */
  tasks: AgentTask[];
  /** Whether a task operation is in progress. */
  loading: boolean;
  /** Last error message (null if none). */
  error: string | null;
  /** Whether the agent is in plan mode. */
  planMode: boolean;
}

interface AgentActions {
  /** Fetch tasks, optionally filtered by status and parentId. */
  fetchTasks: (status?: AgentTaskStatus, parentId?: string) => Promise<void>;

  /** Create a new agent task. Returns the new task ID. */
  createTask: (
    title: string,
    description?: string,
    parentId?: string,
  ) => Promise<string>;

  /** Update a task's status and optional result. */
  updateTask: (
    id: string,
    status: AgentTaskStatus,
    result?: string,
  ) => Promise<void>;

  /** Stop a running task. */
  stopTask: (id: string) => Promise<void>;

  /** Check if the agent is currently in plan mode. */
  checkPlanMode: () => Promise<void>;

  /** Enter plan mode. */
  enterPlanMode: () => Promise<void>;

  /** Exit plan mode with an optional plan string. */
  exitPlanMode: (plan?: string) => Promise<void>;

  /** Clear error. */
  clearError: () => void;
}

export const useAgentStore = create<AgentState & AgentActions>()(
  (set, get) => ({
    tasks: [],
    loading: false,
    error: null,
    planMode: false,

    fetchTasks: async (status?: AgentTaskStatus, parentId?: string) => {
      set({ loading: true, error: null });
      try {
        const tasks = await invoke<AgentTask[]>("agent_task_list", {
          status: status ?? null,
          parentId: parentId ?? null,
        });
        set({ tasks, loading: false });
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    createTask: async (
      title: string,
      description?: string,
      parentId?: string,
    ) => {
      set({ loading: true, error: null });
      try {
        const id = await invoke<string>("agent_task_create", {
          title,
          description: description ?? null,
          parentId: parentId ?? null,
        });
        // Refresh tasks after creation
        await get().fetchTasks();
        return id;
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
        throw e;
      }
    },

    updateTask: async (
      id: string,
      status: AgentTaskStatus,
      result?: string,
    ) => {
      set({ loading: true, error: null });
      try {
        await invoke<void>("agent_task_update", {
          id,
          status,
          result: result ?? null,
        });
        // Refresh tasks after update
        await get().fetchTasks();
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    stopTask: async (id: string) => {
      set({ loading: true, error: null });
      try {
        await invoke<void>("agent_task_stop", { id });
        await get().fetchTasks();
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    checkPlanMode: async () => {
      try {
        const planMode = await invoke<boolean>("agent_is_plan_mode");
        set({ planMode });
      } catch (e: unknown) {
        set({ error: String(e) });
      }
    },

    enterPlanMode: async () => {
      set({ loading: true, error: null });
      try {
        await invoke<void>("agent_enter_plan_mode");
        set({ planMode: true, loading: false });
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    exitPlanMode: async (plan?: string) => {
      set({ loading: true, error: null });
      try {
        await invoke<void>("agent_exit_plan_mode", { plan: plan ?? null });
        set({ planMode: false, loading: false });
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    clearError: () => set({ error: null }),
  }),
);
