import { X, FileText, Image, GitBranch, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────

export interface PendingFile {
  id: string;
  file: File;
  fileId?: string;
  fileName: string;
  fileType?: "image" | "document" | "text";
  mimeType: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  previewUrl?: string;
  lineCount?: number;
}

export interface FileUploadPreviewProps {
  files: PendingFile[];
  onRemove: (id: string) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) {
    return "?";
  }
  return fileName.slice(dot + 1).toUpperCase();
}

function isGithubFile(file: PendingFile): boolean {
  return (
    file.fileName.startsWith("github:") ||
    file.fileName.includes("github.com") ||
    file.mimeType === "text/github"
  );
}

// ─── Sub-components ────────────────────────────────────────────────────

function StatusIcon({ status }: { status: PendingFile["status"] }) {
  switch (status) {
    case "uploading":
      return <Loader2 size={12} className="animate-spin text-[var(--color-brand)]" />;
    case "done":
      return <CheckCircle2 size={12} className="text-[var(--color-success)]" />;
    case "error":
      return <AlertCircle size={12} className="text-[var(--color-error)]" />;
  }
}

function ProgressBar({ progress, status }: { progress: number; status: PendingFile["status"] }) {
  const clamped = Math.min(100, Math.max(0, progress));

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface-container)]">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300 ease-out",
          status === "error"
            ? "bg-[var(--color-error)]"
            : status === "done"
              ? "bg-[var(--color-success)]"
              : "bg-[var(--color-brand)]",
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function ImagePreviewCard({
  file,
  onRemove,
}: {
  file: PendingFile;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="group/card relative flex w-28 shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      {/* Remove button */}
      <button
        onClick={() => onRemove(file.id)}
        className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/40 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/card:opacity-100 hover:bg-black/60"
        aria-label={`Remove ${file.fileName}`}
      >
        <X size={10} />
      </button>

      {/* Image thumbnail */}
      <div className="relative h-20 w-full bg-[var(--color-surface-container)]">
        {file.previewUrl ? (
          <img
            src={file.previewUrl}
            alt={file.fileName}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Image size={20} className="text-[var(--color-text-secondary)]" />
          </div>
        )}

        {/* Status badge overlay */}
        <div className="absolute bottom-1 left-1">
          <StatusIcon status={file.status} />
        </div>
      </div>

      {/* File info */}
      <div className="flex flex-col gap-0.5 px-2 py-1.5">
        <span className="truncate text-[10px] font-medium text-[var(--color-text-primary)]" title={file.fileName}>
          {file.fileName}
        </span>
        <span className="text-[9px] text-[var(--color-text-secondary)]">
          {formatFileSize(file.size)}
        </span>
        <ProgressBar progress={file.progress} status={file.status} />
      </div>

      {/* Error tooltip */}
      {file.status === "error" && file.error && (
        <div className="px-2 pb-1.5">
          <span className="text-[9px] text-[var(--color-error)] line-clamp-2" title={file.error}>
            {file.error}
          </span>
        </div>
      )}
    </div>
  );
}

function DocumentPreviewCard({
  file,
  onRemove,
}: {
  file: PendingFile;
  onRemove: (id: string) => void;
}) {
  const ext = fileExtension(file.fileName);
  const isGithub = isGithubFile(file);

  return (
    <div className="group/card relative flex w-32 shrink-0 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      {/* Remove button */}
      <button
        onClick={() => onRemove(file.id)}
        className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-text-secondary)] opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
        aria-label={`Remove ${file.fileName}`}
      >
        <X size={10} />
      </button>

      {/* Document icon with extension badge */}
      <div className="mb-1.5 flex items-center gap-2">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--color-surface-container)]">
          {isGithub ? (
            <GitBranch size={16} className="text-[var(--color-text-primary)]" />
          ) : (
            <FileText size={16} className="text-[var(--color-text-secondary)]" />
          )}
          {/* Extension badge */}
          <span className="absolute -bottom-0.5 -right-0.5 rounded bg-[var(--color-brand)] px-1 text-[7px] font-bold leading-tight text-white">
            {isGithub ? "GH" : ext}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <span
            className="block truncate text-[11px] font-medium text-[var(--color-text-primary)]"
            title={file.fileName}
          >
            {file.fileName}
          </span>
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-[var(--color-text-secondary)]">
              {formatFileSize(file.size)}
            </span>
            {file.lineCount !== null && (
              <span className="text-[9px] text-[var(--color-text-tertiary)]">
                {file.lineCount} lines
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress */}
      <ProgressBar progress={file.progress} status={file.status} />

      {/* Status row */}
      <div className="mt-1 flex items-center gap-1">
        <StatusIcon status={file.status} />
        <span
          className={cn(
            "text-[9px]",
            file.status === "error"
              ? "text-[var(--color-error)]"
              : file.status === "done"
                ? "text-[var(--color-success)]"
                : "text-[var(--color-text-secondary)]",
          )}
        >
          {file.status === "uploading"
            ? `${Math.round(file.progress)}%`
            : file.status === "done"
              ? "Uploaded"
              : "Failed"}
        </span>
      </div>

      {/* Error message */}
      {file.status === "error" && file.error && (
        <span className="mt-0.5 text-[9px] text-[var(--color-error)] line-clamp-2" title={file.error}>
          {file.error}
        </span>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────

/**
 * FileUploadPreview — horizontal scrollable list of pending file uploads
 * with per-file progress bars, status indicators, and hover-to-remove buttons.
 */
export function FileUploadPreview({ files, onRemove }: FileUploadPreviewProps) {
  if (files.length === 0) {
    return null;
  }

  return (
    <div
      className="flex gap-2 overflow-x-auto py-1 scrollbar-thin"
      role="list"
      aria-label="Pending file uploads"
    >
      {files.map((file) => (
        <div key={file.id} role="listitem">
          {file.fileType === "image" ? (
            <ImagePreviewCard file={file} onRemove={onRemove} />
          ) : (
            <DocumentPreviewCard file={file} onRemove={onRemove} />
          )}
        </div>
      ))}
    </div>
  );
}
