import { create } from "zustand";
import { invoke } from "../lib/ipc";

/** Represents a parsed keyboard shortcut combo. */
export interface KeyCombo {
  key: string;          // e.g. "n", "b", "Enter", "Escape", "`"
  ctrlOrCmd: boolean;   // Ctrl on Win/Linux, Cmd on Mac
  shift: boolean;
  alt: boolean;
}

/** Serializable key combo string, e.g. "ctrlOrCmd+shift+n", "Escape" */
export type KeyComboString = string;

/** Well-known shortcut action identifiers. */
export type ShortcutAction =
  | "newSession"
  | "toggleSidebar"
  | "toggleSplitView"
  | "commandPalette"
  | "openSettings"
  | "sendMessage"
  | "escape"
  | "toggleTerminal"
  | "toggleFiles"
  | "quickFileSearch"
  | "messageSearch";

/** Metadata for each shortcut action. */
export interface ShortcutDefinition {
  action: ShortcutAction;
  defaultCombo: KeyComboString;
  /** i18n key for the action label */
  labelKey: string;
  /** Whether this shortcut fires inside text inputs (e.g. sendMessage) */
  worksInInput: boolean;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { action: "newSession",      defaultCombo: "ctrlOrCmd+n",           labelKey: "scNewChat",           worksInInput: false },
  { action: "toggleSidebar",   defaultCombo: "ctrlOrCmd+b",           labelKey: "scToggleSidebar",     worksInInput: false },
  { action: "toggleSplitView", defaultCombo: "ctrlOrCmd+`",           labelKey: "scToggleSplitView",   worksInInput: false },
  { action: "commandPalette",  defaultCombo: "ctrlOrCmd+k",           labelKey: "scSearch",            worksInInput: false },
  { action: "openSettings",    defaultCombo: "ctrlOrCmd+,",           labelKey: "scOpenSettings",      worksInInput: false },
  { action: "sendMessage",     defaultCombo: "ctrlOrCmd+Enter",       labelKey: "scSendMessage",       worksInInput: true },
  { action: "escape",          defaultCombo: "Escape",                labelKey: "scStopGeneration",    worksInInput: true },
  { action: "toggleTerminal",  defaultCombo: "ctrlOrCmd+j",           labelKey: "scToggleTerminal",    worksInInput: false },
  { action: "toggleFiles",     defaultCombo: "ctrlOrCmd+e",           labelKey: "scToggleFiles",       worksInInput: false },
  { action: "quickFileSearch", defaultCombo: "ctrlOrCmd+p",           labelKey: "scQuickFileSearch",   worksInInput: false },
  { action: "messageSearch",   defaultCombo: "ctrlOrCmd+shift+f",    labelKey: "scMessageSearch",     worksInInput: false },
];

const SETTING_KEY = "keyboardShortcuts";

interface ShortcutState {
  /** Map from action → current key combo string */
  shortcuts: Record<ShortcutAction, KeyComboString>;

  // Actions
  updateShortcut: (action: ShortcutAction, combo: KeyComboString) => void;
  resetShortcut: (action: ShortcutAction) => void;
  resetAllShortcuts: () => void;
  hydrateFromBackend: () => Promise<void>;
  persistToBackend: () => Promise<void>;
}

function defaultsMap(): Record<ShortcutAction, KeyComboString> {
  const map = {} as Record<ShortcutAction, KeyComboString>;
  for (const def of SHORTCUT_DEFINITIONS) {
    map[def.action] = def.defaultCombo;
  }
  return map;
}

function parseCombo(str: KeyComboString): KeyCombo {
  const parts = str.split("+").map((p) => p.trim().toLowerCase());
  return {
    alt: parts.includes("alt"),
    shift: parts.includes("shift"),
    ctrlOrCmd: parts.includes("ctrlorcmd"),
    key: parts.filter((p) => !["alt", "shift", "ctrlorcmd"].includes(p))[0] ?? "",
  };
}

/** Parse a combo string into a human-readable label. */
export function formatCombo(str: KeyComboString, isMac: boolean): string {
  const combo = parseCombo(str);
  const mod = isMac ? "⌘" : "Ctrl";
  const parts: string[] = [];
  if (combo.ctrlOrCmd) { parts.push(mod); }
  if (combo.shift) { parts.push("⇧"); }
  if (combo.alt) { parts.push(isMac ? "⌥" : "Alt"); }

  // Pretty key names
  const keyMap: Record<string, string> = {
    enter: "Enter",
    escape: "Esc",
    "`": "`",
    ",": ",",
    ".": ".",
  };
  const k = combo.key;
  parts.push(keyMap[k] ?? k.toUpperCase());
  return parts.join("+");
}

export { parseCombo };

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: defaultsMap(),

  updateShortcut: (action, combo) => {
    set((s) => ({
      shortcuts: { ...s.shortcuts, [action]: combo },
    }));
    get().persistToBackend();
  },

  resetShortcut: (action) => {
    const def = SHORTCUT_DEFINITIONS.find((d) => d.action === action);
    if (!def) { return; }
    set((s) => ({
      shortcuts: { ...s.shortcuts, [action]: def.defaultCombo },
    }));
    get().persistToBackend();
  },

  resetAllShortcuts: () => {
    set({ shortcuts: defaultsMap() });
    get().persistToBackend();
  },

  hydrateFromBackend: async () => {
    try {
      const result = await invoke<{ key: string; value: string } | null>(
        "get_setting",
        { key: SETTING_KEY },
      );
      if (result?.value) {
        const parsed = JSON.parse(result.value) as Partial<Record<ShortcutAction, KeyComboString>>;
        set((s) => ({
          shortcuts: { ...s.shortcuts, ...parsed },
        }));
      }
    } catch {
      // Not available in browser dev mode — use defaults
    }
  },

  persistToBackend: async () => {
    try {
      const value = JSON.stringify(get().shortcuts);
      await invoke("set_setting", { key: SETTING_KEY, value });
    } catch {
      // Silently ignore in browser dev mode
    }
  },
}));
