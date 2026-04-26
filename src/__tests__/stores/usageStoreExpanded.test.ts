import { describe, it, expect, beforeEach, vi } from "vitest";
import { useUsageStore } from "../../stores/usageStore";

// Mock the toast store to avoid side effects from budget alerts
vi.mock("../../stores/toastStore", () => ({
  toast: {
    warning: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// We also need to ensure providerStore has models with pricing for cost tests.
// The existing tests rely on providerStore already having claude-4-sonnet pricing;
// we do the same here. If providerStore is not loaded, costs default to 0.
vi.mock("../../stores/providerStore", () => {
  const state = {
    providers: [
      {
        id: "anthropic",
        name: "Anthropic",
        models: [
          {
            id: "claude-4-sonnet",
            name: "Claude 4 Sonnet",
            inputPrice: 3,    // $3 per 1M tokens
            outputPrice: 15,  // $15 per 1M tokens
          },
        ],
      },
    ],
  };
  return {
    useProviderStore: {
      getState: () => state,
      subscribe: vi.fn(),
    },
  };
});

describe("usageStore – expanded coverage", () => {
  beforeEach(() => {
    useUsageStore.setState({
      records: [],
      budgetLimit: 0,
      budgetPeriod: "monthly",
      budgetAlerted: false,
    });
  });

  // ─── recordUsageFromTokens ────────────────────────────────────────

  describe("recordUsageFromTokens", () => {
    it("creates a record with exact token counts (no estimation)", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 500,
        outputTokens: 200,
      });

      expect(record.id).toMatch(/^usage-\d+$/);
      expect(record.sessionId).toBe("s1");
      expect(record.model).toBe("claude-4-sonnet");
      expect(record.provider).toBe("Anthropic");
      expect(record.inputTokens).toBe(500);
      expect(record.outputTokens).toBe(200);
      expect(record.timestamp).toBeDefined();
    });

    it("calculates cost using pricing from providerStore", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });

      // claude-4-sonnet: inputPrice=3/1M → 0.003/1K, outputPrice=15/1M → 0.015/1K
      // cost = (1000 * 0.003 + 1000 * 0.015) / 1000 = (3 + 15) / 1000 = 0.018
      expect(record.estimatedCost).toBeCloseTo(0.018, 4);
    });

    it("defaults to zero cost for unknown model", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "mystery-model",
        provider: "Unknown",
        inputTokens: 999,
        outputTokens: 888,
      });

      expect(record.estimatedCost).toBe(0);
    });

    it("defaults to zero cost for zero tokens", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 0,
        outputTokens: 0,
      });

      expect(record.estimatedCost).toBe(0);
      expect(record.inputTokens).toBe(0);
      expect(record.outputTokens).toBe(0);
    });

    it("appends record to existing records", () => {
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 10,
        outputTokens: 10,
      });
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s2",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 20,
        outputTokens: 20,
      });

      expect(useUsageStore.getState().records).toHaveLength(2);
      expect(useUsageStore.getState().records[0]!.sessionId).toBe("s1");
      expect(useUsageStore.getState().records[1]!.sessionId).toBe("s2");
    });

    it("generates unique IDs for each record", () => {
      const r1 = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1,
        outputTokens: 1,
      });
      const r2 = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1,
        outputTokens: 1,
      });

      expect(r1.id).not.toBe(r2.id);
    });

    it("produces a valid ISO timestamp", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 10,
        outputTokens: 10,
      });

      const parsed = new Date(record.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // ─── getSummary – deeper edge cases ───────────────────────────────

  describe("getSummary – expanded", () => {
    it("correctly sums input and output tokens separately", () => {
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 100,
        outputTokens: 50,
      });
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s2",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 200,
        outputTokens: 150,
      });

      const summary = useUsageStore.getState().getSummary();
      expect(summary.totalInputTokens).toBe(300);
      expect(summary.totalOutputTokens).toBe(200);
    });

    it("aggregates cost precisely across many records", () => {
      for (let i = 0; i < 10; i++) {
        useUsageStore.getState().recordUsageFromTokens({
          sessionId: `s${i}`,
          model: "claude-4-sonnet",
          provider: "Anthropic",
          inputTokens: 100,
          outputTokens: 100,
        });
      }

      const summary = useUsageStore.getState().getSummary();
      // Each record: cost = (100*0.003 + 100*0.015)/1000 = 0.0018
      // 10 records → 0.018
      expect(summary.totalCost).toBeCloseTo(0.018, 4);
    });

    it("groups tokens by provider as sum of input+output", () => {
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 300,
        outputTokens: 200,
      });

      const summary = useUsageStore.getState().getSummary();
      expect(summary.byProvider["Anthropic"]).toBeDefined();
      expect(summary.byProvider["Anthropic"]!.tokens).toBe(500);
    });
  });

  // ─── getSessionUsage – expanded ───────────────────────────────────

  describe("getSessionUsage – expanded", () => {
    it("aggregates across multiple records in same session", () => {
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 100,
        outputTokens: 50,
      });
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 200,
        outputTokens: 100,
      });

      const usage = useUsageStore.getState().getSessionUsage("s1");
      expect(usage.tokens).toBe(450); // (100+50) + (200+100)
      expect(usage.cost).toBeGreaterThan(0);
    });

    it("returns zero for session that doesn't exist", () => {
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 100,
        outputTokens: 50,
      });

      const usage = useUsageStore.getState().getSessionUsage("nonexistent");
      expect(usage.tokens).toBe(0);
      expect(usage.cost).toBe(0);
    });
  });

  // ─── Budget: setBudgetLimit / setBudgetPeriod ─────────────────────

  describe("budget settings", () => {
    it("setBudgetLimit updates the limit and resets budgetAlerted", () => {
      useUsageStore.setState({ budgetAlerted: true });
      useUsageStore.getState().setBudgetLimit(50);

      expect(useUsageStore.getState().budgetLimit).toBe(50);
      expect(useUsageStore.getState().budgetAlerted).toBe(false);
    });

    it("setBudgetLimit can be set to 0 to disable", () => {
      useUsageStore.getState().setBudgetLimit(100);
      expect(useUsageStore.getState().budgetLimit).toBe(100);

      useUsageStore.getState().setBudgetLimit(0);
      expect(useUsageStore.getState().budgetLimit).toBe(0);
    });

    it("setBudgetPeriod updates the period and resets budgetAlerted", () => {
      useUsageStore.setState({ budgetAlerted: true });
      useUsageStore.getState().setBudgetPeriod("weekly");

      expect(useUsageStore.getState().budgetPeriod).toBe("weekly");
      expect(useUsageStore.getState().budgetAlerted).toBe(false);
    });

    it("supports all budget periods", () => {
      const periods: Array<"daily" | "weekly" | "monthly" | "total"> = [
        "daily",
        "weekly",
        "monthly",
        "total",
      ];
      for (const period of periods) {
        useUsageStore.getState().setBudgetPeriod(period);
        expect(useUsageStore.getState().budgetPeriod).toBe(period);
      }
    });
  });

  // ─── getPeriodCost ────────────────────────────────────────────────

  describe("getPeriodCost", () => {
    it("returns 0 when there are no records", () => {
      useUsageStore.getState().setBudgetPeriod("monthly");
      expect(useUsageStore.getState().getPeriodCost()).toBe(0);
    });

    it("returns total cost for 'total' period", () => {
      useUsageStore.getState().setBudgetPeriod("total");

      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });

      const cost = useUsageStore.getState().getPeriodCost();
      expect(cost).toBeGreaterThan(0);
    });

    it("includes recent records in 'daily' period", () => {
      useUsageStore.getState().setBudgetPeriod("daily");

      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 500,
        outputTokens: 500,
      });

      // Record was just created, so it should be within today
      const cost = useUsageStore.getState().getPeriodCost();
      expect(cost).toBeGreaterThan(0);
    });

    it("excludes old records with future-dated budget period start", () => {
      // Set period to "daily" and inject a record with a timestamp far in the past
      useUsageStore.getState().setBudgetPeriod("daily");

      // Manually inject an old record
      useUsageStore.setState({
        records: [
          {
            id: "usage-old",
            sessionId: "s1",
            model: "claude-4-sonnet",
            provider: "Anthropic",
            inputTokens: 1000,
            outputTokens: 1000,
            estimatedCost: 5.0,
            timestamp: "2020-01-01T00:00:00.000Z",
          },
        ],
      });

      // The old record should be excluded from today's cost
      const cost = useUsageStore.getState().getPeriodCost();
      expect(cost).toBe(0);
    });

    it("includes old records when period is 'total'", () => {
      useUsageStore.getState().setBudgetPeriod("total");

      useUsageStore.setState({
        records: [
          {
            id: "usage-old",
            sessionId: "s1",
            model: "claude-4-sonnet",
            provider: "Anthropic",
            inputTokens: 1000,
            outputTokens: 1000,
            estimatedCost: 5.0,
            timestamp: "2020-01-01T00:00:00.000Z",
          },
        ],
      });

      const cost = useUsageStore.getState().getPeriodCost();
      expect(cost).toBe(5.0);
    });
  });

  // ─── getBudgetUsage ───────────────────────────────────────────────

  describe("getBudgetUsage", () => {
    it("returns 0 percentage when budget is disabled (limit=0)", () => {
      useUsageStore.getState().setBudgetLimit(0);
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });

      const usage = useUsageStore.getState().getBudgetUsage();
      expect(usage.limit).toBe(0);
      expect(usage.percentage).toBe(0);
      expect(usage.spent).toBeGreaterThan(0);
      expect(usage.period).toBe(useUsageStore.getState().budgetPeriod);
    });

    it("calculates percentage correctly within limit", () => {
      useUsageStore.getState().setBudgetLimit(1); // $1 budget

      // cost = (1000*0.003 + 1000*0.015)/1000 = 0.018
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });

      const usage = useUsageStore.getState().getBudgetUsage();
      expect(usage.limit).toBe(1);
      expect(usage.spent).toBeCloseTo(0.018, 4);
      expect(usage.percentage).toBeCloseTo(1.8, 1); // 0.018/1 * 100
    });

    it("caps percentage at 100 when budget is exceeded", () => {
      useUsageStore.getState().setBudgetLimit(0.001); // very small budget

      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });

      const usage = useUsageStore.getState().getBudgetUsage();
      expect(usage.percentage).toBe(100);
    });
  });

  // ─── checkBudget ──────────────────────────────────────────────────

  describe("checkBudget", () => {
    it("does nothing when budget is disabled (limit=0)", () => {
      useUsageStore.getState().setBudgetLimit(0);
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 10000,
        outputTokens: 10000,
      });

      // Should not set budgetAlerted
      expect(useUsageStore.getState().budgetAlerted).toBe(false);
    });

    it("does not alert when under budget", () => {
      useUsageStore.getState().setBudgetLimit(100);
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 10,
        outputTokens: 10,
      });

      expect(useUsageStore.getState().budgetAlerted).toBe(false);
    });

    it("sets budgetAlerted and calls toast.warning when budget exceeded", async () => {
      const { toast } = await import("../../stores/toastStore");

      useUsageStore.getState().setBudgetLimit(0.001); // tiny budget
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });

      expect(useUsageStore.getState().budgetAlerted).toBe(true);
      expect(toast.warning).toHaveBeenCalled();
    });

    it("only alerts once per period (budgetAlerted prevents re-alert)", async () => {
      const { toast } = await import("../../stores/toastStore");
      vi.clearAllMocks();

      useUsageStore.getState().setBudgetLimit(0.001);

      // First record triggers alert
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });
      expect(toast.warning).toHaveBeenCalledTimes(1);

      // Second record should NOT trigger another alert
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s2",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });
      expect(toast.warning).toHaveBeenCalledTimes(1);
    });

    it("re-alerts after setBudgetLimit resets budgetAlerted", async () => {
      const { toast } = await import("../../stores/toastStore");
      vi.clearAllMocks();

      useUsageStore.getState().setBudgetLimit(0.001);

      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });
      expect(toast.warning).toHaveBeenCalledTimes(1);

      // Reset budget → resets budgetAlerted
      useUsageStore.getState().setBudgetLimit(0.001);

      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s3",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 1000,
        outputTokens: 1000,
      });
      expect(toast.warning).toHaveBeenCalledTimes(2);
    });
  });

  // ─── clearUsage – expanded ────────────────────────────────────────

  describe("clearUsage – expanded", () => {
    it("resets budgetAlerted flag", () => {
      useUsageStore.setState({ budgetAlerted: true });
      useUsageStore.getState().clearUsage();
      expect(useUsageStore.getState().budgetAlerted).toBe(false);
    });

    it("does not reset budget limit or period", () => {
      useUsageStore.getState().setBudgetLimit(50);
      useUsageStore.getState().setBudgetPeriod("weekly");

      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 100,
        outputTokens: 100,
      });

      useUsageStore.getState().clearUsage();

      expect(useUsageStore.getState().budgetLimit).toBe(50);
      expect(useUsageStore.getState().budgetPeriod).toBe("weekly");
    });
  });

  // ─── recordUsage (text-based) – edge cases ────────────────────────

  describe("recordUsage – edge cases", () => {
    it("handles empty strings with minimum token count", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputText: "",
        outputText: "",
      });

      expect(record.inputTokens).toBe(0);
      expect(record.outputTokens).toBe(0);
      expect(record.estimatedCost).toBe(0);
    });

    it("handles very long text", () => {
      const longText = "A".repeat(100000);
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputText: longText,
        outputText: longText,
      });

      // 100000 / 4 = 25000 tokens each
      expect(record.inputTokens).toBe(25000);
      expect(record.outputTokens).toBe(25000);
      expect(record.estimatedCost).toBeGreaterThan(0);
    });

    it("uses actual token counts from recordUsageFromTokens without estimation", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 12345,
        outputTokens: 6789,
      });

      expect(record.inputTokens).toBe(12345);
      expect(record.outputTokens).toBe(6789);
    });
  });

  // ─── record ID format ─────────────────────────────────────────────

  describe("record ID format", () => {
    it("recordUsage generates IDs with 'usage-' prefix", () => {
      const record = useUsageStore.getState().recordUsage({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputText: "test",
        outputText: "test",
      });
      expect(record.id).toMatch(/^usage-\d+$/);
    });

    it("recordUsageFromTokens generates IDs with 'usage-' prefix", () => {
      const record = useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 10,
        outputTokens: 10,
      });
      expect(record.id).toMatch(/^usage-\d+$/);
    });
  });

  // ─── mixed recordUsage + recordUsageFromTokens ────────────────────

  describe("mixed record types", () => {
    it("both record types appear in summary together", () => {
      useUsageStore.getState().recordUsage({
        sessionId: "s1",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputText: "Hello world",
        outputText: "Hi there",
      });
      useUsageStore.getState().recordUsageFromTokens({
        sessionId: "s2",
        model: "claude-4-sonnet",
        provider: "Anthropic",
        inputTokens: 100,
        outputTokens: 200,
      });

      const summary = useUsageStore.getState().getSummary();
      expect(summary.totalInputTokens).toBeGreaterThan(0);
      expect(summary.totalOutputTokens).toBeGreaterThan(0);
      expect(summary.totalCost).toBeGreaterThan(0);
      expect(Object.keys(summary.byProvider)).toHaveLength(1);
      expect(summary.byProvider["Anthropic"]!).toBeDefined();
    });
  });

  // ─── getSessionUsage cost precision ───────────────────────────────

  describe("cost precision", () => {
    it("accumulates cost from multiple records precisely", () => {
      for (let i = 0; i < 5; i++) {
        useUsageStore.getState().recordUsageFromTokens({
          sessionId: "s1",
          model: "claude-4-sonnet",
          provider: "Anthropic",
          inputTokens: 100,
          outputTokens: 100,
        });
      }

      const usage = useUsageStore.getState().getSessionUsage("s1");
      // Each record: cost = (100*0.003 + 100*0.015)/1000 = 0.0018
      // 5 records → 0.009
      expect(usage.cost).toBeCloseTo(0.009, 4);
      expect(usage.tokens).toBe(1000); // 5 * (100+100)
    });
  });
});
