"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Components } from "react-markdown";

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
    "svg",
    "path",
    "g",
    "circle",
    "rect",
    "line",
    "text",
    "tspan",
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
    "*": ["className", "style"], // Allow math classes and styles
  },
};

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
          theme: "dark",
          securityLevel: "strict",
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
      <div className="my-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-950)] overflow-hidden">
        <div className="bg-[var(--surface-1)] border-b border-[var(--border-subtle)] px-3 py-2 flex items-center justify-between text-[10px] text-[var(--text-muted)] font-black uppercase tracking-wider">
          <span>Streaming diagram definition...</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(chart);
            }}
            className="px-2 py-0.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-2)] transition-colors text-[9px] font-black uppercase tracking-wider"
          >
            Copy Source
          </button>
        </div>
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-[var(--text-muted)]">
          <code className="whitespace-pre font-mono text-[12px]">{chart}</code>
        </pre>
      </div>
    );
  }

  if (fallback) {
    return (
      <div className="my-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--bg-950)] overflow-hidden">
        <div className="bg-[var(--danger)]/5 border-b border-[var(--danger)]/15 px-3 py-2 flex items-center justify-between text-[10px] text-[var(--danger)] font-black uppercase tracking-wider">
          <span>Invalid Mermaid Diagram (Render Failed)</span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(chart);
            }}
            className="px-2 py-0.5 rounded border border-[var(--danger)]/20 hover:bg-[var(--danger)]/10 transition-colors text-[9px] font-black uppercase tracking-wider"
          >
            Copy Code
          </button>
        </div>
        <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          <code className="whitespace-pre font-mono text-[12px]">{chart}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] p-3 relative group">
      <div className="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => {
            navigator.clipboard.writeText(chart);
          }}
          className="p-1.5 rounded-md bg-[var(--bg-950)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-all active:scale-95 text-[10px] font-bold flex items-center gap-1.5"
          title="Copy Diagram Source"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          Copy Source
        </button>
      </div>
      <div
        ref={hostRef}
        className="flex justify-center text-[var(--text-primary)] [&_svg]:h-auto [&_svg]:max-w-full"
      />
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
    <div className="my-5 overflow-x-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-1)] shadow-xl">
      <table className="w-full min-w-[320px] border-collapse text-left text-sm table-layout-auto">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--bg-950)]/50 border-b border-[var(--border-strong)] text-[var(--text-secondary)] font-bold">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-[var(--border-subtle)]/30">{children}</tbody>,
  tr: ({ children }) => <tr className="transition-colors hover:bg-[var(--accent-subtle)]/5">{children}</tr>,
  th: ({ children }) => (
    <th className="px-4 py-3 font-extrabold uppercase tracking-wider text-[10px] text-[var(--text-muted)] bg-[var(--bg-900)] whitespace-nowrap">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-3 text-[var(--text-primary)] border-r border-[var(--border-subtle)]/20 last:border-0 break-words max-w-[250px] leading-relaxed">
      {children}
    </td>
  ),
};

type ChatMessageContentProps = {
  content: string;
  /** While tokens stream, avoid breaking the MD tree on an open ```mermaid block. */
  streaming?: boolean;
};

export function ChatMessageContent({ content, streaming }: ChatMessageContentProps) {
  const trimmed = (content ?? "").trim();

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
          <div className="relative group my-5">
            <div className="absolute right-3 top-3 flex items-center gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-dim)] bg-[var(--bg-950)] px-2 py-1 rounded-md border border-[var(--border-subtle)]">
                    {lang || "code"}
                </div>
                <button
                    onClick={() => {
                        navigator.clipboard.writeText(text);
                    }}
                    className="p-1.5 rounded-md bg-[var(--bg-950)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition-all active:scale-95"
                    title="Copy to clipboard"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
            </div>
            <pre className="overflow-x-auto rounded-xl border border-[var(--border-strong)] bg-[var(--bg-950)] p-4 shadow-2xl relative">
                <code
                className={`font-mono text-[13px] leading-relaxed text-[var(--text-secondary)] block ${className ?? ""}`}
                >
                {children}
                </code>
            </pre>
          </div>
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
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema], rehypeKatex]}
        components={components}
        skipHtml
      >
        {preprocessContent(content, streaming)}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Preprocesses Markdown content by:
 * 1. Temporarily closing incomplete Mermaid code fences while streaming.
 * 2. Translating LaTeX block and inline mathematical brackets to $$ and $ for KaTeX.
 */
function preprocessContent(text: string, streaming?: boolean): string {
  let processed = text ?? "";
  
  if (streaming) {
    processed = closeIncompleteMermaidFence(processed);
  }

  // Translate \[ ... \] block delimiters to $$ ... $$ and \( ... \) inline delimiters to $ ... $
  processed = processed
    .replace(/\\\[/g, "\n$$\n")
    .replace(/\\\]/g, "\n$$\n")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");

  return processed;
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
