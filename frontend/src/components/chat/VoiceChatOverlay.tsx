"use client";

import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, X, Sparkles } from "lucide-react";

export type VoiceOverlayPhase = "idle" | "listening" | "thinking";

interface VoiceChatOverlayProps {
  open: boolean;
  onClose: () => void;
  phase: VoiceOverlayPhase;
  caption: string;
  interimTranscript: string;
  listening: boolean;
  speechSupported: boolean;
  micDisabled: boolean;
  onOrbClick: () => void;
}

export function VoiceChatOverlay({
  open,
  onClose,
  phase,
  caption,
  interimTranscript,
  listening,
  speechSupported,
  micDisabled,
  onOrbClick,
}: VoiceChatOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
        >
          {/* Main Card */}
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg bg-[var(--surface-1)] border border-[var(--border-subtle)] rounded-[32px] p-8 shadow-2xl text-center space-y-8 overflow-hidden"
          >
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-[var(--accent)]/10 rounded-full blur-[60px]" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-[60px]" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute right-6 top-6 p-2 rounded-xl text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title / Status */}
            <div className="space-y-1">
              <h3 className="text-lg font-black text-[var(--text-primary)] tracking-tight">Voice Assistant</h3>
              <p className="text-xs text-[var(--text-muted)] font-medium">
                {!speechSupported
                  ? "Speech recognition is not supported by your browser."
                  : phase === "listening"
                  ? "Listening... speak now"
                  : phase === "thinking"
                  ? "Processing speech..."
                  : "Ready. Tap the mic to talk."}
              </p>
            </div>

            {/* Animated Interactive Orb / Mic Button */}
            <div className="flex justify-center py-6">
              <div className="relative">
                {/* Wave Rings when listening or thinking */}
                {(phase === "listening" || phase === "thinking") && (
                  <>
                    <motion.div
                      animate={{ scale: [1, 1.8], opacity: [0.4, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full bg-[var(--accent)]/20"
                    />
                    <motion.div
                      animate={{ scale: [1, 1.5], opacity: [0.3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
                      className="absolute inset-0 rounded-full bg-purple-500/20"
                    />
                  </>
                )}

                {/* Orb Button */}
                <button
                  onClick={onOrbClick}
                  disabled={!speechSupported || micDisabled}
                  className={`
                    relative w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl
                    ${!speechSupported || micDisabled
                      ? "bg-[var(--surface-3)] text-[var(--text-dim)] border border-[var(--border-subtle)]"
                      : phase === "listening"
                      ? "bg-gradient-to-tr from-[var(--accent)] to-purple-600 text-white hover:scale-105"
                      : phase === "thinking"
                      ? "bg-gradient-to-tr from-purple-600 to-pink-500 text-white hover:scale-105"
                      : "bg-[var(--surface-2)] text-[var(--text-primary)] border border-[var(--border-subtle)] hover:border-[var(--accent-subtle)] hover:bg-[var(--surface-3)] hover:scale-105"
                    }
                  `}
                >
                  <AnimatePresence mode="wait">
                    {!speechSupported ? (
                      <motion.div
                        key="supported"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <MicOff className="w-8 h-8" />
                      </motion.div>
                    ) : phase === "thinking" ? (
                      <motion.div
                        key="thinking"
                        initial={{ opacity: 0, rotate: 0 }}
                        animate={{ opacity: 1, rotate: 360 }}
                        exit={{ opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      >
                        <Sparkles className="w-8 h-8" />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="normal"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                      >
                        <Mic className={`w-8 h-8 ${phase === "listening" ? "animate-pulse" : ""}`} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>

            {/* Transcript Display Section */}
            <div className="min-h-16 px-4 py-3 bg-[var(--surface-2)] border border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center max-w-sm mx-auto">
              {interimTranscript ? (
                <p className="text-xs text-[var(--text-primary)] italic leading-relaxed break-words w-full">
                  &ldquo;{interimTranscript}&rdquo;
                </p>
              ) : caption ? (
                <p className="text-xs text-[var(--text-muted)] font-medium leading-relaxed break-words w-full">
                  Last input: &ldquo;{caption}&rdquo;
                </p>
              ) : (
                <p className="text-[10px] text-[var(--text-dim)] font-black uppercase tracking-wider">
                  No active voice stream
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
