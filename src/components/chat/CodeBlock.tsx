import { useState, lazy, Suspense } from "react";
import { Copy, Check, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

/**
 * Lazy-load shiki to avoid bundling the 9MB shiki-core in the main chunk.
 * The heavy code-to-html highlighting work is deferred until first code block renders.
 */
const LazyCodeBlock = lazy(() =>
  import("./CodeBlockInner").then((m) => ({ default: m.CodeBlockInner })),
);

interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
}

export function CodeBlock({ code, lang, className }: CodeBlockProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border", className)} role="region" aria-label={t("a11y.codeBlockRegion")}>
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {lang || "code"}
          </span>
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground"
            aria-label={t("a11y.toggleLineNumbers")}
          >
            {t("lineNumbers")}
          </button>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
          aria-label={t("a11y.copyCode")}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <Loader2 size={12} className="animate-spin" />
            <span>Loading syntax highlighter...</span>
          </div>
        }
      >
        <LazyCodeBlock code={code} lang={lang} />
      </Suspense>
    </div>
  );
}
