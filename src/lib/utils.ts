import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Map a provider ID string (e.g. "provider-anthropic") to a provider type
 * matching the Rust backend enum (e.g. "anthropic").
 */
export function mapProviderType(providerId: string): string {
  if (providerId.includes("anthropic")) { return "anthropic"; }
  if (providerId.includes("openrouter")) { return "openrouter"; }
  if (providerId.includes("ollama")) { return "ollama"; }
  if (providerId.includes("google")) { return "google"; }
  if (providerId.includes("qwen")) { return "qwen"; }
  if (providerId.includes("deepseek")) { return "deepseek"; }
  if (providerId.includes("zhipu") || providerId.includes("glm")) { return "glm"; }
  if (providerId.includes("kimi") || providerId.includes("moonshot")) { return "kimi"; }
  if (providerId.includes("minimax")) { return "minimax"; }
  if (providerId.includes("volcengine") || providerId.includes("doubao")) { return "volcengine"; }
  if (providerId.includes("openai")) { return "openai"; }
  return "custom";
}
