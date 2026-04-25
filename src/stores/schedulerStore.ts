import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { TaskInfoIPC, TaskActionIPC } from "../lib/ipc";

/** Persisted scheduled task from SQLite. */
export interface ScheduledTaskRecord {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  model: string | null;
  provider: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string;
}

/** Persisted task run from SQLite. */
export interface TaskRunRecord {
  id: string;
  taskId: string;
  status: string;
  result: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

/** Schedule definition for creating tasks. */
export type TaskScheduleDef =
  | { type: "cron"; expr: string }
  | { type: "interval"; seconds: number };

interface SchedulerState {
  tasks: TaskInfoIPC[];
  savedTasks: ScheduledTaskRecord[];
  taskRuns: TaskRunRecord[];
  loading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  fetchSavedTasks: () => Promise<void>;
  fetchTaskRuns: (taskId: string) => Promise<void>;
  createTask: (name: string, schedule: TaskScheduleDef, action: TaskActionIPC, maxExecutions?: number) => Promise<string>;
  removeTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
  saveTask: (task: ScheduledTaskRecord) => Promise<void>;
  deleteSavedTask: (taskId: string) => Promise<void>;
  saveRun: (run: TaskRunRecord) => Promise<void>;
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  tasks: [],
  savedTasks: [],
  taskRuns: [],
  loading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const tasks = await invoke<TaskInfoIPC[]>("scheduler_list_tasks");
      set({ tasks, loading: false });
    } catch (e: unknown) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  fetchSavedTasks: async () => {
    try {
      const savedTasks = await invoke<ScheduledTaskRecord[]>("scheduler_list_saved");
      set({ savedTasks });
    } catch { /* ignore */ }
  },

  fetchTaskRuns: async (taskId) => {
    try {
      const taskRuns = await invoke<TaskRunRecord[]>("scheduler_list_runs", { taskId });
      set({ taskRuns });
    } catch { /* ignore */ }
  },

  createTask: async (name, schedule, action, maxExecutions) => {
    const id = await invoke<string>("scheduler_create_task", { name, schedule, action, maxExecutions });
    await get().fetchTasks();
    return id;
  },

  removeTask: async (taskId) => {
    await invoke("scheduler_remove_task", { taskId });
    await get().fetchTasks();
  },

  pauseTask: async (taskId) => {
    await invoke("scheduler_pause_task", { taskId });
    await get().fetchTasks();
  },

  resumeTask: async (taskId) => {
    await invoke("scheduler_resume_task", { taskId });
    await get().fetchTasks();
  },

  saveTask: async (task) => {
    await invoke("scheduler_save_task", { task });
    await get().fetchSavedTasks();
  },

  deleteSavedTask: async (taskId) => {
    await invoke("scheduler_delete_saved", { taskId });
    await get().fetchSavedTasks();
  },

  saveRun: async (run) => {
    await invoke("scheduler_save_run", { run });
  },
}));
