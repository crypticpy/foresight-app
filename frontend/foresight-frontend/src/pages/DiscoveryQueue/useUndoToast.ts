/**
 * Toast visibility + 100ms-tick countdown for the undo toast. Separates the
 * "is the toast on screen, how many ms left" state from the undo stack so the
 * stack hook stays pure and the timer can be torn down independently on
 * unmount.
 *
 * @module pages/DiscoveryQueue/useUndoToast
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { UNDO_TIMEOUT_MS } from "./types";

const TICK_INTERVAL_MS = 100;

export interface UseUndoToastResult {
  visible: boolean;
  /** Milliseconds remaining until auto-dismiss; drives the progress bar. */
  timeRemaining: number;
  /** Show the toast and start (or restart) the countdown timer. */
  show: () => void;
  /** Hide the toast and tear down the timer. */
  dismiss: () => void;
}

export function useUndoToast(): UseUndoToastResult {
  const [visible, setVisible] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(UNDO_TIMEOUT_MS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    setVisible(true);
    setTimeRemaining(UNDO_TIMEOUT_MS);

    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, UNDO_TIMEOUT_MS - elapsed);
      setTimeRemaining(remaining);

      if (remaining <= 0) {
        setVisible(false);
        clearTimer();
      }
    }, TICK_INTERVAL_MS);
  }, [clearTimer]);

  const dismiss = useCallback(() => {
    setVisible(false);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    return clearTimer;
  }, [clearTimer]);

  return { visible, timeRemaining, show, dismiss };
}
