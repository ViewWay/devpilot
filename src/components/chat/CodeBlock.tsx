import { useState, useMemo } from "react";
import { Copy, Check } from "lucide-react";
import { createHighlighter, type Highlighter } from "shiki";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

let highlighterPromise: Promise<Highlighter> | undefined;

/** Map common language aliases to Shiki language IDs. */
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  jsx: "javascript",
  sh: "shell",
  zsh: "shell",
  py: "python",
  rb: "ruby",
  rs: "rust",
  golang: "go",
  cs: "csharp",
  makefile: "ini",
  docker: "dockerfile",
  yml: "yaml",
  md: "markdown",
  proto: "protobuf",
  tf: "hcl",  // Terraform — may not be available, falls back gracefully
};

function resolveLang(lang: string | undefined): string {
  if (!lang) {
    return "text";
  }
  const lower = lang.toLowerCase().replace(/[-_.]/g, "");
  // Direct match first
  if (LANG_ALIASES[lower]) {
    return LANG_ALIASES[lower];
  }
  // Try original lowercase
  return lang.toLowerCase();
}

function getShiki(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [
        // Core languages
        "rust", "typescript", "javascript", "python", "go", "java",
        "c", "cpp", "csharp",
        // Web & markup
        "html", "css", "scss", "json", "yaml", "toml", "xml",
        "markdown", "mdx",
        // Shell & scripting
        "bash", "shell", "powershell", "lua", "perl", "ruby", "php",
        // Data & query
        "sql", "graphql", "protobuf",
        // Systems & infra
        "dockerfile", "nix", "ini",
        // Functional & other
        "haskell", "elixir", "kotlin", "swift", "scala", "zig",
        // Config formats
        "diff",
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
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [showLineNumbers, setShowLineNumbers] = useState(false);

  useMemo(() => {
    const language = resolveLang(lang);
    getShiki().then((h) => {
      try {
        // Check if language is loaded; fall back to 'text' if not
        const resolvedLang = h.getLoadedLanguages().includes(language) ? language : "text";
        const result = h.codeToHtml(code, {
          lang: resolvedLang,
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
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border", className)} role="region" aria-label={t("a11y.codeBlockRegion")}>
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {lang || "code"}
          </span>
          <button
            onClick={() => setShowLineNumbers((v) => !v)}
            className="text-[10px] text-muted-foreground hover:text-foreground"
            aria-label={t("a11y.toggleLineNumbers")}
            aria-pressed={showLineNumbers}
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
      {html ? (
        <>
          <div className={cn("shiki-wrapper overflow-x-auto relative", showLineNumbers && "with-line-numbers")} dangerouslySetInnerHTML={{ __html: html }} />
          {showLineNumbers && (
            <div className="absolute top-[34px] left-0 bottom-0 w-10 flex flex-col border-r border-border/50 bg-muted/30 select-none pointer-events-none" style={{ paddingTop: 12, paddingBottom: 12 }}>
              {code.split("\n").map((_, i) => (
                <div key={i} className="text-right pr-2 text-[11px] leading-[1.6] text-muted-foreground/60">{i + 1}</div>
              ))}
            </div>
          )}
          <style>{`
            .shiki-wrapper pre { margin: 0 !important; padding: 12px 16px !important; background: transparent !important; }
            .shiki-wrapper code { font-size: 12px !important; line-height: 1.6 !important; }
            .shiki-wrapper.with-line-numbers code { padding-left: 48px !important; }
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
