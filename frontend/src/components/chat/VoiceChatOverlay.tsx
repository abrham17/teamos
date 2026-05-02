"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { Mic, MicOff, Sparkles, X } from "lucide-react";

import { graphChromePrefersReducedMotion } from "@/lib/graphChromeMotion";

export type VoiceOverlayPhase = "idle" | "listening" | "thinking" | "speaking";

interface Props {
  open: boolean;
  onClose: () => void;
  phase: VoiceOverlayPhase;
  caption: string;
  interimTranscript: string;
  listening: boolean;
  speechSupported: boolean;
  /** Disable mic while a reply is streaming */
  micDisabled?: boolean;
  onToggleMic: () => void;
}

export function VoiceChatOverlay({
  open,
  onClose,
  phase,
  caption,
  interimTranscript,
  listening,
  speechSupported,
  micDisabled = false,
  onToggleMic,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const orbRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  /* Pop-in when opened */
  useEffect(() => {
    if (!open || !shellRef.current || graphChromePrefersReducedMotion()) return;
    const el = shellRef.current;
    const a = animate(el, {
      scale: [0.88, 1],
      opacity: [0, 1],
      duration: 480,
      ease: "outCubic",
    });
    return () => {
      try {
        a.revert();
      } catch {
        /* ignore */
      }
    };
  }, [open]);

  /* “Talking” pulse on the orb (anime.js loop) */
  useEffect(() => {
    if (!open || !orbRef.current || graphChromePrefersReducedMotion()) return;
    const pulse =
      phase === "listening" || phase === "thinking" || phase === "speaking" || listening;
    if (!pulse) return;
    const el = orbRef.current;
    const big = phase === "speaking" ? 1.1 : phase === "thinking" ? 1.06 : 1.05;
    const a = animate(el, {
      scale: [1, big, 1],
      duration: phase === "listening" ? 720 : 900,
      ease: "inOutSine",
      loop: true,
      alternate: true,
    });
    return () => {
      try {
        a.revert();
      } catch {
        /* ignore */
      }
    };
  }, [open, phase, listening]);

  /* Outer ring shimmer while model is “thinking” or streaming */
  useEffect(() => {
    if (!open || !ringRef.current || graphChromePrefersReducedMotion()) return;
    if (phase !== "thinking" && phase !== "speaking") return;
    const el = ringRef.current;
    const a = animate(el, {
      rotate: [0, 360],
      duration: 14000,
      ease: "linear",
      loop: true,
    });
    return () => {
      try {
        a.revert();
      } catch {
        /* ignore */
      }
    };
  }, [open, phase]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--bg-950)]/85 backdrop-blur-md p-6 motion-reduce:backdrop-blur-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-chat-title"
    >
      <div
        ref={shellRef}
        className="relative flex w-full max-w-lg flex-col items-center gap-8 rounded-[2rem] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-8 py-10 shadow-[var(--shadow-lg)]"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
          aria-label="Close voice chat"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-800)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-dim)]">
            <Sparkles className="h-3 w-3 text-[var(--accent)]" />
            Voice mode
          </div>
          <h2 id="voice-chat-title" className="text-xl font-bold text-[var(--text-primary)]">
            Ask out loud
          </h2>
          <p className="max-w-sm text-sm text-[var(--text-muted)]">
            Tap the mic, speak your question, then we&apos;ll search your wiki and answer. The orb animates while we
            listen and respond—like a voice assistant panel.
          </p>
        </div>

        <div className="relative flex h-52 w-52 items-center justify-center">
          <div
            ref={ringRef}
            className="absolute inset-0 rounded-full border-2 border-dashed border-[var(--accent)]/35 opacity-80"
            aria-hidden
          />
          <div
            ref={orbRef}
            className="relative flex h-40 w-40 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] via-[#a855f7] to-[#22c55e] shadow-[0_0_60px_rgba(0,212,232,0.35)]"
          >
            <Mic className="h-14 w-14 text-[var(--bg-950)] drop-shadow-md" aria-hidden />
          </div>
        </div>

        <div className="min-h-[4.5rem] w-full rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-900)] px-4 py-3 text-center text-sm text-[var(--text-secondary)]">
          {caption ? <p className="leading-relaxed">{caption}</p> : null}
          {interimTranscript ? (
            <p className="mt-2 text-xs italic text-[var(--text-dim)]">{interimTranscript}</p>
          ) : null}
        </div>

        {!speechSupported ? (
          <p className="text-center text-xs text-amber-400/90">
            Speech recognition isn&apos;t available in this browser. Use Chrome or Edge on desktop, or type in the
            main chat.
          </p>
        ) : (
          <button
            type="button"
            onClick={onToggleMic}
            disabled={micDisabled && !listening}
            className={`flex items-center gap-3 rounded-2xl px-8 py-4 text-sm font-semibold transition-all ${
              listening
                ? "bg-red-500/20 text-red-300 ring-2 ring-red-400/50 hover:bg-red-500/30"
                : "bg-[var(--accent-subtle)] text-[var(--accent)] ring-2 ring-[var(--accent)]/40 hover:bg-[var(--accent)]/20"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {listening ? (
              <>
                <MicOff className="h-5 w-5" />
                Stop listening
              </>
            ) : (
              <>
                <Mic className="h-5 w-5" />
                Tap to speak
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
