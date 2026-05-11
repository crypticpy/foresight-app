/**
 * LIFO undo stack for review actions. Stores up to a small set of recent
 * `UndoAction`s (with their full `PendingCard` payload), expires any past
 * `UNDO_TIMEOUT_MS`, and lets callers restore the card to the list when the
 * user hits Undo.
 *
 * State ownership:
 * - `undoStack` is owned here.
 * - Restoring a card to the queue is delegated via the `restoreCard` callback
 *   so the host page keeps owning `cards`.
 *
 * @module pages/DiscoveryQueue/useUndoStack
 */

import { useCallback, useState } from "react";
import type { PendingCard } from "../../lib/discovery-api";
import { UNDO_TIMEOUT_MS, type UndoAction } from "./types";

export interface UseUndoStackArgs {
  /** Called with the card to restore when an undo succeeds. */
  restoreCard: (card: PendingCard) => void;
}

export interface UseUndoStackResult {
  /** Push a fresh action onto the stack; auto-evicts expired ones. */
  pushToUndoStack: (action: UndoAction) => void;
  /** Pop the most recent in-window action and restore its card. */
  undoLastAction: () => UndoAction | null;
  /** True if any action on the stack is still within the time window. */
  canUndo: () => boolean;
  /** Most recent in-window action (used to render the toast contents). */
  getLastUndoableAction: () => UndoAction | null;
}

export function useUndoStack({
  restoreCard,
}: UseUndoStackArgs): UseUndoStackResult {
  const [undoStack, setUndoStack] = useState<UndoAction[]>([]);

  const pushToUndoStack = useCallback((action: UndoAction) => {
    setUndoStack((prev) => {
      const now = Date.now();
      const validActions = prev.filter(
        (a) => now - a.timestamp < UNDO_TIMEOUT_MS,
      );
      return [...validActions, action];
    });
  }, []);

  const undoLastAction = useCallback((): UndoAction | null => {
    let undoneAction: UndoAction | null = null;

    setUndoStack((prev) => {
      if (prev.length === 0) return prev;

      const now = Date.now();
      let lastValidIndex = -1;
      for (let i = prev.length - 1; i >= 0; i--) {
        if (now - prev[i]!.timestamp < UNDO_TIMEOUT_MS) {
          lastValidIndex = i;
          break;
        }
      }

      if (lastValidIndex === -1) return [];

      undoneAction = prev[lastValidIndex]!;
      return prev.slice(0, lastValidIndex);
    });

    if (undoneAction) {
      restoreCard((undoneAction as UndoAction).card);
    }

    return undoneAction;
  }, [restoreCard]);

  const canUndo = useCallback((): boolean => {
    const now = Date.now();
    return undoStack.some((a) => now - a.timestamp < UNDO_TIMEOUT_MS);
  }, [undoStack]);

  const getLastUndoableAction = useCallback((): UndoAction | null => {
    const now = Date.now();
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (now - undoStack[i]!.timestamp < UNDO_TIMEOUT_MS) {
        return undoStack[i]!;
      }
    }
    return null;
  }, [undoStack]);

  return { pushToUndoStack, undoLastAction, canUndo, getLastUndoableAction };
}
