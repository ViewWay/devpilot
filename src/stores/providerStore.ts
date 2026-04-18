import { create } from "zustand";

export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelConfig[];
  enabled: boolean;
  lastTested?: string;
  testStatus?: "ok" | "error";
  testError?: string;
}

export interface ModelConfig {
  id: string;
  name: string;
  maxTokens: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  inputPrice?: number; // per 1M tokens
  outputPrice?: number;
}

export interface ProviderStore {
  providers: Provider[];

  // Actions
  addProvider: (provider: Omit<Provider, "id">) => string;
  updateProvider: (id: string, partial: Partial<Provider>) => void;
  removeProvider: (id: string) => void;
  testConnection: (id: string) => Promise<boolean>;
  setApiKey: (id: string, key: string) => void;
  getEnabledProviders: () => Provider[];
  getProviderById: (id: string) => Provider | undefined;
}

let nextId = 200;
function genId() {
  return `provider-${++nextId}`;
}

// Default providers (pre-configured, but need API keys)
const DEFAULT_PROVIDERS: Provider[] = [
  {
    id: "provider-anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKey: "",
    models: [
      { id: "claude-4-sonnet", name: "Claude 4 Sonnet", maxTokens: 200000, supportsStreaming: true, supportsVision: true, inputPrice: 3, outputPrice: 15 },
      { id: "claude-4-opus", name: "Claude 4 Opus", maxTokens: 200000, supportsStreaming: true, supportsVision: true, inputPrice: 15, outputPrice: 75 },
      { id: "claude-4-haiku", name: "Claude 4 Haiku", maxTokens: 200000, supportsStreaming: true, supportsVision: true, inputPrice: 0.8, outputPrice: 4 },
    ],
    enabled: true,
  },
  {
    id: "provider-openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    models: [
      { id: "gpt-5.2", name: "GPT-5.2", maxTokens: 128000, supportsStreaming: true, supportsVision: true, inputPrice: 2.5, outputPrice: 10 },
      { id: "gpt-5.2-mini", name: "GPT-5.2 Mini", maxTokens: 128000, supportsStreaming: true, supportsVision: false, inputPrice: 0.6, outputPrice: 2.4 },
      { id: "o3-pro", name: "o3 Pro", maxTokens: 200000, supportsStreaming: true, supportsVision: true, inputPrice: 10, outputPrice: 40 },
    ],
    enabled: true,
  },
  {
    id: "provider-zhipu",
    name: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "",
    models: [
      { id: "glm-5", name: "GLM-5", maxTokens: 128000, supportsStreaming: true, supportsVision: true, inputPrice: 0.05, outputPrice: 0.05 },
      { id: "glm-5-turbo", name: "GLM-5 Turbo", maxTokens: 128000, supportsStreaming: true, supportsVision: false, inputPrice: 0.01, outputPrice: 0.01 },
    ],
    enabled: true,
  },
  {
    id: "provider-deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    models: [
      { id: "deepseek-v3", name: "DeepSeek V3", maxTokens: 64000, supportsStreaming: true, supportsVision: false, inputPrice: 0.14, outputPrice: 0.28 },
      { id: "deepseek-r1", name: "DeepSeek R1", maxTokens: 64000, supportsStreaming: true, supportsVision: false, inputPrice: 0.55, outputPrice: 2.19 },
    ],
    enabled: true,
  },
  {
    id: "provider-google",
    name: "Google AI",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    apiKey: "",
    models: [
      { id: "gemini-3-pro", name: "Gemini 3 Pro", maxTokens: 1000000, supportsStreaming: true, supportsVision: true, inputPrice: 1.25, outputPrice: 10 },
      { id: "gemini-3-flash", name: "Gemini 3 Flash", maxTokens: 1000000, supportsStreaming: true, supportsVision: true, inputPrice: 0.15, outputPrice: 0.6 },
    ],
    enabled: true,
  },
  {
    id: "provider-ollama",
    name: "Ollama (Local)",
    baseUrl: "http://localhost:11434",
    apiKey: "",
    models: [
      { id: "llama-4", name: "Llama 4 (local)", maxTokens: 128000, supportsStreaming: true, supportsVision: false },
      { id: "codellama", name: "Code Llama (local)", maxTokens: 16000, supportsStreaming: true, supportsVision: false },
      { id: "deepseek-coder", name: "DeepSeek Coder (local)", maxTokens: 16000, supportsStreaming: true, supportsVision: false },
    ],
    enabled: false,
  },
];

export const useProviderStore = create<ProviderStore>((set, get) => ({
  providers: DEFAULT_PROVIDERS,

  addProvider: (provider) => {
    const id = genId();
    set((s) => ({ providers: [...s.providers, { ...provider, id }] }));
    return id;
  },

  updateProvider: (id, partial) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, ...partial } : p)),
    }));
  },

  removeProvider: (id) => {
    set((s) => ({ providers: s.providers.filter((p) => p.id !== id) }));
  },

  testConnection: async (id) => {
    const provider = get().providers.find((p) => p.id === id);
    if (!provider) {
      return false;
    }

    const requiresApiKey = provider.id !== "provider-ollama";
    if (requiresApiKey && !provider.apiKey) {
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? { ...p, testStatus: "error" as const, testError: "No API key configured", lastTested: new Date().toISOString() }
            : p,
        ),
      }));
      return false;
    }

    // Simulate connection test (will use Tauri IPC in production)
    set((s) => ({
      providers: s.providers.map((p) =>
        p.id === id
          ? { ...p, testStatus: undefined as "ok" | "error" | undefined } : p,
      ),
    }));

    try {
      // Mock: Ollama doesn't need API key
      if (!requiresApiKey) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        set((s) => ({
          providers: s.providers.map((p) =>
            p.id === id
              ? { ...p, testStatus: "ok" as const, testError: undefined, lastTested: new Date().toISOString() }
              : p,
          ),
        }));
        return true;
      }

      // Mock: simulate test for other providers
      await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 500));
      const success = provider.apiKey.length > 0;
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? {
                ...p,
                testStatus: success ? ("ok" as const) : ("error" as const),
                testError: success ? undefined : "Invalid API key",
                lastTested: new Date().toISOString(),
              }
            : p,
        ),
      }));
      return success;
    } catch {
      set((s) => ({
        providers: s.providers.map((p) =>
          p.id === id
            ? { ...p, testStatus: "error" as const, testError: "Connection failed", lastTested: new Date().toISOString() }
            : p,
        ),
      }));
      return false;
    }
  },

  setApiKey: (id, key) => {
    set((s) => ({
      providers: s.providers.map((p) => (p.id === id ? { ...p, apiKey: key } : p)),
    }));
  },

  getEnabledProviders: () => get().providers.filter((p) => p.enabled && p.apiKey),

  getProviderById: (id) => get().providers.find((p) => p.id === id),
}));
