"use client";

import { useRef } from "react";
import { Mic, ArrowUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputBarProps {
  inputText: string;
  setInputText: (text: string) => void;
  onSend: () => void;
  loading: boolean;
  isListening: boolean;
  onStartVoice: () => void;
  placeholder?: string;
}

export function InputBar({
  inputText,
  setInputText,
  onSend,
  loading,
  isListening,
  onStartVoice,
  placeholder = "Describe a project plan or ask a question...",
}: InputBarProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        value={inputText}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={isListening ? "" : placeholder}
        className="w-full bg-white/5 border border-white/10 rounded-2xl py-3.5 pl-4 pr-24 text-sm text-white focus:outline-none focus:border-[var(--accent)]/50 transition-all placeholder:text-[var(--text-dim)] shadow-none resize-none overflow-hidden"
        style={{ maxHeight: "120px" }}
        title="AI Planner prompt"
      />

      {isListening && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
          <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
          <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider animate-pulse">Listening...</span>
          <div className="flex items-end gap-0.5 h-3 ml-1.5">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className="w-0.5 bg-rose-500 rounded-full animate-bounce"
                style={{
                  height: "100%",
                  animationDuration: `${0.4 + n * 0.1}s`,
                  animationDelay: `${n * 0.05}s`
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="absolute right-2 bottom-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onStartVoice}
          title={isListening ? "Stop voice input" : "Start voice input"}
          aria-label={isListening ? "Stop voice input" : "Start voice input"}
          className={cn(
            "p-2 rounded-xl transition-all border border-transparent",
            isListening 
              ? "text-rose-500 bg-rose-500/10 hover:bg-rose-500/20" 
              : "text-[var(--text-dim)] hover:text-white hover:bg-white/5"
          )}
        >
          <Mic size={16} />
        </button>
        <button
          onClick={onSend}
          disabled={!inputText.trim() || loading}
          title="Send message"
          aria-label="Send message"
          className="p-2 bg-[var(--accent)] text-[var(--bg-950)] rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-none"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
        </button>
      </div>
    </div>
  );
}
