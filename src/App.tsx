import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ChatPanel } from "./components/chat/ChatPanel";
import { SettingsPage } from "./app/SettingsPage";
import { useUIStore } from "./stores/uiStore";

function AppRoutes() {
  const activeView = useUIStore((s) => s.activeView);

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route
          path="/"
          element={
            activeView === "settings" ? (
              <Navigate to="/settings" replace />
            ) : (
              <ChatPanel />
            )
          }
        />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
