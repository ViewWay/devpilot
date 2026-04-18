import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { createHighlighter, type Highlighter } from "shiki";
import { cn } from "../../lib/utils";

let highlighterPromise: Promise<Highlighter> | undefined;

function getShiki(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [
        "rust", "typescript", "javascript", "python", "go", "toml",
        "json", "yaml", "bash", "shell", "sql", "markdown", "html", "css",
      ],
    });
  }
  return highlighterPromise;
}

interface CodeBlockProps {
  code: string;
  lang?: string;
  className?: string;
}

export function CodeBlock({ code, lang, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  useMemo(() => {
    const language = lang || "text";
    getShiki().then((h) => {
      try {
        const result = h.codeToHtml(code, {
          lang: language,
          themes: { dark: "github-dark", light: "github-light" },
          defaultColor: false,
        });
        setHtml(result);
      } catch {
        setHtml(null);
      }
    });
  }, [code, lang]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border", className)}>
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {lang || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check size={11} /> : <Copy size={11} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {html ? (
        <>
          <div className="shiki-wrapper overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
          <style>{`
            .shiki-wrapper pre { margin: 0 !important; padding: 12px 16px !important; background: transparent !important; }
            .shiki-wrapper code { font-size: 12px !important; line-height: 1.6 !important; }
            .dark .shiki-wrapper .shiki,
            .dark .shiki-wrapper span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg) !important; }
            .shiki-wrapper .shiki,
            .shiki-wrapper span { color: var(--shiki-light) !important; background-color: var(--shiki-light-bg) !important; }
          `}</style>
        </>
      ) : (
        <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
