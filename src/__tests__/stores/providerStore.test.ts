import { describe, it, expect, beforeEach } from "vitest";
import { useProviderStore } from "../../stores/providerStore";

describe("providerStore", () => {
  beforeEach(() => {
    // Re-initialize store — remove all custom providers, keep defaults
    const defaults = useProviderStore.getState().providers.filter(
      (p) => !p.id.startsWith("provider-20"),
    );
    useProviderStore.setState({ providers: defaults });
  });

  describe("default providers", () => {
    it("has pre-configured providers", () => {
      const providers = useProviderStore.getState().providers;
      expect(providers.length).toBeGreaterThanOrEqual(6);
    });

    it("has Anthropic, OpenAI, 智谱 AI, DeepSeek, Google AI, Ollama", () => {
      const names = useProviderStore.getState().providers.map((p) => p.name);
      expect(names).toContain("Anthropic");
      expect(names).toContain("OpenAI");
      expect(names).toContain("智谱 AI");
      expect(names).toContain("DeepSeek");
      expect(names).toContain("Google AI");
      expect(names).toContain("Ollama (Local)");
    });

    it("Anthropic has Claude 4 Sonnet model", () => {
      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic");
      expect(anthropic!.models.length).toBeGreaterThanOrEqual(1);
      expect(anthropic!.models[0]!.id).toBe("claude-4-sonnet");
    });

    it("Anthropic model supports streaming and vision", () => {
      const model = useProviderStore.getState().providers
        .find((p) => p.id === "provider-anthropic")!
        .models.find((m) => m.id === "claude-4-sonnet")!;
      expect(model.supportsStreaming).toBe(true);
      expect(model.supportsVision).toBe(true);
      expect(model.maxTokens).toBe(200000);
    });

    it("Ollama is disabled by default", () => {
      const ollama = useProviderStore.getState().providers.find((p) => p.id === "provider-ollama");
      expect(ollama!.enabled).toBe(false);
    });
  });

  describe("addProvider", () => {
    it("adds a new provider", () => {
      const count = useProviderStore.getState().providers.length;
      const id = useProviderStore.getState().addProvider({
        name: "Test Provider",
        baseUrl: "https://api.test.com",
        apiKey: "test-key",
        models: [],
        enabled: true,
      });
      expect(useProviderStore.getState().providers).toHaveLength(count + 1);
      expect(useProviderStore.getState().providers.find((p) => p.id === id)!.name).toBe("Test Provider");
    });
  });

  describe("updateProvider", () => {
    it("updates provider fields", () => {
      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      useProviderStore.getState().updateProvider(anthropic.id, { apiKey: "sk-test-123" });
      const updated = useProviderStore.getState().providers.find((p) => p.id === anthropic.id)!;
      expect(updated.apiKey).toBe("sk-test-123");
    });

    it("updates enabled state", () => {
      const id = useProviderStore.getState().providers.find((p) => p.id === "provider-ollama")!.id;
      useProviderStore.getState().updateProvider(id, { enabled: true });
      expect(useProviderStore.getState().providers.find((p) => p.id === id)!.enabled).toBe(true);
    });
  });

  describe("removeProvider", () => {
    it("removes a custom provider", () => {
      const id = useProviderStore.getState().addProvider({
        name: "To Remove",
        baseUrl: "https://remove.com",
        apiKey: "",
        models: [],
        enabled: false,
      });
      const count = useProviderStore.getState().providers.length;
      useProviderStore.getState().removeProvider(id);
      expect(useProviderStore.getState().providers).toHaveLength(count - 1);
    });
  });

  describe("setApiKey", () => {
    it("sets the API key for a provider", () => {
      const id = "provider-anthropic";
      useProviderStore.getState().setApiKey(id, "sk-new-key");
      expect(useProviderStore.getState().providers.find((p) => p.id === id)!.apiKey).toBe("sk-new-key");
    });
  });

  describe("testConnection", () => {
    it("fails with no API key", async () => {
      const id = "provider-anthropic";
      useProviderStore.getState().setApiKey(id, "");
      const result = await useProviderStore.getState().testConnection(id);
      expect(result).toBe(false);
      const provider = useProviderStore.getState().providers.find((p) => p.id === id)!;
      expect(provider.testStatus).toBe("error");
      expect(provider.testError).toContain("No API key");
    });

    it("succeeds with API key (mock)", async () => {
      const id = "provider-anthropic";
      useProviderStore.getState().setApiKey(id, "sk-valid-key");
      const result = await useProviderStore.getState().testConnection(id);
      expect(result).toBe(true);
      const provider = useProviderStore.getState().providers.find((p) => p.id === id)!;
      expect(provider.testStatus).toBe("ok");
      expect(provider.lastTested).toBeDefined();
    });

    it("Ollama succeeds without API key", async () => {
      const id = "provider-ollama";
      useProviderStore.getState().setApiKey(id, "");
      const result = await useProviderStore.getState().testConnection(id);
      expect(result).toBe(true);
      expect(useProviderStore.getState().providers.find((p) => p.id === id)!.testStatus).toBe("ok");
    });
  });

  describe("getEnabledProviders", () => {
    it("returns only enabled providers with API keys", () => {
      const id = useProviderStore.getState().addProvider({
        name: "Enabled Provider",
        baseUrl: "https://api.test.com",
        apiKey: "has-key",
        models: [],
        enabled: true,
      });
      useProviderStore.getState().addProvider({
        name: "Disabled Provider",
        baseUrl: "https://api.test2.com",
        apiKey: "",
        models: [],
        enabled: false,
      });
      const enabled = useProviderStore.getState().getEnabledProviders();
      expect(enabled.some((p) => p.id === id)).toBe(true);
      expect(enabled.some((p) => p.name === "Disabled Provider")).toBe(false);
    });
  });

  describe("getProviderById", () => {
    it("returns the provider with matching id", () => {
      const provider = useProviderStore.getState().getProviderById("provider-openai");
      expect(provider).toBeDefined();
      expect(provider!.name).toBe("OpenAI");
    });

    it("returns undefined for non-existent id", () => {
      const provider = useProviderStore.getState().getProviderById("nonexistent");
      expect(provider).toBeUndefined();
    });
  });
});
