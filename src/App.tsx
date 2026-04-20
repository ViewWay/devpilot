import { registerChatStoreAccessor } from "./stores/uiStore";
import { useChatStore } from "./stores/chatStore";
import { AppShell } from "./components/layout/AppShell";

// Register lazy accessor so uiStore can query session state without circular import
registerChatStoreAccessor(() => {
  const s = useChatStore.getState();
  return { sessions: s.sessions, activeSessionId: s.activeSessionId };
});

function App() {
  return <AppShell />;
}

export default App;
