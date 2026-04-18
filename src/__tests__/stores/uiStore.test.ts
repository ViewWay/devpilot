import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "../../stores/uiStore";


describe("uiStore", () => {
  beforeEach(() => {
    // Reset to initial state
    useUIStore.setState({
      sidebarOpen: true,
      selectedModel: useUIStore.getState().models[0]!,
      activeMode: "code",
      reasoningEffort: 50,
      activeView: "chat",
      rightPanel: "none",
      panelSize: 50,
      theme: "system",
      commandPaletteOpen: false,
    });
  });

  describe("sidebar", () => {
    it("toggles sidebar open/close", () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

    it("sets sidebar open state directly", () => {
      useUIStore.getState().setSidebarOpen(false);
      expect(useUIStore.getState().sidebarOpen).toBe(false);
      useUIStore.getState().setSidebarOpen(true);
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });
  });

  describe("model selection", () => {
    it("has default models list", () => {
      const models = useUIStore.getState().models;
      expect(models.length).toBeGreaterThanOrEqual(7);
      expect(models[0]!.name).toBe("Claude 4 Sonnet");
    });

    it("sets selected model", () => {
      const glmModel = useUIStore.getState().models.find((m) => m.id === "glm-5")!;
      useUIStore.getState().setSelectedModel(glmModel);
      expect(useUIStore.getState().selectedModel.id).toBe("glm-5");
      expect(useUIStore.getState().selectedModel.provider).toBe("智谱");
    });
  });

  describe("agent mode", () => {
    it("defaults to code mode", () => {
      expect(useUIStore.getState().activeMode).toBe("code");
    });

    it("switches between modes", () => {
      useUIStore.getState().setActiveMode("ask");
      expect(useUIStore.getState().activeMode).toBe("ask");
      useUIStore.getState().setActiveMode("plan");
      expect(useUIStore.getState().activeMode).toBe("plan");
    });
  });

  describe("reasoning effort", () => {
    it("defaults to 50", () => {
      expect(useUIStore.getState().reasoningEffort).toBe(50);
    });

    it("clamps to 0-100 range", () => {
      useUIStore.getState().setReasoningEffort(150);
      expect(useUIStore.getState().reasoningEffort).toBe(100);
      useUIStore.getState().setReasoningEffort(-50);
      expect(useUIStore.getState().reasoningEffort).toBe(0);
      useUIStore.getState().setReasoningEffort(75);
      expect(useUIStore.getState().reasoningEffort).toBe(75);
    });
  });

  describe("right panel", () => {
    it("defaults to none", () => {
      expect(useUIStore.getState().rightPanel).toBe("none");
    });

    it("sets right panel directly", () => {
      useUIStore.getState().setRightPanel("files");
      expect(useUIStore.getState().rightPanel).toBe("files");
    });

    it("toggles right panel (open/close)", () => {
      useUIStore.getState().toggleRightPanel("terminal");
      expect(useUIStore.getState().rightPanel).toBe("terminal");
      useUIStore.getState().toggleRightPanel("terminal");
      expect(useUIStore.getState().rightPanel).toBe("none");
    });

    it("switches between different panels", () => {
      useUIStore.getState().setRightPanel("files");
      useUIStore.getState().toggleRightPanel("terminal");
      expect(useUIStore.getState().rightPanel).toBe("terminal");
    });
  });

  describe("panel size", () => {
    it("defaults to 50", () => {
      expect(useUIStore.getState().panelSize).toBe(50);
    });

    it("clamps to 20-80 range", () => {
      useUIStore.getState().setPanelSize(10);
      expect(useUIStore.getState().panelSize).toBe(20);
      useUIStore.getState().setPanelSize(95);
      expect(useUIStore.getState().panelSize).toBe(80);
      useUIStore.getState().setPanelSize(35);
      expect(useUIStore.getState().panelSize).toBe(35);
    });
  });

  describe("theme", () => {
    it("defaults to system", () => {
      expect(useUIStore.getState().theme).toBe("system");
    });

    it("switches themes", () => {
      useUIStore.getState().setTheme("dark");
      expect(useUIStore.getState().theme).toBe("dark");
      useUIStore.getState().setTheme("light");
      expect(useUIStore.getState().theme).toBe("light");
    });
  });

  describe("command palette", () => {
    it("defaults to closed", () => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("toggles open/close", () => {
      useUIStore.getState().toggleCommandPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
      useUIStore.getState().toggleCommandPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });
  });
});
