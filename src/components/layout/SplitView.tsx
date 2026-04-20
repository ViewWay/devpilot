import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/utils";
import { useUIStore } from "../../stores/uiStore";

interface SplitViewProps {
  left: ReactNode;
  right: ReactNode;
  className?: string;
}

export function SplitView({ left, right, className }: SplitViewProps) {
  const panelSize = useUIStore((s) => s.panelSize);
  const setPanelSize = useUIStore((s) => s.setPanelSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        if (!containerRef.current) {return;}
        const rect = containerRef.current.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        const pct = (x / rect.width) * 100;
        setPanelSize(pct);
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
    [setPanelSize],
  );

  return (
    <div
      ref={containerRef}
      className={cn("flex h-full overflow-hidden", className)}
    >
      {/* Left panel (Chat) — min 280px for usable width */}
      <div className="flex min-w-[280px] flex-col overflow-hidden" style={{ width: `${panelSize}%` }}>
        {left}
      </div>

      {/* Drag handle */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors",
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

      {/* Right panel — min 200px */}
      <div className="min-w-[200px] flex-1 overflow-hidden">{right}</div>
    </div>
  );
}
