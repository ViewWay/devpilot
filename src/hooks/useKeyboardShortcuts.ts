import { useEffect, useCallback } from "react";
import { useUIStore } from "../stores/uiStore";
import { useChatStore } from "../stores/chatStore";

type ShortcutAction = () => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  meta?: boolean;
  description: string;
  action: ShortcutAction;
}

/**
 * Global keyboard shortcuts hook.
 * Attaches listeners on mount, cleans up on unmount.
 *
 * Default bindings (Mac-aware):
 *   Ctrl/Cmd + K   → Focus chat input
 *   Ctrl/Cmd + N   → New chat session
 *   Ctrl/Cmd + B   → Toggle sidebar
 *   Ctrl/Cmd + J   → Toggle terminal panel
 *   Ctrl/Cmd + E   → Toggle files panel
 *   Ctrl/Cmd + .   → Toggle right panel (last used)
 *   Ctrl/Cmd + Shift + P → (reserved for command palette)
 *   Escape         → Close right panel / clear input
 */
export function useKeyboardShortcuts() {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const rightPanel = useUIStore((s) => s.rightPanel);
  const createSession = useChatStore((s) => s.createSession);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const focusChatInput = useCallback(() => {
    const input = document.querySelector<HTMLTextAreaElement>(
      'textarea[data-testid="chat-input"]',
    );
    if (input) {
      input.focus();
      input.select();
    }
  }, []);

  const selectedModel = useUIStore((s) => s.selectedModel);

  const handleNewChat = useCallback(() => {
    createSession(selectedModel.id, selectedModel.provider);
  }, [createSession, selectedModel]);

  useEffect(() => {
    const shortcuts: Shortcut[] = [
      { key: "k", ctrl: true, description: "Command palette", action: toggleCommandPalette },
      { key: "k", ctrl: true, shift: true, description: "Focus chat input", action: focusChatInput },
      { key: "n", ctrl: true, description: "New chat", action: handleNewChat },
      { key: "b", ctrl: true, description: "Toggle sidebar", action: toggleSidebar },
      { key: "j", ctrl: true, description: "Toggle terminal", action: () => toggleRightPanel("terminal") },
      { key: "e", ctrl: true, description: "Toggle files", action: () => toggleRightPanel("files") },
      { key: ".", ctrl: true, description: "Toggle panel", action: () => toggleRightPanel(rightPanel === "none" ? "files" : "none") },
    ];

    const handler = (e: KeyboardEvent) => {
      // Skip when user is typing in an input/textarea (except for Escape)
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (e.key !== "Escape" && isInput) {return;}

      const isMac = navigator.platform.startsWith("Mac");
      const ctrlOrMeta = isMac ? e.metaKey : e.ctrlKey;

      for (const sc of shortcuts) {
        if (
          e.key.toLowerCase() === sc.key &&
          (sc.ctrl ? ctrlOrMeta : !ctrlOrMeta) &&
          (sc.shift ? e.shiftKey : !e.shiftKey) &&
          (sc.meta ? e.metaKey : true)
        ) {
          e.preventDefault();
          sc.action();
          return;
        }
      }

      // Escape handler
      if (e.key === "Escape") {
        setCommandPaletteOpen(false);
        if (rightPanel !== "none") {
          toggleRightPanel(rightPanel);
        }
        if (isInput) {
          target.blur();
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusChatInput, handleNewChat, toggleSidebar, toggleRightPanel, rightPanel, toggleCommandPalette, setCommandPaletteOpen]);
}
