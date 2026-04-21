import { useEffect, useCallback, type ReactNode } from "react";
import { useSettingsStore, type Theme } from "../stores/settingsStore";

/**
 * Resolves "system" theme to actual "dark" or "light" based on OS preference.
 */
export function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

/**
 * Applies the resolved theme class to <html>. Called by ThemeProvider.
 */
function applyThemeClass(resolved: "dark" | "light") {
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * ThemeProvider — bridges uiStore theme state to the DOM.
 * Wraps the app in main.tsx. Listens to system preference changes when theme is "system".
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // Apply theme class whenever theme changes
  useEffect(() => {
    const resolved = resolveTheme(theme);
    applyThemeClass(resolved);
    localStorage.setItem("devpilot-theme", theme);
  }, [theme]);

  // When theme is "system", listen for OS preference changes
  useEffect(() => {
    if (theme !== "system") {return;}

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      applyThemeClass(mq.matches ? "dark" : "light");
    };

    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("devpilot-theme") as Theme | null;
    if (saved === "dark" || saved === "light" || saved === "system") {
      setTheme(saved);
    }
  }, [setTheme]);

  return <>{children}</>;
}

/**
 * Hook to cycle theme: dark -> light -> system -> dark ...
 */
export function useThemeCycle() {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const cycleTheme = useCallback(() => {
    const order: Theme[] = ["dark", "light", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length]!;
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, cycleTheme };
}
