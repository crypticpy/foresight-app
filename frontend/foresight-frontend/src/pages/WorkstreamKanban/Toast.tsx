/**
 * Toast notification renderer used by the WorkstreamKanban page. The
 * `ToastContainer` is the bottom-right stack; `Toast` is a single entry
 * that auto-dismisses itself after 4s.
 *
 * State is owned by `useToasts` — these components are pure renderers.
 *
 * @module pages/WorkstreamKanban/Toast
 */

import { useEffect } from "react";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ToastNotification } from "./types";

const TOAST_DISMISS_MS = 4000;

const ICON_CLASS = "h-5 w-5 flex-shrink-0";

const BG_BY_TYPE: Record<ToastNotification["type"], string> = {
  success:
    "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700",
  error: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700",
  info: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700",
};

function ToastIcon({ type }: { type: ToastNotification["type"] }) {
  switch (type) {
    case "success":
      return <CheckCircle2 className={cn(ICON_CLASS, "text-green-500")} />;
    case "error":
      return <XCircle className={cn(ICON_CLASS, "text-red-500")} />;
    case "info":
      return <Sparkles className={cn(ICON_CLASS, "text-brand-blue")} />;
  }
}

interface ToastProps {
  notification: ToastNotification;
  onDismiss: (id: string) => void;
}

export function Toast({ notification, onDismiss }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, TOAST_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300",
        BG_BY_TYPE[notification.type],
      )}
      role="alert"
    >
      <ToastIcon type={notification.type} />
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {notification.message}
      </p>
      <button
        onClick={() => onDismiss(notification.id)}
        className="ml-auto p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
        aria-label="Dismiss notification"
      >
        <XCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  notifications: ToastNotification[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({
  notifications,
  onDismiss,
}: ToastContainerProps) {
  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}
