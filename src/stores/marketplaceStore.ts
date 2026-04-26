import { create } from "zustand";
import { invoke } from "../lib/ipc";

// ── Types ────────────────────────────────────────────────

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: string;
  tags: string[];
  installed: boolean;
}

// ── Store State ──────────────────────────────────────────

interface MarketplaceState {
  /** List of marketplace skills. */
  skills: MarketplaceSkill[];
  /** Whether a marketplace operation is in progress. */
  loading: boolean;
  /** Last error message (null if none). */
  error: string | null;
}

interface MarketplaceActions {
  /** Fetch the skills catalog, optionally filtered by source. */
  fetchCatalog: (source?: string) => Promise<void>;

  /** Search skills by query. */
  searchSkills: (query: string) => Promise<void>;

  /** Install a skill by its ID. */
  installSkill: (skillId: string) => Promise<void>;

  /** Uninstall a skill by its name. */
  uninstallSkill: (name: string) => Promise<void>;

  /** Clear error. */
  clearError: () => void;
}

export const useMarketplaceStore = create<MarketplaceState & MarketplaceActions>()(
  (set, get) => ({
    skills: [],
    loading: false,
    error: null,

    fetchCatalog: async (source?: string) => {
      set({ loading: true, error: null });
      try {
        const skills = await invoke<MarketplaceSkill[]>(
          "marketplace_fetch_catalog",
          { source: source ?? null },
        );
        set({ skills, loading: false });
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    searchSkills: async (query: string) => {
      set({ loading: true, error: null });
      try {
        const skills = await invoke<MarketplaceSkill[]>(
          "marketplace_search_skills",
          { query },
        );
        set({ skills, loading: false });
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    installSkill: async (skillId: string) => {
      set({ loading: true, error: null });
      try {
        await invoke<void>("marketplace_install_skill", { skillId });
        // Refresh catalog after install
        await get().fetchCatalog();
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    uninstallSkill: async (name: string) => {
      set({ loading: true, error: null });
      try {
        await invoke<void>("marketplace_uninstall_skill", { name });
        // Refresh catalog after uninstall
        await get().fetchCatalog();
      } catch (e: unknown) {
        set({ error: String(e), loading: false });
      }
    },

    clearError: () => set({ error: null }),
  }),
);
