export interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  model?: string;
  timestamp: string;
  toolCalls?: ToolCall[];
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
