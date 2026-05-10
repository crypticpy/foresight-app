/**
 * Owns the export hook's mutable state and the refs required to
 * cancel in-flight fetches, clear progress intervals, and detect
 * stale updates after unmount or after a new export starts.
 *
 * @module hooks/useExportWithProgress/useExportLifecycle
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { initialState, type ExportState } from "./state";

export interface ExportLifecycle {
  state: ExportState;
  /** Apply a partial state update if still mounted. */
  updateState: (updates: Partial<ExportState>) => void;
  /** Reset to the initial state if still mounted. */
  resetState: () => void;
  /** Abort any active fetch and clear the progress interval. */
  cleanupExport: () => void;
  /**
   * Start tracking a new export. Increments the export id, returns a
   * checker that's true only while this export is still the current one
   * and the component is still mounted.
   */
  beginExport: () => () => boolean;
  isMountedRef: React.MutableRefObject<boolean>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  progressIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  revokeTimeoutRef: React.MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
}

export function useExportLifecycle(): ExportLifecycle {
  const [state, setState] = useState<ExportState>(initialState);

  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const revokeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exportIdRef = useRef<number>(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (revokeTimeoutRef.current) {
        clearTimeout(revokeTimeoutRef.current);
        revokeTimeoutRef.current = null;
      }
    };
  }, []);

  const updateState = useCallback((updates: Partial<ExportState>) => {
    if (isMountedRef.current) {
      setState((prev) => ({ ...prev, ...updates }));
    }
  }, []);

  const resetState = useCallback(() => {
    if (isMountedRef.current) {
      setState(initialState);
    }
  }, []);

  const cleanupExport = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const beginExport = useCallback(() => {
    const id = ++exportIdRef.current;
    return () => exportIdRef.current === id && isMountedRef.current;
  }, []);

  return {
    state,
    updateState,
    resetState,
    cleanupExport,
    beginExport,
    isMountedRef,
    abortControllerRef,
    progressIntervalRef,
    revokeTimeoutRef,
  };
}
