/**
 * SessionExportDialog — Modal dialog for exporting chat sessions.
 *
 * Features:
 *  - Format selection: Markdown, JSON, HTML
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

type ExportFormat = "markdown" | "json" | "html";

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

const FORMATS: Array<{ value: ExportFormat; label: string; ext: string }> = [
  { value: "markdown", label: "Markdown", ext: ".md" },
  { value: "json", label: "JSON", ext: ".json" },
  { value: "html", label: "HTML", ext: ".html" },
];

// ── Component ──────────────────────────────────────────────

export function SessionExportDialog({ sessionId, onClose }: SessionExportDialogProps) {
  const { t: _t } = useI18n();
  void _t;
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

  // Generate export content
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
          <span className="text-sm font-semibold">Export Session</span>
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
            <label className="text-xs font-medium mb-1.5 block">Format</label>
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
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div>
            <label className="text-xs font-medium mb-1.5 block">Options</label>
            <div className="space-y-1.5">
              {([
                { key: "includeMetadata" as const, label: "Include metadata" },
                { key: "includeToolCalls" as const, label: "Include tool calls" },
                { key: "includeThinkingBlocks" as const, label: "Include thinking blocks" },
              ]).map(({ key, label }) => (
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
                  {label}
                </label>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview !== null && (
            <div>
              <label className="text-xs font-medium mb-1.5 block">Preview</label>
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
            Preview
          </button>

          <div className="flex-1" />

          <button
            onClick={handleCopy}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-accent/50 disabled:opacity-50 transition-colors"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Copy size={12} />
            {copied ? "Copied!" : "Copy"}
          </button>

          <button
            onClick={handleDownload}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 transition-colors"
            style={{ background: "var(--color-brand)" }}
          >
            <Download size={12} />
            Download
          </button>
        </div>
      </div>
    </div>
  );
}
