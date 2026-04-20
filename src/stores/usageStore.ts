import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UsageRecord, UsageSummary } from "../types";
import { useProviderStore, type ModelConfig } from "./providerStore";
import { toast } from "./toastStore";

// Approximate token estimation: ~4 chars per token for English, ~1.5 chars per token for CJK
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}

/**
 * Look up model pricing from providerStore (prices are per 1M tokens).
 * Returns { input, output } in per-1K tokens for backward-compatible cost calculation.
 * Falls back to 0 if model not found (e.g., local/Ollama models).
 */
function getModelPricing(modelId: string): { input: number; output: number } {
  const providers = useProviderStore.getState().providers;
  for (const provider of providers) {
    const model = provider.models.find((m: ModelConfig) => m.id === modelId);
    if (model && model.inputPrice !== undefined && model.outputPrice !== undefined) {
      // providerStore prices are per 1M tokens → convert to per 1K tokens
      return {
        input: model.inputPrice / 1000,
        output: model.outputPrice / 1000,
      };
    }
  }
  // Default: free (for local models like Ollama, or unknown models)
  return { input: 0, output: 0 };
}

/** Budget period for cost tracking. */
export type BudgetPeriod = "daily" | "weekly" | "monthly" | "total";

/** Get the start timestamp for a budget period. */
function getPeriodStart(period: BudgetPeriod): Date {
  const now = new Date();
  switch (period) {
    case "daily": {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    case "weekly": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Start on Monday
      return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
    }
    case "monthly": {
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    case "total": {
      return new Date(0); // Beginning of time
    }
  }
}

interface UsageState {
  records: UsageRecord[];

  // Budget settings
  budgetLimit: number; // USD, 0 = disabled
  budgetPeriod: BudgetPeriod;
  budgetAlerted: boolean; // Whether we've already shown an alert this period

  // Actions
  recordUsage: (params: {
    sessionId: string;
    model: string;
    provider: string;
    inputText: string;
    outputText: string;
  }) => UsageRecord;
  /** Record usage from actual token counts (received from Tauri backend). */
  recordUsageFromTokens: (params: {
    sessionId: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
  }) => UsageRecord;
  getSummary: () => UsageSummary;
  getSessionUsage: (sessionId: string) => { tokens: number; cost: number };
  getPeriodCost: () => number;
  getBudgetUsage: () => { spent: number; limit: number; percentage: number; period: BudgetPeriod };
  setBudgetLimit: (limit: number) => void;
  setBudgetPeriod: (period: BudgetPeriod) => void;
  checkBudget: () => void;
  clearUsage: () => void;
}

let usageIdCounter = Date.now();


export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      records: [],
      budgetLimit: 0,
      budgetPeriod: "monthly" as BudgetPeriod,
      budgetAlerted: false,

      recordUsage: ({ sessionId, model, provider, inputText, outputText }) => {
        const inputTokens = estimateTokens(inputText);
        const outputTokens = estimateTokens(outputText);
        const pricing = getModelPricing(model);
        const estimatedCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;

        const record: UsageRecord = {
          id: `usage-${++usageIdCounter}`,
          sessionId,
          model,
          provider,
          inputTokens,
          outputTokens,
          estimatedCost,
          timestamp: new Date().toISOString(),
        };

        set((s) => ({ records: [...s.records, record] }));
        get().checkBudget();
        return record;
      },

      recordUsageFromTokens: ({ sessionId, model, provider, inputTokens, outputTokens }) => {
        const pricing = getModelPricing(model);
        const estimatedCost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000;

        const record: UsageRecord = {
          id: `usage-${++usageIdCounter}`,
          sessionId,
          model,
          provider,
          inputTokens,
          outputTokens,
          estimatedCost,
          timestamp: new Date().toISOString(),
        };

        set((s) => ({ records: [...s.records, record] }));
        get().checkBudget();
        return record;
      },

      getSummary: () => {
        const records = get().records;
        const byProvider: Record<string, { tokens: number; cost: number }> = {};

        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let totalCost = 0;

        for (const r of records) {
          totalInputTokens += r.inputTokens;
          totalOutputTokens += r.outputTokens;
          totalCost += r.estimatedCost;
          if (!byProvider[r.provider]) {
            byProvider[r.provider] = { tokens: 0, cost: 0 };
          }
          byProvider[r.provider]!.tokens += r.inputTokens + r.outputTokens;
          byProvider[r.provider]!.cost += r.estimatedCost;
        }

        return { totalInputTokens, totalOutputTokens, totalCost, byProvider };
      },

      getSessionUsage: (sessionId) => {
        const records = get().records.filter((r) => r.sessionId === sessionId);
        let tokens = 0;
        let cost = 0;
        for (const r of records) {
          tokens += r.inputTokens + r.outputTokens;
          cost += r.estimatedCost;
        }
        return { tokens, cost };
      },

      /** Get total cost for the current budget period. */
      getPeriodCost: () => {
        const { records, budgetPeriod } = get();
        const start = getPeriodStart(budgetPeriod);
        const startTime = start.getTime();
        let cost = 0;
        for (const r of records) {
          if (new Date(r.timestamp).getTime() >= startTime) {
            cost += r.estimatedCost;
          }
        }
        return cost;
      },

      /** Get budget usage info (spent, limit, percentage). */
      getBudgetUsage: () => {
        const { budgetLimit, budgetPeriod } = get();
        const spent = get().getPeriodCost();
        const percentage = budgetLimit > 0 ? Math.min((spent / budgetLimit) * 100, 100) : 0;
        return { spent, limit: budgetLimit, percentage, period: budgetPeriod };
      },

      /** Set the budget limit in USD. Set to 0 to disable. */
      setBudgetLimit: (limit: number) => {
        set({ budgetLimit: limit, budgetAlerted: false });
      },

      /** Set the budget period. */
      setBudgetPeriod: (period: BudgetPeriod) => {
        set({ budgetPeriod: period, budgetAlerted: false });
      },

      /** Internal: check if budget has been exceeded and show toast. */
      checkBudget: () => {
        const { budgetLimit, budgetAlerted } = get();
        if (budgetLimit <= 0 || budgetAlerted) {
          return;
        }
        const spent = get().getPeriodCost();
        if (spent >= budgetLimit) {
          set({ budgetAlerted: true });
          toast.warning(
            `Budget limit reached: $${spent.toFixed(2)} of $${budgetLimit.toFixed(2)} used this ${get().budgetPeriod}.`,
            8000,
          );
        }
      },

      clearUsage: () => set({ records: [], budgetAlerted: false }),
    }),
    {
      name: "devpilot-usage",
      version: 2,
      // Persist records + budget settings
      partialize: (state) => ({
        records: state.records,
        budgetLimit: state.budgetLimit,
        budgetPeriod: state.budgetPeriod,
      }),
    }
  )
);
