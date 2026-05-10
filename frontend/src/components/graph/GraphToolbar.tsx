"use client";

import { ZoomIn, ZoomOut, Maximize2, Download, Search, Network, X } from "lucide-react";

const LAYOUTS = [
  { value: "cose",          label: "Force-directed" },
  { value: "grid",          label: "Grid"           },
  { value: "circle",        label: "Circle"         },
  { value: "breadthfirst",  label: "Hierarchical"   },
  { value: "concentric",    label: "Concentric"     },
];

interface Props {
  nodeCount:      number;
  edgeCount:      number;
  loading:        boolean;
  searchQuery:    string;
  layout:         string;
  onSearch:       (q: string) => void;
  onLayoutChange: (name: string) => void;
  onZoomIn:       () => void;
  onZoomOut:      () => void;
  onFit:          () => void;
  onExportPng:    () => void;
  isolateSelection: boolean;
  onToggleIsolateSelection: () => void;
}

export function GraphToolbar({
  nodeCount, edgeCount, loading,
  searchQuery, layout,
  onSearch, onLayoutChange,
  onZoomIn, onZoomOut, onFit, onExportPng,
  isolateSelection, onToggleIsolateSelection,
}: Props) {
  return (
    <div className="flex items-center h-[var(--header-h)] border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 gap-2 shrink-0">

      {/* Zoom controls */}
      <div className="flex items-center gap-0.5">
        <ToolBtn onClick={onZoomIn}  title="Zoom in"    icon={<ZoomIn  className="w-4 h-4" />} />
        <ToolBtn onClick={onZoomOut} title="Zoom out"   icon={<ZoomOut className="w-4 h-4" />} />
        <ToolBtn onClick={onFit}     title="Fit to view" icon={<Maximize2 className="w-4 h-4" />} />
      </div>

      <Divider />

      {/* Layout picker */}
      <div className="flex items-center gap-1.5">
        <Network className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
        <select
          value={layout}
          onChange={e => onLayoutChange(e.target.value)}
          className="bg-[var(--bg-800)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs rounded-lg px-2 py-1.5 outline-none cursor-pointer hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition-colors appearance-none"
          style={{ colorScheme: "dark" }}
        >
          {LAYOUTS.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      <Divider />

      {/* Search input */}
      <div className="relative flex items-center">
        <Search className="absolute left-2.5 w-3.5 h-3.5 text-[var(--text-muted)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search nodes…"
          className="bg-[var(--surface-2)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs rounded-lg pl-8 pr-7 py-1.5 w-44 outline-none focus:border-[var(--accent)] placeholder:text-[var(--text-dim)] transition-colors"
        />
        {searchQuery && (
          <button
            onClick={() => onSearch("")}
            className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      <button
        onClick={onToggleIsolateSelection}
        title="Isolate selected node neighborhood"
        className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
          isolateSelection
            ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-subtle)]"
            : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
        }`}
      >
        Isolate
      </button>

      {/* Stats */}
      <div className="text-xs text-[var(--text-muted)] tabular-nums">
        {loading ? (
          <span className="flex items-center gap-1.5">
            <span
              className="w-3.5 h-3.5 border border-[var(--accent)] border-t-transparent rounded-full shrink-0"
              style={{ animation: "spin 0.75s linear infinite", display: "inline-block" }}
            />
            Loading…
          </span>
        ) : (
          <span>{nodeCount} nodes · {edgeCount} edges</span>
        )}
      </div>

      <Divider />

      {/* Export PNG */}
      <button
        onClick={onExportPng}
        title="Export as PNG"
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] rounded-lg transition-colors border border-transparent hover:border-[var(--border-subtle)]"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>
    </div>
  );
}

/* ── Helpers ── */
function ToolBtn({ onClick, title, icon }: { onClick(): void; title: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-[var(--border-subtle)] mx-1 shrink-0" />;
}
