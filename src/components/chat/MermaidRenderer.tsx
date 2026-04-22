import { useEffect, useRef, useState } from "react";

type MermaidRendererProps = {
  /** Mermaid diagram definition text. */
  chart: string;
  /** Optional class name. */
  className?: string;
};

// Lazy-loaded mermaid module — keeps the ~1.5MB mermaid out of the main bundle.
import type MermaidAPI from "mermaid";

let mermaidInstance: typeof MermaidAPI | null = null;
let mermaidInitPromise: Promise<typeof MermaidAPI> | null = null;
let mermaidInitialized = false;

async function loadMermaid(): Promise<typeof MermaidAPI> {
  if (mermaidInstance) {
    return mermaidInstance;
  }
  if (mermaidInitPromise) {
    return mermaidInitPromise;
  }

  mermaidInitPromise = (async () => {
    const mod = await import("mermaid");
    const api = mod.default;
    if (!mermaidInitialized) {
      api.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "var(--font-mono)",
      });
      mermaidInitialized = true;
    }
    mermaidInstance = api;
    return api;
  })();

  return mermaidInitPromise;
}

/**
 * MermaidRenderer — renders Mermaid diagram definitions as SVG.
 * Used by MarkdownRenderer to render ```mermaid code blocks.
 *
 * Mermaid is loaded on-demand via dynamic import() to avoid
 * inflating the initial JS bundle (~1.5MB saved).
 */
export function MermaidRenderer({ chart, className = "" }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      try {
        const api = await loadMermaid();
        if (cancelled) {
          return;
        }
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const { svg: renderedSvg } = await api.render(id, chart.trim());
        if (!cancelled) {
          setSvg(renderedSvg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setSvg("");
        }
      }
    }

    renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return (
      <div className={`rounded-lg border border-[var(--color-error)]/30 bg-[var(--color-error)]/5 px-3 py-2 text-xs text-[var(--color-error)] ${className}`}>
        <div className="font-medium mb-1">Mermaid render error</div>
        <pre className="whitespace-pre-wrap text-[11px] opacity-80">{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className={`flex items-center justify-center py-8 ${className}`}>
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-brand)]" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-x-auto rounded-lg border border-[var(--color-border)]/40 bg-[var(--color-surface-container)]/20 p-4 ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
