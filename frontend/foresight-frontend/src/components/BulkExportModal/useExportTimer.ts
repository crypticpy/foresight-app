/**
 * Elapsed-time timer for the bulk-export modal. Starts when `isExporting`
 * flips to true and clears on the way back; surfaces a "long export"
 * boolean once we cross the warning threshold.
 *
 * @module components/BulkExportModal/useExportTimer
 */

import { useEffect, useRef, useState } from "react";

import { LONG_EXPORT_WARNING_THRESHOLD } from "./constants";

export interface UseExportTimerReturn {
  elapsedTime: number;
  showLongExportWarning: boolean;
}

export function useExportTimer(isExporting: boolean): UseExportTimerReturn {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showLongExportWarning, setShowLongExportWarning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const exportStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (isExporting) {
      exportStartRef.current = Date.now();
      setElapsedTime(0);
      setShowLongExportWarning(false);

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor(
          (Date.now() - (exportStartRef.current || Date.now())) / 1000,
        );
        setElapsedTime(elapsed);
        if (elapsed > LONG_EXPORT_WARNING_THRESHOLD) {
          setShowLongExportWarning(true);
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      exportStartRef.current = null;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isExporting]);

  return { elapsedTime, showLongExportWarning };
}
