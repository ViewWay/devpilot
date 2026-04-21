import { describe, it, expect } from "vitest";
import { cn, mapProviderType } from "../../lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const condition = false;
    expect(cn("foo", condition && "bar", "baz")).toBe("foo baz");
  });

  it("deduplicates tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });

  it("handles undefined and null", () => {
    expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
  });
});

describe("mapProviderType", () => {
  it("maps anthropic", () => {
    expect(mapProviderType("provider-anthropic")).toBe("anthropic");
  });

  it("maps openrouter", () => {
    expect(mapProviderType("my-openrouter-id")).toBe("openrouter");
  });

  it("maps ollama", () => {
    expect(mapProviderType("ollama-local")).toBe("ollama");
  });

  it("maps google", () => {
    expect(mapProviderType("provider-google")).toBe("google");
  });

  it("maps qwen", () => {
    expect(mapProviderType("qwen-model")).toBe("qwen");
  });

  it("maps deepseek", () => {
    expect(mapProviderType("deepseek-chat")).toBe("deepseek");
  });

  it("maps zhipu", () => {
    expect(mapProviderType("zhipu-api")).toBe("glm");
  });

  it("maps glm", () => {
    expect(mapProviderType("glm-4")).toBe("glm");
  });

  it("maps kimi", () => {
    expect(mapProviderType("kimi-v1")).toBe("kimi");
  });

  it("maps moonshot", () => {
    expect(mapProviderType("moonshot-pro")).toBe("kimi");
  });

  it("maps minimax", () => {
    expect(mapProviderType("minimax-abab")).toBe("minimax");
  });

  it("maps volcengine", () => {
    expect(mapProviderType("volcengine-endpoint")).toBe("volcengine");
  });

  it("maps doubao", () => {
    expect(mapProviderType("doubao-pro")).toBe("volcengine");
  });

  it("maps openai (fallback)", () => {
    expect(mapProviderType("openai-gpt4")).toBe("openai");
  });

  it("returns custom for unknown", () => {
    expect(mapProviderType("some-unknown-provider")).toBe("custom");
  });

  it("returns custom for empty string", () => {
    expect(mapProviderType("")).toBe("custom");
  });
});
