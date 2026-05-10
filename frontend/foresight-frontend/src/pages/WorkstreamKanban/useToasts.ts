/**
 * Hook that owns the toast-notification queue used throughout the
 * WorkstreamKanban composer. Returns the current list plus `showToast` /
 * `dismissToast` helpers — both stable across renders so they're safe to
 * pass into the various action hooks (`useQuickUpdate`, `useCardExport`,
 * etc.) without re-subscribing.
 *
 * @module pages/WorkstreamKanban/useToasts
 */

import { useCallback, useRef, useState } from "react";
import type { ToastNotification, ToastType } from "./types";

export interface UseToastsResult {
  toasts: ToastNotification[];
  showToast: (type: ToastType, message: string) => void;
  dismissToast: (id: string) => void;
}

export function useToasts(): UseToastsResult {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const toastIdRef = useRef(0);

  const showToast = useCallback((type: ToastType, message: string) => {
    const id = `toast-${toastIdRef.current++}`;
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, showToast, dismissToast };
}
