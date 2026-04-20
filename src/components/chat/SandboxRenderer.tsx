import { useState, useRef, useCallback, useEffect, Component } from "react";
import { AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

// ── Error Boundary ──────────────────────────────────────────

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class SandboxErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
          <AlertCircle size={20} className="text-destructive" />
          <p className="text-xs text-destructive">Sandbox render error</p>
          <button
            onClick={this.reset}
            className="text-[10px] text-muted-foreground underline hover:text-foreground"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Resize Handle ───────────────────────────────────────────

function ResizeHandle({
  height,
  onHeightChange,
}: {
  height: number;
  onHeightChange: (h: number) => void;
}) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startH.current = height;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) {return;}
      const delta = e.clientY - startY.current;
      const next = Math.max(150, Math.min(800, startH.current + delta));
      onHeightChange(next);
    },
    [onHeightChange],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      className="flex cursor-row-resize items-center justify-center border-t border-border bg-muted/30 py-0.5 transition-colors hover:bg-muted/60"
    >
      <div className="h-0.5 w-6 rounded-full bg-muted-foreground/30" />
    </div>
  );
}

// ── SandboxRenderer ─────────────────────────────────────────

interface SandboxRendererProps {
  /** HTML content to render inside the sandboxed iframe. */
  code: string;
  /** Optional title for the iframe document. */
  title?: string;
  /** Default height in pixels. Defaults to 300. */
  defaultHeight?: number;
  /** Additional class names for the outer wrapper. */
  className?: string;
}

export function SandboxRenderer({
  code,
  title,
  defaultHeight = 300,
  className,
}: SandboxRendererProps) {
  const { t } = useI18n();
  const [height, setHeight] = useState(defaultHeight);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build the srcdoc content
  const srcdoc = buildSrcdoc(code, title);

  // Re-enter loading state when code changes
  useEffect(() => {
    setLoading(true);
  }, [code]);

  const handleLoad = useCallback(() => {
    setLoading(false);
  }, []);

  const handleOpenInNewTab = useCallback(() => {
    const blob = new Blob([srcdoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // Revoke after a short delay so the new tab can load it
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [srcdoc]);

  return (
    <SandboxErrorBoundary>
      <div className={cn("relative flex flex-col overflow-hidden rounded-b-lg", className)}>
        {/* iframe container */}
        <div className="relative flex-1" style={{ height }}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
                <span className="text-xs">{t("sandboxLoading")}</span>
              </div>
            </div>
          )}
          <iframe
            ref={iframeRef}
            srcDoc={srcdoc}
            sandbox="allow-scripts"
            onLoad={handleLoad}
            title={title ?? t("sandboxPreview")}
            className="h-full w-full border-0 bg-[var(--color-surface-container-lowest)]"
          />
        </div>

        {/* Resize handle */}
        <ResizeHandle height={height} onHeightChange={setHeight} />

        {/* Bottom action bar */}
        <div className="flex items-center border-t border-border bg-muted/30 px-2 py-1">
          <button
            onClick={handleOpenInNewTab}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title={t("sandboxOpenNewTab")}
          >
            <ExternalLink size={10} />
            {t("sandboxOpenNewTab")}
          </button>
        </div>
      </div>
    </SandboxErrorBoundary>
  );
}

// ── Helper ──────────────────────────────────────────────────

/**
 * Wraps the provided code in a full HTML document for srcdoc.
 * If the code already looks like a complete HTML document (has <html> or <head>),
 * it is returned as-is. Otherwise, it is wrapped in a basic HTML scaffold.
 */
function buildSrcdoc(code: string, title?: string): string {
  const trimmed = code.trim();

  // If already a full document, return as-is
  if (/^<!doctype\s+html/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    return trimmed;
  }

  // Wrap in scaffold
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${title ? `<title>${escapeHtml(title)}</title>` : ""}
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
${trimmed}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
