import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UsageRecord, UsageSummary } from "../types";
import { useProviderStore, type ModelConfig } from "./providerStore";

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

interface UsageState {
  records: UsageRecord[];

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
  clearUsage: () => void;
}

let usageIdCounter = Date.now();

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      records: [],

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

      clearUsage: () => set({ records: [] }),
    }),
    {
      name: "devpilot-usage",
      version: 1,
      // Only persist records array
      partialize: (state) => ({ records: state.records }),
    }
  )
);
