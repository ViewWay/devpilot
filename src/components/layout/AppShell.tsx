import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "../CommandPalette";
import { ToastContainer } from "../ToastContainer";
import { useUIStore } from "../../stores/uiStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useEffect, useCallback } from "react";

export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const location = useLocation();

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Sync URL → store
  useEffect(() => {
    const view = location.pathname === "/settings" ? "settings" : "chat";
    setActiveView(view);
  }, [location.pathname, setActiveView]);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [location.pathname, setSidebarOpen]);

  // Close sidebar when clicking backdrop
  const handleBackdropClick = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: drawer on mobile, inline on desktop */}
      {sidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-40 md:relative md:inset-auto md:z-auto">
          <Sidebar />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
      <ToastContainer />
    </div>
  );
}
