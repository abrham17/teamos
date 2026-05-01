"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { X, CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toast: () => {},
  success: () => {},
  error: () => {},
  info: () => {},
  warning: () => {},
});

const ICON_MAP = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const STYLE_MAP: Record<ToastType, { border: string; icon: string; bg: string }> = {
  success: { bg: "var(--success-bg)", border: "var(--success)", icon: "var(--success)" },
  error:   { bg: "var(--danger-bg)",  border: "var(--danger)",  icon: "var(--danger)"  },
  info:    { bg: "var(--info-bg)",    border: "var(--info)",    icon: "var(--info)"    },
  warning: { bg: "var(--warning-bg)", border: "var(--warning)", icon: "var(--warning)" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback(
    (type: ToastType, message: string, duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts(prev => [...prev, { id, type, message }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss]
  );

  const success = useCallback((msg: string) => toast("success", msg), [toast]);
  const error   = useCallback((msg: string) => toast("error", msg),   [toast]);
  const info    = useCallback((msg: string) => toast("info", msg),    [toast]);
  const warning = useCallback((msg: string) => toast("warning", msg), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}

      {/* Toast container */}
      <div
        className="fixed bottom-6 right-6 z-[300] flex flex-col gap-3 pointer-events-none"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map(t => {
          const Icon = ICON_MAP[t.type];
          const s = STYLE_MAP[t.type];
          return (
            <div
              key={t.id}
              role="alert"
              className="flex items-start gap-3 pl-4 pr-3 py-3 rounded-xl border backdrop-blur-sm min-w-[280px] max-w-sm pointer-events-auto"
              style={{
                background: s.bg,
                borderColor: s.border,
                boxShadow: "var(--shadow-lg)",
                animation: "toast-in 0.28s cubic-bezier(0.25,1.2,0.4,1) both",
              }}
            >
              <Icon className="w-5 h-5 mt-0.5 shrink-0" style={{ color: s.icon }} />
              <p className="flex-1 text-sm text-[var(--text-primary)] leading-snug">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0 p-0.5"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
