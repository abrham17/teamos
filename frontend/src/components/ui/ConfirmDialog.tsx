"use client";

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle, Info } from "lucide-react";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: "danger" | "primary" | "warning";
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  type = "primary",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  const getThemeColor = () => {
    switch (type) {
      case "danger":
        return {
          bg: "bg-[var(--danger-bg)]/30",
          text: "text-[var(--danger)]",
          border: "border-[var(--danger)]/30",
          btnBg: "bg-[var(--danger)]",
          btnHover: "hover:bg-[var(--danger)]/90",
          Icon: AlertTriangle,
        };
      case "warning":
        return {
          bg: "bg-[var(--warning-bg)]/30",
          text: "text-[var(--warning)]",
          border: "border-[var(--warning)]/30",
          btnBg: "bg-[var(--warning)]",
          btnHover: "hover:bg-[var(--warning)]/90",
          Icon: AlertTriangle,
        };
      default:
        return {
          bg: "bg-[var(--accent-subtle)]",
          text: "text-[var(--accent)]",
          border: "border-[var(--accent)]/30",
          btnBg: "bg-[var(--accent)]",
          btnHover: "hover:bg-[var(--accent)]/90",
          Icon: Info,
        };
    }
  };

  const theme = getThemeColor();
  const IconComponent = theme.Icon;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          className="relative w-full max-w-md bg-[var(--surface-1)] rounded-[24px] overflow-hidden shadow-2xl border border-[var(--border-subtle)] z-10"
        >
          <header className="p-6 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${theme.bg} flex items-center justify-center border ${theme.border}`}>
                <IconComponent className={`w-5 h-5 ${theme.text}`} />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg transition-colors">
              <X className="w-4.5 h-4.5 text-[var(--text-muted)]" />
            </button>
          </header>

          <div className="p-6 space-y-6">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-semibold border border-[var(--border-subtle)] transition-all hover:bg-[var(--surface-3)]"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`flex-1 h-11 text-white font-semibold rounded-xl flex items-center justify-center transition-all ${theme.btnBg} ${theme.btnHover} shadow-md`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
