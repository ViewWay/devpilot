/**
 * ErrorBoundary — catches rendering errors in child components and displays
 * a recoverable error screen instead of a blank white page.
 *
 * Wrap the entire App so any unhandled rendering crash is caught.
 */
import { Component, type ReactNode } from "react";
import { useI18n } from "../i18n";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Unhandled rendering error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
  };

  handleRestart = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReload={this.handleReload} onRestart={this.handleRestart} />;
    }
    return this.props.children;
  }
}

function ErrorFallback({ error, onReload, onRestart }: { error: Error | null; onReload: () => void; onRestart: () => void }) {
  const { t } = useI18n();

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--color-surface)] px-6">
      <div className="max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-container-low)] p-6 shadow-lg">
        <div className="flex items-center gap-3 mb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-error)]/10 text-[var(--color-error)] text-lg">
            !
          </span>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {t("errorGeneric")}
          </h1>
        </div>
        {error && (
          <pre className="mb-4 max-h-40 overflow-auto rounded-lg bg-[var(--color-surface-container-high)] p-3 text-xs text-[var(--color-text-secondary)] font-mono whitespace-pre-wrap">
            {error.message}
          </pre>
        )}
        <div className="flex gap-3">
          <button
            onClick={onReload}
            className="rounded-lg bg-[var(--color-brand)] text-white px-4 py-2 text-sm font-medium transition-colors hover:opacity-90"
          >
            {t("retry")}
          </button>
          <button
            onClick={onRestart}
            className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-hover)]"
          >
            {t("restartApp")}
          </button>
        </div>
      </div>
    </div>
  );
}
