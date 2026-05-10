import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import mermaid from 'mermaid';
import { useEffect, useState } from 'react';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
});

const MermaidComponent = ({ node, updateAttributes, selected }: any) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const code = node.textContent;

  useEffect(() => {
    if (!code || !code.trim()) {
      setSvg('');
      setError('Empty diagram');
      return;
    }
    
    let isCancelled = false;
    
    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        // mermaid.render returns { svg, bindFunctions } in v10+
        const result = await mermaid.render(id, code);
        if (!isCancelled) {
          setSvg(result.svg);
          setError(null);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setError(err?.message || 'Syntax Error in Mermaid Diagram');
        }
      }
    };
    
    // Add a small debounce to prevent rendering on every keystroke
    const timeout = setTimeout(() => {
      renderDiagram();
    }, 500);
    
    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [code]);

  return (
    <NodeViewWrapper 
      className={`mermaid-block relative my-6 rounded-xl border transition-all ${
        selected ? 'border-[var(--accent)] shadow-[0_0_0_1px_rgba(var(--accent-rgb),1)]' : 'border-[var(--border-subtle)]'
      } bg-[var(--surface-1)] p-1 overflow-hidden group`}
    >
      <div className="absolute top-2 right-4 text-[10px] font-bold uppercase tracking-widest text-[var(--accent)] opacity-50 select-none">
        Mermaid
      </div>

      <div className="mermaid-preview overflow-x-auto flex items-center justify-center bg-black/40 rounded-lg p-6 min-h-[150px]">
        {error ? (
          <div className="text-[var(--warning)] text-xs font-mono whitespace-pre-wrap max-w-full overflow-x-auto p-4">{error}</div>
        ) : svg ? (
          <div dangerouslySetInnerHTML={{ __html: svg }} className="max-w-full" />
        ) : (
          <div className="text-[var(--text-muted)] text-sm animate-pulse">Rendering diagram...</div>
        )}
      </div>
      
      {/* 
        The editor portion. We show it clearly so the user can type the diagram code.
      */}
      <div className="bg-[var(--bg-950)] border-t border-[var(--border-subtle)] p-4 text-sm font-mono text-[var(--text-secondary)] focus-within:text-[var(--text-primary)] transition-colors">
        <NodeViewContent className="whitespace-pre-wrap focus:outline-none min-h-[40px]" />
      </div>
    </NodeViewWrapper>
  );
};

export const MermaidBlock = Node.create({
  name: 'mermaid',
  group: 'block',
  content: 'text*',
  marks: '',
  defining: true,
  code: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  parseHTML() {
    return [
      {
        tag: 'pre[data-type="mermaid"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['pre', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-type': 'mermaid' }), ['code', 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidComponent);
  },
});
