import { describe, it, expect, beforeEach } from "vitest";
import {
  useUIStore,
  registerChatStoreAccessor,
  registerChatStoreSetActiveSession,
} from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";

describe("uiStore", () => {
  beforeEach(() => {
    // Reset to initial state
    useUIStore.setState({
      sidebarOpen: true,
      activeView: "chat",
      rightPanel: "none",
      panelSize: 50,
      commandPaletteOpen: false,
      workingDir: "",
      previewFile: "",
      diffData: null,
      splitViewActive: false,
      secondarySessionId: null,
      splitViewSize: 50,
      quickFileSearchOpen: false,
      messageSearchOpen: false,
    });
    useSettingsStore.setState({
      selectedModel: useSettingsStore.getState().models[0]!,
      activeMode: "code",
      reasoningEffort: 50,
      theme: "system",
    });
  });

  // ─── Sidebar ────────────────────────────────────────────────────────
  describe("sidebar", () => {
    it("defaults to open", () => {
      expect(useUIStore.getState().sidebarOpen).toBe(true);
    });

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

  // ─── Active View ────────────────────────────────────────────────────
  describe("activeView", () => {
    it("defaults to chat", () => {
      expect(useUIStore.getState().activeView).toBe("chat");
    });

    it("sets active view to settings", () => {
      useUIStore.getState().setActiveView("settings");
      expect(useUIStore.getState().activeView).toBe("settings");
    });

    it("sets active view to scheduler", () => {
      useUIStore.getState().setActiveView("scheduler");
      expect(useUIStore.getState().activeView).toBe("scheduler");
    });

    it("sets active view to gallery", () => {
      useUIStore.getState().setActiveView("gallery");
      expect(useUIStore.getState().activeView).toBe("gallery");
    });

    it("switches between views multiple times", () => {
      useUIStore.getState().setActiveView("settings");
      expect(useUIStore.getState().activeView).toBe("settings");
      useUIStore.getState().setActiveView("chat");
      expect(useUIStore.getState().activeView).toBe("chat");
      useUIStore.getState().setActiveView("gallery");
      expect(useUIStore.getState().activeView).toBe("gallery");
    });
  });

  // ─── Right Panel ────────────────────────────────────────────────────
  describe("right panel", () => {
    it("defaults to none", () => {
      expect(useUIStore.getState().rightPanel).toBe("none");
    });

    it("sets right panel directly", () => {
      useUIStore.getState().setRightPanel("files");
      expect(useUIStore.getState().rightPanel).toBe("files");
    });

    it("sets all panel types", () => {
      const panels = ["files", "terminal", "preview", "git"] as const;
      for (const panel of panels) {
        useUIStore.getState().setRightPanel(panel);
        expect(useUIStore.getState().rightPanel).toBe(panel);
      }
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

    it("toggles different panel when another is open", () => {
      useUIStore.getState().setRightPanel("files");
      useUIStore.getState().toggleRightPanel("git");
      expect(useUIStore.getState().rightPanel).toBe("git");
    });

    it("toggles none panel when already none stays none... wait no", () => {
      // When rightPanel is "none" and we toggle "none", it becomes "none" (matches, so set to none)
      useUIStore.getState().toggleRightPanel("none");
      expect(useUIStore.getState().rightPanel).toBe("none");
    });
  });

  // ─── Panel Size ─────────────────────────────────────────────────────
  describe("panel size", () => {
    it("defaults to 50", () => {
      expect(useUIStore.getState().panelSize).toBe(50);
    });

    it("clamps to 20-80 range (lower bound)", () => {
      useUIStore.getState().setPanelSize(10);
      expect(useUIStore.getState().panelSize).toBe(20);
    });

    it("clamps to 20-80 range (upper bound)", () => {
      useUIStore.getState().setPanelSize(95);
      expect(useUIStore.getState().panelSize).toBe(80);
    });

    it("accepts valid values within range", () => {
      useUIStore.getState().setPanelSize(35);
      expect(useUIStore.getState().panelSize).toBe(35);
    });

    it("accepts exact boundary values", () => {
      useUIStore.getState().setPanelSize(20);
      expect(useUIStore.getState().panelSize).toBe(20);
      useUIStore.getState().setPanelSize(80);
      expect(useUIStore.getState().panelSize).toBe(80);
    });
  });

  // ─── Command Palette ────────────────────────────────────────────────
  describe("command palette", () => {
    it("defaults to closed", () => {
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("sets command palette open directly", () => {
      useUIStore.getState().setCommandPaletteOpen(true);
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
      useUIStore.getState().setCommandPaletteOpen(false);
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });

    it("toggles open/close", () => {
      useUIStore.getState().toggleCommandPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(true);
      useUIStore.getState().toggleCommandPalette();
      expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    });
  });

  // ─── Working Directory ──────────────────────────────────────────────
  describe("workingDir", () => {
    it("defaults to empty string", () => {
      expect(useUIStore.getState().workingDir).toBe("");
    });

    it("sets working directory", () => {
      useUIStore.getState().setWorkingDir("/home/user/project");
      expect(useUIStore.getState().workingDir).toBe("/home/user/project");
    });

    it("updates working directory", () => {
      useUIStore.getState().setWorkingDir("/first/path");
      useUIStore.getState().setWorkingDir("/second/path");
      expect(useUIStore.getState().workingDir).toBe("/second/path");
    });

    it("clears working directory", () => {
      useUIStore.getState().setWorkingDir("/some/path");
      useUIStore.getState().setWorkingDir("");
      expect(useUIStore.getState().workingDir).toBe("");
    });
  });

  // ─── Preview File ───────────────────────────────────────────────────
  describe("previewFile", () => {
    it("defaults to empty string", () => {
      expect(useUIStore.getState().previewFile).toBe("");
    });

    it("sets preview file path", () => {
      useUIStore.getState().setPreviewFile("/src/components/App.tsx");
      expect(useUIStore.getState().previewFile).toBe("/src/components/App.tsx");
    });

    it("updates preview file path", () => {
      useUIStore.getState().setPreviewFile("/file1.ts");
      useUIStore.getState().setPreviewFile("/file2.ts");
      expect(useUIStore.getState().previewFile).toBe("/file2.ts");
    });

    it("clears preview file path", () => {
      useUIStore.getState().setPreviewFile("/some/file.ts");
      useUIStore.getState().setPreviewFile("");
      expect(useUIStore.getState().previewFile).toBe("");
    });
  });

  // ─── Diff Data ──────────────────────────────────────────────────────
  describe("diffData", () => {
    it("defaults to null", () => {
      expect(useUIStore.getState().diffData).toBeNull();
    });

    it("sets diff data", () => {
      const data = {
        original: "const x = 1;",
        modified: "const x = 2;",
        language: "typescript",
      };
      useUIStore.getState().setDiffData(data);
      expect(useUIStore.getState().diffData).toEqual(data);
    });

    it("clears diff data by setting null", () => {
      useUIStore.getState().setDiffData({
        original: "a",
        modified: "b",
        language: "text",
      });
      useUIStore.getState().setDiffData(null);
      expect(useUIStore.getState().diffData).toBeNull();
    });

    it("overwrites diff data", () => {
      const first = { original: "a", modified: "b", language: "js" };
      const second = { original: "c", modified: "d", language: "py" };
      useUIStore.getState().setDiffData(first);
      useUIStore.getState().setDiffData(second);
      expect(useUIStore.getState().diffData).toEqual(second);
    });
  });

  // ─── Split View ─────────────────────────────────────────────────────
  describe("split view", () => {
    it("defaults to inactive with null secondary session and size 50", () => {
      const s = useUIStore.getState();
      expect(s.splitViewActive).toBe(false);
      expect(s.secondarySessionId).toBeNull();
      expect(s.splitViewSize).toBe(50);
    });

    describe("toggleSplitView", () => {
      it("activates split view with provided sessionId", () => {
        useUIStore.getState().toggleSplitView("session-2");
        expect(useUIStore.getState().splitViewActive).toBe(true);
        expect(useUIStore.getState().secondarySessionId).toBe("session-2");
      });

      it("deactivates split view when already active", () => {
        useUIStore.getState().toggleSplitView("session-2");
        expect(useUIStore.getState().splitViewActive).toBe(true);
        useUIStore.getState().toggleSplitView();
        expect(useUIStore.getState().splitViewActive).toBe(false);
        expect(useUIStore.getState().secondarySessionId).toBeNull();
      });

      it("auto-picks first non-active non-archived session when no sessionId provided", () => {
        registerChatStoreAccessor(() => ({
          sessions: [
            { id: "active-session" },
            { id: "other-session" },
            { id: "archived-session", archived: true },
          ],
          activeSessionId: "active-session",
        }));

        useUIStore.getState().toggleSplitView();
        expect(useUIStore.getState().splitViewActive).toBe(true);
        expect(useUIStore.getState().secondarySessionId).toBe("other-session");
      });

      it("sets secondarySessionId to null when no sessionId and no matching session", () => {
        registerChatStoreAccessor(() => ({
          sessions: [{ id: "only-session" }],
          activeSessionId: "only-session",
        }));

        useUIStore.getState().toggleSplitView();
        expect(useUIStore.getState().splitViewActive).toBe(true);
        expect(useUIStore.getState().secondarySessionId).toBeNull();
      });

      it("sets secondarySessionId to null when no sessionId and no chat accessor registered", () => {
        // Unregister the chat accessor
        registerChatStoreAccessor(undefined as never);

        useUIStore.getState().toggleSplitView();
        expect(useUIStore.getState().splitViewActive).toBe(true);
        expect(useUIStore.getState().secondarySessionId).toBeNull();
      });

      it("skips archived sessions when auto-picking", () => {
        registerChatStoreAccessor(() => ({
          sessions: [
            { id: "active", archived: false },
            { id: "archived1", archived: true },
            { id: "available", archived: false },
          ],
          activeSessionId: "active",
        }));

        useUIStore.getState().toggleSplitView();
        expect(useUIStore.getState().secondarySessionId).toBe("available");
      });
    });

    describe("closeSplitView", () => {
      it("closes active split view", () => {
        useUIStore.setState({
          splitViewActive: true,
          secondarySessionId: "session-2",
        });
        useUIStore.getState().closeSplitView();
        expect(useUIStore.getState().splitViewActive).toBe(false);
        expect(useUIStore.getState().secondarySessionId).toBeNull();
      });

      it("is idempotent when split view already closed", () => {
        useUIStore.getState().closeSplitView();
        expect(useUIStore.getState().splitViewActive).toBe(false);
        expect(useUIStore.getState().secondarySessionId).toBeNull();
      });
    });

    describe("setSecondarySession", () => {
      it("sets secondary session id", () => {
        useUIStore.getState().setSecondarySession("new-session");
        expect(useUIStore.getState().secondarySessionId).toBe("new-session");
      });

      it("overwrites existing secondary session", () => {
        useUIStore.setState({ secondarySessionId: "old-session" });
        useUIStore.getState().setSecondarySession("new-session");
        expect(useUIStore.getState().secondarySessionId).toBe("new-session");
      });
    });

    describe("swapSplitView", () => {
      it("swaps primary and secondary sessions", () => {
        let activeSessionId = "primary-id";
        registerChatStoreAccessor(() => ({
          sessions: [
            { id: "primary-id" },
            { id: "secondary-id" },
          ],
          activeSessionId,
        }));
        registerChatStoreSetActiveSession((id: string) => {
          activeSessionId = id;
        });

        useUIStore.setState({
          splitViewActive: true,
          secondarySessionId: "secondary-id",
        });

        useUIStore.getState().swapSplitView();

        // The old secondary becomes the new active session
        expect(activeSessionId).toBe("secondary-id");
        // The old primary becomes the new secondary
        expect(useUIStore.getState().secondarySessionId).toBe("primary-id");
      });

      it("does nothing when split view is not active", () => {
        let activeSessionId = "primary-id";
        registerChatStoreAccessor(() => ({
          sessions: [{ id: "primary-id" }],
          activeSessionId,
        }));
        registerChatStoreSetActiveSession((id: string) => {
          activeSessionId = id;
        });

        useUIStore.setState({
          splitViewActive: false,
          secondarySessionId: null,
        });

        useUIStore.getState().swapSplitView();
        expect(activeSessionId).toBe("primary-id");
      });

      it("does nothing when secondarySessionId is null", () => {
        let activeSessionId = "primary-id";
        registerChatStoreAccessor(() => ({
          sessions: [{ id: "primary-id" }],
          activeSessionId,
        }));
        registerChatStoreSetActiveSession((id: string) => {
          activeSessionId = id;
        });

        useUIStore.setState({
          splitViewActive: true,
          secondarySessionId: null,
        });

        useUIStore.getState().swapSplitView();
        expect(activeSessionId).toBe("primary-id");
      });

      it("does nothing when chat state has no activeSessionId", () => {
        let swapped = false;
        registerChatStoreAccessor(() => ({
          sessions: [{ id: "some-session" }],
          activeSessionId: null,
        }));
        registerChatStoreSetActiveSession(() => {
          swapped = true;
        });

        useUIStore.setState({
          splitViewActive: true,
          secondarySessionId: "secondary-id",
        });

        useUIStore.getState().swapSplitView();
        expect(swapped).toBe(false);
      });

      it("does nothing when no chat accessor registered", () => {
        registerChatStoreAccessor(undefined as never);

        useUIStore.setState({
          splitViewActive: true,
          secondarySessionId: "secondary-id",
        });

        // Should not throw
        useUIStore.getState().swapSplitView();
        expect(useUIStore.getState().secondarySessionId).toBe("secondary-id");
      });

      it("does nothing when no setActiveSession registered", () => {
        registerChatStoreAccessor(() => ({
          sessions: [{ id: "primary-id" }, { id: "secondary-id" }],
          activeSessionId: "primary-id",
        }));
        registerChatStoreSetActiveSession(undefined as never);

        useUIStore.setState({
          splitViewActive: true,
          secondarySessionId: "secondary-id",
        });

        // Should not throw — _setActiveSession?.() is optional chained
        useUIStore.getState().swapSplitView();
      });
    });

    describe("setSplitViewSize", () => {
      it("clamps to 20-80 range (lower bound)", () => {
        useUIStore.getState().setSplitViewSize(5);
        expect(useUIStore.getState().splitViewSize).toBe(20);
      });

      it("clamps to 20-80 range (upper bound)", () => {
        useUIStore.getState().setSplitViewSize(99);
        expect(useUIStore.getState().splitViewSize).toBe(80);
      });

      it("accepts valid values within range", () => {
        useUIStore.getState().setSplitViewSize(60);
        expect(useUIStore.getState().splitViewSize).toBe(60);
      });

      it("accepts exact boundary values", () => {
        useUIStore.getState().setSplitViewSize(20);
        expect(useUIStore.getState().splitViewSize).toBe(20);
        useUIStore.getState().setSplitViewSize(80);
        expect(useUIStore.getState().splitViewSize).toBe(80);
      });
    });
  });

  // ─── Quick File Search ──────────────────────────────────────────────
  describe("quick file search", () => {
    it("defaults to closed", () => {
      expect(useUIStore.getState().quickFileSearchOpen).toBe(false);
    });

    it("sets quick file search open directly", () => {
      useUIStore.getState().setQuickFileSearchOpen(true);
      expect(useUIStore.getState().quickFileSearchOpen).toBe(true);
      useUIStore.getState().setQuickFileSearchOpen(false);
      expect(useUIStore.getState().quickFileSearchOpen).toBe(false);
    });

    it("toggles quick file search", () => {
      useUIStore.getState().toggleQuickFileSearch();
      expect(useUIStore.getState().quickFileSearchOpen).toBe(true);
      useUIStore.getState().toggleQuickFileSearch();
      expect(useUIStore.getState().quickFileSearchOpen).toBe(false);
    });
  });

  // ─── Message Search ─────────────────────────────────────────────────
  describe("message search", () => {
    it("defaults to closed", () => {
      expect(useUIStore.getState().messageSearchOpen).toBe(false);
    });

    it("sets message search open directly", () => {
      useUIStore.getState().setMessageSearchOpen(true);
      expect(useUIStore.getState().messageSearchOpen).toBe(true);
      useUIStore.getState().setMessageSearchOpen(false);
      expect(useUIStore.getState().messageSearchOpen).toBe(false);
    });

    it("toggles message search", () => {
      useUIStore.getState().toggleMessageSearch();
      expect(useUIStore.getState().messageSearchOpen).toBe(true);
      useUIStore.getState().toggleMessageSearch();
      expect(useUIStore.getState().messageSearchOpen).toBe(false);
    });
  });

  // ─── Settings Store (kept from original for backward compat) ────────
  describe("model selection", () => {
    it("has default models list", () => {
      const models = useSettingsStore.getState().models;
      expect(models.length).toBeGreaterThanOrEqual(7);
      expect(models[0]!.name).toBe("Claude 4 Sonnet");
    });

    it("sets selected model", () => {
      const glmModel = useSettingsStore.getState().models.find((m) => m.id === "glm-5")!;
      useSettingsStore.getState().setSelectedModel(glmModel);
      expect(useSettingsStore.getState().selectedModel.id).toBe("glm-5");
      expect(useSettingsStore.getState().selectedModel.provider).toBe("智谱");
    });
  });

  describe("agent mode", () => {
    it("defaults to code mode", () => {
      expect(useSettingsStore.getState().activeMode).toBe("code");
    });

    it("switches between modes", () => {
      useSettingsStore.getState().setActiveMode("ask");
      expect(useSettingsStore.getState().activeMode).toBe("ask");
      useSettingsStore.getState().setActiveMode("plan");
      expect(useSettingsStore.getState().activeMode).toBe("plan");
    });
  });

  describe("reasoning effort", () => {
    it("defaults to 50", () => {
      expect(useSettingsStore.getState().reasoningEffort).toBe(50);
    });

    it("clamps to 0-100 range", () => {
      useSettingsStore.getState().setReasoningEffort(150);
      expect(useSettingsStore.getState().reasoningEffort).toBe(100);
      useSettingsStore.getState().setReasoningEffort(-50);
      expect(useSettingsStore.getState().reasoningEffort).toBe(0);
      useSettingsStore.getState().setReasoningEffort(75);
      expect(useSettingsStore.getState().reasoningEffort).toBe(75);
    });
  });

  describe("theme", () => {
    it("defaults to system", () => {
      expect(useSettingsStore.getState().theme).toBe("system");
    });

    it("switches themes", () => {
      useSettingsStore.getState().setTheme("dark");
      expect(useSettingsStore.getState().theme).toBe("dark");
      useSettingsStore.getState().setTheme("light");
      expect(useSettingsStore.getState().theme).toBe("light");
    });
  });

  // ─── registerChatStoreAccessor / registerChatStoreSetActiveSession ──
  describe("chat store registration", () => {
    it("registerChatStoreAccessor stores a getter function", () => {
      const mockGetter = () => ({
        sessions: [{ id: "test" }],
        activeSessionId: "test",
      });
      // Should not throw
      expect(() => registerChatStoreAccessor(mockGetter)).not.toThrow();
    });

    it("registerChatStoreSetActiveSession stores a setter function", () => {
      const mockSetter = (_id: string) => {};
      expect(() => registerChatStoreSetActiveSession(mockSetter)).not.toThrow();
    });
  });
});
