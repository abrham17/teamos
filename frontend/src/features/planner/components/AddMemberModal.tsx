"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, UserPlus, Shield, Search } from "lucide-react";
import { TeamMember } from "../types";

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (userId: string, role: string) => void;
  teamMembers: TeamMember[];
  alreadyInProjectIds: string[];
  initialUserId?: string | null;
  initialRole?: string;
}

export function AddMemberModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  teamMembers, 
  alreadyInProjectIds,
  initialUserId = null,
  initialRole = "Contributor"
}: AddMemberModalProps) {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(initialUserId);
  const [role, setRole] = useState(initialRole);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedUserId(initialUserId);
      setRole(initialRole);
    }
  }, [isOpen, initialUserId, initialRole]);

  const filteredMembers = teamMembers.filter(m => {
    const nameMatch = (m.user.first_name || "").toLowerCase().includes(search.toLowerCase()) || 
                      (m.user.email || "").toLowerCase().includes(search.toLowerCase());
    const notInProject = !alreadyInProjectIds.includes(m.user.id);
    return nameMatch && notInProject;
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !role.trim()) return;
    onSubmit(selectedUserId, role);
    setSelectedUserId(null);
    setRole("Contributor");
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
          className="relative w-full max-w-xl bg-[var(--surface-1)] rounded-[32px] overflow-hidden shadow-2xl border border-[var(--border-subtle)]"
        >
          <header className="p-8 pb-4 flex items-center justify-between border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-[var(--accent-subtle)] flex items-center justify-center">
                <UserPlus className="w-7 h-7 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
                  {initialUserId ? "Edit Project Role" : "Add Project Member"}
                </h2>
                <p className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-muted)]">
                  {initialUserId ? "Member Permissions" : "Strategic Allocation"}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-700)] rounded-xl transition-colors">
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </header>

          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {!initialUserId && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search team members..."
                    className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl py-3 pl-11 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all"
                  />
                </div>

                <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                  {filteredMembers.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedUserId(member.user.id)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${
                        selectedUserId === member.user.id
                          ? "bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--accent)]"
                          : "bg-[var(--bg-900)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--text-dim)]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-[10px] font-black border border-[var(--border-subtle)]">
                          {member.user.first_name?.substring(0, 2).toUpperCase() || member.user.email?.substring(0, 2).toUpperCase()}
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold">{member.user.first_name || member.user.email}</p>
                          <p className="text-[10px] opacity-60 font-medium">{member.role}</p>
                        </div>
                      </div>
                      {selectedUserId === member.user.id && <div className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />}
                    </button>
                  ))}
                  {filteredMembers.length === 0 && (
                    <div className="py-8 text-center text-[10px] font-bold text-[var(--text-dim)] uppercase tracking-widest border-2 border-dashed border-[var(--border-subtle)] rounded-2xl">
                      No available members found
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                <Shield className="w-3 h-3" />
                Project Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full bg-[var(--bg-900)] border border-[var(--border-subtle)] rounded-xl p-4 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-subtle)] transition-all appearance-none"
              >
                <option value="Lead">Project Lead</option>
                <option value="Architect">Architect</option>
                <option value="Contributor">Contributor</option>
                <option value="Reviewer">Reviewer</option>
                <option value="Stakeholder">Stakeholder</option>
              </select>
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
                disabled={!selectedUserId}
                className="flex-[2] h-14 bg-[var(--accent)] text-white font-bold rounded-2xl flex items-center justify-center gap-3 hover:opacity-90 disabled:opacity-30 transition-all shadow-xl shadow-[var(--accent-glow)]"
              >
                {initialUserId ? "Save Changes" : "Add Member"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
