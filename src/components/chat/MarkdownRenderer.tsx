import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { CodeBlock } from "./CodeBlock";
import { SandboxBlock } from "./SandboxBlock";

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
 * Handles code blocks (with syntax highlighting), tables, GFM, and sandbox blocks.
 */
export function MarkdownRenderer({ content, fontSize, className = "" }: MarkdownRendererProps) {
  return (
    <div className={`leading-relaxed text-assistant-bubble-foreground prose-sm ${className}`} style={fontSize ? { fontSize } : undefined}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
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
            // Render HTML code blocks as interactive sandbox previews
            if (lang === "html") {
              return <SandboxBlock code={codeStr} />;
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
