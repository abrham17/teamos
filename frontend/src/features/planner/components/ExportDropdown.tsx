"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileText, FileJson, Calendar, FileCode, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExportFormat } from "../utils/export/types";
import { handleExport } from "../utils/export";
import type { PlanProjectDetail } from "../types";

interface ExportDropdownProps {
  teamId: string;
  project: PlanProjectDetail;
  className?: string;
}

const FORMATS: { id: ExportFormat; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "html",
    label: "HTML Report",
    icon: <FileCode className="h-4 w-4" />,
    desc: "Rich formatted report with Gantt chart",
  },
  {
    id: "markdown",
    label: "Markdown",
    icon: <FileText className="h-4 w-4" />,
    desc: "Wiki-style document with mermaid diagrams",
  },
  {
    id: "json",
    label: "JSON Data",
    icon: <FileJson className="h-4 w-4" />,
    desc: "Complete project state with all relations",
  },
  {
    id: "ics",
    label: "Calendar (ICS)",
    icon: <Calendar className="h-4 w-4" />,
    desc: "Import tasks and milestones into calendar apps",
  },
];

export function ExportDropdown({ teamId, project, className }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await handleExport(teamId, project, format);
    } catch (e) {
      console.error("Export failed:", e);
    } finally {
      setExporting(null);
      setIsOpen(false);
    }
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={!!exporting}
        title="Export project"
        aria-label="Export project"
        className={cn(
          "h-12 w-12 flex items-center justify-center rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-secondary)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)] transition-all",
          isOpen && "border-[var(--accent)]/40 text-[var(--accent)]",
        )}
      >
        {exporting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-1)] shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Export Project</p>
          </div>
          <div className="py-1">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => handleClick(f.id)}
                disabled={!!exporting}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
              >
                <span className="text-[var(--text-muted)] shrink-0">
                  {exporting === f.id ? <Loader2 className="h-4 w-4 animate-spin" /> : f.icon}
                </span>
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">{f.label}</p>
                  <p className="text-[11px] text-[var(--text-muted)]">{f.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
