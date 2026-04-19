import { create } from "zustand";
import { invoke } from "../lib/ipc";
import type { GenerateImageResultIPC } from "../lib/ipc";

interface GeneratedImage {
  id: string;
  prompt: string;
  provider: string;
  model: string;
  url?: string;
  b64Json?: string;
  revisedPrompt?: string;
  createdAt: string;
}

/** Persisted media generation from SQLite. */
export interface MediaGenerationRecord {
  id: string;
  prompt: string;
  model: string;
  provider: string;
  filePath: string | null;
  status: string;
  tags: string | null;
  createdAt: string;
}

interface MediaState {
  images: GeneratedImage[];
  savedGenerations: MediaGenerationRecord[];
  providers: string[];
  loading: boolean;
  error: string | null;
  fetchProviders: () => Promise<void>;
  fetchSavedGenerations: () => Promise<void>;
  generate: (prompt: string, provider?: string, model?: string, size?: string, apiKey?: string) => Promise<void>;
  saveGeneration: (record: MediaGenerationRecord) => Promise<void>;
  updateGenerationStatus: (mediaId: string, status: string, filePath?: string) => Promise<void>;
  updateGenerationTags: (mediaId: string, tags: string) => Promise<void>;
  deleteGeneration: (mediaId: string) => Promise<void>;
}

export const useMediaStore = create<MediaState>((set, get) => ({
  images: [],
  savedGenerations: [],
  providers: ["openai", "stability", "generic"],
  loading: false,
  error: null,

  fetchProviders: async () => {
    try {
      const providers = await invoke<string[]>("media_providers");
      set({ providers });
    } catch { /* keep defaults */ }
  },

  fetchSavedGenerations: async () => {
    try {
      const savedGenerations = await invoke<MediaGenerationRecord[]>("media_list_saved");
      set({ savedGenerations });
    } catch { /* ignore */ }
  },

  generate: async (prompt, provider, model, size, apiKey) => {
    set({ loading: true, error: null });
    try {
      const result = await invoke<GenerateImageResultIPC>("media_generate", {
        prompt,
        provider: provider || "openai",
        model,
        size: size || "1024x1024",
        n: 1,
        apiKey: apiKey || "mock-key",
      });
      const newImages: GeneratedImage[] = result.images.map((img, i) => ({
        id: `img-${Date.now()}-${i}`,
        prompt,
        provider: result.provider,
        model: result.model,
        url: img.url ?? undefined,
        b64Json: img.b64Json ?? undefined,
        revisedPrompt: img.revisedPrompt ?? undefined,
        createdAt: new Date().toISOString(),
      }));
      set((s) => ({ images: [...newImages, ...s.images], loading: false }));
    } catch (e: unknown) {
      set({ error: String(e), loading: false });
    }
  },

  saveGeneration: async (record) => {
    await invoke("media_save", { record });
    await get().fetchSavedGenerations();
  },

  updateGenerationStatus: async (mediaId, status, filePath) => {
    await invoke("media_update_status", { mediaId, status, filePath });
    await get().fetchSavedGenerations();
  },

  updateGenerationTags: async (mediaId, tags) => {
    await invoke("media_update_tags", { mediaId, tags });
    await get().fetchSavedGenerations();
  },

  deleteGeneration: async (mediaId) => {
    await invoke("media_delete", { mediaId });
    await get().fetchSavedGenerations();
  },
}));
