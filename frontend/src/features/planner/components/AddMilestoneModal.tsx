"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Flag } from "lucide-react";

interface AddMilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; description: string; target_date: string | null; status: string }) => void;
}

export function AddMilestoneModal({ isOpen, onClose, onSubmit }: AddMilestoneModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title,
      description,
      target_date: date || null,
      status: "pending",
    });
    // Reset
    setTitle("");
    setDescription("");
    setDate("");
    onClose();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-lg bg-[var(--surface-1)] rounded-[32px] overflow-hidden shadow-2xl border border-[var(--border-subtle)]"
        >
          <header className="p-8 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
                <Flag className="w-7 h-7 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">New Milestone</h2>
                <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">Mission Checkpoint</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-700)] rounded-xl transition-colors">
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Milestone Name</label>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Alpha Release, Beta Launch..."
                className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Target Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What defines this milestone?"
                className="w-full h-24 bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all resize-none"
              />
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-14 rounded-2xl bg-[var(--surface-2)] text-[var(--text-secondary)] font-bold transition-all border border-[var(--border-subtle)] hover:bg-[var(--surface-3)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-[2] h-14 bg-[var(--accent)] text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 transition-all shadow-xl shadow-[var(--accent-glow)]"
              >
                Create Milestone
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
