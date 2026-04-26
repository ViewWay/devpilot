/**
 * pdfRenderer — thin wrapper around pdfjs-dist for rendering PDF pages to
 * a <canvas> element. Handles worker initialisation internally.
 */
import * as pdfjsLib from "pdfjs-dist";

// ── Worker setup (lazy, runs once) ────────────────────────────────────
let _workerInitialised = false;

function ensureWorker() {
  if (_workerInitialised) {return;}
  // For pdfjs-dist v5+, point the worker to the bundled minified file.
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  _workerInitialised = true;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Load a PDF document from an ArrayBuffer (e.g. File#arrayBuffer()).
 * Returns the PDFDocumentProxy.
 */
export async function loadPdf(data: ArrayBuffer) {
  ensureWorker();
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(data) }).promise;
  return pdf;
}

/** Return the number of pages in the loaded PDF document. */
export function getPageCount(pdf: pdfjsLib.PDFDocumentProxy): number {
  return pdf.numPages;
}

/**
 * Render a specific page of the PDF onto the given <canvas> element.
 *
 * @param pdf     The loaded PDFDocumentProxy.
 * @param pageNum 1-indexed page number.
 * @param canvas  Target <canvas> element.
 * @param scale   Zoom factor (default 1.0).
 */
export async function renderPage(
  pdf: pdfjsLib.PDFDocumentProxy,
  pageNum: number,
  canvas: HTMLCanvasElement,
  scale = 1.0,
): Promise<void> {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {throw new Error("Could not get 2D context from canvas");}

  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
  }).promise;
}
