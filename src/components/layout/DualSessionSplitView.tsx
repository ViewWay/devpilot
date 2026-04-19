import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/uiStore";

interface DualSessionSplitViewProps {
  primary: ReactNode;
  secondary: ReactNode;
  className?: string;
}

/**
 * A resizable split view layout for dual session display.
 * Renders two panels side-by-side with a draggable divider.
 * Stacks vertically on mobile (< 768px).
 */
export function DualSessionSplitView({ primary, secondary, className }: DualSessionSplitViewProps) {
  const splitViewSize = useUIStore((s) => s.splitViewSize);
  const setSplitViewSize = useUIStore((s) => s.setSplitViewSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!containerRef.current) { return; }
        const rect = containerRef.current.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        setSplitViewSize(pct);
      };

      const onMouseUp = () => {
        setDragging(false);
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [setSplitViewSize],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-full overflow-hidden",
        // Stack vertically on mobile
        "flex-col md:flex-row",
        className,
      )}
    >
      {/* Primary panel (left on desktop, top on mobile) */}
      <div
        className="flex min-w-0 min-h-0 flex-col overflow-hidden"
        style={{
          width: `${splitViewSize}%`,
          // On mobile, use percentage of height
        }}
      >
        {primary}
      </div>

      {/* Drag handle — hidden on mobile */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "group relative hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors border-x border-border/50",
          dragging ? "bg-primary/30" : "bg-transparent hover:bg-primary/20",
        )}
      >
        <div
          className={cn(
            "h-8 w-0.5 rounded-full transition-colors",
            dragging ? "bg-primary" : "bg-border group-hover:bg-primary/50",
          )}
        />
      </div>

      {/* Mobile divider — visible only on mobile */}
      <div className="h-px bg-border md:hidden" />

      {/* Secondary panel (right on desktop, bottom on mobile) */}
      <div className="min-w-0 min-h-0 flex-1 overflow-hidden">
        {secondary}
      </div>
    </div>
  );
}
