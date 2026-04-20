import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ChatPanel } from "./components/chat/ChatPanel";
import { SettingsPage } from "./app/SettingsPage";
import { SchedulerPage } from "./app/SchedulerPage";
import { GalleryPage } from "./app/GalleryPage";
import { BridgePage } from "./app/BridgePage";
import { useUIStore, registerChatStoreAccessor } from "./stores/uiStore";
import { useChatStore } from "./stores/chatStore";
import type { ActiveView } from "./stores/uiStore";

// Register lazy accessor so uiStore can query session state without circular import
registerChatStoreAccessor(() => {
  const s = useChatStore.getState();
  return { sessions: s.sessions, activeSessionId: s.activeSessionId };
});

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
    "/bridge": "chat",
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
      <Route path="/bridge" element={<BridgePage />} />
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
