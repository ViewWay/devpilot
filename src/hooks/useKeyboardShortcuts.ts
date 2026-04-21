import { useEffect, useCallback, useMemo } from "react";
import { useUIStore } from "../stores/uiStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useChatStore } from "../stores/chatStore";
import { useShortcutStore, parseCombo, SHORTCUT_DEFINITIONS, type ShortcutAction } from "../stores/shortcutStore";
import { useTabStore, SETTINGS_TAB_ID } from "../stores/tabStore";
import { toast } from "../stores/toastStore";

type ShortcutHandler = () => void;

/**
 * Global keyboard shortcuts hook.
 * Reads current bindings from shortcutStore and attaches listeners.
 * Cleans up on unmount.
 */
export function useKeyboardShortcuts() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const toggleSplitView = useUIStore((s) => s.toggleSplitView);
  const createSession = useChatStore((s) => s.createSession);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const selectedModel = useSettingsStore((s) => s.selectedModel);
  const toggleQuickFileSearch = useUIStore((s) => s.toggleQuickFileSearch);
  const toggleMessageSearch = useUIStore((s) => s.toggleMessageSearch);
  const shortcuts = useShortcutStore((s) => s.shortcuts);
  const openTab = useTabStore((s) => s.openTab);

  const handleNewChat = useCallback(() => {
    createSession(selectedModel.id, selectedModel.provider);
  }, [createSession, selectedModel]);

  const handleOpenSettings = useCallback(() => {
    openTab(SETTINGS_TAB_ID, "Settings", "settings");
  }, [openTab]);

  const handleCommandPalette = useCallback(() => {
    if (commandPaletteOpen) {
      setCommandPaletteOpen(false);
    } else {
      setCommandPaletteOpen(true);
      toast.info("Command palette opened");
    }
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const handleSendMessage = useCallback(() => {
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-testid="chat-input"]',
    );
    if (input) {
      input.focus();
      input.dispatchEvent(new CustomEvent("shortcut-send"));
    }
  }, []);

  const handleEscape = useCallback(() => {
    setCommandPaletteOpen(false);
    if (rightPanel !== "none") {
      toggleRightPanel(rightPanel);
    }
    const target = document.activeElement as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
      target.blur();
    }
  }, [rightPanel, toggleRightPanel, setCommandPaletteOpen]);

  // Memoize the action handlers map so it has a stable reference
  const actionHandlers: Record<ShortcutAction, ShortcutHandler> = useMemo(() => ({
    newSession: handleNewChat,
    toggleSidebar: toggleSidebar,
    toggleSplitView: () => toggleSplitView(),
    commandPalette: handleCommandPalette,
    openSettings: handleOpenSettings,
    sendMessage: handleSendMessage,
    escape: handleEscape,
    toggleTerminal: () => toggleRightPanel("terminal"),
    toggleFiles: () => toggleRightPanel("files"),
    quickFileSearch: toggleQuickFileSearch,
    messageSearch: toggleMessageSearch,
  }), [handleNewChat, toggleSidebar, toggleSplitView, handleCommandPalette,
    handleOpenSettings, handleSendMessage, handleEscape, toggleRightPanel,
    toggleQuickFileSearch, toggleMessageSearch]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      const isMac = navigator.platform.toUpperCase().startsWith("MAC");
      const ctrlOrMeta = isMac ? e.metaKey : e.ctrlKey;

      for (const def of SHORTCUT_DEFINITIONS) {
        // Skip input-excluded shortcuts when typing
        if (!def.worksInInput && e.key !== "Escape" && isInput) {
          continue;
        }

        const comboStr = shortcuts[def.action];
        const combo = parseCombo(comboStr);

        if (
          e.key.toLowerCase() === combo.key.toLowerCase() &&
          (combo.ctrlOrCmd ? ctrlOrMeta : !ctrlOrMeta) &&
          (combo.shift ? e.shiftKey : !e.shiftKey) &&
          (combo.alt ? e.altKey : !e.altKey)
        ) {
          e.preventDefault();
          e.stopPropagation();
          actionHandlers[def.action]?.();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts, actionHandlers]);
}
