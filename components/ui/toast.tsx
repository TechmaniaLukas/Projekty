"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";

interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

interface ToastApi {
  show: (input: {
    title: string;
    description?: string;
    tone?: ToastTone;
    duration?: number;
  }) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    ({ title, description, tone = "info", duration = 3500 }) => {
      counter.current += 1;
      const id = counter.current;
      setItems((arr) => [...arr, { id, title, description, tone, duration }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) =>
        show({ title, description, tone: "success" }),
      error: (title, description) =>
        show({ title, description, tone: "error", duration: 6000 }),
      info: (title, description) => show({ title, description, tone: "info" }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within <ToastProvider>");
  }
  return ctx;
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [enter, setEnter] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setEnter(true), 10);
    return () => clearTimeout(t);
  }, []);

  const Icon =
    toast.tone === "success"
      ? CheckCircle2
      : toast.tone === "error"
        ? AlertCircle
        : Info;

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-white px-4 py-3 shadow-lg transition-all duration-200 dark:bg-slate-900",
        enter ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
        toast.tone === "success" && "border-emerald-200 dark:border-emerald-800",
        toast.tone === "error" && "border-red-200 dark:border-red-800",
        toast.tone === "info" && "border-slate-200 dark:border-slate-700",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          toast.tone === "success" && "text-emerald-600",
          toast.tone === "error" && "text-red-600",
          toast.tone === "info" && "text-slate-600",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {toast.title}
        </div>
        {toast.description && (
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
            {toast.description}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        aria-label="Zavřít"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
