import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useI18n } from "../../i18n";
import type { CitationSource } from "../../types";

interface SourcesListProps {
  sources: CitationSource[];
}

/**
 * SourcesList — a collapsible "Sources (N)" section that lists all
 * citation sources with ExternalLink icons.
 */
export function SourcesList({ sources }: SourcesListProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        aria-expanded={expanded}
      >
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`}
        />
        <ExternalLink size={12} className="shrink-0 text-muted-foreground/70" />
        <span>
          {t("citation.sources")} ({sources.length})
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {sources.map((src) => {
            const displayTitle = src.title || t("citation.noTitle");
            return (
              <div key={src.index} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-0.5 shrink-0 font-semibold leading-none"
                  style={{ color: "var(--color-brand)" }}
                >
                  [{src.index}]
                </span>
                <div className="min-w-0 flex-1">
                  {src.url ? (
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium hover:underline"
                      style={{ color: "var(--color-brand)" }}
                    >
                      <span className="truncate">{displayTitle}</span>
                      <ExternalLink size={10} className="shrink-0" />
                    </a>
                  ) : (
                    <span className="font-medium">{displayTitle}</span>
                  )}
                  {src.snippet && (
                    <p className="mt-0.5 leading-snug text-muted-foreground line-clamp-2">
                      {src.snippet}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
