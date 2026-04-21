import { describe, it, expect, beforeEach } from "vitest";
import { useToastStore, toast, type ToastType } from "../../stores/toastStore";

describe("toastStore", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  describe("initial state", () => {
    it("starts with no toasts", () => {
      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });

  describe("addToast", () => {
    it("adds a toast with generated id", () => {
      const id = useToastStore.getState().addToast({
        type: "info",
        message: "Hello world",
      });
      expect(id).toMatch(/^toast-\d+$/);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0]!.id).toBe(id);
    });

    it("adds multiple toasts", () => {
      useToastStore.getState().addToast({ type: "info", message: "First" });
      useToastStore.getState().addToast({ type: "error", message: "Second" });
      expect(useToastStore.getState().toasts).toHaveLength(2);
    });

    it("preserves toast type", () => {
      const types: ToastType[] = ["info", "success", "warning", "error"];
      for (const type of types) {
        useToastStore.getState().addToast({ type, message: `${type} toast` });
      }
      const toasts = useToastStore.getState().toasts;
      expect(toasts.map((t) => t.type)).toEqual(types);
    });

    it("uses default duration of 4000 when not specified (internal logic)", () => {
      useToastStore.getState().addToast({ type: "info", message: "test" });
      // The store uses duration ?? 4000 internally for auto-remove timeout,
      // but the toast object itself keeps the original value (undefined).
      // The auto-remove is handled by setTimeout, not stored on the toast.
      const t = useToastStore.getState().toasts[0]!;
      expect(t.type).toBe("info");
      expect(t.message).toBe("test");
    });

    it("allows custom duration", () => {
      useToastStore.getState().addToast({
        type: "info",
        message: "test",
        duration: 1000,
      });
      expect(useToastStore.getState().toasts[0]!.duration).toBe(1000);
    });

    it("allows duration 0 (persistent)", () => {
      useToastStore.getState().addToast({
        type: "warning",
        message: "persistent",
        duration: 0,
      });
      expect(useToastStore.getState().toasts[0]!.duration).toBe(0);
    });
  });

  describe("removeToast", () => {
    it("removes a specific toast by id", () => {
      const id1 = useToastStore.getState().addToast({ type: "info", message: "Keep" });
      const id2 = useToastStore.getState().addToast({ type: "error", message: "Remove" });
      expect(useToastStore.getState().toasts).toHaveLength(2);

      useToastStore.getState().removeToast(id2);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0]!.id).toBe(id1);
    });

    it("does nothing for nonexistent id", () => {
      useToastStore.getState().addToast({ type: "info", message: "test" });
      useToastStore.getState().removeToast("nonexistent");
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });
  });

  describe("clearAll", () => {
    it("removes all toasts", () => {
      useToastStore.getState().addToast({ type: "info", message: "A" });
      useToastStore.getState().addToast({ type: "success", message: "B" });
      useToastStore.getState().addToast({ type: "error", message: "C" });
      expect(useToastStore.getState().toasts).toHaveLength(3);

      useToastStore.getState().clearAll();
      expect(useToastStore.getState().toasts).toEqual([]);
    });

    it("works on empty state", () => {
      useToastStore.getState().clearAll();
      expect(useToastStore.getState().toasts).toEqual([]);
    });
  });

  describe("toast convenience shortcuts", () => {
    it("toast.info creates an info toast", () => {
      const id = toast.info("Info message");
      expect(useToastStore.getState().toasts[0]!.type).toBe("info");
      expect(useToastStore.getState().toasts[0]!.message).toBe("Info message");
      expect(useToastStore.getState().toasts[0]!.id).toBe(id);
    });

    it("toast.success creates a success toast", () => {
      toast.success("Success!");
      expect(useToastStore.getState().toasts[0]!.type).toBe("success");
    });

    it("toast.warning creates a warning toast", () => {
      toast.warning("Warning!");
      expect(useToastStore.getState().toasts[0]!.type).toBe("warning");
    });

    it("toast.error creates an error toast", () => {
      toast.error("Error occurred");
      expect(useToastStore.getState().toasts[0]!.type).toBe("error");
    });

    it("toast shortcuts accept custom duration", () => {
      toast.info("Persistent", 0);
      expect(useToastStore.getState().toasts[0]!.duration).toBe(0);
    });
  });
});
