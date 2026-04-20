import { useState, useEffect } from "react";
import { createHighlighter, type Highlighter } from "shiki";

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
  tf: "hcl",
};

function resolveLang(lang: string | undefined): string {
  if (!lang) {
    return "text";
  }
  const lower = lang.toLowerCase().replace(/[-_.]/g, "");
  if (LANG_ALIASES[lower]) {
    return LANG_ALIASES[lower];
  }
  return lang.toLowerCase();
}

/** Only load the two themes we use (no grammars — those load on demand). */
function getShiki(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-dark", "github-light"],
      langs: [],
    });
  }
  return highlighterPromise;
}

const CORE_LANGS = new Set([
  "rust", "typescript", "javascript", "python", "go", "java",
  "c", "cpp", "csharp", "html", "css", "json", "yaml", "toml",
  "bash", "shell", "sql", "diff", "markdown", "xml",
]);

/** Dynamically load a language grammar only when needed. */
async function ensureLang(highlighter: Highlighter, lang: string): Promise<string> {
  const resolved = resolveLang(lang);
  if (resolved === "text") { return "text"; }

  const loaded = highlighter.getLoadedLanguages();
  if (loaded.includes(resolved)) {
    return resolved;
  }

  // Only try to load known core languages — others fall back to text gracefully
  if (!CORE_LANGS.has(resolved)) {
    return "text";
  }

  try {
    // shiki 3.x+ supports dynamic grammar loading
    const shikiModule = await import("shiki");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadLang = (shikiModule as any).loadBundledLanguage ?? (shikiModule as any).bundledLanguages?.[resolved];
    if (loadLang) {
      await highlighter.loadLanguage(await loadLang());
      return resolved;
    }
  } catch {
    // fall through — language grammar not available
  }

  // Fallback: try loading directly (shiki 4.x)
  try {
    const grammarImport = await import(`shiki/langs/${resolved}`);
    if (grammarImport?.default) {
      await highlighter.loadLanguage(grammarImport.default);
      return resolved;
    }
  } catch {
    // grammar not available
  }

  return loaded.includes(resolved) ? resolved : "text";
}

interface CodeBlockInnerProps {
  code: string;
  lang?: string;
}

/**
 * Inner code block that uses shiki for syntax highlighting.
 * Lazy-loaded to keep shiki-core out of the main bundle.
 * Only loads language grammars on demand to reduce initial load.
 */
export function CodeBlockInner({ code, lang }: CodeBlockInnerProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const language = resolveLang(lang);

    getShiki().then(async (h) => {
      try {
        // Try direct use first (for pre-loaded langs)
        let resolvedLang: string;
        if (h.getLoadedLanguages().includes(language)) {
          resolvedLang = language;
        } else {
          resolvedLang = await ensureLang(h, language);
        }

        if (cancelled) {
          return;
        }

        const result = h.codeToHtml(code, {
          lang: resolvedLang,
          themes: { dark: "github-dark", light: "github-light" },
          defaultColor: false,
        });
        setHtml(result);
      } catch {
        if (!cancelled) {
          setHtml(null);
        }
      }
    });

    return () => { cancelled = true; };
  }, [code, lang]);

  if (html) {
    return (
      <>
        <div className="shiki-wrapper overflow-x-auto relative" dangerouslySetInnerHTML={{ __html: html }} />
        <style>{`
          .shiki-wrapper pre { margin: 0 !important; padding: 12px 16px !important; background: transparent !important; }
          .shiki-wrapper code { font-size: 12px !important; line-height: 1.6 !important; }
          .dark .shiki-wrapper .shiki,
          .dark .shiki-wrapper span { color: var(--shiki-dark) !important; background-color: var(--shiki-dark-bg) !important; }
          .shiki-wrapper .shiki,
          .shiki-wrapper span { color: var(--shiki-light) !important; background-color: var(--shiki-light-bg) !important; }
        `}</style>
      </>
    );
  }

  return (
    <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
      <code>{code}</code>
    </pre>
  );
}
