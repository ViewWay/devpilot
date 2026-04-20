import { useState, useEffect } from "react";
import { getHighlighter, resolveLang, ensureLang } from "@/lib/shiki";

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

    getHighlighter().then(async (h) => {
      try {
        // Try direct use first (for pre-loaded langs)
        let resolvedLang: string;
        if (h.getLoadedLanguages().includes(language)) {
          resolvedLang = language;
        } else {
          resolvedLang = await ensureLang(language);
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

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  if (html) {
    return (
      <>
        <div
          className="shiki-wrapper overflow-x-auto relative"
          dangerouslySetInnerHTML={{ __html: html }}
        />
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
