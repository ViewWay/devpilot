/**
 * Lightweight Shiki highlighter setup.
 *
 * Uses @shikijs/core to avoid bundling every language/theme upfront.
 * Only loads the 2 themes + languages actually used in code blocks.
 * This reduces the shiki chunk from ~9.5 MB to ~200 KB.
 */
import { createHighlighterCore } from "@shikijs/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;

/**
 * Map common language aliases to Shiki language IDs.
 */
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

/**
 * Resolve a language name (handling aliases).
 */
export function resolveLang(lang: string | undefined): string {
  if (!lang) {
    return "text";
  }
  const lower = lang.toLowerCase().replace(/[-_.]/g, "");
  if (LANG_ALIASES[lower]) {
    return LANG_ALIASES[lower];
  }
  return lang.toLowerCase();
}

/**
 * Pre-loaded languages — the most common ones for a coding agent.
 * These are loaded at highlighter creation time so they're instantly available.
 */
const PRELOADED_LANGS = [
  "rust",
  "typescript",
  "javascript",
  "python",
  "go",
  "java",
  "c",
  "cpp",
  "html",
  "css",
  "json",
  "yaml",
  "toml",
  "bash",
  "sql",
  "diff",
  "markdown",
  "xml",
];

/** Set of languages that we know how to load dynamically. */
const KNOWN_LANGS = new Set([
  ...PRELOADED_LANGS,
  "shell",
  "csharp",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "scala",
  "r",
  "lua",
  "perl",
  "dockerfile",
  "ini",
  "protobuf",
  "hcl",
  "graphql",
  "vue",
  "svelte",
]);

/**
 * Create (or return cached) highlighter instance.
 * Loads themes + core languages upfront; others load on demand.
 */
export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [
        import("shiki/themes/github-dark.mjs"),
        import("shiki/themes/github-light.mjs"),
      ],
      langs: PRELOADED_LANGS.map((lang) => import(`shiki/langs/${lang}.mjs`)),
      engine: createOnigurumaEngine(import("shiki/wasm")),
    });
  }
  return highlighterPromise;
}

/**
 * Dynamically load a language grammar if not already loaded.
 * Returns the resolved language ID or "text" as fallback.
 */
export async function ensureLang(
  lang: string,
): Promise<string> {
  const resolved = resolveLang(lang);
  if (resolved === "text") {
    return "text";
  }

  const h = await getHighlighter();
  const loaded = h.getLoadedLanguages();
  if (loaded.includes(resolved)) {
    return resolved;
  }

  // Only try known languages
  if (!KNOWN_LANGS.has(resolved)) {
    return "text";
  }

  try {
    const grammarImport = await import(`shiki/langs/${resolved}.mjs`);
    if (grammarImport?.default) {
      await h.loadLanguage(grammarImport.default);
      return resolved;
    }
  } catch {
    // grammar not available
  }

  return loaded.includes(resolved) ? resolved : "text";
}
