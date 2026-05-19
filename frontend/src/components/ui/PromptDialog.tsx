"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, AlertTriangle } from "lucide-react";

export interface PromptDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
  title: string;
  message: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  validationValue?: string; // Optional: value that input must match exactly
}

export function PromptDialog({
  isOpen,
  onClose,
  onSubmit,
  title,
  message,
  placeholder = "Type here...",
  confirmLabel = "Submit",
  cancelLabel = "Cancel",
  validationValue,
}: PromptDialogProps) {
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (isOpen) {
      setInputValue("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validationValue && inputValue !== validationValue) return;
    onSubmit(inputValue);
    onClose();
  };

  const isInvalid = validationValue ? inputValue !== validationValue : !inputValue.trim();

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
              <div className="w-10 h-10 rounded-xl bg-[var(--danger-bg)]/30 flex items-center justify-center border border-[var(--danger)]/30">
                <AlertTriangle className="w-5 h-5 text-[var(--danger)]" />
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[var(--surface-2)] rounded-lg transition-colors">
              <X className="w-4.5 h-4.5 text-[var(--text-muted)]" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{message}</p>
              
              {validationValue && (
                <div className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                  Type: <span className="text-[var(--text-primary)] select-all">&quot;{validationValue}&quot;</span>
                </div>
              )}

              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-3 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all text-sm"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-11 rounded-xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-semibold border border-[var(--border-subtle)] transition-all hover:bg-[var(--surface-3)]"
              >
                {cancelLabel}
              </button>
              <button
                type="submit"
                disabled={isInvalid}
                className="flex-1 h-11 text-white font-semibold rounded-xl flex items-center justify-center transition-all bg-[var(--danger)] hover:bg-[var(--danger)]/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                {confirmLabel}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
