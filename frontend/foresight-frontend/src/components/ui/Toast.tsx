/**
 * Toast — lightweight transient notification system.
 *
 * Hand-rolled (no `sonner`/`react-hot-toast`) so the bundle stays slim.
 * Three pieces:
 *
 *   1. `ToastProvider` — context provider; mount once near the app root.
 *   2. `ToastViewport` — fixed-position render slot (rendered *inside*
 *      the provider via the same component, so consumers don't have to
 *      mount it separately).
 *   3. `useToast` — hook returning `{ pushToast, dismissToast }`.
 *
 * A toast auto-dismisses after `duration` ms (default 4000). Pass
 * `duration: 0` for sticky toasts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "../../lib/utils";

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  variant?: ToastVariant;
  /** Auto-dismiss after this many ms. Pass 0 to make sticky. Default: 4000. */
  duration?: number;
}

interface ToastRecord {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastContextValue {
  pushToast: (message: string, options?: ToastOptions) => number;
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used inside a <ToastProvider>");
  }
  return ctx;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { ring: string; icon: typeof CheckCircle2; iconColor: string }
> = {
  success: {
    ring: "ring-emerald-500/30",
    icon: CheckCircle2,
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    ring: "ring-red-500/30",
    icon: AlertTriangle,
    iconColor: "text-red-600 dark:text-red-400",
  },
  info: {
    ring: "ring-brand-blue/30",
    icon: Info,
    iconColor: "text-brand-blue",
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      idRef.current += 1;
      const id = idRef.current;
      const record: ToastRecord = {
        id,
        message,
        variant: options.variant ?? "info",
        duration: options.duration ?? 4000,
      };
      setToasts((prev) => [...prev, record]);
      if (record.duration > 0) {
        const timer = setTimeout(() => dismissToast(id), record.duration);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismissToast],
  );

  // Capture timers ref at effect-mount time so cleanup doesn't observe a
  // mutated ref.current after unmount.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ pushToast, dismissToast }),
    [pushToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

interface ToastViewportProps {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}

function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const { icon: Icon, ring, iconColor } = VARIANT_STYLES[toast.variant];
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto",
              "flex items-start gap-3 max-w-sm",
              "px-4 py-3 rounded-xl shadow-lg ring-1",
              "bg-white dark:bg-dark-surface-elevated",
              "text-gray-800 dark:text-gray-100",
              "animate-in slide-in-from-right-4 fade-in duration-200",
              ring,
            )}
            role="status"
          >
            <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", iconColor)} />
            <div className="flex-1 text-sm">{toast.message}</div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="flex-shrink-0 rounded p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
