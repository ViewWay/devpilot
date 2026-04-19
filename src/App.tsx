import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ChatPanel } from "./components/chat/ChatPanel";
import { SettingsPage } from "./app/SettingsPage";
import { SchedulerPage } from "./app/SchedulerPage";
import { GalleryPage } from "./app/GalleryPage";
import { useUIStore } from "./stores/uiStore";
import type { ActiveView } from "./stores/uiStore";

/** Sync activeView with URL and handle navigation. */
function RouteSync() {
  const location = useLocation();
  const setActiveView = useUIStore((s) => s.setActiveView);

  // Sync URL → store on location change
  const pathToView: Record<string, ActiveView> = {
    "/": "chat",
    "/settings": "settings",
    "/scheduler": "scheduler",
    "/gallery": "gallery",
  };
  const view = pathToView[location.pathname] ?? "chat";
  setActiveView(view);

  return null;
}

function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<ChatPanel />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/scheduler" element={<SchedulerPage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <RouteSync />
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
