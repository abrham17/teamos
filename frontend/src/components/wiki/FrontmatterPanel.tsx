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
    <div className="border border-white/10 rounded-xl bg-white/5 overflow-hidden mb-4 transition-all">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-300">
          <Settings size={16} />
          <span>Page Metadata (Frontmatter)</span>
        </div>
        <div className="flex gap-2">
           {frontmatter.status && (
             <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-xs">
               {frontmatter.status}
             </span>
           )}
           {frontmatter.tags && frontmatter.tags.split(',').map((t: string) => (
             <span key={t} className="px-2 py-0.5 rounded-full bg-white/10 text-gray-400 text-xs">
               #{t.trim()}
             </span>
           ))}
        </div>
      </button>

      {isOpen && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/10">
          <div className="space-y-1">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Tag size={12} /> Tags (comma separated)
            </label>
            <input 
              type="text" 
              value={frontmatter.tags || ""} 
              onChange={(e) => updateField("tags", e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="e.g. project, research, active"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Info size={12} /> Status
            </label>
            <select 
              value={frontmatter.status || "draft"} 
              onChange={(e) => updateField("status", e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="draft">Draft</option>
              <option value="review">In Review</option>
              <option value="stable">Stable</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar size={12} /> Target Date
            </label>
            <input 
              type="date" 
              value={frontmatter.target_date || ""} 
              onChange={(e) => updateField("target_date", e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-md p-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-gray-500 flex items-center gap-1">
              <Info size={12} /> Priority
            </label>
            <div className="flex gap-2">
              {["Low", "Medium", "High"].map((p) => (
                <button
                  key={p}
                  onClick={() => updateField("priority", p)}
                  className={`flex-1 p-2 rounded-md border text-xs transition-colors ${
                    frontmatter.priority === p 
                      ? "bg-blue-500/20 border-blue-500 text-blue-400" 
                      : "bg-black/20 border-white/10 text-gray-500 hover:bg-white/5"
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
