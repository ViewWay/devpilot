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
      loading: false,
      error: null,
    });
  });

  describe("fetchTasks", () => {
    it("loads tasks successfully", async () => {
      const mockTasks = [
        { id: "t1", name: "Task 1", cronExpr: "0 * * * *", action: { type: "shellCommand", command: "echo hi" }, status: "Active", executionCount: 5, maxExecutions: null, createdAt: "2026-01-01T00:00:00Z", nextRun: "2026-01-01T01:00:00Z" },
      ];
      mockInvoke.mockResolvedValueOnce(mockTasks);

      await useSchedulerStore.getState().fetchTasks();
      expect(useSchedulerStore.getState().tasks).toEqual(mockTasks);
      expect(useSchedulerStore.getState().loading).toBe(false);
      expect(useSchedulerStore.getState().error).toBeNull();
    });

    it("handles errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("DB error"));

      await useSchedulerStore.getState().fetchTasks();
      expect(useSchedulerStore.getState().error).toBe("DB error");
      expect(useSchedulerStore.getState().loading).toBe(false);
    });
  });

  describe("createTask", () => {
    it("creates a task and refreshes", async () => {
      mockInvoke
        .mockResolvedValueOnce("new-task-id")
        .mockResolvedValueOnce([]);

      const action = { type: "shellCommand" as const, command: "echo hi" };
      const id = await useSchedulerStore.getState().createTask("Test", "0 * * * *", action);
      expect(id).toBe("new-task-id");
      expect(mockInvoke).toHaveBeenCalledWith("scheduler_create_task", {
        name: "Test",
        cronExpr: "0 * * * *",
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
});
