import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock IPC module — controls isTauriRuntime() and invoke
vi.mock("../../lib/ipc", () => ({
  invoke: vi.fn(),
  isTauriRuntime: vi.fn(() => true),
}));

import { invoke } from "../../lib/ipc";
import { useProviderStore } from "../../stores/providerStore";
import type { Provider } from "../../stores/providerStore";

const mockInvoke = invoke as ReturnType<typeof vi.fn>;
const mockIsTauriRuntime = vi.mocked(
  (await import("../../lib/ipc")).isTauriRuntime,
);

// ── Helpers ─────────────────────────────────────────────────────
function resetStore() {
  // Restore default providers and reset hydrated flag
  const { providers } = useProviderStore.getState();
  const defaults = providers.filter((p) => !p.id.startsWith("provider-20"));
  useProviderStore.setState({ providers: defaults, hydrated: false, diagnosticReports: {} });
}

function sampleProvider(overrides?: Partial<Provider>): Omit<Provider, "id"> {
  return {
    name: "Test Provider",
    baseUrl: "https://api.test.com",
    apiKey: "test-key",
    models: [],
    enabled: true,
    ...overrides,
  };
}

function sampleIPCRecord(overrides?: Record<string, unknown>) {
  return {
    id: "provider-anthropic",
    name: "Anthropic",
    providerType: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKeySet: true,
    models: JSON.stringify([
      { id: "claude-4-sonnet", name: "Claude 4 Sonnet", maxInputTokens: 200000, maxOutputTokens: 16384, supportsStreaming: true, supportsVision: true, inputPricePerMillion: 3, outputPricePerMillion: 15 },
    ]),
    enabled: true,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────
describe("providerStore (expanded — Tauri IPC paths)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTauriRuntime.mockReturnValue(true);
    resetStore();
  });

  // ─────────────────────────────────────────────────────────────
  // hydrateFromBackend
  // ─────────────────────────────────────────────────────────────
  describe("hydrateFromBackend", () => {
    it("does nothing when not in Tauri runtime", async () => {
      mockIsTauriRuntime.mockReturnValue(false);
      useProviderStore.setState({ hydrated: false });
      await useProviderStore.getState().hydrateFromBackend();
      expect(mockInvoke).not.toHaveBeenCalled();
      // Should remain unhydrated because non-Tauri path just returns
      expect(useProviderStore.getState().hydrated).toBe(false);
    });

    it("skips hydration if already hydrated", async () => {
      useProviderStore.setState({ hydrated: true });
      await useProviderStore.getState().hydrateFromBackend();
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("merges persisted records with defaults", async () => {
      const record = sampleIPCRecord({ apiKeySet: true, enabled: false });
      mockInvoke
        .mockResolvedValueOnce([record])       // list_providers
        .mockResolvedValueOnce("sk-restored");  // get_provider_api_key

      await useProviderStore.getState().hydrateFromBackend();

      expect(mockInvoke).toHaveBeenCalledWith("list_providers");
      expect(mockInvoke).toHaveBeenCalledWith("get_provider_api_key", { id: "provider-anthropic" });

      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(anthropic.apiKey).toBe("sk-restored");
      expect(anthropic.enabled).toBe(false);
      expect(useProviderStore.getState().hydrated).toBe(true);
    });

    it("adds persisted providers not in defaults", async () => {
      const customRecord = sampleIPCRecord({
        id: "provider-custom-x",
        name: "Custom Provider",
        providerType: "openai",
        baseUrl: "https://custom.api.com",
        models: JSON.stringify([
          { id: "custom-model", name: "Custom Model", maxInputTokens: 64000, supportsStreaming: true, supportsVision: false },
        ]),
      });
      mockInvoke
        .mockResolvedValueOnce([customRecord])
        .mockResolvedValueOnce("custom-key");

      await useProviderStore.getState().hydrateFromBackend();

      const custom = useProviderStore.getState().providers.find((p) => p.id === "provider-custom-x");
      expect(custom).toBeDefined();
      expect(custom!.name).toBe("Custom Provider");
      expect(custom!.apiKey).toBe("custom-key");
    });

    it("sets hydrated=true when backend returns empty list", async () => {
      mockInvoke.mockResolvedValueOnce([]);
      await useProviderStore.getState().hydrateFromBackend();
      expect(useProviderStore.getState().hydrated).toBe(true);
    });

    it("sets hydrated=true when invoke throws", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("IPC failure"));
      await useProviderStore.getState().hydrateFromBackend();
      expect(useProviderStore.getState().hydrated).toBe(true);
    });

    it("handles missing API key gracefully (get_provider_api_key returns null)", async () => {
      const record = sampleIPCRecord();
      mockInvoke
        .mockResolvedValueOnce([record])
        .mockResolvedValueOnce(null);

      await useProviderStore.getState().hydrateFromBackend();
      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(anthropic.apiKey).toBe("");
    });

    it("handles get_provider_api_key throwing", async () => {
      const record = sampleIPCRecord();
      mockInvoke
        .mockResolvedValueOnce([record])
        .mockRejectedValueOnce(new Error("key error"));

      await useProviderStore.getState().hydrateFromBackend();
      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(anthropic.apiKey).toBe("");
    });

    it("handles record with no models field", async () => {
      const record = sampleIPCRecord({ models: undefined });
      mockInvoke
        .mockResolvedValueOnce([record])
        .mockResolvedValueOnce("key");

      await useProviderStore.getState().hydrateFromBackend();
      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(anthropic.models).toEqual([]);
    });

    it("uses default maxInputTokens when missing in model JSON", async () => {
      const record = sampleIPCRecord({
        models: JSON.stringify([
          { id: "m1", name: "M1", supportsStreaming: true, supportsVision: false },
        ]),
      });
      mockInvoke
        .mockResolvedValueOnce([record])
        .mockResolvedValueOnce("");

      await useProviderStore.getState().hydrateFromBackend();
      const anthropic = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(anthropic.models[0]!.maxTokens).toBe(128000);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // addProvider — Tauri persistence
  // ─────────────────────────────────────────────────────────────
  describe("addProvider (Tauri persistence)", () => {
    it("calls upsert_provider via invoke", () => {
      mockInvoke.mockResolvedValue(undefined);
      const id = useProviderStore.getState().addProvider(sampleProvider());
      expect(mockInvoke).toHaveBeenCalledWith("upsert_provider", expect.objectContaining({
        provider: expect.objectContaining({ id }),
        apiKey: "test-key",
      }));
    });

    it("passes undefined apiKey when apiKey is empty", () => {
      mockInvoke.mockResolvedValue(undefined);
      const id = useProviderStore.getState().addProvider(sampleProvider({ apiKey: "" }));
      expect(mockInvoke).toHaveBeenCalledWith("upsert_provider", expect.objectContaining({
        provider: expect.objectContaining({ id }),
        apiKey: undefined,
      }));
    });

    it("generates unique sequential IDs", () => {
      const id1 = useProviderStore.getState().addProvider(sampleProvider());
      const id2 = useProviderStore.getState().addProvider(sampleProvider());
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^provider-\d+$/);
      expect(id2).toMatch(/^provider-\d+$/);
    });

    it("silently ignores persistence errors", () => {
      mockInvoke.mockRejectedValue(new Error("persist error"));
      const id = useProviderStore.getState().addProvider(sampleProvider());
      // Provider should still be added locally
      const found = useProviderStore.getState().providers.find((p) => p.id === id);
      expect(found).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // updateProvider — Tauri persistence
  // ─────────────────────────────────────────────────────────────
  describe("updateProvider (Tauri persistence)", () => {
    it("persists changes via upsert_provider", () => {
      mockInvoke.mockResolvedValue(undefined);
      useProviderStore.getState().updateProvider("provider-anthropic", { apiKey: "sk-updated" });
      expect(mockInvoke).toHaveBeenCalledWith("upsert_provider", expect.objectContaining({
        provider: expect.objectContaining({ id: "provider-anthropic" }),
        apiKey: "sk-updated",
      }));
    });

    it("does not call persist if provider id not found", () => {
      useProviderStore.getState().updateProvider("nonexistent-id", { name: "Ghost" });
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("merges partial fields correctly", () => {
      const before = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      useProviderStore.getState().updateProvider("provider-anthropic", { enabled: false });
      const after = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(after.enabled).toBe(false);
      // Other fields unchanged
      expect(after.name).toBe(before.name);
      expect(after.baseUrl).toBe(before.baseUrl);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // removeProvider — Tauri persistence
  // ─────────────────────────────────────────────────────────────
  describe("removeProvider (Tauri persistence)", () => {
    it("calls delete_provider via invoke", () => {
      mockInvoke.mockResolvedValue(undefined);
      const id = useProviderStore.getState().addProvider(sampleProvider());
      mockInvoke.mockClear();

      useProviderStore.getState().removeProvider(id);
      expect(mockInvoke).toHaveBeenCalledWith("delete_provider", { id });
    });

    it("removes from local state even if invoke fails", () => {
      const id = useProviderStore.getState().addProvider(sampleProvider());
      const count = useProviderStore.getState().providers.length;
      mockInvoke.mockRejectedValue(new Error("delete failed"));

      useProviderStore.getState().removeProvider(id);
      expect(useProviderStore.getState().providers).toHaveLength(count - 1);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // testConnection — Tauri IPC path
  // ─────────────────────────────────────────────────────────────
  describe("testConnection (Tauri IPC)", () => {
    it("returns false for nonexistent provider", async () => {
      const result = await useProviderStore.getState().testConnection("nonexistent");
      expect(result).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("returns false when API key is missing (non-Ollama)", async () => {
      useProviderStore.getState().setApiKey("provider-anthropic", "");
      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(false);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(p.testStatus).toBe("error");
      expect(p.testError).toContain("No API key");
    });

    it("succeeds when check_provider returns connected=true", async () => {
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-valid");
      mockInvoke.mockResolvedValueOnce({ connected: true, message: "ok", modelsCount: 3 });

      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(true);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(p.testStatus).toBe("ok");
      expect(p.testError).toBeUndefined();
      expect(p.lastTested).toBeDefined();
    });

    it("fails when check_provider returns connected=false", async () => {
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-bad");
      mockInvoke.mockResolvedValueOnce({ connected: false, message: "Unauthorized" });

      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(false);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(p.testStatus).toBe("error");
      expect(p.testError).toBe("Unauthorized");
    });

    it("handles invoke throwing an error", async () => {
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-err");
      mockInvoke.mockRejectedValueOnce(new Error("Network timeout"));

      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(false);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(p.testStatus).toBe("error");
      expect(p.testError).toBe("Network timeout");
    });

    it("handles invoke throwing a non-Error value", async () => {
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-err");
      mockInvoke.mockRejectedValueOnce("string error");

      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(false);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(p.testStatus).toBe("error");
      expect(p.testError).toBe("string error");
    });

    it("clears previous test status before invoking", async () => {
      // First set an error status
      useProviderStore.getState().setApiKey("provider-anthropic", "");
      await useProviderStore.getState().testConnection("provider-anthropic");
      const afterFirst = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(afterFirst.testStatus).toBe("error");

      // Now set a valid key and test again — status should be cleared then set to ok
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-valid");
      mockInvoke.mockResolvedValueOnce({ connected: true, message: "ok" });
      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(true);
    });

    it("passes correct config shape to check_provider", async () => {
      useProviderStore.getState().setApiKey("provider-openai", "sk-openai");
      mockInvoke.mockResolvedValueOnce({ connected: true, message: "ok" });

      await useProviderStore.getState().testConnection("provider-openai");
      expect(mockInvoke).toHaveBeenCalledWith("check_provider", {
        config: expect.objectContaining({
          id: "provider-openai",
          name: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-openai",
          enabled: true,
          models: expect.any(Array),
        }),
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // testConnection — browser mock fallback path
  // ─────────────────────────────────────────────────────────────
  describe("testConnection (browser fallback)", () => {
    beforeEach(() => {
      mockIsTauriRuntime.mockReturnValue(false);
    });

    it("succeeds for Ollama without API key", async () => {
      const result = await useProviderStore.getState().testConnection("provider-ollama");
      expect(result).toBe(true);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-ollama")!;
      expect(p.testStatus).toBe("ok");
    });

    it("succeeds for provider with non-empty API key", async () => {
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-valid");
      const result = await useProviderStore.getState().testConnection("provider-anthropic");
      expect(result).toBe(true);
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-anthropic")!;
      expect(p.testStatus).toBe("ok");
    });

    it("fails for provider with empty API key (non-Ollama, browser mock)", async () => {
      // The browser fallback checks apiKey.length > 0
      // But the early check for missing key already catches empty key before reaching fallback
      useProviderStore.getState().setApiKey("provider-openai", "");
      const result = await useProviderStore.getState().testConnection("provider-openai");
      expect(result).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // diagnoseProvider — Tauri IPC path
  // ─────────────────────────────────────────────────────────────
  describe("diagnoseProvider (Tauri IPC)", () => {
    it("returns null for nonexistent provider", async () => {
      const result = await useProviderStore.getState().diagnoseProvider("nonexistent");
      expect(result).toBeNull();
    });

    it("returns diagnostic report from backend", async () => {
      const mockReport = {
        providerId: "provider-anthropic",
        providerName: "Anthropic",
        healthy: true,
        durationMs: 350,
        checks: [
          { name: "Configuration", severity: "ok", message: "Base URL configured" },
          { name: "API Key", severity: "ok", message: "API key is set" },
          { name: "Connectivity", severity: "ok", message: "Connection successful" },
        ],
        modelsCount: 3,
      };
      mockInvoke.mockResolvedValueOnce(mockReport);

      const result = await useProviderStore.getState().diagnoseProvider("provider-anthropic");
      expect(result).toEqual(mockReport);
      expect(mockInvoke).toHaveBeenCalledWith("diagnose_provider", expect.objectContaining({
        config: expect.objectContaining({ id: "provider-anthropic" }),
      }));
    });

    it("stores diagnostic report in state", async () => {
      const mockReport = {
        providerId: "provider-openai",
        providerName: "OpenAI",
        healthy: false,
        durationMs: 120,
        checks: [],
      };
      mockInvoke.mockResolvedValueOnce(mockReport);

      await useProviderStore.getState().diagnoseProvider("provider-openai");
      expect(useProviderStore.getState().diagnosticReports["provider-openai"]).toEqual(mockReport);
    });

    it("returns null when invoke throws", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("IPC error"));
      const result = await useProviderStore.getState().diagnoseProvider("provider-anthropic");
      expect(result).toBeNull();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // diagnoseProvider — browser mock fallback
  // ─────────────────────────────────────────────────────────────
  describe("diagnoseProvider (browser fallback)", () => {
    beforeEach(() => {
      mockIsTauriRuntime.mockReturnValue(false);
    });

    it("returns healthy report for local provider", async () => {
      const result = await useProviderStore.getState().diagnoseProvider("provider-ollama");
      expect(result).not.toBeNull();
      expect(result!.healthy).toBe(true);
      expect(result!.providerId).toBe("provider-ollama");
      expect(result!.checks.length).toBeGreaterThanOrEqual(2);
    });

    it("returns healthy report for provider with API key", async () => {
      useProviderStore.getState().setApiKey("provider-deepseek", "sk-deepseek");
      const result = await useProviderStore.getState().diagnoseProvider("provider-deepseek");
      expect(result).not.toBeNull();
      expect(result!.healthy).toBe(true);
      expect(result!.checks.some((c) => c.name === "API Key" && c.severity === "ok")).toBe(true);
    });

    it("returns unhealthy report for provider without API key", async () => {
      useProviderStore.getState().setApiKey("provider-openai", "");
      const result = await useProviderStore.getState().diagnoseProvider("provider-openai");
      expect(result).not.toBeNull();
      expect(result!.healthy).toBe(false);
      expect(result!.checks.some((c) => c.name === "API Key" && c.severity === "error")).toBe(true);
    });

    it("includes models count in report", async () => {
      const result = await useProviderStore.getState().diagnoseProvider("provider-anthropic");
      expect(result).not.toBeNull();
      expect(result!.modelsCount).toBeGreaterThanOrEqual(1);
      const modelsCheck = result!.checks.find((c) => c.name === "Models");
      expect(modelsCheck).toBeDefined();
      expect(modelsCheck!.severity).toBe("ok");
    });

    it("stores report in diagnosticReports state", async () => {
      await useProviderStore.getState().diagnoseProvider("provider-google");
      expect(useProviderStore.getState().diagnosticReports["provider-google"]).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // setApiKey
  // ─────────────────────────────────────────────────────────────
  describe("setApiKey", () => {
    it("updates the API key on the target provider", () => {
      useProviderStore.getState().setApiKey("provider-openai", "sk-new");
      const p = useProviderStore.getState().providers.find((p) => p.id === "provider-openai")!;
      expect(p.apiKey).toBe("sk-new");
    });

    it("persists via upsert_provider after setting key", () => {
      mockInvoke.mockResolvedValue(undefined);
      useProviderStore.getState().setApiKey("provider-anthropic", "sk-persist");
      expect(mockInvoke).toHaveBeenCalledWith("upsert_provider", expect.objectContaining({
        provider: expect.objectContaining({ id: "provider-anthropic" }),
        apiKey: "sk-persist",
      }));
    });

    it("does not persist if provider not found", () => {
      useProviderStore.getState().setApiKey("nonexistent", "key");
      expect(mockInvoke).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getEnabledProviders
  // ─────────────────────────────────────────────────────────────
  describe("getEnabledProviders", () => {
    it("excludes disabled providers", () => {
      // OpenRouter and Ollama are disabled by default
      const enabled = useProviderStore.getState().getEnabledProviders();
      expect(enabled.every((p) => p.enabled)).toBe(true);
    });

    it("excludes enabled providers without API key (non-local)", () => {
      // Default providers have empty API keys and non-local baseUrls
      const enabled = useProviderStore.getState().getEnabledProviders();
      const nonLocal = enabled.filter(
        (p) => !p.baseUrl.includes("localhost") && !p.baseUrl.includes("127.0.0.1"),
      );
      // All non-local enabled providers must have an API key
      expect(nonLocal.every((p) => !!p.apiKey)).toBe(true);
    });

    it("includes local providers without API key if enabled", () => {
      // Enable Ollama (local, no API key needed)
      useProviderStore.getState().updateProvider("provider-ollama", { enabled: true });
      const enabled = useProviderStore.getState().getEnabledProviders();
      const ollama = enabled.find((p) => p.id === "provider-ollama");
      expect(ollama).toBeDefined();
    });

    it("includes provider with API key and enabled=true", () => {
      useProviderStore.getState().setApiKey("provider-deepseek", "sk-deep");
      const enabled = useProviderStore.getState().getEnabledProviders();
      expect(enabled.some((p) => p.id === "provider-deepseek")).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // getProviderById
  // ─────────────────────────────────────────────────────────────
  describe("getProviderById", () => {
    it("returns the correct provider", () => {
      const p = useProviderStore.getState().getProviderById("provider-deepseek");
      expect(p).toBeDefined();
      expect(p!.name).toBe("DeepSeek");
    });

    it("returns undefined for unknown id", () => {
      expect(useProviderStore.getState().getProviderById("does-not-exist")).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // diagnosticReports state
  // ─────────────────────────────────────────────────────────────
  describe("diagnosticReports", () => {
    it("starts empty", () => {
      expect(useProviderStore.getState().diagnosticReports).toEqual({});
    });

    it("accumulates reports across providers", async () => {
      mockIsTauriRuntime.mockReturnValue(false);

      await useProviderStore.getState().diagnoseProvider("provider-ollama");
      await useProviderStore.getState().diagnoseProvider("provider-google");

      const reports = useProviderStore.getState().diagnosticReports;
      expect(Object.keys(reports).length).toBeGreaterThanOrEqual(2);
      expect(reports["provider-ollama"]).toBeDefined();
      expect(reports["provider-google"]).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Edge cases & state integrity
  // ─────────────────────────────────────────────────────────────
  describe("state integrity", () => {
    it("updating a non-existent provider does not add it", () => {
      const count = useProviderStore.getState().providers.length;
      useProviderStore.getState().updateProvider("ghost", { name: "Ghost" });
      expect(useProviderStore.getState().providers).toHaveLength(count);
    });

    it("removing a non-existent provider does not change state", () => {
      const count = useProviderStore.getState().providers.length;
      useProviderStore.getState().removeProvider("ghost");
      expect(useProviderStore.getState().providers).toHaveLength(count);
    });

    it("addProvider returns generated id that exists in state", () => {
      const id = useProviderStore.getState().addProvider(sampleProvider());
      const found = useProviderStore.getState().getProviderById(id);
      expect(found).toBeDefined();
      expect(found!.name).toBe("Test Provider");
    });

    it("multiple updates to same provider apply sequentially", () => {
      useProviderStore.getState().updateProvider("provider-anthropic", { name: "Renamed" });
      useProviderStore.getState().updateProvider("provider-anthropic", { baseUrl: "https://new.url" });

      const p = useProviderStore.getState().getProviderById("provider-anthropic")!;
      expect(p.name).toBe("Renamed");
      expect(p.baseUrl).toBe("https://new.url");
    });

    it("diagnoseProvider with Tauri runtime passes full model list", async () => {
      const anthropic = useProviderStore.getState().getProviderById("provider-anthropic")!;
      mockInvoke.mockResolvedValueOnce({
        providerId: anthropic.id,
        providerName: anthropic.name,
        healthy: true,
        durationMs: 100,
        checks: [],
      });

      await useProviderStore.getState().diagnoseProvider(anthropic.id);

      const call = mockInvoke.mock.calls[0]!;
      const config = (call[1] as Record<string, unknown>).config as Record<string, unknown>;
      expect((config.models as unknown[]).length).toBe(anthropic.models.length);
    });
  });
});
