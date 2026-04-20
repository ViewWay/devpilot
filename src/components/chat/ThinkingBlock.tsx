import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { useI18n } from "../../i18n";

interface ThinkingBlockProps {
  content: string;
  /** Whether the message is still being streamed. When true the block is expanded by default. */
  streaming?: boolean;
}

export function ThinkingBlock({ content, streaming }: ThinkingBlockProps) {
  const { t } = useI18n();
  // Default expanded during active streaming, collapsed for completed messages
  const [expanded, setExpanded] = useState(streaming ?? false);

  if (!content) {return null;}

  return (
    <div className="mb-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        aria-expanded={expanded}
        aria-label={expanded ? t("hideThinking") : t("showThinking")}
      >
        <ChevronRight
          size={12}
          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
        <Brain size={12} className="shrink-0 text-muted-foreground/70" />
        <span className="italic">{streaming ? t("thinking") : t("showThinking")}</span>
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 text-xs italic leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}
