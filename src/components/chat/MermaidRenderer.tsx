import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

type MermaidRendererProps = {
  /** Mermaid diagram definition text. */
  chart: string;
  /** Optional class name. */
  className?: string;
};

let mermaidInitialized = false;

/**
 * MermaidRenderer — renders Mermaid diagram definitions as SVG.
 * Used by MarkdownRenderer to render ```mermaid code blocks.
 */
export function MermaidRenderer({ chart, className = "" }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "var(--font-mono)",
      });
      mermaidInitialized = true;
    }

    let cancelled = false;

    async function renderChart() {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart.trim());
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
