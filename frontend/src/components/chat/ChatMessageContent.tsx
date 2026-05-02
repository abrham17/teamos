"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Components } from "react-markdown";

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
      <pre className="my-3 overflow-x-auto rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-950)] p-3 text-[12px] text-[var(--text-muted)]">
        <code className="whitespace-pre font-mono">{chart}</code>
        <div className="mt-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-dim)]">
          Chart preview when reply finishes…
        </div>
      </pre>
    );
  }

  if (fallback) {
    return (
      <pre className="my-3 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] p-3 text-[13px] leading-relaxed text-[var(--text-secondary)]">
        <code className="whitespace-pre font-mono text-[12px]">{chart}</code>
      </pre>
    );
  }

  return (
    <div className="my-4 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] p-3">
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
      className="font-medium text-[var(--accent)] underline decoration-[var(--accent)]/40 underline-offset-2 hover:decoration-[var(--accent)]"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-[var(--accent)]/60 pl-3 text-[var(--text-muted)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-4 border-[var(--border-subtle)]" />,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full min-w-[280px] border-collapse text-left text-[13px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--bg-800)] text-[var(--text-secondary)]">{children}</thead>,
  tbody: ({ children }) => <tbody className="divide-y divide-[var(--border-subtle)]">{children}</tbody>,
  tr: ({ children }) => <tr className="hover:bg-[var(--bg-800)]/40">{children}</tr>,
  th: ({ children }) => (
    <th className="border-b border-[var(--border-subtle)] px-3 py-2 font-semibold text-[var(--text-primary)]">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-[var(--border-subtle)]/80 px-3 py-2 text-[var(--text-primary)]">{children}</td>
  ),
};

type ChatMessageContentProps = {
  content: string;
  /** While tokens stream, avoid breaking the MD tree on an open ```mermaid block. */
  streaming?: boolean;
};

export function ChatMessageContent({ content, streaming }: ChatMessageContentProps) {
  const trimmed = (content ?? "").trim();
  if (!trimmed) {
    return <span className="text-[var(--text-dim)]">…</span>;
  }

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
              className="rounded bg-[var(--bg-800)] px-1.5 py-0.5 font-mono text-[13px] text-[var(--accent)]"
              {...rest}
            >
              {children}
            </code>
          );
        }

        return (
          <pre className="my-3 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-950)] p-3">
            <code
              className={`font-mono text-[12px] leading-relaxed text-[var(--text-secondary)] ${className ?? ""}`}
            >
              {children}
            </code>
          </pre>
        );
      },
    }),
    [streaming],
  );

  return (
    <div className="chat-md max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
        skipHtml
      >
        {streaming ? closeIncompleteMermaidFence(content) : content}
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
