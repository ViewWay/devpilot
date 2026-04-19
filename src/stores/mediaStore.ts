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

interface MediaState {
  images: GeneratedImage[];
  providers: string[];
  loading: boolean;
  error: string | null;
  fetchProviders: () => Promise<void>;
  generate: (prompt: string, provider?: string, model?: string, size?: string, apiKey?: string) => Promise<void>;
}

export const useMediaStore = create<MediaState>((set) => ({
  images: [],
  providers: ["openai", "stability", "generic"],
  loading: false,
  error: null,

  fetchProviders: async () => {
    try {
      const providers = await invoke<string[]>("media_providers");
      set({ providers });
    } catch { /* keep defaults */ }
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
}));
