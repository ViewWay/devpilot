import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSchedulerStore } from "../../stores/schedulerStore";

// Mock IPC
vi.mock("../../lib/ipc", () => ({
  invoke: vi.fn(),
  isTauriRuntime: () => true,
}));

import { invoke } from "../../lib/ipc";
const mockInvoke = invoke as ReturnType<typeof vi.fn>;

describe("schedulerStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSchedulerStore.setState({
      tasks: [],
      savedTasks: [],
      taskRuns: [],
      loading: false,
      error: null,
    });
  });

  describe("fetchTasks", () => {
    it("loads tasks successfully", async () => {
      const mockTasks = [
        { id: "t1", name: "Task 1", cronExpr: "0 * * * *", scheduleType: "cron", action: { type: "shellCommand", command: "echo hi" }, status: "Active", executionCount: 5, maxExecutions: null, createdAt: "2026-01-01T00:00:00Z", nextRun: "2026-01-01T01:00:00Z" },
      ];
      mockInvoke.mockResolvedValueOnce(mockTasks);

      await useSchedulerStore.getState().fetchTasks();
      expect(useSchedulerStore.getState().tasks).toEqual(mockTasks);
      expect(useSchedulerStore.getState().loading).toBe(false);
      expect(useSchedulerStore.getState().error).toBeNull();
    });

    it("loads interval tasks successfully", async () => {
      const mockTasks = [
        { id: "t2", name: "Interval Task", intervalSeconds: 30, scheduleType: "interval", status: "Active", executionCount: 100, maxExecutions: null },
      ];
      mockInvoke.mockResolvedValueOnce(mockTasks);

      await useSchedulerStore.getState().fetchTasks();
      expect(useSchedulerStore.getState().tasks).toEqual(mockTasks);
    });

    it("handles errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("DB error"));

      await useSchedulerStore.getState().fetchTasks();
      expect(useSchedulerStore.getState().error).toBe("DB error");
      expect(useSchedulerStore.getState().loading).toBe(false);
    });
  });

  describe("createTask", () => {
    it("creates a cron task and refreshes", async () => {
      mockInvoke
        .mockResolvedValueOnce("new-task-id")
        .mockResolvedValueOnce([]);

      const action = { type: "shellCommand" as const, command: "echo hi" };
      const schedule = { type: "cron" as const, expr: "0 * * * *" };
      const id = await useSchedulerStore.getState().createTask("Test", schedule, action);
      expect(id).toBe("new-task-id");
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_create_task", {
        name: "Test",
        schedule,
        action,
        maxExecutions: undefined,
      });
    });

    it("creates an interval task and refreshes", async () => {
      mockInvoke
        .mockResolvedValueOnce("interval-task-id")
        .mockResolvedValueOnce([]);

      const action = { type: "shellCommand" as const, command: "collect-metrics" };
      const schedule = { type: "interval" as const, seconds: 30 };
      const id = await useSchedulerStore.getState().createTask("Metrics", schedule, action);
      expect(id).toBe("interval-task-id");
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_create_task", {
        name: "Metrics",
        schedule,
        action,
        maxExecutions: undefined,
      });
    });
  });

  describe("removeTask", () => {
    it("removes a task and refreshes", async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useSchedulerStore.getState().removeTask("t1");
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_remove_task", { taskId: "t1" });
    });
  });

  describe("pauseTask", () => {
    it("pauses a task and refreshes", async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useSchedulerStore.getState().pauseTask("t1");
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_pause_task", { taskId: "t1" });
    });
  });

  describe("resumeTask", () => {
    it("resumes a task and refreshes", async () => {
      mockInvoke
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useSchedulerStore.getState().resumeTask("t1");
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_resume_task", { taskId: "t1" });
    });
  });

  describe("fetchSavedTasks", () => {
    it("loads persisted tasks", async () => {
      const mockSaved = [
        { id: "st1", name: "Daily", schedule: "0 9 * * *", prompt: "Hello", model: "gpt-4o", provider: "openai", enabled: true, lastRunAt: null, nextRunAt: null, createdAt: "2026-01-01T00:00:00Z" },
      ];
      mockInvoke.mockResolvedValueOnce(mockSaved);

      await useSchedulerStore.getState().fetchSavedTasks();
      expect(useSchedulerStore.getState().savedTasks).toEqual(mockSaved);
    });
  });

  describe("saveTask", () => {
    it("persists a task and refreshes", async () => {
      const task = { id: "st2", name: "Weekly", schedule: "0 0 * * 1", prompt: "Summary", model: null, provider: null, enabled: true, lastRunAt: null, nextRunAt: null, createdAt: "2026-01-01T00:00:00Z" };
      mockInvoke
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useSchedulerStore.getState().saveTask(task);
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_save_task", { task });
    });
  });

  describe("saveRun", () => {
    it("persists a task run", async () => {
      const run = { id: "r1", taskId: "st1", status: "done", result: "OK", error: null, startedAt: "2026-01-01T00:00:00Z", completedAt: "2026-01-01T00:00:05Z" };
      mockInvoke.mockResolvedValueOnce(undefined);

      await useSchedulerStore.getState().saveRun(run);
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_save_run", { run });
    });
  });
});
