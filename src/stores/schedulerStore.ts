import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { TaskInfoIPC, TaskActionIPC } from "../lib/ipc";

interface SchedulerState {
  tasks: TaskInfoIPC[];
  loading: boolean;
  error: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (name: string, cronExpr: string, action: TaskActionIPC, maxExecutions?: number) => Promise<string>;
  removeTask: (taskId: string) => Promise<void>;
  pauseTask: (taskId: string) => Promise<void>;
  resumeTask: (taskId: string) => Promise<void>;
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  tasks: [],
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

  createTask: async (name, cronExpr, action, maxExecutions) => {
    const id = await invoke<string>("scheduler_create_task", { name, cronExpr, action, maxExecutions });
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
}));
