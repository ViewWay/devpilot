/**
 * useDiffHighlight — hook to syntax-highlight old/new code for diff views.
 *
 * Uses Shiki to tokenize code with dual-theme (dark/light) support.
 * Falls back to plain text for very large diffs (>500 lines) or on error.
 */
import { useState, useEffect, useMemo } from "react";
import {
  highlightLines,
  langFromPath,
  type HighlightedToken,
  type HighlightedLines,
} from "@/lib/shiki";

/** Maximum total lines before degrading to plain text */
const MAX_LINES_FOR_SHIKI = 500;

/** Plain-text tokenization: one token per line */
function plainTokens(code: string): HighlightedToken[][] {
  if (!code) {return [];}
  return code.split("\n").map((line) => [{ content: line }]);
}

/**
 * Hook return type — token arrays indexed by line number (0-based).
 */
export interface DiffHighlightResult {
  /** Tokens for old content lines */
  oldTokens: HighlightedToken[][];
  /** Tokens for new content lines */
  newTokens: HighlightedToken[][];
  /** Whether highlighting is currently loading */
  loading: boolean;
  /** Whether we degraded to plain text (no syntax color) */
  degraded: boolean;
}

/**
 * React hook that syntax-highlights old and new code for diff rendering.
 *
 * @param oldCode  - Original file content
 * @param newCode  - Modified file content
 * @param filePath - File path (used for language detection)
 * @returns Tokenized lines for rendering
 */
export function useDiffHighlight(
  oldCode: string,
  newCode: string,
  filePath: string,
): DiffHighlightResult {
  const language = useMemo(() => langFromPath(filePath), [filePath]);

  const totalLines = useMemo(() => {
    return oldCode.split("\n").length + newCode.split("\n").length;
  }, [oldCode, newCode]);

  const shouldHighlight = totalLines <= MAX_LINES_FOR_SHIKI && language !== "text";

  const [tokens, setTokens] = useState<HighlightedLines | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldHighlight) {
      setTokens(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    highlightLines(oldCode, newCode, language)
      .then((result) => {
        if (!cancelled) {
          setTokens(result);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTokens(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [oldCode, newCode, language, shouldHighlight]);

  // If not highlighting (degraded), use plain tokens
  if (!shouldHighlight) {
    return {
      oldTokens: plainTokens(oldCode),
      newTokens: plainTokens(newCode),
      loading: false,
      degraded: true,
    };
  }

  if (loading || !tokens) {
    return {
      oldTokens: plainTokens(oldCode),
      newTokens: plainTokens(newCode),
      loading,
      degraded: false,
    };
  }

  return {
    oldTokens: tokens.oldTokens,
    newTokens: tokens.newTokens,
    loading: false,
    degraded: false,
  };
}
