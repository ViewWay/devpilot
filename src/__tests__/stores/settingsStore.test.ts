import { describe, it, expect, beforeEach } from "vitest";
import { useSettingsStore } from "../../stores/settingsStore";

describe("settingsStore", () => {
  // Reset to defaults before each test
  beforeEach(() => {
    useSettingsStore.setState({
      locale: "en",
      theme: "system",
      selectedModel: useSettingsStore.getState().models[0]!,
      activeMode: "code",
      reasoningEffort: 50,
      fontSize: 14,
      sandboxPolicy: "default",
      systemPrompt: "",
    });
    localStorage.clear();
  });

  describe("initial state", () => {
    it("has default models list", () => {
      const models = useSettingsStore.getState().models;
      expect(models.length).toBeGreaterThanOrEqual(7);
    });

    it("defaults to Claude 4 Sonnet", () => {
      expect(useSettingsStore.getState().selectedModel.id).toBe("claude-4-sonnet");
      expect(useSettingsStore.getState().selectedModel.provider).toBe("Anthropic");
    });

    it("defaults to code mode", () => {
      expect(useSettingsStore.getState().activeMode).toBe("code");
    });

    it("defaults to system theme", () => {
      expect(useSettingsStore.getState().theme).toBe("system");
    });

    it("defaults to en locale", () => {
      expect(useSettingsStore.getState().locale).toBe("en");
    });

    it("defaults to reasoning effort 50", () => {
      expect(useSettingsStore.getState().reasoningEffort).toBe(50);
    });

    it("defaults to font size 14", () => {
      expect(useSettingsStore.getState().fontSize).toBe(14);
    });

    it("defaults to sandbox policy default", () => {
      expect(useSettingsStore.getState().sandboxPolicy).toBe("default");
    });

    it("defaults to empty system prompt", () => {
      expect(useSettingsStore.getState().systemPrompt).toBe("");
    });
  });

  describe("model selection", () => {
    it("sets selected model", () => {
      const glmModel = useSettingsStore.getState().models.find((m) => m.id === "glm-5")!;
      useSettingsStore.getState().setSelectedModel(glmModel);
      expect(useSettingsStore.getState().selectedModel.id).toBe("glm-5");
    });

    it("persists model selection", () => {
      const dsModel = useSettingsStore.getState().models.find((m) => m.id === "deepseek-v3")!;
      useSettingsStore.getState().setSelectedModel(dsModel);
      const stored = JSON.parse(localStorage.getItem("devpilot-settings") || "{}");
      expect(stored.selectedModel.id).toBe("deepseek-v3");
    });
  });

  describe("agent mode", () => {
    it("switches to plan mode", () => {
      useSettingsStore.getState().setActiveMode("plan");
      expect(useSettingsStore.getState().activeMode).toBe("plan");
    });

    it("switches to ask mode", () => {
      useSettingsStore.getState().setActiveMode("ask");
      expect(useSettingsStore.getState().activeMode).toBe("ask");
    });

    it("persists mode change", () => {
      useSettingsStore.getState().setActiveMode("plan");
      const stored = JSON.parse(localStorage.getItem("devpilot-settings") || "{}");
      expect(stored.activeMode).toBe("plan");
    });
  });

  describe("reasoning effort", () => {
    it("sets reasoning effort", () => {
      useSettingsStore.getState().setReasoningEffort(80);
      expect(useSettingsStore.getState().reasoningEffort).toBe(80);
    });

    it("clamps effort to 0–100 range (lower bound)", () => {
      useSettingsStore.getState().setReasoningEffort(-10);
      expect(useSettingsStore.getState().reasoningEffort).toBe(0);
    });

    it("clamps effort to 0–100 range (upper bound)", () => {
      useSettingsStore.getState().setReasoningEffort(150);
      expect(useSettingsStore.getState().reasoningEffort).toBe(100);
    });

    it("accepts boundary values 0 and 100", () => {
      useSettingsStore.getState().setReasoningEffort(0);
      expect(useSettingsStore.getState().reasoningEffort).toBe(0);
      useSettingsStore.getState().setReasoningEffort(100);
      expect(useSettingsStore.getState().reasoningEffort).toBe(100);
    });
  });

  describe("theme", () => {
    it("sets theme to dark", () => {
      useSettingsStore.getState().setTheme("dark");
      expect(useSettingsStore.getState().theme).toBe("dark");
    });

    it("sets theme to light", () => {
      useSettingsStore.getState().setTheme("light");
      expect(useSettingsStore.getState().theme).toBe("light");
    });

    it("persists theme", () => {
      useSettingsStore.getState().setTheme("dark");
      const stored = JSON.parse(localStorage.getItem("devpilot-settings") || "{}");
      expect(stored.theme).toBe("dark");
    });
  });

  describe("locale", () => {
    it("sets locale to zh", () => {
      useSettingsStore.getState().setLocale("zh");
      expect(useSettingsStore.getState().locale).toBe("zh");
    });

    it("persists locale", () => {
      useSettingsStore.getState().setLocale("zh");
      const stored = JSON.parse(localStorage.getItem("devpilot-settings") || "{}");
      expect(stored.locale).toBe("zh");
    });
  });

  describe("font size", () => {
    it("sets font size", () => {
      useSettingsStore.getState().setFontSize(16);
      expect(useSettingsStore.getState().fontSize).toBe(16);
    });

    it("clamps font size to 12–18 range (lower bound)", () => {
      useSettingsStore.getState().setFontSize(8);
      expect(useSettingsStore.getState().fontSize).toBe(12);
    });

    it("clamps font size to 12–18 range (upper bound)", () => {
      useSettingsStore.getState().setFontSize(24);
      expect(useSettingsStore.getState().fontSize).toBe(18);
    });

    it("accepts boundary values 12 and 18", () => {
      useSettingsStore.getState().setFontSize(12);
      expect(useSettingsStore.getState().fontSize).toBe(12);
      useSettingsStore.getState().setFontSize(18);
      expect(useSettingsStore.getState().fontSize).toBe(18);
    });
  });

  describe("sandbox policy", () => {
    it("sets sandbox policy to permissive", () => {
      useSettingsStore.getState().setSandboxPolicy("permissive");
      expect(useSettingsStore.getState().sandboxPolicy).toBe("permissive");
    });

    it("sets sandbox policy to strict", () => {
      useSettingsStore.getState().setSandboxPolicy("strict");
      expect(useSettingsStore.getState().sandboxPolicy).toBe("strict");
    });
  });

  describe("system prompt", () => {
    it("sets system prompt", () => {
      useSettingsStore.getState().setSystemPrompt("You are a helpful assistant.");
      expect(useSettingsStore.getState().systemPrompt).toBe("You are a helpful assistant.");
    });

    it("clears system prompt with empty string", () => {
      useSettingsStore.getState().setSystemPrompt("Some prompt");
      useSettingsStore.getState().setSystemPrompt("");
      expect(useSettingsStore.getState().systemPrompt).toBe("");
    });

    it("persists system prompt", () => {
      useSettingsStore.getState().setSystemPrompt("Custom instructions here");
      const stored = JSON.parse(localStorage.getItem("devpilot-settings") || "{}");
      expect(stored.systemPrompt).toBe("Custom instructions here");
    });
  });

  describe("persistence", () => {
    it("persists multiple settings", () => {
      useSettingsStore.getState().setTheme("dark");
      useSettingsStore.getState().setLocale("zh");
      useSettingsStore.getState().setFontSize(16);
      useSettingsStore.getState().setActiveMode("ask");

      const stored = JSON.parse(localStorage.getItem("devpilot-settings") || "{}");
      expect(stored.theme).toBe("dark");
      expect(stored.locale).toBe("zh");
      expect(stored.fontSize).toBe(16);
      expect(stored.activeMode).toBe("ask");
    });
  });
});
