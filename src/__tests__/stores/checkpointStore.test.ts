import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCheckpointStore } from "../../stores/checkpointStore";

// Mock IPC
vi.mock("../../lib/ipc", () => ({
  invoke: vi.fn(),
  isTauriRuntime: () => true,
}));

import { invoke } from "../../lib/ipc";
const mockInvoke = invoke as ReturnType<typeof vi.fn>;

describe("checkpointStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCheckpointStore.setState({
      checkpoints: [],
      loading: false,
      error: null,
    });
  });

  describe("loadCheckpoints", () => {
    it("loads checkpoints successfully", async () => {
      const mockCheckpoints = [
        { id: "cp1", sessionId: "s1", messageId: "m1", summary: "Before refactor", tokenCount: 1500, createdAt: "2026-01-01T00:00:00Z" },
      ];
      mockInvoke.mockResolvedValueOnce(mockCheckpoints);

      await useCheckpointStore.getState().loadCheckpoints("s1");
      expect(useCheckpointStore.getState().checkpoints).toEqual(mockCheckpoints);
      expect(useCheckpointStore.getState().loading).toBe(false);
    });

    it("handles errors", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("DB error"));

      await useCheckpointStore.getState().loadCheckpoints("s1");
      expect(useCheckpointStore.getState().error).toBe("DB error");
      expect(useCheckpointStore.getState().loading).toBe(false);
    });
  });

  describe("createCheckpoint", () => {
    it("creates a checkpoint and refreshes", async () => {
      const mockCp = { id: "cp2", sessionId: "s1", messageId: "m2", summary: "test", tokenCount: 100, createdAt: "2026-01-01T00:00:00Z" };
      mockInvoke
        .mockResolvedValueOnce(mockCp)
        .mockResolvedValueOnce([mockCp]);

      const result = await useCheckpointStore.getState().createCheckpoint("s1", "m2", "test", 100);
      expect(result).toEqual(mockCp);
      expect(mockInvoke).toHaveBeenCalledWith("create_checkpoint", {
        sessionId: "s1",
        messageId: "m2",
        summary: "test",
        tokenCount: 100,
      });
    });

    it("returns null on error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fail"));

      const result = await useCheckpointStore.getState().createCheckpoint("s1", "m2", "test", 100);
      expect(result).toBeNull();
      expect(useCheckpointStore.getState().error).toBe("fail");
    });
  });

  describe("rewindCheckpoint", () => {
    it("rewinds and returns deleted count", async () => {
      mockInvoke
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce([]);

      const deleted = await useCheckpointStore.getState().rewindCheckpoint("cp1", "s1");
      expect(deleted).toBe(3);
      expect(mockInvoke).toHaveBeenCalledWith("rewind_checkpoint", { checkpointId: "cp1" });
    });

    it("returns 0 on error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("fail"));

      const deleted = await useCheckpointStore.getState().rewindCheckpoint("cp1", "s1");
      expect(deleted).toBe(0);
      expect(useCheckpointStore.getState().error).toBe("fail");
    });
  });

  describe("clear", () => {
    it("resets state", () => {
      useCheckpointStore.setState({
        checkpoints: [{ id: "cp1", sessionId: "s1", messageId: "m1", summary: "x", tokenCount: 0, createdAt: "" }],
        loading: true,
        error: "err",
      });

      useCheckpointStore.getState().clear();
      expect(useCheckpointStore.getState().checkpoints).toEqual([]);
      expect(useCheckpointStore.getState().loading).toBe(false);
      expect(useCheckpointStore.getState().error).toBeNull();
    });
  });
});
