/**
 * Unified error handling utilities for DevPilot.
 *
 * Every component/store should use these helpers instead of
 * calling toast.error() or setError() individually.
 */
import { toast } from "../stores/toastStore";

/**
 * Extract a human-readable message from an unknown error.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "An unexpected error occurred";
}

/**
 * Report an error: logs to console + shows toast.
 * Use this as the single entry point for all user-facing errors.
 */
export function reportError(err: unknown, context?: string): string {
  const message = getErrorMessage(err);
  const full = context ? `${context}: ${message}` : message;

  console.error(`[DevPilot] ${full}`, err);
  toast.error(full, 6000);

  return full;
}

/**
 * Wrap an async operation with unified error handling.
 * Returns [result, error] tuple — error is null on success.
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<[T | null, string | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (err: unknown) {
    const msg = reportError(err, context);
    return [null, msg];
  }
}
