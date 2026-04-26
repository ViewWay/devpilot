import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useI18n } from "../../i18n";
import { loadPdf, getPageCount, renderPage } from "../../lib/pdfRenderer";
import { renderDocx } from "../../lib/docxRenderer";

// ─── Types ────────────────────────────────────────────────────────────

export interface DocumentPreviewFile {
  /** The raw File object. */
  file: File;
  /** File name for display. */
  fileName: string;
  /** MIME type. */
  mimeType: string;
}

export interface DocumentPreviewModalProps {
  /** Whether the modal is visible. */
  open: boolean;
  /** Callback to close the modal. */
  onClose: () => void;
  /** The file to preview. */
  file: DocumentPreviewFile | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function isPdf(mimeType: string, name: string): boolean {
  return (
    mimeType === "application/pdf" ||
    name.toLowerCase().endsWith(".pdf")
  );
}

function isDocx(mimeType: string, name: string): boolean {
  return (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  );
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4.0;
const ZOOM_STEP = 0.25;

// ─── Component ────────────────────────────────────────────────────────

export function DocumentPreviewModal({
  open,
  onClose,
  file,
}: DocumentPreviewModalProps) {
  const { t } = useI18n();

  // PDF state
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);

  // DOCX state
  const docxContainerRef = useRef<HTMLDivElement>(null);

  // General state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [docType, setDocType] = useState<"pdf" | "docx" | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // ── Reset state when file changes ─────────────────────────────────
  useEffect(() => {
    if (!open || !file) {return;}

    let cancelled = false;
    setPdfDoc(null);
    setPageCount(0);
    setCurrentPage(1);
    setScale(1.0);
    setError(null);
    setLoading(true);

    const { mimeType, fileName } = file;

    if (isPdf(mimeType, fileName)) {
      setDocType("pdf");
      file.file
        .arrayBuffer()
        .then((buf) => loadPdf(buf))
        .then((doc) => {
          if (cancelled) {return;}
          setPdfDoc(doc);
          setPageCount(getPageCount(doc));
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (cancelled) {return;}
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    } else if (isDocx(mimeType, fileName)) {
      setDocType("docx");
      file.file
        .arrayBuffer()
        .then((buf) => {
          if (cancelled || !docxContainerRef.current) {return;}
          return renderDocx(buf, docxContainerRef.current);
        })
        .then(() => {
          if (!cancelled) {setLoading(false);}
        })
        .catch((err: unknown) => {
          if (cancelled) {return;}
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        });
    } else {
      setDocType(null);
      setError(t("docPreview.noPreview" as const));
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [open, file, t]);

  // ── Render PDF page whenever page or scale changes ─────────────────
  useEffect(() => {
    if (!pdfDoc || docType !== "pdf" || !pdfCanvasRef.current) {return;}

    renderPage(
      pdfDoc,
      currentPage,
      pdfCanvasRef.current,
      scale,
    ).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [pdfDoc, currentPage, scale, docType]);

  // ── Keyboard navigation ────────────────────────────────────────────
  useEffect(() => {
    if (!open) {return;}

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      } else if (docType === "pdf") {
        if (e.key === "ArrowLeft") {
          setCurrentPage((p) => Math.max(1, p - 1));
        } else if (e.key === "ArrowRight") {
          setCurrentPage((p) => Math.min(pageCount, p + 1));
        } else if (e.key === "+" || e.key === "=") {
          setScale((s) => Math.min(MAX_ZOOM, s + ZOOM_STEP));
        } else if (e.key === "-") {
          setScale((s) => Math.max(MIN_ZOOM, s - ZOOM_STEP));
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, docType, pageCount]);

  // ── Fullscreen toggle ──────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!overlayRef.current) {return;}
    if (!document.fullscreenElement) {
      overlayRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  }, []);

  // ── Don't render if not open ───────────────────────────────────────
  if (!open) {return null;}

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={file?.fileName ?? "Document Preview"}
    >
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2">
        {/* File name */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText size={16} className="shrink-0 text-[var(--color-text-secondary)]" />
          <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
            {file?.fileName ?? ""}
          </span>
        </div>

        {/* Controls */}
        <div className="flex shrink-0 items-center gap-1">
          {/* PDF-specific: page navigation */}
          {docType === "pdf" && pageCount > 0 && (
            <>
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-container)] disabled:opacity-40"
                aria-label={t("previous" as const)}
              >
                <ChevronLeft size={16} />
              </button>

              <span className="min-w-[5rem] text-center text-xs text-[var(--color-text-secondary)]">
                {t("docPreview.page" as const)} {currentPage} {t("docPreview.of" as const)} {pageCount}
              </span>

              <button
                onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-container)] disabled:opacity-40"
                aria-label={t("next" as const)}
              >
                <ChevronRight size={16} />
              </button>

              <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />
            </>
          )}

          {/* Zoom controls */}
          {docType === "pdf" && (
            <>
              <button
                onClick={() => setScale((s) => Math.max(MIN_ZOOM, s - ZOOM_STEP))}
                disabled={scale <= MIN_ZOOM}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-container)] disabled:opacity-40"
                aria-label={t("zoomOut" as const)}
              >
                <ZoomOut size={16} />
              </button>

              <span className="min-w-[3rem] text-center text-xs text-[var(--color-text-secondary)]">
                {Math.round(scale * 100)}%
              </span>

              <button
                onClick={() => setScale((s) => Math.min(MAX_ZOOM, s + ZOOM_STEP))}
                disabled={scale >= MAX_ZOOM}
                className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-container)] disabled:opacity-40"
                aria-label={t("zoomIn" as const)}
              >
                <ZoomIn size={16} />
              </button>

              <div className="mx-1 h-5 w-px bg-[var(--color-border)]" />
            </>
          )}

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-container)]"
            aria-label={t("docPreview.fullscreen" as const)}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-error)]/10 hover:text-[var(--color-error)]"
            aria-label={t("docPreview.close" as const)}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center overflow-auto bg-[var(--color-surface-container)]">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-[var(--color-brand)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">
              {t("docPreview.loading" as const)}
            </span>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center gap-3 p-8">
            <FileText size={48} className="text-[var(--color-text-tertiary)]" />
            <span className="text-sm text-[var(--color-text-secondary)]">{error}</span>
          </div>
        )}

        {/* PDF canvas */}
        {docType === "pdf" && !loading && !error && pdfDoc && (
          <div className="flex justify-center p-4">
            <canvas
              ref={pdfCanvasRef}
              className="shadow-lg"
              style={{ maxWidth: "100%", maxHeight: "100%" }}
            />
          </div>
        )}

        {/* DOCX container */}
        {docType === "docx" && (
          <div
            ref={docxContainerRef}
            className="docx-preview-host mx-auto my-4 max-w-[900px] overflow-auto bg-white"
            style={{ minHeight: loading ? "200px" : undefined }}
          />
        )}
      </div>
    </div>
  );
}
