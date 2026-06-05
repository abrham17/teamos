"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Components } from "react-markdown";
import { preprocessMath } from "../editor/extensions/MathMarkdownExtension";

import "katex/dist/katex.min.css";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "del",
    "input",
    // SVG (for Mermaid output)
    "svg",
    "path",
    "g",
    "circle",
    "rect",
    "line",
    "text",
    "tspan",
    "defs",
    "marker",
    "use",
    "polygon",
    "polyline",
    "ellipse",
    "foreignObject",
    // MathML (preserved through KaTeX)
    "math",
    "annotation",
    "semantics",
    "mtext",
    "mn",
    "mo",
    "mi",
    "mspace",
    "mover",
    "munder",
    "munderover",
    "msup",
    "msub",
    "msubsup",
    "mfrac",
    "msqrt",
    "mroot",
    "mrow",
    "mstyle",
    "mtable",
    "mtr",
    "mtd",
    "mpadded",
  ],
  attributes: {
    ...defaultSchema.attributes,
    table: ["align", ...(defaultSchema.attributes?.table ?? [])],
    th: ["align", "colspan", "rowspan", ...(defaultSchema.attributes?.th ?? [])],
    td: ["align", "colspan", "rowspan", ...(defaultSchema.attributes?.td ?? [])],
    input: [
      "type",
      "checked",
      "disabled",
      ...(defaultSchema.attributes?.input ?? []),
    ],
    // Allow all class/style/aria/data attrs everywhere (needed for KaTeX & Mermaid)
    "*": ["className", "style", "aria-hidden", "aria-label", "data-*", "role",
          "xmlns", "viewBox", "width", "height", "fill", "stroke", "d",
          "stroke-width", "stroke-linecap", "stroke-linejoin", "transform",
          "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
          "points", "marker-end", "marker-start", "id", "href",
          "preserveAspectRatio", "encoding"],
  },
};

function getMermaidTheme(): "dark" | "neutral" {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "light" ? "neutral" : "dark";
}

function MermaidBlock({ chart, deferRender }: { chart: string; deferRender?: boolean }) {
  const reactId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const trimmed = chart.trim();
    if (!trimmed) {
      el.innerHTML = "";
      setFallback(false);
      return;
    }

    if (deferRender) {
      el.innerHTML = "";
      setFallback(false);
      return;
    }

    let cancelled = false;
    setFallback(false);

    const run = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: getMermaidTheme(),
          securityLevel: "loose",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        });
        const rid = `mer-${reactId}-${Math.random().toString(36).slice(2, 9)}`;
        const { svg } = await mermaid.render(rid, trimmed);
        if (!cancelled && hostRef.current) {
          hostRef.current.innerHTML = svg;
          setFallback(false);
        }
      } catch {
        if (!cancelled) {
          setFallback(true);
          if (hostRef.current) hostRef.current.innerHTML = "";
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [chart, reactId, deferRender]);

  if (deferRender) {
    return (
      <div className="my-4 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-950)]">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-950)] border-b border-[var(--border-subtle)] rounded-t-lg">
          <span className="text-[10px] uppercase text-[var(--text-dim)]">Diagram</span>
        </div>
        <div className="p-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-dim)]">
            Chart preview when reply finishes…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-950)] border-b border-[var(--border-subtle)] rounded-t-lg">
        <span className="text-[10px] uppercase text-[var(--text-dim)]">Diagram</span>
      </div>
      <div className="p-4 overflow-x-auto">
        {fallback ? (
          <span className="text-[var(--danger)] text-[12px]">Failed to render diagram.</span>
        ) : (
          <div
            ref={hostRef}
            className="flex justify-center text-[var(--text-primary)] [&_svg]:h-auto [&_svg]:max-w-full"
          />
        )}
      </div>
    </div>
  );
}

function extractLanguage(className: string | undefined): string | undefined {
  const m = /language-([\w-]+)/.exec(className ?? "");
  return m?.[1];
}

const mdComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-lg font-bold text-[var(--text-primary)] first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-4 text-base font-semibold text-[var(--text-primary)] first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-3 text-sm font-semibold text-[var(--text-primary)] first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2 last:mb-0 text-[var(--text-primary)]">{children}</p>,
  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 text-[var(--text-primary)] last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 text-[var(--text-primary)] last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-[var(--text-primary)]">{children}</strong>,
  em: ({ children }) => <em className="italic text-[var(--text-secondary)]">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-[var(--text-secondary)] underline decoration-[var(--border-subtle)] underline-offset-2 hover:text-[var(--text-primary)] hover:decoration-[var(--text-dim)]"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-4 border-[var(--accent)] bg-[var(--accent-subtle)] px-4 py-3 italic text-[var(--text-primary)] rounded-r-xl">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-[var(--border-subtle)]" />,
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full min-w-[320px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--bg-800)]">{children}</thead>,
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="transition-colors hover:bg-[var(--bg-800)]/20 even:bg-[var(--bg-800)]/30">{children}</tr>,
  th: ({ children }) => (
    <th className="px-3 py-2 font-semibold uppercase tracking-wide text-[10px] text-[var(--text-muted)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 text-[var(--text-primary)] border-t border-[var(--border-subtle)]">{children}</td>
  ),
};

function CodeBlock({ lang, text, className, children }: { lang?: string; text: string; className?: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-950)] overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-950)] border-b border-[var(--border-subtle)] rounded-t-lg select-none">
        <span className="text-[10px] uppercase font-semibold text-[var(--text-dim)] tracking-wider">
          {lang || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] font-semibold text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"
          title="Copy code"
        >
          {copied ? (
            <span className="text-[var(--success)]">Copied!</span>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 rounded-b-lg">
        <code className={`font-mono text-[12px] leading-relaxed text-[var(--text-secondary)] block ${className ?? ""}`}>
          {children}
        </code>
      </pre>
    </div>
  );
}

type ChatMessageContentProps = {
  content: string;
  /** While tokens stream, avoid breaking the MD tree on an open ```mermaid block. */
  streaming?: boolean;
};

// Math preprocessing is now imported from extensions/MathMarkdownExtension

export function ChatMessageContent({ content, streaming }: ChatMessageContentProps) {
  const trimmed = (content ?? "").trim();

  const processedContent = useMemo(() => {
    if (!trimmed) return "";
    const raw = streaming ? closeIncompleteMermaidFence(content) : content;
    return preprocessMath(raw);
  }, [content, trimmed, streaming]);

  const components = useMemo<Components>(
    () => ({
      ...mdComponents,
      code(props) {
        const { className, children, ...rest } = props;
        const inline = "inline" in props && Boolean((props as { inline?: boolean }).inline);
        const lang = extractLanguage(className);
        const text = String(children).replace(/\n$/, "");

        if (!inline && lang === "mermaid") {
          return <MermaidBlock chart={text} deferRender={streaming} />;
        }

        if (inline) {
          return (
            <code
              className="rounded bg-[var(--bg-800)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--text-secondary)]"
              {...rest}
            >
              {children}
            </code>
          );
        }

        return (
          <CodeBlock lang={lang} text={text} className={className}>
            {children}
          </CodeBlock>
        );
      },
    }),
    [streaming],
  );

  if (!trimmed) {
    return <span className="text-[var(--text-dim)]">…</span>;
  }

  return (
    <div className="chat-md max-w-none">
      <style>{`
        .chat-md .math-display, .chat-md .katex-display {
          overflow-x: auto;
          padding-top: 0.75rem;
          padding-bottom: 0.75rem;
          width: 100%;
        }
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

/**
 * If the model opened ```mermaid but has not closed the fence yet, temporarily append ```
 * so markdown below still parses; MermaidBlock may fail until the diagram is complete.
 */

function closeIncompleteMermaidFence(text: string): string {
  const fence = "```mermaid";
  const start = text.indexOf(fence);
  if (start === -1) return text;

  const after = text.slice(start + fence.length);
  const endRel = after.indexOf("```");
  if (endRel !== -1) return text;

  return `${text}\n\`\`\``;
}
