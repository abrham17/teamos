"use client";

import { Menu } from "lucide-react";
import { useWikiStore } from "@/stores/useWikiStore";

export function MobileHeader() {
  const { zenMode } = useWikiStore();

  const toggleSidebar = () => {
    window.dispatchEvent(new Event("toggle-sidebar"));
  };

  if (zenMode) return null;

  return (
    <header className="md:hidden h-14 border-b border-[var(--border-subtle)] bg-[var(--bg-900)] px-4 flex items-center justify-between z-30 shrink-0 sticky top-0">
      <button
        onClick={toggleSidebar}
        aria-label="Toggle Navigation Sidebar"
        className="p-2 hover:bg-white/[0.04] rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-subtle)]"
      >
        <Menu className="w-5 h-5" />
      </button>
      
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-lg bg-transparent border border-[var(--border-strong)] flex items-center justify-center shrink-0">
          <span className="text-[var(--text-primary)] font-bold text-[10px]">T</span>
        </div>
        <span className="text-sm font-bold text-[var(--text-primary)] tracking-tight">TeamOS</span>
      </div>

      <div className="w-9" /> {/* Spacing element for center balancing */}
    </header>
  );
}
