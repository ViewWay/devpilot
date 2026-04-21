/**
 * StreamingIndicator — pulsing cursor shown during streaming responses.
 */
export function StreamingIndicator() {
  return (
    <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--color-brand)] ml-0.5 align-text-bottom" />
  );
}
