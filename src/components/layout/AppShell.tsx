import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandPalette } from "../CommandPalette";
import { useUIStore } from "../../stores/uiStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useEffect } from "react";

export function AppShell() {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const location = useLocation();

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Sync URL → store
  useEffect(() => {
    const view = location.pathname === "/settings" ? "settings" : "chat";
    setActiveView(view);
  }, [location.pathname, setActiveView]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
