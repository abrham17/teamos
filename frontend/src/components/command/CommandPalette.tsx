"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { FileText, MessageSquare, Share2, Settings, Plus, Search } from "lucide-react";
import { useWikiStore } from "@/stores/useWikiStore";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setWikiSidebarOpen } = useWikiStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[15vh]">
      <Command 
        className="w-full max-w-[600px] bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      >
        <div className="flex items-center px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-900)]">
          <Search className="w-5 h-5 text-[var(--accent)]" />
          <Command.Input 
            autoFocus 
            placeholder="Type a command or search..." 
            className="flex-1 bg-transparent border-none outline-none p-4 text-[var(--text-primary)] placeholder-[var(--text-muted)]" 
          />
        </div>

        <Command.List className="max-h-[300px] overflow-y-auto p-2 bg-[var(--surface-1)]">
          <Command.Empty className="py-6 text-center text-sm text-[var(--text-muted)]">
            No results found.
          </Command.Empty>

          <Command.Group heading={<div className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Navigation</div>}>
            <Command.Item onSelect={() => { router.push("/wiki"); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-[var(--bg-800)] aria-selected:bg-[var(--bg-800)] aria-selected:text-[var(--accent)] text-[var(--text-primary)]">
              <FileText className="w-4 h-4" /> Go to Wiki
            </Command.Item>
            <Command.Item onSelect={() => { router.push("/chat"); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-[var(--bg-800)] aria-selected:bg-[var(--bg-800)] aria-selected:text-[var(--accent)] text-[var(--text-primary)]">
              <MessageSquare className="w-4 h-4" /> Ask TeamOS Chat
            </Command.Item>

            <Command.Item onSelect={() => { router.push("/graph"); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-[var(--bg-800)] aria-selected:bg-[var(--bg-800)] aria-selected:text-[var(--accent)] text-[var(--text-primary)]">
              <Share2 className="w-4 h-4" /> View Knowledge Graph
            </Command.Item>
            <Command.Item onSelect={() => { router.push("/settings"); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-[var(--bg-800)] aria-selected:bg-[var(--bg-800)] aria-selected:text-[var(--accent)] text-[var(--text-primary)]">
              <Settings className="w-4 h-4" /> Team Settings
            </Command.Item>
          </Command.Group>

          <Command.Group heading={<div className="px-3 py-2 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mt-2 border-t border-[var(--border-subtle)]">Actions</div>}>
            <Command.Item onSelect={() => { router.push("/wiki?action=new"); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-[var(--bg-800)] aria-selected:bg-[var(--bg-800)] aria-selected:text-[var(--accent)] text-[var(--text-primary)]">
              <Plus className="w-4 h-4" /> Create New Page
            </Command.Item>
            <Command.Item onSelect={() => { setWikiSidebarOpen(true); setOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg cursor-pointer hover:bg-[var(--bg-800)] aria-selected:bg-[var(--bg-800)] aria-selected:text-[var(--accent)] text-[var(--text-primary)]">
              <Search className="w-4 h-4" /> Search Pages
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
