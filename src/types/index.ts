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
  messages: Message[];
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  color: string;
}

export type AgentMode = "code" | "plan" | "ask";
