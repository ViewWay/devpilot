import { create } from "zustand";
import type { UsageRecord, UsageSummary } from "../types";

// Approximate token estimation: ~4 chars per token for English, ~1.5 chars per token for CJK
function estimateTokens(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) || []).length;
  const other = text.length - cjk;
  return Math.ceil(cjk / 1.5 + other / 4);
}

// Mock pricing per 1K tokens (USD)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-4-sonnet": { input: 0.003, output: 0.015 },
  "gpt-5.2": { input: 0.005, output: 0.02 },
  "glm-5": { input: 0.001, output: 0.002 },
  "deepseek-v3": { input: 0.0014, output: 0.0028 },
  "qwen-max": { input: 0.002, output: 0.006 },
  "gemini-3-pro": { input: 0.00125, output: 0.01 },
  "ollama-llama4": { input: 0, output: 0 }, // Free / local
};

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
  getSummary: () => UsageSummary;
  getSessionUsage: (sessionId: string) => { tokens: number; cost: number };
  clearUsage: () => void;
}

let usageIdCounter = 100;

export const useUsageStore = create<UsageState>((set, get) => ({
  records: [],

  recordUsage: ({ sessionId, model, provider, inputText, outputText }) => {
    const inputTokens = estimateTokens(inputText);
    const outputTokens = estimateTokens(outputText);
    const pricing = MODEL_PRICING[model] || { input: 0.003, output: 0.015 };
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
}));
