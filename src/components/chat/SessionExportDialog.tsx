/**
 * SessionExportDialog — Modal dialog for exporting chat sessions.
 *
 * Features:
 *  - Format selection: Markdown, JSON, HTML, Plain Text
 *  - Toggle options: include metadata, tool calls, thinking blocks
 *  - Preview button
 *  - Copy to clipboard / Download as file
 */

import { useState, useCallback } from "react";
import { Download, Copy, Eye, X } from "lucide-react";
import { invoke } from "../../lib/ipc";
import { cn } from "../../lib/utils";
import { useI18n } from "../../i18n";

// ── Types ──────────────────────────────────────────────────

type ExportFormat = "markdown" | "json" | "html" | "txt";

interface ExportOptions {
  includeMetadata: boolean;
  includeToolCalls: boolean;
  includeThinkingBlocks: boolean;
}

interface SessionExportDialogProps {
  sessionId: string;
  onClose: () => void;
}

// ── Format config ──────────────────────────────────────────

const FORMATS: Array<{ value: ExportFormat; labelKey: string; ext: string }> = [
  { value: "markdown", labelKey: "exportMarkdown", ext: ".md" },
  { value: "json", labelKey: "exportJson", ext: ".json" },
  { value: "html", labelKey: "exportHtml", ext: ".html" },
  { value: "txt", labelKey: "exportTxt", ext: ".txt" },
];

// ── Component ──────────────────────────────────────────────

export function SessionExportDialog({ sessionId, onClose }: SessionExportDialogProps) {
  const { t } = useI18n();
  const [format, setFormat] = useState<ExportFormat>("markdown");
  const [options, setOptions] = useState<ExportOptions>({
    includeMetadata: true,
    includeToolCalls: true,
    includeThinkingBlocks: false,
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Toggle an option
  const toggleOption = useCallback((key: keyof ExportOptions) => {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Generate export content via backend IPC
  const generateContent = useCallback(async (): Promise<string> => {
    const result = await invoke<string>("session_export", {
      sessionId,
      format,
      includeMetadata: options.includeMetadata,
      includeToolCalls: options.includeToolCalls,
      includeThinking: options.includeThinkingBlocks,
    });
    return result ?? "";
  }, [sessionId, format, options]);

  // Preview
  const handlePreview = useCallback(async () => {
    try {
      setLoading(true);
      const content = await generateContent();
      setPreview(content);
    } catch (err) {
      setPreview(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, [generateContent]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    try {
      const content = preview ?? (await generateContent());
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [preview, generateContent]);

  // Download as file
  const handleDownload = useCallback(async () => {
    try {
      setLoading(true);
      const content = preview ?? (await generateContent());
      const fmt = FORMATS.find((f) => f.value === format)!;
      const mimeTypes: Record<ExportFormat, string> = {
        markdown: "text/markdown;charset=utf-8",
        json: "application/json;charset=utf-8",
        html: "text/html;charset=utf-8",
        txt: "text/plain;charset=utf-8",
      };
      const blob = new Blob([content], { type: mimeTypes[format] });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${sessionId.slice(0, 8)}${fmt.ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download:", err);
    } finally {
      setLoading(false);
    }
  }, [preview, generateContent, format, sessionId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {onClose();}
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-xl"
        style={{
          background: "var(--color-surface)",
          color: "var(--color-text-primary)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="text-sm font-semibold">{t("exportSession")}</span>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-accent/50 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-4">
          {/* Format selection */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("exportFormat")}</label>
            <div className="flex gap-1.5">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.value}
                  onClick={() => {
                    setFormat(fmt.value);
                    setPreview(null);
                  }}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                    format === fmt.value
                      ? "text-white"
                      : "hover:bg-accent/50",
                  )}
                  style={{
                    background: format === fmt.value ? "var(--color-brand)" : "transparent",
                    borderColor: "var(--color-border)",
                  }}
                >
                  {t(fmt.labelKey)}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("exportOptions")}</label>
            <div className="space-y-1.5">
              {([
                { key: "includeMetadata" as const, labelKey: "exportIncludeMeta" },
                { key: "includeToolCalls" as const, labelKey: "exportIncludeTools" },
                { key: "includeThinkingBlocks" as const, labelKey: "exportIncludeThinking" },
              ]).map(({ key, labelKey }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 cursor-pointer text-xs"
                >
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={() => toggleOption(key)}
                    className="rounded"
                  />
                  {t(labelKey)}
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview !== null && (
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("exportPreview")}</label>
              <div
                className="rounded-md border p-2 max-h-48 overflow-y-auto text-xs font-mono whitespace-pre-wrap"
                style={{
                  borderColor: "var(--color-border)",
                  background: "var(--color-surface)",
                  opacity: 0.85,
                }}
              >
                {preview.length > 2000
                  ? preview.slice(0, 2000) + "\n... (truncated)"
                  : preview}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          className="flex items-center gap-2 px-4 py-3 border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <button
            onClick={handlePreview}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent/50 disabled:opacity-50 transition-colors"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Eye size={12} />
            {t("exportPreviewBtn")}
          </button>

          <div className="flex-1" />

          <button
            onClick={handleCopy}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent/50 disabled:opacity-50 transition-colors"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Copy size={12} />
            {copied ? t("exportCopied") : t("exportCopy")}
          </button>

          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            style={{ background: "var(--color-brand)" }}
          >
            <Download size={12} />
            {t("exportDownload")}
          </button>
        </div>
      </div>
    </div>
  );
}
