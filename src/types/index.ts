export type SessionMode = "code" | "plan" | "ask";

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  model: string;
  time: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  model?: string;
  timestamp: string;
}
