export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  model?: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  streaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  input: string;
  output?: string;
  status: "running" | "done" | "error";
  duration?: number;
}

export interface Session {
  id: string;
  title: string;
  model: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
  archived?: boolean;
  messages: Message[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  color: string;
}

export type AgentMode = "code" | "plan" | "ask";

export interface UsageRecord {
  id: string;
  sessionId: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number; // USD
  timestamp: string;
}

export interface UsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  byProvider: Record<string, { tokens: number; cost: number }>;
}

export type RiskLevel = "low" | "medium" | "high";

export interface ApprovalRequest {
  id: string;
  toolCallId: string;
  command: string;
  description: string;
  riskLevel: RiskLevel;
  workingDir?: string;
  createdAt: string;
}

export interface Attachment {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string; // MIME type
  preview?: string; // data URL for images
}
