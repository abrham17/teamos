"use client";

import { useState } from "react";
import { Settings, Tag, Info, Calendar } from "lucide-react";

interface Props {
  frontmatter: Record<string, string>;
  onChange: (newFm: Record<string, string>) => void;
}

export default function FrontmatterPanel({ frontmatter, onChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  const updateField = (field: string, value: string) => {
    onChange({ ...frontmatter, [field]: value });
  };

  return (
    <div className="border border-white/5 rounded-2xl bg-white/[0.02] overflow-hidden mb-6 transition-all group hover:border-white/10">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition-all"
      >
        <div className="flex items-center gap-3 text-sm font-bold tracking-tight text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
          <Settings size={18} className="text-[var(--accent)]" />
          <span>Document Settings</span>
        </div>
        <div className="flex gap-2">
           {frontmatter.status && (
             <span className="px-3 py-1 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] text-[10px] font-bold uppercase tracking-wider border border-[var(--accent)]/20">
               {frontmatter.status}
             </span>
           )}
           {frontmatter.tags && frontmatter.tags.split(',').map((t: string) => (
             <span key={t} className="px-3 py-1 rounded-full bg-white/5 text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-wider border border-white/5">
               #{t.trim()}
             </span>
           ))}
        </div>
      </button>

      {isOpen && (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/5 animate-in slide-in-from-top-2 duration-300">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
              <Tag size={12} /> Keywords / Tags
            </label>
            <input 
              type="text" 
              value={frontmatter.tags || ""} 
              onChange={(e) => updateField("tags", e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/50 transition-all"
              placeholder="Separate with commas..."
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
              <Info size={12} /> Lifecycle Status
            </label>
            <select 
              value={frontmatter.status || "draft"} 
              onChange={(e) => updateField("status", e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all appearance-none cursor-pointer"
            >
              <option value="draft">Draft Phase</option>
              <option value="review">Under Review</option>
              <option value="stable">Stable Version</option>
              <option value="archived">Legacy / Archived</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
              <Calendar size={12} /> Milestone Date
            </label>
            <input 
              type="date" 
              value={frontmatter.target_date || ""} 
              onChange={(e) => updateField("target_date", e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
              <Info size={12} /> Priority Level
            </label>
            <div className="flex gap-2">
              {["Low", "Medium", "High"].map((p) => (
                <button
                  key={p}
                  onClick={() => updateField("priority", p)}
                  className={`flex-1 py-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                    frontmatter.priority === p 
                      ? "bg-[var(--accent)] border-[var(--accent)] text-[var(--bg-950)] shadow-lg shadow-[var(--accent)]/20" 
                      : "bg-white/[0.03] border-white/10 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-white/5"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
