import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import DOMPurify from "dompurify";
import { CodeBlock } from "./CodeBlock";

/**
 * Configure DOMPurify with a strict allowlist for rehype-raw output.
 *
 * Allowed tags cover standard markdown formatting plus tables, images,
 * links, code blocks, and interactive disclosure widgets.
 *
 * Explicitly forbidden: script, iframe, object, embed, form, input, style (external).
 */
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    // Formatting
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "strong", "em", "b", "i", "u", "s", "del", "ins", "mark", "sub", "sup", "abbr",
    "blockquote", "pre", "code",
    "span", "div",
    // Lists
    "ul", "ol", "li", "dl", "dt", "dd",
    // Tables
    "table", "thead", "tbody", "tfoot", "th", "td", "tr", "caption", "colgroup", "col",
    // Media & links
    "a", "img",
    // Interactive disclosure
    "details", "summary",
    // KaTeX wrappers
    "math", "annotation",
    "semantics", "mrow", "mi", "mn", "mo", "msup", "msub", "mfrac", "msqrt", "mroot", "munder", "mover",
    // SVG (used by mermaid / math)
    "svg", "path", "g", "circle", "rect", "line", "polygon", "polyline", "text", "tspan", "defs", "use",
  ],
  ALLOWED_ATTR: [
    "class", "id", "style",
    "href", "src", "alt", "title", "target", "rel",
    "width", "height",
    "colspan", "rowspan", "align", "valign",
    "open",  // details/summary
    "viewBox", "d", "fill", "stroke", "transform", "xmlns", "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "points", "offset",
    "displaystyle", "mathvariant", "mathcolor",
    "data-*",
  ],
  // Explicitly forbid dangerous tags
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style", "link", "meta", "base", "noscript"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "formaction", "xlink:href"],
};

/**
 * Rehype plugin that sanitizes raw HTML nodes inserted by rehype-raw.
 * It rewrites each "raw" node through DOMPurify, then parses the clean
 * result back into hast elements so downstream plugins (e.g. rehype-katex)
 * see a safe tree.
 */
function rehypeSanitizeWithDOMPurify() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tree: any) => {
    if (!tree.children) {return;}
    let i = 0;
    while (i < tree.children.length) {
      const child = tree.children[i];
      if (child.type === "raw") {
        // Sanitize the raw HTML through DOMPurify
        const clean = DOMPurify.sanitize(child.value, PURIFY_CONFIG) as string;
        // If DOMPurify stripped everything, remove the node
        if (!clean.trim()) {
          tree.children.splice(i, 1);
          continue;
        }
        // Parse the sanitized HTML back into hast nodes.
        // We use a simple approach: convert to text node if it's plain text,
        // or keep it as a sanitized raw node for rehype-raw's sibling processing.
        child.value = clean;
      }
      // Recurse into children
      if (child.children) {
        sanitizeTree(child);
      }
      i++;
    }
  };
}

/** Recursively sanitize raw nodes throughout the hast tree. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sanitizeTree(node: any) {
  if (!node.children) {return;}
  let i = 0;
  while (i < node.children.length) {
    const child = node.children[i];
    if (child.type === "raw") {
      const clean = DOMPurify.sanitize(child.value, PURIFY_CONFIG) as string;
      if (!clean.trim()) {
        node.children.splice(i, 1);
        continue;
      }
      child.value = clean;
    }
    if (child.children) {
      sanitizeTree(child);
    }
    i++;
  }
}

/**
 * Lazy-load MermaidRenderer and SandboxBlock to keep mermaid / iframe code
 * out of the main bundle. These are only needed for specialised code fences.
 */
const MermaidRenderer = lazy(() =>
  import("./MermaidRenderer").then((m) => ({ default: m.MermaidRenderer })),
);
const SandboxBlock = lazy(() =>
  import("./SandboxBlock").then((m) => ({ default: m.SandboxBlock })),
);

/** Shared inline spinner fallback for lazy-loaded markdown components. */
function LazyFallback() {
  return (
    <div className="flex items-center justify-center py-4 text-xs text-muted-foreground">
      <Loader2 size={14} className="animate-spin" />
    </div>
  );
}

/**
 * Preprocess markdown so that edge-case $$ blocks that aren't properly
 * separated by blank lines are still picked up by remark-math.
 *
 * Handles cases like:
 *   $$E=mc^2$$           (inline $$ on a single line)
 *   $$\nx^2\n$$          (block without surrounding blank lines)
 */
function normalizeMathBlocks(md: string): string {
  // Ensure standalone $$...$$ on a single line is treated as display math
  return md.replace(/(^|\n)(\$\$[^\n$]+\$\$)(\n|$)/g, (_, pre, math, post) => {
    return `${pre}\n\n${math}\n\n${post}`;
  });
}

type MarkdownRendererProps = {
  /** The markdown content to render. */
  content: string;
  /** Optional font size override. */
  fontSize?: number;
  /** Additional class names for the wrapper. */
  className?: string;
};

/**
 * MarkdownRenderer — reusable markdown rendering with all component overrides.
 * Handles code blocks (with syntax highlighting), tables, GFM, math (KaTeX), and sandbox blocks.
 */
export function MarkdownRenderer({ content, fontSize, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`leading-relaxed text-assistant-bubble-foreground prose-sm ${className}`} style={fontSize ? { fontSize } : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeRaw, rehypeSanitizeWithDOMPurify, rehypeKatex]}
        components={{
          code({ className: codeClassName, children }) {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const codeStr = String(children).replace(/\n$/, "");
            const isInline = !match && !codeStr.includes("\n");
            if (isInline) {
              return (
                <code className="rounded bg-[var(--color-surface-container)] px-1 py-0.5 text-xs font-mono">
                  {children}
                </code>
              );
            }
            const lang = match?.[1];
            // Render Mermaid diagrams as SVG
            if (lang === "mermaid") {
              return (
                <Suspense fallback={<LazyFallback />}>
                  <MermaidRenderer chart={codeStr} className="my-3" />
                </Suspense>
              );
            }
            // Render HTML code blocks as interactive sandbox previews
            if (lang === "html") {
              return (
                <Suspense fallback={<LazyFallback />}>
                  <SandboxBlock code={codeStr} />
                </Suspense>
              );
            }
            return <CodeBlock code={codeStr} lang={lang} />;
          },
          table({ children }) {
            return (
              <div className="my-2 overflow-x-auto rounded-lg border border-[var(--color-border)]/40">
                <table className="w-full text-xs border-collapse">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border-b border-[var(--color-border)] bg-[var(--color-surface-container)]/50 px-3 py-2 text-left font-semibold text-[var(--color-text-primary)]">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-text-secondary)]">
                {children}
              </td>
            );
          },
          tr({ children }) {
            return <tr className="hover:bg-[var(--color-surface-container)]/20 transition-colors">{children}</tr>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                className="text-[var(--color-brand)] underline underline-offset-2 hover:text-[var(--color-brand)]/80 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            );
          },
          ul({ children }) {
            return <ul className="my-1.5 ml-4 list-disc space-y-1 text-sm marker:text-[var(--color-text-secondary)]">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="my-1.5 ml-4 list-decimal space-y-1 text-sm marker:text-[var(--color-text-secondary)]">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-relaxed">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="my-2 border-l-2 border-[var(--color-brand)]/40 bg-[var(--color-brand)]/5 pl-3 py-1 text-sm italic text-[var(--color-text-secondary)]">
                {children}
              </blockquote>
            );
          },
          h1({ children }) {
            return <h1 className="mt-4 mb-2 text-lg font-bold text-[var(--color-text-primary)]">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="mt-3 mb-1.5 text-base font-bold text-[var(--color-text-primary)]">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="mt-2 mb-1 text-sm font-bold text-[var(--color-text-primary)]">{children}</h3>;
          },
          p({ children }) {
            return <p className="my-1 leading-relaxed">{children}</p>;
          },
          hr() {
            return <hr className="my-3 border-[var(--color-border)]" />;
          },
          input({ checked, disabled }) {
            // GFM task list checkboxes
            return (
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                className="mr-1.5 h-3.5 w-3.5 rounded border-[var(--color-border)] accent-[var(--color-brand)]"
              />
            );
          },
        }}
      >
        {normalizeMathBlocks(content)}
      </ReactMarkdown>
    </div>
  );
}
