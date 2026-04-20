import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "../CommandPalette";
import { QuickFileSearch } from "../QuickFileSearch";
import { ToastContainer } from "../ToastContainer";
import { UpdateChecker } from "../UpdateChecker";
import { useUIStore } from "../../stores/uiStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useShortcutStore } from "../../stores/shortcutStore";
import { useI18n } from "../../i18n";
import { useEffect, useCallback } from "react";
import { cn } from "../../lib/utils";

export function AppShell() {
  const { t } = useI18n();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const location = useLocation();

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Hydrate shortcut config from backend
  const hydrateShortcuts = useShortcutStore((s) => s.hydrateFromBackend);
  useEffect(() => {
    hydrateShortcuts();
  }, [hydrateShortcuts]);

  // Sync URL → store
  useEffect(() => {
    const view = location.pathname === "/settings" ? "settings" : "chat";
    setActiveView(view);
  }, [location.pathname, setActiveView]);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (window.innerWidth < 768) {setSidebarOpen(false);}
  }, [location.pathname, setSidebarOpen]);

  // Close sidebar when clicking backdrop
  const handleBackdropClick = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Skip to main content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-50 focus:p-2 focus:bg-primary focus:text-primary-foreground"
      >
        {t("a11y.skipToMain")}
      </a>

      {/* Sidebar: always rendered — collapsed icon strip when closed, full panel when open.
          Mobile: overlay drawer. Desktop: inline flex child. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          "shrink-0 z-40",
          // Mobile: fixed overlay
          sidebarOpen
            ? "fixed inset-y-0 left-0 md:relative md:inset-auto"
            : "relative",
        )}
      >
        <Sidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <UpdateChecker />
        <TopBar />
        <main id="main-content" className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <QuickFileSearch />
      <ToastContainer />
    </div>
  );
}
