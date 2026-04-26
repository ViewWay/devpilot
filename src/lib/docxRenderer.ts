/**
 * docxRenderer — thin wrapper around docx-preview for rendering .docx
 * files into a DOM container.
 */

// docx-preview ships a UMD bundle; we use the default export.
 
import { renderAsync as renderDocxAsync } from "docx-preview";

/**
 * Render a DOCX file (as ArrayBuffer) into the supplied container element.
 *
 * @param data      The raw .docx file bytes.
 * @param container A DOM element (typically a <div>) to render into.
 */
export async function renderDocx(
  data: ArrayBuffer,
  container: HTMLElement,
): Promise<void> {
  // Clear previous content
  container.innerHTML = "";

  await renderDocxAsync(data, container, undefined, {
    className: "docx-preview-wrapper",
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: false,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    experimental: false,
    trimXmlDeclaration: true,
    debug: false,
  });
}
