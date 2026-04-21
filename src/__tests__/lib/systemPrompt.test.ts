import { describe, it, expect } from "vitest";
import {
  buildSystemPrompt,
  DEFAULT_SYSTEM_PROMPT,
  invalidatePersonaCache,
  type PersonaFilesResult,
} from "../../lib/systemPrompt";

describe("DEFAULT_SYSTEM_PROMPT", () => {
  it("is a non-empty string", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toBeTruthy();
    expect(typeof DEFAULT_SYSTEM_PROMPT).toBe("string");
  });

  it("mentions available tools", () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain("file_read");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("file_write");
    expect(DEFAULT_SYSTEM_PROMPT).toContain("shell_exec");
  });
});

describe("buildSystemPrompt", () => {
  it("returns default prompt when no options given", () => {
    const result = buildSystemPrompt();
    expect(result).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("includes custom prompt when provided", () => {
    const result = buildSystemPrompt("Always respond in Chinese.");
    expect(result).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(result).toContain("Always respond in Chinese.");
    expect(result).toContain("Additional Instructions");
  });

  it("skips empty custom prompt", () => {
    const result = buildSystemPrompt("   ");
    expect(result).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("includes soul when persona has soul content", () => {
    const persona: PersonaFilesResult = {
      soul: "You are a helpful coding assistant.",
      user: "",
      memory: "",
    };
    const result = buildSystemPrompt(undefined, persona);
    expect(result).toContain("Agent Personality (SOUL.md)");
    expect(result).toContain("You are a helpful coding assistant.");
  });

  it("includes user context when persona has user content", () => {
    const persona: PersonaFilesResult = {
      soul: "",
      user: "User prefers dark theme.",
      memory: "",
    };
    const result = buildSystemPrompt(undefined, persona);
    expect(result).toContain("User Context (USER.md)");
    expect(result).toContain("User prefers dark theme.");
  });

  it("includes memory when persona has memory content", () => {
    const persona: PersonaFilesResult = {
      soul: "",
      user: "",
      memory: "The user works on project X.",
    };
    const result = buildSystemPrompt(undefined, persona);
    expect(result).toContain("Long-term Memory (MEMORY.md)");
    expect(result).toContain("The user works on project X.");
  });

  it("skips whitespace-only persona fields", () => {
    const persona: PersonaFilesResult = {
      soul: "   ",
      user: "  \n  ",
      memory: "\t\n",
    };
    const result = buildSystemPrompt(undefined, persona);
    expect(result).not.toContain("SOUL.md");
    expect(result).not.toContain("USER.md");
    expect(result).not.toContain("MEMORY.md");
  });

  it("combines all sections", () => {
    const persona: PersonaFilesResult = {
      soul: "Soul content",
      user: "User content",
      memory: "Memory content",
    };
    const result = buildSystemPrompt("Custom prompt", persona);
    expect(result).toContain("SOUL.md");
    expect(result).toContain("USER.md");
    expect(result).toContain("MEMORY.md");
    expect(result).toContain("Additional Instructions");
    expect(result).toContain("Soul content");
    expect(result).toContain("User content");
    expect(result).toContain("Memory content");
    expect(result).toContain("Custom prompt");
  });

  it("joins sections with double newlines", () => {
    const persona: PersonaFilesResult = {
      soul: "soul",
      user: "",
      memory: "",
    };
    const result = buildSystemPrompt(undefined, persona);
    // Default prompt followed by soul section
    expect(result).toContain(DEFAULT_SYSTEM_PROMPT);
    expect(result).toContain("\n\n");
  });
});

describe("invalidatePersonaCache", () => {
  it("does not throw", () => {
    expect(() => invalidatePersonaCache()).not.toThrow();
  });
});
