import { describe, it, expect, beforeEach } from "vitest";
import { useUsageStore } from "../../stores/usageStore";

describe("usageStore", () => {
  beforeEach(() => {
    useUsageStore.getState().clearUsage();
  });

  describe("recordUsage", () => {
    it("creates a usage record with estimated tokens", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "session-1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputText: "Hello, how are you?",
        outputText: "I'm doing well, thank you!",
      });

      expect(record.id).toMatch(/^usage-\d+$/);
      expect(record.sessionId).toBe("session-1");
      expect(record.model).toBe("claude-4-sonnet");
      expect(record.provider).toBe("Anthropic");
      expect(record.inputTokens).toBeGreaterThan(0);
      expect(record.outputTokens).toBeGreaterThan(0);
      expect(record.estimatedCost).toBeGreaterThan(0);
      expect(record.timestamp).toBeDefined();
    });

    it("accumulates multiple records", () => {
      useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "Hello", outputText: "Hi",
      });
      useUsageStore.getState().recordUsage({
        sessionId: "s2", model: "glm-5", provider: "智谱",
        inputText: "你好", outputText: "你好呀",
      });
      expect(useUsageStore.getState().records).toHaveLength(2);
    });
  });

  describe("getSummary", () => {
    it("returns zero summary when no records", () => {
      const summary = useUsageStore.getState().getSummary();
      expect(summary.totalInputTokens).toBe(0);
      expect(summary.totalOutputTokens).toBe(0);
      expect(summary.totalCost).toBe(0);
      expect(Object.keys(summary.byProvider)).toHaveLength(0);
    });

    it("aggregates tokens and cost across records", () => {
      useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "Hello world, this is a test message",
        outputText: "This is a longer response to the test message",
      });
      useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "Follow up question",
        outputText: "Follow up answer",
      });

      const summary = useUsageStore.getState().getSummary();
      expect(summary.totalInputTokens).toBeGreaterThan(0);
      expect(summary.totalOutputTokens).toBeGreaterThan(0);
      expect(summary.totalCost).toBeGreaterThan(0);
      expect(summary.byProvider["Anthropic"]).toBeDefined();
      expect(summary.byProvider["Anthropic"]!.tokens).toBeGreaterThan(0);
    });

    it("groups by provider correctly", () => {
      useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "test", outputText: "response",
      });
      useUsageStore.getState().recordUsage({
        sessionId: "s2", model: "glm-5", provider: "智谱",
        inputText: "测试", outputText: "回复",
      });

      const summary = useUsageStore.getState().getSummary();
      expect(Object.keys(summary.byProvider)).toHaveLength(2);
      expect(summary.byProvider["Anthropic"]).toBeDefined();
      expect(summary.byProvider["智谱"]).toBeDefined();
    });
  });

  describe("getSessionUsage", () => {
    it("returns tokens and cost for a specific session", () => {
      useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "hello", outputText: "world",
      });
      useUsageStore.getState().recordUsage({
        sessionId: "s2", model: "glm-5", provider: "智谱",
        inputText: "你好", outputText: "世界",
      });

      const s1Usage = useUsageStore.getState().getSessionUsage("s1");
      expect(s1Usage.tokens).toBeGreaterThan(0);
      expect(s1Usage.cost).toBeGreaterThan(0);

      const s2Usage = useUsageStore.getState().getSessionUsage("s2");
      expect(s2Usage.tokens).toBeGreaterThan(0);

      const s3Usage = useUsageStore.getState().getSessionUsage("nonexistent");
      expect(s3Usage.tokens).toBe(0);
      expect(s3Usage.cost).toBe(0);
    });
  });

  describe("clearUsage", () => {
    it("removes all records", () => {
      useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "test", outputText: "test",
      });
      expect(useUsageStore.getState().records.length).toBeGreaterThan(0);
      useUsageStore.getState().clearUsage();
      expect(useUsageStore.getState().records).toHaveLength(0);
    });
  });

  describe("token estimation accuracy", () => {
    it("estimates English tokens (~4 chars/token)", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "A".repeat(400), // ~100 tokens
        outputText: "",
      });
      // 400 chars / 4 = 100 tokens
      expect(record.inputTokens).toBe(100);
    });

    it("estimates CJK tokens (~1.5 chars/token)", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "glm-5", provider: "智谱",
        inputText: "中".repeat(15), // 15 CJK chars / 1.5 = 10 tokens
        outputText: "",
      });
      expect(record.inputTokens).toBe(10);
    });

    it("estimates mixed CJK + English correctly", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "Hello你好World世界", // 10 English + 4 CJK
        outputText: "",
      });
      // English: 10/4 = 2.5 -> ceil = 3, CJK: 4/1.5 = 2.67 -> ceil = 3, total = 6
      expect(record.inputTokens).toBe(6);
    });
  });

  describe("pricing model", () => {
    it("Claude 4 Sonnet has correct pricing", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "claude-4-sonnet", provider: "Anthropic",
        inputText: "A".repeat(1000),  // 250 input tokens
        outputText: "B".repeat(1000), // 250 output tokens
      });
      // cost = (250 * 0.003 + 250 * 0.015) / 1000 = (0.75 + 3.75) / 1000 = 0.0045
      expect(record.estimatedCost).toBeCloseTo(0.0045, 4);
    });

    it("Ollama (local) is free", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "ollama-llama4", provider: "Ollama",
        inputText: "Hello", outputText: "World",
      });
      expect(record.estimatedCost).toBe(0);
    });

    it("unknown model is free (no pricing data)", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1", model: "unknown-model", provider: "Unknown",
        inputText: "A".repeat(1000),  // 250 tokens
        outputText: "B".repeat(1000), // 250 tokens
      });
      // No pricing data found in providerStore → defaults to free
      expect(record.estimatedCost).toBe(0);
    });
  });
});
