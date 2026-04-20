import { create } from "zustand";
import { invoke, isTauriRuntime } from "../lib/ipc";
import { toast } from "./toastStore";
import type { SkillInfo } from "../types/index";

// ── Store Interface ──────────────────────────────────────────

export interface SkillStore {
  /** All installed skills. */
  skills: SkillInfo[];
  /** Current search query string. */
  searchQuery: string;
  /** True while an async operation is in flight. */
  loading: boolean;
  /** True after the initial hydrate from backend completes. */
  hydrated: boolean;

  // Actions
  /** Load all skills from the Tauri backend (or browser mock). */
  hydrateFromBackend: () => Promise<void>;
  /** Re-fetch the full skill list from the backend. */
  refreshSkills: () => Promise<void>;
  /** Search installed skills by query string. */
  searchSkills: (query: string) => Promise<void>;
  /** Install a skill from SKILL.md content. */
  installSkill: (content: string) => Promise<void>;
  /** Uninstall (remove) a skill by name. */
  uninstallSkill: (name: string) => Promise<void>;
  /** Toggle a skill's enabled state. */
  toggleSkill: (name: string) => Promise<void>;
}

// ── Store Implementation ─────────────────────────────────────

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  searchQuery: "",
  loading: false,
  hydrated: false,

  // ── hydrateFromBackend ───────────────────────────────────
  hydrateFromBackend: async () => {
    if (get().hydrated) {return;}
    await get().refreshSkills();
    set({ hydrated: true });
  },

  // ── refreshSkills ────────────────────────────────────────
  refreshSkills: async () => {
    set({ loading: true });
    try {
      if (isTauriRuntime()) {
        const skills = await invoke<SkillInfo[]>("list_skills");
        set({ skills });
      } else {
        // Browser mock mode
        const skills = await invoke<SkillInfo[]>("list_skills");
        set({ skills });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to load skills: ${message}`);
    } finally {
      set({ loading: false });
    }
  },

  // ── searchSkills ─────────────────────────────────────────
  searchSkills: async (query: string) => {
    set({ searchQuery: query, loading: true });
    try {
      const results = await invoke<SkillInfo[]>("search_skills", { query });
      set({ skills: results });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to search skills: ${message}`);
    } finally {
      set({ loading: false });
    }
  },

  // ── installSkill ─────────────────────────────────────────
  installSkill: async (content: string) => {
    set({ loading: true });
    try {
      await invoke<void>("install_skill", { content });
      toast.success("Skill installed successfully");
      // Refresh the skill list to reflect the new installation
      await get().refreshSkills();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to install skill: ${message}`);
    } finally {
      set({ loading: false });
    }
  },

  // ── uninstallSkill ───────────────────────────────────────
  uninstallSkill: async (name: string) => {
    set({ loading: true });
    try {
      await invoke<void>("uninstall_skill", { name });
      toast.success(`Skill "${name}" uninstalled`);
      // Remove from local state immediately for a snappy UI
      set((s) => ({ skills: s.skills.filter((sk) => sk.name !== name) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to uninstall skill: ${message}`);
    } finally {
      set({ loading: false });
    }
  },

  // ── toggleSkill ──────────────────────────────────────────
  toggleSkill: async (name: string) => {
    // Optimistic update: flip the enabled flag immediately
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.name === name ? { ...sk, enabled: !sk.enabled } : sk,
      ),
    }));

    try {
      await invoke<SkillInfo>("toggle_skill", { name });
    } catch (err) {
      // Revert optimistic update on failure
      set((s) => ({
        skills: s.skills.map((sk) =>
          sk.name === name ? { ...sk, enabled: !sk.enabled } : sk,
        ),
      }));
      const message = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to toggle skill: ${message}`);
    }
  },
}));
