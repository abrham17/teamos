"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, PlusCircle, ChevronLeft, ChevronRight, Trash2, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSession } from "@/components/chat/chatTypes";

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
}

export function ChatSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
}: ChatSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem("teamos-chat-sidebar-collapsed") === "true");
  }, []);

  useEffect(() => {
    if (renamingId && renameRef.current) renameRef.current.focus();
  }, [renamingId]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("teamos-chat-sidebar-collapsed", String(next));
  };

  const sessionCls = (isActive: boolean) => {
    if (collapsed) {
      return [
        "w-11 h-10 rounded-lg flex items-center justify-center transition-all duration-200 shrink-0 relative group",
        isActive
          ? "bg-[var(--bg-800)] text-[var(--text-primary)] border border-[var(--border-subtle)]"
          : "text-[var(--text-muted)] hover:bg-[var(--bg-700)] hover:text-[var(--text-primary)]",
      ].join(" ");
    }
    return [
      "flex items-center gap-3 px-3.5 py-2.5 w-full rounded-lg text-sm transition-all duration-200 text-left truncate group/sess relative",
      isActive
        ? "bg-[var(--bg-800)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--bg-700)] hover:text-[var(--text-primary)] border border-transparent",
    ].join(" ");
  };

  const startRename = (s: ChatSession) => {
    setRenamingId(s.id);
    setRenameInput(s.title);
  };

  const confirmRename = () => {
    if (renamingId && renameInput.trim() && onRenameSession) {
      onRenameSession(renamingId, renameInput.trim());
    }
    setRenamingId(null);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameInput("");
  };

  const handleDelete = (id: string) => {
    if (onDeleteSession) onDeleteSession(id);
  };

  return (
    <>
      {/* Mobile toggle — positioned after main sidebar (left-16 ≈ 64px) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-4 left-16 z-30 p-2 rounded-xl bg-[var(--bg-800)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors shadow-lg"
        title="Open chat history"
      >
        <Bot className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Single sidebar element — positioned differently for mobile vs desktop via CSS */}
      <div
        className={cn(
          "bg-[var(--bg-900)] border-r border-[var(--border-subtle)] flex flex-col h-full shrink-0 transition-[width] duration-300 ease-in-out overflow-hidden",
          /* Mobile: fixed slide-in */
          "max-md:fixed max-md:top-0 max-md:left-0 max-md:z-50 max-md:transition-transform max-md:duration-300",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          /* Desktop: always visible */
          "md:translate-x-0"
        )}
        style={{ width: collapsed ? "64px" : "240px" }}
      >
        {/* ── Header ── */}
        <div
          className={cn(
            "flex items-center h-14 border-b border-[var(--border-subtle)] shrink-0",
            collapsed ? "justify-center" : "px-4 justify-between"
          )}
        >
          {collapsed ? (
            <Bot className="w-5 h-5 text-[var(--accent)]" />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-[var(--accent)]" />
                <span className="font-bold text-[var(--text-primary)] tracking-tight text-[15px]">
                  Chats
                </span>
              </div>
              <button
                onClick={toggleCollapsed}
                title="Collapse sidebar"
                className="p-1.5 rounded-lg text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {/* ── New Chat CTA ── */}
        <div className={cn("shrink-0", collapsed ? "py-3 flex justify-center" : "p-2 pt-3")}>
          {collapsed ? (
            <button
              onClick={onNewChat}
              title="New Chat"
              className="w-10 h-10 rounded-lg flex items-center justify-center text-[var(--accent)] hover:bg-[var(--accent-subtle)] transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onNewChat}
              className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--border-subtle)] bg-transparent text-[var(--accent)] hover:bg-[var(--bg-700)] font-medium transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              New Chat
            </button>
          )}
        </div>

        {/* ── Session list ── */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-1 flex flex-col gap-0.5 min-h-0 custom-scrollbar",
            collapsed ? "items-center px-0" : "px-2"
          )}
          aria-label="Chat sessions"
        >
          {sessions.map((s) => {
            const isActive = activeSessionId === s.id;
            const isRenaming = renamingId === s.id;

            if (isRenaming && !collapsed) {
              return (
                <div key={s.id} className="flex items-center gap-1 px-2 py-1">
                  <input
                    ref={renameRef}
                    value={renameInput}
                    aria-label="Rename session"
                    placeholder="Session name"
                    onChange={(e) => setRenameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") confirmRename();
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="flex-1 min-w-0 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                  />
                  <button onClick={confirmRename} aria-label="Confirm rename" className="p-1 rounded-lg text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"><Check className="w-3.5 h-3.5" aria-hidden="true" /></button>
                  <button onClick={cancelRename} aria-label="Cancel rename" className="p-1 rounded-lg text-[var(--text-dim)] hover:bg-[var(--surface-2)] transition-colors"><X className="w-3.5 h-3.5" aria-hidden="true" /></button>
                </div>
              );
            }

            return (
              <div key={s.id} className="relative group/sess">
                <button
                  onClick={() => {
                    onSelectSession(s.id);
                    setMobileOpen(false);
                  }}
                  title={collapsed ? s.title : undefined}
                  className={sessionCls(isActive)}
                >
                  {collapsed ? (
                    <span className="text-xs font-bold">{s.title?.[0]?.toUpperCase() ?? "C"}</span>
                  ) : (
                    <span className="truncate">{s.title}</span>
                  )}
                </button>
                {/* Hover actions (expanded only) */}
                {!collapsed && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover/sess:opacity-100 transition-opacity">
                    {onRenameSession && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startRename(s); }}
                        className="p-1 rounded-lg text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--surface-2)] transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    )}
                    {onDeleteSession && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                        className="p-1 rounded-lg text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* ── Expand button (collapsed only) ── */}
        {collapsed && (
          <div className="py-3 flex justify-center">
            <button
              onClick={toggleCollapsed}
              title="Expand sidebar"
              className="w-10 h-10 rounded-xl flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
