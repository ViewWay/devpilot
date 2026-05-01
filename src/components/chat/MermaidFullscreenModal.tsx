import { useEffect, useCallback, useRef, useState } from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useI18n } from "../../i18n";

type MermaidFullscreenModalProps = {
  open: boolean;
  svg: string;
  onClose: () => void;
};

/**
 * MermaidFullscreenModal — full-screen viewer for rendered Mermaid SVGs.
 *
 * Features:
 * - Mouse-wheel zoom + drag-to-pan (CSS transform)
 * - "Download SVG" button
 * - ESC to close
 * - Dark backdrop, centered content
 */
export function MermaidFullscreenModal({ open, svg, onClose }: MermaidFullscreenModalProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Transform state: scale + translate
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  // Dragging state
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const translateStart = useRef({ x: 0, y: 0 });

  // Reset transform when modal opens with new content
  useEffect(() => {
    if (open) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    }
  }, [open, svg]);

  // ESC to close
  useEffect(() => {
    if (!open) {return;}
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {onClose();}
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Wheel zoom (centered on cursor)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((prev) => Math.min(Math.max(prev + delta, 0.1), 10));
    },
    [],
  );

  // Drag-to-pan handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) {return;} // left click only
      dragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
      translateStart.current = { ...translate };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [translate],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) {return;}
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setTranslate({
        x: translateStart.current.x + dx,
        y: translateStart.current.y + dy,
      });
    },
    [],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Download SVG
  const handleDownload = useCallback(() => {
    if (!svg) {return;}
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mermaid-diagram.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [svg]);

  // Zoom controls
  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.25, 10)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.25, 0.1)), []);
  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  if (!open) {return null;}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Content area */}
      <div
        ref={containerRef}
        className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: dragging.current ? "grabbing" : "grab" }}
      >
        <div
          ref={contentRef}
          className="pointer-events-none select-none"
          style={{
            transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging.current ? "none" : "transform 0.15s ease-out",
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* Top-right toolbar */}
      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-end justify-between p-4">
        {/* Top bar */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Download SVG */}
          <button
            type="button"
            onClick={handleDownload}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            title={t("mermaidDownloadSvg")}
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">{t("mermaidDownloadSvg")}</span>
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Bottom-right zoom controls */}
        <div className="pointer-events-auto flex items-center gap-1 self-end">
          <button
            type="button"
            onClick={zoomOut}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            title={t("mermaidZoomOut")}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[3.5rem] text-center text-xs text-white/70">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomIn}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            title={t("mermaidZoomIn")}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            title={t("mermaidResetView")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
