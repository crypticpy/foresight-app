/**
 * Wires the j/k/f/d/z keyboard shortcuts for the discovery queue. Form-field
 * inputs are excluded (`enableOnFormTags: false`); a shared `canExecuteAction`
 * debounce guards against rapid double-fires.
 *
 * @module pages/DiscoveryQueue/useDiscoveryHotkeys
 */

import { useCallback, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { ACTION_DEBOUNCE_MS } from "./types";

export interface UseDiscoveryHotkeysArgs {
  navigateNext: () => void;
  navigatePrevious: () => void;
  /** True if there's a card to act on and no in-flight action. */
  canAct: boolean;
  approveFocused: () => void;
  dismissFocused: () => void;
  /** True if the toast is open and there's an undoable action available. */
  canUndo: boolean;
  undo: () => void;
}

export function useDiscoveryHotkeys({
  navigateNext,
  navigatePrevious,
  canAct,
  approveFocused,
  dismissFocused,
  canUndo,
  undo,
}: UseDiscoveryHotkeysArgs): void {
  const lastActionTimeRef = useRef<number>(0);

  /** True if enough time has passed since the last action to allow another. */
  const canExecuteAction = useCallback((): boolean => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < ACTION_DEBOUNCE_MS) return false;
    lastActionTimeRef.current = now;
    return true;
  }, []);

  const hotkeyOptions = useMemo(
    () => ({
      preventDefault: true,
      enableOnFormTags: false,
    }),
    [],
  );

  useHotkeys("j", navigateNext, hotkeyOptions, [navigateNext]);
  useHotkeys("k", navigatePrevious, hotkeyOptions, [navigatePrevious]);

  useHotkeys(
    "f",
    () => {
      if (canAct && canExecuteAction()) approveFocused();
    },
    hotkeyOptions,
    [canAct, approveFocused, canExecuteAction],
  );

  useHotkeys(
    "d",
    () => {
      if (canAct && canExecuteAction()) dismissFocused();
    },
    hotkeyOptions,
    [canAct, dismissFocused, canExecuteAction],
  );

  useHotkeys(
    "z",
    () => {
      if (canUndo && canExecuteAction()) undo();
    },
    hotkeyOptions,
    [canUndo, undo, canExecuteAction],
  );
}
