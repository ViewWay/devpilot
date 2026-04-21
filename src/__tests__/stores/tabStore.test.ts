/**
 * Unit tests for tabStore — tab management, persistence, and reorder.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock localStorage ──────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(store)) {delete store[k];}
  }),
};
vi.stubGlobal("localStorage", localStorageMock);

// ── Mock chatStore for restoreTabs validation ───────────────
vi.mock("../../stores/chatStore", () => ({
  useChatStore: {
    getState: () => ({
      sessions: [
        { id: "s1", title: "Session 1" },
        { id: "s2", title: "Session 2" },
      ],
    }),
  },
}));

// Import after mocks
import {
  useTabStore,
  SETTINGS_TAB_ID,
  SCHEDULED_TAB_ID,
  SKILLS_TAB_ID,
  GALLERY_TAB_ID,
  BRIDGE_TAB_ID,
} from "../../stores/tabStore";

describe("tabStore", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    // Reset the store to initial state
    useTabStore.setState({ tabs: [], activeTabId: null });
  });

  // ── openTab ────────────────────────────────────────────────

  describe("openTab", () => {
    it("opens a new tab and sets it active", () => {
      useTabStore.getState().openTab("s1", "Session 1");

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0]).toEqual({
        sessionId: "s1",
        title: "Session 1",
        type: "session",
        status: "idle",
      });
      expect(state.activeTabId).toBe("s1");
    });

    it("does not duplicate existing tabs — just activates", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s1", "Session 1");

      expect(useTabStore.getState().tabs).toHaveLength(1);
      expect(useTabStore.getState().activeTabId).toBe("s1");
    });

    it("opens multiple tabs", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");

      expect(useTabStore.getState().tabs).toHaveLength(2);
      expect(useTabStore.getState().activeTabId).toBe("s2");
    });

    it("persists tabs to localStorage", () => {
      useTabStore.getState().openTab("s1", "Session 1");

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "devpilot-open-tabs",
        expect.any(String),
      );
      const calls = localStorageMock.setItem.mock.calls;
      const lastCall = calls[calls.length - 1];
      const saved = JSON.parse(lastCall![1] as string);
      expect(saved.openTabs).toHaveLength(1);
      expect(saved.activeTabId).toBe("s1");
    });

    it("opens special tabs with correct type", () => {
      useTabStore.getState().openTab(SETTINGS_TAB_ID, "Settings", "settings");
      useTabStore.getState().openTab(GALLERY_TAB_ID, "Gallery", "gallery");

      const state = useTabStore.getState();
      expect(state.tabs[0]!.type).toBe("settings");
      expect(state.tabs[1]!.type).toBe("gallery");
    });
  });

  // ── closeTab ───────────────────────────────────────────────

  describe("closeTab", () => {
    it("closes an active tab and selects the previous one", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");
      useTabStore.getState().closeTab("s2");

      expect(useTabStore.getState().tabs).toHaveLength(1);
      expect(useTabStore.getState().activeTabId).toBe("s1");
    });

    it("closes a non-active tab without changing active", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");
      useTabStore.getState().closeTab("s1");

      expect(useTabStore.getState().tabs).toHaveLength(1);
      expect(useTabStore.getState().activeTabId).toBe("s2");
    });

    it("closes the only tab and sets active to null", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().closeTab("s1");

      expect(useTabStore.getState().tabs).toHaveLength(0);
      expect(useTabStore.getState().activeTabId).toBeNull();
    });

    it("selects next tab when closing first tab of three", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");
      useTabStore.getState().openTab("s3", "Session 3");
      // activate s1 then close it
      useTabStore.getState().setActiveTab("s1");
      useTabStore.getState().closeTab("s1");

      // Should select the tab now at index 0
      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(2);
      expect(state.activeTabId).toBe("s2");
    });

    it("no-ops when closing a nonexistent tab", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().closeTab("nonexistent");

      expect(useTabStore.getState().tabs).toHaveLength(1);
    });
  });

  // ── setActiveTab ───────────────────────────────────────────

  describe("setActiveTab", () => {
    it("sets the active tab", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");
      useTabStore.getState().setActiveTab("s1");

      expect(useTabStore.getState().activeTabId).toBe("s1");
    });
  });

  // ── updateTabTitle ─────────────────────────────────────────

  describe("updateTabTitle", () => {
    it("updates the title of a specific tab", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().updateTabTitle("s1", "Updated Title");

      expect(useTabStore.getState().tabs[0]!.title).toBe("Updated Title");
    });
  });

  // ── updateTabStatus ────────────────────────────────────────

  describe("updateTabStatus", () => {
    it("updates the status of a specific tab", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().updateTabStatus("s1", "running");

      expect(useTabStore.getState().tabs[0]!.status).toBe("running");
    });
  });

  // ── replaceTabSession ──────────────────────────────────────

  describe("replaceTabSession", () => {
    it("replaces the session ID of a tab", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().replaceTabSession("s1", "s_new");

      const state = useTabStore.getState();
      expect(state.tabs[0]!.sessionId).toBe("s_new");
    });

    it("updates activeTabId if it was the replaced tab", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().replaceTabSession("s1", "s_new");

      expect(useTabStore.getState().activeTabId).toBe("s_new");
    });

    it("does not change activeTabId if a different tab was replaced", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");
      useTabStore.getState().setActiveTab("s2");
      useTabStore.getState().replaceTabSession("s1", "s_new");

      expect(useTabStore.getState().activeTabId).toBe("s2");
    });
  });

  // ── moveTab ────────────────────────────────────────────────

  describe("moveTab", () => {
    it("swaps tab positions", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().openTab("s2", "Session 2");
      useTabStore.getState().openTab("s3", "Session 3");
      // [s1, s2, s3] → move tab at index 0 to index 2
      useTabStore.getState().moveTab(0, 2);

      const ids = useTabStore.getState().tabs.map((t) => t.sessionId);
      expect(ids).toEqual(["s2", "s3", "s1"]);
    });

    it("no-ops when from === to", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().moveTab(0, 0);

      expect(useTabStore.getState().tabs[0]!.sessionId).toBe("s1");
    });

    it("no-ops with out-of-bounds indices", () => {
      useTabStore.getState().openTab("s1", "Session 1");
      useTabStore.getState().moveTab(-1, 5);

      expect(useTabStore.getState().tabs).toHaveLength(1);
    });
  });

  // ── restoreTabs ────────────────────────────────────────────

  describe("restoreTabs", () => {
    it("restores tabs from localStorage", async () => {
      store["devpilot-open-tabs"] = JSON.stringify({
        openTabs: [
          { sessionId: "s1", title: "Session 1", type: "session" },
          { sessionId: "s2", title: "Session 2", type: "session" },
        ],
        activeTabId: "s2",
      });

      await useTabStore.getState().restoreTabs();

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(2);
      expect(state.activeTabId).toBe("s2");
    });

    it("filters out tabs for non-existent sessions", async () => {
      store["devpilot-open-tabs"] = JSON.stringify({
        openTabs: [
          { sessionId: "s1", title: "Session 1", type: "session" },
          { sessionId: "s999", title: "Deleted Session", type: "session" },
        ],
        activeTabId: "s1",
      });

      await useTabStore.getState().restoreTabs();

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(1);
      expect(state.tabs[0]!.sessionId).toBe("s1");
    });

    it("keeps special tabs even without matching session", async () => {
      store["devpilot-open-tabs"] = JSON.stringify({
        openTabs: [
          { sessionId: SETTINGS_TAB_ID, title: "Settings", type: "settings" },
          { sessionId: SKILLS_TAB_ID, title: "Skills", type: "skills" },
        ],
        activeTabId: SETTINGS_TAB_ID,
      });

      await useTabStore.getState().restoreTabs();

      const state = useTabStore.getState();
      expect(state.tabs).toHaveLength(2);
      expect(state.tabs[0]!.type).toBe("settings");
      expect(state.tabs[1]!.type).toBe("skills");
    });

    it("no-ops when localStorage is empty", async () => {
      await useTabStore.getState().restoreTabs();
      expect(useTabStore.getState().tabs).toHaveLength(0);
    });

    it("falls back to first valid tab when activeTabId is invalid", async () => {
      store["devpilot-open-tabs"] = JSON.stringify({
        openTabs: [
          { sessionId: "s1", title: "Session 1", type: "session" },
        ],
        activeTabId: "nonexistent",
      });

      await useTabStore.getState().restoreTabs();

      expect(useTabStore.getState().activeTabId).toBe("s1");
    });
  });

  // ── constants ──────────────────────────────────────────────

  describe("constants", () => {
    it("exports correct special tab IDs", () => {
      expect(SETTINGS_TAB_ID).toBe("__settings__");
      expect(SCHEDULED_TAB_ID).toBe("__scheduled__");
      expect(SKILLS_TAB_ID).toBe("__skills__");
      expect(GALLERY_TAB_ID).toBe("__gallery__");
      expect(BRIDGE_TAB_ID).toBe("__bridge__");
    });
  });
});
