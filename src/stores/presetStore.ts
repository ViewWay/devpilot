import { create } from "zustand";
import { invoke } from "../lib/ipc";

// ── Types ────────────────────────────────────────────────

export interface Preset {
  /** Unique ID. */
  id: string;
  /** Preset name. */
  name: string;
  /** System prompt template. */
  systemPrompt: string;
  /** Default model ID. */
  model: string;
  /** Default provider ID. */
  provider: string;
  /** Default temperature. */
  temperature: number;
  /** Default interaction mode. */
  mode: "code" | "plan" | "ask";
  /** Whether this is a built-in preset (not deletable). */
  builtIn: boolean;
}

// ── Store State ──────────────────────────────────────────

interface PresetState {
  presets: Preset[];
  loading: boolean;
  error: string | null;
}

interface PresetActions {
  /** Load presets from backend. */
  fetchPresets: () => Promise<void>;

  /** Create a new preset. */
  createPreset: (preset: Omit<Preset, "id" | "builtIn">) => Promise<string>;

  /** Update an existing preset. */
  updatePreset: (id: string, updates: Partial<Preset>) => Promise<void>;

  /** Delete a custom preset. */
  deletePreset: (id: string) => Promise<void>;

  /** Get a preset by ID. */
  getPreset: (id: string) => Preset | undefined;

  /** Clear error. */
  clearError: () => void;
}

const DEFAULT_PRESETS: Preset[] = [
  {
    id: "default-code",
    name: "Code Assistant",
    systemPrompt:
      "You are a helpful coding assistant. Write clean, idiomatic code with good error handling.",
    model: "",
    provider: "",
    temperature: 0.7,
    mode: "code",
    builtIn: true,
  },
  {
    id: "default-plan",
    name: "Architecture Planner",
    systemPrompt:
      "You are a software architect. Analyze requirements, propose designs, and create detailed implementation plans. Do not execute code — only plan.",
    model: "",
    provider: "",
    temperature: 0.5,
    mode: "plan",
    builtIn: true,
  },
  {
    id: "default-ask",
    name: "Knowledge Q&A",
    systemPrompt:
      "You are a knowledgeable assistant. Answer questions clearly and concisely with examples when helpful.",
    model: "",
    provider: "",
    temperature: 0.8,
    mode: "ask",
    builtIn: true,
  },
  {
    id: "default-review",
    name: "Code Reviewer",
    systemPrompt:
      "You are an expert code reviewer. Analyze code for bugs, security issues, performance problems, and style. Provide specific, actionable feedback.",
    model: "",
    provider: "",
    temperature: 0.3,
    mode: "code",
    builtIn: true,
  },
];

export const usePresetStore = create<PresetState & PresetActions>()(
  (set, get) => ({
    presets: DEFAULT_PRESETS,
    loading: false,
    error: null,

    fetchPresets: async () => {
      set({ loading: true, error: null });
      try {
        // Try loading from settings; fall back to defaults
        const saved = await invoke<Preset[] | null>("get_setting", {
          key: "presets",
        });
        if (saved && saved.length > 0) {
          set({ presets: [...DEFAULT_PRESETS, ...saved], loading: false });
        } else {
          set({ loading: false });
        }
      } catch {
        set({ loading: false });
      }
    },

    createPreset: async (preset) => {
      const id = `preset-${Date.now()}`;
      const newPreset: Preset = { ...preset, id, builtIn: false };
      set((s) => ({ presets: [...s.presets, newPreset] }));
      await saveCustomPresets(get().presets);
      return id;
    },

    updatePreset: async (id, updates) => {
      set((s) => ({
        presets: s.presets.map((p) =>
          p.id === id ? { ...p, ...updates } : p,
        ),
      }));
      await saveCustomPresets(get().presets);
    },

    deletePreset: async (id) => {
      set((s) => ({
        presets: s.presets.filter((p) => p.id !== id),
      }));
      await saveCustomPresets(get().presets);
    },

    getPreset: (id: string) => {
      return get().presets.find((p) => p.id === id);
    },

    clearError: () => set({ error: null }),
  }),
);

async function saveCustomPresets(presets: Preset[]): Promise<void> {
  const custom = presets.filter((p) => !p.builtIn);
  try {
    await invoke("save_setting", {
      key: "presets",
      value: JSON.stringify(custom),
    });
  } catch {
    // Ignore save errors
  }
}
