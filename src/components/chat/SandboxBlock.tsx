import { useState, useCallback } from "react";
import { Copy, Check, RefreshCw, Layout } from "lucide-react";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";
import { toast } from "../../stores/toastStore";
import { SandboxRenderer } from "./SandboxRenderer";

interface SandboxBlockProps {
  /** HTML content to render inside the sandbox. */
  code: string;
  /** Optional title for the sandbox block header. */
  title?: string;
  /** Additional class names. */
  className?: string;
}

export function SandboxBlock({ code, title, className }: SandboxBlockProps) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(t("copied"));
    setTimeout(() => setCopied(false), 2000);
  }, [code, t]);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className={cn("my-3 overflow-hidden rounded-lg border border-border", className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Layout size={12} className="text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {title ?? t("sandboxGeneratedUI")}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title={t("refresh")}
          >
            <RefreshCw size={11} />
            {t("refresh")}
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title={t("copy")}
          >
            {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
            {copied ? t("copied") : t("sandboxCopyCode")}
          </button>
        </div>
      </div>

      {/* Sandbox iframe renderer — keyed by refreshKey to force re-render */}
      <SandboxRenderer
        key={refreshKey}
        code={code}
        defaultHeight={300}
      />
    </div>
  );
}
