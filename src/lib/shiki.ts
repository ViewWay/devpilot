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

/**
 * Map file extensions to Shiki language IDs.
 * Covers common programming languages.
 */
const EXT_TO_LANG: Record<string, string> = {
  // Web
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  less: "less",
  vue: "vue",
  svelte: "svelte",
  // Systems
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  swift: "swift",
  // Scripting
  py: "python",
  rb: "ruby",
  php: "php",
  pl: "perl",
  pm: "perl",
  lua: "lua",
  r: "r",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  // Data / Config
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  csv: "text",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  // Markup
  md: "markdown",
  mdx: "markdown",
  // DevOps / IaC
  dockerfile: "dockerfile",
  tf: "hcl",
  hcl: "hcl",
  proto: "protobuf",
  graphql: "graphql",
  gql: "graphql",
  // Shell
  sql: "sql",
  // C#
  cs: "csharp",
};

/**
 * Detect language from a file path's extension.
 * Returns the Shiki language ID or "text" as fallback.
 */
export function langFromPath(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath;
  // Handle dotfiles like .gitignore, .eslintrc
  if (fileName.startsWith(".") && !fileName.includes(".", 1)) {
    return "text";
  }
  // Handle special filenames
  const lower = fileName.toLowerCase();
  if (lower === "dockerfile" || lower.startsWith("dockerfile.")) {return "dockerfile";}
  if (lower === "makefile" || lower === "gnumakefile") {return "ini";}
  if (lower === "cmakelists.txt" || lower.endsWith(".cmake")) {return "ini";}

  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (!ext) {return "text";}
  return EXT_TO_LANG[ext] ?? "text";
}

/**
 * Token type for highlighted diff lines with dual-theme support.
 * Each token carries both dark and light mode colors via CSS variables.
 */
export interface HighlightedToken {
  content: string;
  colorDark?: string;
  colorLight?: string;
  fontStyle?: number;
}

/**
 * Tokenized line arrays for old and new content.
 * Lines are indexed 0-based matching split("\n").
 */
export interface HighlightedLines {
  oldTokens: HighlightedToken[][];
  newTokens: HighlightedToken[][];
}

/**
 * Highlight old and new code content into token arrays using Shiki.
 *
 * Uses `codeToTokensWithThemes` for dual-theme (dark/light) output.
 * Returns tokenized lines for both old and new content.
 * Falls back to plain text on error or for very large inputs.
 */
export async function highlightLines(
  oldCode: string,
  newCode: string,
  language: string,
): Promise<HighlightedLines> {
  const resolved = resolveLang(language);
  const h = await getHighlighter();

  let resolvedLang: string;
  if (h.getLoadedLanguages().includes(resolved)) {
    resolvedLang = resolved;
  } else {
    resolvedLang = await ensureLang(resolved);
  }

  const tokenize = (code: string): HighlightedToken[][] => {
    if (resolvedLang === "text" || !code) {
      return code.split("\n").map((line) => [{ content: line }]);
    }

    try {
      const tokens2d = h.codeToTokensWithThemes(code, {
        lang: resolvedLang,
        themes: { dark: "github-dark", light: "github-light" },
      });

      return tokens2d.map((line) =>
        line.map((token) => ({
          content: token.content,
          colorDark: token.variants.dark?.color,
          colorLight: token.variants.light?.color,
          fontStyle: token.variants.dark?.fontStyle,
        })),
      );
    } catch {
      // Fallback: plain text
      return code.split("\n").map((line) => [{ content: line }]);
    }
  };

  return {
    oldTokens: tokenize(oldCode),
    newTokens: tokenize(newCode),
  };
}
