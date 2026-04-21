import { describe, it, expect, beforeEach } from "vitest";
import {
  useShortcutStore,
  SHORTCUT_DEFINITIONS,
  formatCombo,
  parseCombo,
  type ShortcutAction,
} from "../../stores/shortcutStore";

describe("shortcutStore", () => {
  beforeEach(() => {
    // Reset to defaults
    useShortcutStore.setState({ shortcuts: defaultsMap() });
  });

  function defaultsMap(): Record<ShortcutAction, string> {
    const map = {} as Record<ShortcutAction, string>;
    for (const def of SHORTCUT_DEFINITIONS) {
      map[def.action] = def.defaultCombo;
    }
    return map;
  }

  describe("initial state", () => {
    it("has all shortcut actions defined", () => {
      const shortcuts = useShortcutStore.getState().shortcuts;
      const actions = SHORTCUT_DEFINITIONS.map((d) => d.action);
      for (const action of actions) {
        expect(shortcuts[action]).toBeDefined();
      }
    });

    it("has correct default combos", () => {
      const shortcuts = useShortcutStore.getState().shortcuts;
      expect(shortcuts.newSession).toBe("ctrlOrCmd+n");
      expect(shortcuts.toggleSidebar).toBe("ctrlOrCmd+b");
      expect(shortcuts.commandPalette).toBe("ctrlOrCmd+k");
      expect(shortcuts.openSettings).toBe("ctrlOrCmd+,");
      expect(shortcuts.sendMessage).toBe("ctrlOrCmd+Enter");
      expect(shortcuts.escape).toBe("Escape");
      expect(shortcuts.toggleTerminal).toBe("ctrlOrCmd+j");
      expect(shortcuts.toggleFiles).toBe("ctrlOrCmd+e");
      expect(shortcuts.quickFileSearch).toBe("ctrlOrCmd+p");
      expect(shortcuts.messageSearch).toBe("ctrlOrCmd+shift+f");
      expect(shortcuts.toggleSplitView).toBe("ctrlOrCmd+`");
    });

    it("has 11 shortcut definitions", () => {
      expect(SHORTCUT_DEFINITIONS).toHaveLength(11);
    });
  });

  describe("updateShortcut", () => {
    it("updates a shortcut combo", () => {
      useShortcutStore.getState().updateShortcut("newSession", "ctrlOrCmd+shift+n");
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("ctrlOrCmd+shift+n");
    });

    it("only updates the specified shortcut", () => {
      useShortcutStore.getState().updateShortcut("newSession", "alt+n");
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("alt+n");
      expect(useShortcutStore.getState().shortcuts.toggleSidebar).toBe("ctrlOrCmd+b");
    });

    it("allows updating multiple shortcuts", () => {
      useShortcutStore.getState().updateShortcut("newSession", "alt+n");
      useShortcutStore.getState().updateShortcut("openSettings", "alt+s");
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("alt+n");
      expect(useShortcutStore.getState().shortcuts.openSettings).toBe("alt+s");
    });
  });

  describe("resetShortcut", () => {
    it("resets a shortcut to its default", () => {
      useShortcutStore.getState().updateShortcut("newSession", "alt+n");
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("alt+n");

      useShortcutStore.getState().resetShortcut("newSession");
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("ctrlOrCmd+n");
    });

    it("does nothing for an unknown action", () => {
      const before = { ...useShortcutStore.getState().shortcuts };
      // @ts-expect-error testing invalid action
      useShortcutStore.getState().resetShortcut("nonexistent");
      expect(useShortcutStore.getState().shortcuts).toEqual(before);
    });
  });

  describe("resetAllShortcuts", () => {
    it("resets all shortcuts to defaults", () => {
      useShortcutStore.getState().updateShortcut("newSession", "alt+n");
      useShortcutStore.getState().updateShortcut("toggleSidebar", "alt+b");
      useShortcutStore.getState().updateShortcut("commandPalette", "alt+k");

      useShortcutStore.getState().resetAllShortcuts();

      const shortcuts = useShortcutStore.getState().shortcuts;
      expect(shortcuts.newSession).toBe("ctrlOrCmd+n");
      expect(shortcuts.toggleSidebar).toBe("ctrlOrCmd+b");
      expect(shortcuts.commandPalette).toBe("ctrlOrCmd+k");
    });
  });

  describe("hydrateFromBackend", () => {
    it("hydrates without error (mock returns null)", async () => {
      await useShortcutStore.getState().hydrateFromBackend();
      // get_setting not in mock → default case returns null → no change
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("ctrlOrCmd+n");
    });
  });

  describe("persistToBackend", () => {
    it("persists without error (mock ignores set_setting)", async () => {
      await useShortcutStore.getState().persistToBackend();
      // No crash
      expect(useShortcutStore.getState().shortcuts.newSession).toBe("ctrlOrCmd+n");
    });
  });

  describe("formatCombo", () => {
    it("formats ctrlOrCmd+n on Mac", () => {
      expect(formatCombo("ctrlOrCmd+n", true)).toBe("⌘+N");
    });

    it("formats ctrlOrCmd+n on non-Mac", () => {
      expect(formatCombo("ctrlOrCmd+n", false)).toBe("Ctrl+N");
    });

    it("formats ctrlOrCmd+shift+f on Mac", () => {
      expect(formatCombo("ctrlOrCmd+shift+f", true)).toBe("⌘+⇧+F");
    });

    it("formats ctrlOrCmd+shift+f on non-Mac", () => {
      expect(formatCombo("ctrlOrCmd+shift+f", false)).toBe("Ctrl+⇧+F");
    });

    it("formats Escape", () => {
      expect(formatCombo("Escape", true)).toBe("Esc");
      expect(formatCombo("Escape", false)).toBe("Esc");
    });

    it("formats ctrlOrCmd+Enter", () => {
      expect(formatCombo("ctrlOrCmd+Enter", true)).toBe("⌘+Enter");
    });

    it("formats ctrlOrCmd+` (backtick)", () => {
      expect(formatCombo("ctrlOrCmd+`", true)).toBe("⌘+`");
    });

    it("formats ctrlOrCmd+, (comma)", () => {
      expect(formatCombo("ctrlOrCmd+,", true)).toBe("⌘+,");
    });

    it("formats simple letter without modifier", () => {
      expect(formatCombo("a", true)).toBe("A");
      expect(formatCombo("a", false)).toBe("A");
    });
  });

  describe("parseCombo", () => {
    it("parses ctrlOrCmd+n", () => {
      const combo = parseCombo("ctrlOrCmd+n");
      expect(combo.ctrlOrCmd).toBe(true);
      expect(combo.shift).toBe(false);
      expect(combo.alt).toBe(false);
      expect(combo.key).toBe("n");
    });

    it("parses ctrlOrCmd+shift+f", () => {
      const combo = parseCombo("ctrlOrCmd+shift+f");
      expect(combo.ctrlOrCmd).toBe(true);
      expect(combo.shift).toBe(true);
      expect(combo.alt).toBe(false);
      expect(combo.key).toBe("f");
    });

    it("parses Escape (no modifiers)", () => {
      const combo = parseCombo("Escape");
      expect(combo.ctrlOrCmd).toBe(false);
      expect(combo.shift).toBe(false);
      expect(combo.alt).toBe(false);
      expect(combo.key).toBe("escape");
    });

    it("parses alt+shift+p", () => {
      const combo = parseCombo("alt+shift+p");
      expect(combo.ctrlOrCmd).toBe(false);
      expect(combo.shift).toBe(true);
      expect(combo.alt).toBe(true);
      expect(combo.key).toBe("p");
    });
  });

  describe("SHORTCUT_DEFINITIONS", () => {
    it("all definitions have required fields", () => {
      for (const def of SHORTCUT_DEFINITIONS) {
        expect(def.action).toBeTruthy();
        expect(def.defaultCombo).toBeTruthy();
        expect(def.labelKey).toBeTruthy();
        expect(typeof def.worksInInput).toBe("boolean");
      }
    });

    it("sendMessage works in input", () => {
      const sendMsg = SHORTCUT_DEFINITIONS.find((d) => d.action === "sendMessage");
      expect(sendMsg?.worksInInput).toBe(true);
    });

    it("escape works in input", () => {
      const esc = SHORTCUT_DEFINITIONS.find((d) => d.action === "escape");
      expect(esc?.worksInInput).toBe(true);
    });

    it("most shortcuts do not work in input", () => {
      const notInInput = SHORTCUT_DEFINITIONS.filter((d) => !d.worksInInput);
      expect(notInInput.length).toBeGreaterThan(5);
    });
  });
});
