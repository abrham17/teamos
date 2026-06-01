"use client";

import { type ReactNode } from "react";

interface DrawerContainerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function DrawerContainer({ isOpen, onClose, title, children }: DrawerContainerProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-40 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div
        className="w-[420px] bg-[#0d0d12] border-l border-[rgba(255,255,255,0.07)] shadow-[-8px_0_32px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between shrink-0">
          <h2 className="text-[13px] font-semibold text-[#eeeef2]">{title}</h2>
          <button
            onClick={onClose}
            className="bg-transparent border-none cursor-pointer text-[#62627a] hover:text-[#a0a0b8] p-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
