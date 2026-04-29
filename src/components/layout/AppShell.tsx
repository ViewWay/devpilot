import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "./Sidebar";
import { ContentRouter } from "./ContentRouter";
import { ToastContainer } from "../ToastContainer";
import { UpdateChecker } from "../UpdateChecker";
import { CommandPalette } from "../CommandPalette";
import { QuickFileSearch } from "../QuickFileSearch";
import { MessageSearchDialog } from "../MessageSearchDialog";
import { OnboardingWizard } from "../OnboardingWizard";
import { useUIStore } from "../../stores/uiStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useShortcutStore } from "../../stores/shortcutStore";
import { useI18n } from "../../i18n";
import { TabBar } from "./TabBar";
import { useTabStore } from "../../stores/tabStore";
import { useChatStore } from "../../stores/chatStore";
import {
  useOnboardingStore,
  checkOnboardingStatus,
} from "../../stores/onboardingStore";

export function AppShell() {
  const { t } = useI18n();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const onboardingCompleted = useOnboardingStore((s) => s.completed);
  const [ready, setReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  // Global keyboard shortcuts
  useKeyboardShortcuts();

  // Hydrate shortcut config from backend
  const hydrateShortcuts = useShortcutStore((s) => s.hydrateFromBackend);
  useEffect(() => {
    hydrateShortcuts();
  }, [hydrateShortcuts]);

  // Bootstrap: restore tabs, check onboarding, activate session
  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Check if onboarding has been completed
        await checkOnboardingStatus();

        // Hydrate providers, sessions, and workingDir from backend (SQLite)
        // This replaces per-session lazy hydration so configs survive restart
        await useChatStore.getState().hydrateFromBackend();

        // Restore tabs from localStorage
        await useTabStore.getState().restoreTabs();
        const activeId = useTabStore.getState().activeTabId;
        if (activeId) {
          useChatStore.getState().setActiveSession(activeId);
        }
        if (!cancelled) {
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          setStartupError(error instanceof Error ? error.message : String(error));
          setReady(false);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [setSidebarOpen]);

  // Close sidebar when clicking backdrop
  const handleBackdropClick = useCallback(() => setSidebarOpen(false), [setSidebarOpen]);

  if (startupError) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-surface)] px-6">
        <div className="max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-6">
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t("errorGeneric")}
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{startupError}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-text-secondary)]">
        {t("loading")}
      </div>
    );
  }

  // Show onboarding wizard for first-time users
  if (!onboardingCompleted) {
    return <OnboardingWizard />;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-[var(--color-surface)]">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-[2px] md:hidden"
          onClick={handleBackdropClick}
          aria-hidden="true"
        />
      )}

      {/* Sidebar shell — uses cc-haha's sidebar-shell / sidebar-panel CSS classes */}
      <div
        data-testid="sidebar-shell"
        data-state={sidebarOpen ? "open" : "closed"}
        className="sidebar-shell"
      >
        <Sidebar />
      </div>

      {/* Main content area */}
      <main
        id="main-content"
        data-sidebar-state={sidebarOpen ? "open" : "closed"}
        className="min-w-0 flex-1 flex flex-col overflow-hidden"
      >
        <TabBar />
        <ContentRouter />
      </main>

      <CommandPalette />
      <QuickFileSearch />
      <MessageSearchDialog />
      <ToastContainer />
      <UpdateChecker />
    </div>
  );
}
