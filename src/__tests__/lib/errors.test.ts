import { describe, it, expect, vi, beforeEach } from "vitest";
import { getErrorMessage, reportError, safeAsync } from "../../lib/errors";

// Mock toastStore
vi.mock("../../stores/toastStore", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

import { toast } from "../../stores/toastStore";

describe("errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("getErrorMessage", () => {
    it("extracts message from Error instances", () => {
      expect(getErrorMessage(new Error("test error"))).toBe("test error");
    });

    it("returns string as-is", () => {
      expect(getErrorMessage("plain string")).toBe("plain string");
    });

    it("extracts message from objects with message property", () => {
      expect(getErrorMessage({ message: "obj error" })).toBe("obj error");
    });

    it("returns fallback for unknown types", () => {
      expect(getErrorMessage(null)).toBe("An unexpected error occurred");
      expect(getErrorMessage(undefined)).toBe("An unexpected error occurred");
      expect(getErrorMessage(42)).toBe("An unexpected error occurred");
    });
  });

  describe("reportError", () => {
    it("logs to console and shows toast", () => {
      const msg = reportError(new Error("fail"));
      expect(msg).toBe("fail");
      expect(console.error).toHaveBeenCalledWith("[DevPilot] fail", expect.any(Error));
      expect(toast.error).toHaveBeenCalledWith("fail", 6000);
    });

    it("prepends context", () => {
      const msg = reportError(new Error("fail"), "ctx");
      expect(msg).toBe("ctx: fail");
      expect(toast.error).toHaveBeenCalledWith("ctx: fail", 6000);
    });
  });

  describe("safeAsync", () => {
    it("returns [result, null] on success", async () => {
      const [result, error] = await safeAsync(() => Promise.resolve(42));
      expect(result).toBe(42);
      expect(error).toBeNull();
    });

    it("returns [null, message] on failure", async () => {
      const [result, error] = await safeAsync(
        () => Promise.reject(new Error("boom")),
        "operation",
      );
      expect(result).toBeNull();
      expect(error).toBe("operation: boom");
      expect(toast.error).toHaveBeenCalledWith("operation: boom", 6000);
    });
  });
});
