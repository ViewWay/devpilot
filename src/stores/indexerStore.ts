import { create } from "zustand";
import { invoke } from "../lib/ipc";

// ── Types ────────────────────────────────────────────────

export interface IndexStats {
  filesIndexed: number;
  symbolsCount: number;
  parseErrors: number;
  indexTimeMs: number;
  root: string;
}

export interface CodeSymbol {
  name: string;
  kind: string;
  fullPath: string;
  language: string;
  filePath: string;
  line: number;
  column: number;
  container: string | null;
  docSummary: string | null;
}

export interface SearchResult {
  symbol: CodeSymbol;
  score: number;
  matchReason: string;
}

// ── Store State ──────────────────────────────────────────

interface IndexerState {
  /** Current index statistics. */
  stats: IndexStats | null;
  /** Whether indexing is in progress. */
  indexing: boolean;
  /** Last error message (null if none). */
  error: string | null;
  /** Most recent search results. */
  searchResults: SearchResult[];
}

interface IndexerActions {
  /** Index a directory. */
  indexDirectory: (rootPath: string) => Promise<IndexStats>;

  /** Search for symbols matching a query. */
  searchSymbols: (query: string) => Promise<SearchResult[]>;

  /** Get current index statistics. */
  fetchStats: () => Promise<void>;

  /** Clear error. */
  clearError: () => void;
}

export const useIndexerStore = create<IndexerState & IndexerActions>()(
  (set) => ({
    stats: null,
    indexing: false,
    error: null,
    searchResults: [],

    indexDirectory: async (rootPath: string) => {
      set({ indexing: true, error: null });
      try {
        const resultStats = await invoke<IndexStats>("index_directory", {
          rootPath,
        });
        set({ stats: resultStats, indexing: false });
        return resultStats;
      } catch (e: unknown) {
        set({ error: String(e), indexing: false });
        throw e;
      }
    },

    searchSymbols: async (query: string) => {
      set({ error: null });
      try {
        const results = await invoke<SearchResult[]>("search_symbols", {
          query,
        });
        set({ searchResults: results });
        return results;
      } catch (e: unknown) {
        set({ error: String(e) });
        return [];
      }
    },

    fetchStats: async () => {
      try {
        const stats = await invoke<IndexStats>("get_index_stats");
        set({ stats });
      } catch (e: unknown) {
        set({ error: String(e) });
      }
    },

    clearError: () => set({ error: null }),
  }),
);
