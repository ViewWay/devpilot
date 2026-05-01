import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { useI18n } from "../../i18n";

interface ThinkingBlockProps {
  content: string;
  /** Whether the message is still being streamed. When true the block is expanded by default. */
  streaming?: boolean;
}

/**
 * ThinkingBlock — collapsible reasoning/thinking display with smooth animation.
 *
 * Inspired by Codex's history_cell pattern where each cell manages its own
 * expand/collapse state with animation. Uses CSS grid trick for smooth
 * height animation (grid-template-rows: 0fr → 1fr).
 */
export function ThinkingBlock({ content, streaming }: ThinkingBlockProps) {
  const { t } = useI18n();
  // Default expanded during active streaming, collapsed for completed messages
  const [expanded, setExpanded] = useState(streaming ?? false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsOverflow, setNeedsOverflow] = useState(true);

  // When streaming ends, auto-collapse after a brief delay
  const prevStreamingRef = useRef(streaming);
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && expanded) {
      const timer = setTimeout(() => {
        setExpanded(false);
      }, 800);
      return () => {
        clearTimeout(timer);
      };
    }
    prevStreamingRef.current = streaming;
  }, [streaming, expanded]);

  // Disable overflow hidden once transition completes (for text selection, scrolling)
  const handleTransitionEnd = useCallback(() => {
    if (expanded) {
      setNeedsOverflow(false);
    }
  }, [expanded]);

  // Re-enable overflow when collapsing
  useEffect(() => {
    if (!expanded) {
      setNeedsOverflow(true);
    }
  }, [expanded]);

  if (!content) {
    return null;
  }

  // Truncate preview for collapsed state
  const previewText = content.length > 120 ? content.slice(0, 120) + "..." : content;

  return (
    <div className="mb-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-container)]/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-container)]/50 transition-colors"
        aria-expanded={expanded}
        aria-label={expanded ? t("hideThinking") : t("showThinking")}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
        <Brain size={12} className="shrink-0 text-[var(--color-text-secondary)]/70" />
        <span className="italic">
          {streaming ? t("thinking") : t("showThinking")}
        </span>
        {!expanded && !streaming && (
          <span className="ml-2 truncate text-[var(--color-text-secondary)]/50 italic">
            {previewText}
          </span>
        )}
        {streaming && (
          <span className="ml-auto flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] animate-pulse" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] animate-pulse [animation-delay:0.2s]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] animate-pulse [animation-delay:0.4s]" />
          </span>
        )}
      </button>

      {/* Animated collapse/expand using CSS grid trick */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
        onTransitionEnd={handleTransitionEnd}
      >
        <div
          ref={contentRef}
          className="overflow-hidden"
          style={needsOverflow ? { overflow: "hidden" } : { overflow: "visible" }}
        >
          <div className="border-t border-[var(--color-border)] px-3 py-2 text-xs italic leading-relaxed text-[var(--color-text-secondary)] whitespace-pre-wrap">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}
