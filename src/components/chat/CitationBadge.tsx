import { useState } from "react";
import { useI18n } from "../../i18n";
import type { CitationSource } from "../../types";

interface CitationBadgeProps {
  source: CitationSource;
}

/**
 * CitationBadge — an inline superscript [N] badge that shows a hover
 * tooltip with the source title, URL, and snippet.
 */
export function CitationBadge({ source }: CitationBadgeProps) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  return (
    <span
      className="relative inline-flex items-center align-super"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        className="cursor-default rounded px-0.5 text-[10px] font-semibold leading-none"
        style={{ color: "var(--color-brand)" }}
      >
        [{source.index}]
      </span>

      {show && (
        <span
          className="absolute bottom-full left-1/2 z-50 mb-1 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
          role="tooltip"
        >
          {/* Title */}
          {source.title && (
            <div className="mb-1 font-medium leading-snug">{source.title}</div>
          )}

          {/* URL */}
          {source.url && (
            <div className="mb-1 truncate text-[10px] text-muted-foreground">
              {source.url}
            </div>
          )}

          {/* Snippet */}
          {source.snippet && (
            <div className="line-clamp-3 leading-snug text-muted-foreground">
              {source.snippet}
            </div>
          )}

          {/* Fallback when nothing is provided */}
          {!source.title && !source.url && !source.snippet && (
            <div className="text-muted-foreground">{t("citation.noTitle")}</div>
          )}
        </span>
      )}
    </span>
  );
}
