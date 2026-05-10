/**
 * Quick-triage keyboard shortcuts for inbox-column cards while the pointer
 * is over the card. Hot keys: `e`/`a` → working, `x`/`r` → archived,
 * `w` → toggle watching. Ignored when typing in form fields or when
 * modifier keys are held.
 *
 * @module components/kanban/KanbanCard/useQuickTriageKeyboard
 */

import { useEffect } from "react";

import type { CardActionCallbacks, KanbanStatus } from "../types";

export interface UseQuickTriageKeyboardOptions {
  cardId: string;
  isHovered: boolean;
  columnId?: KanbanStatus;
  isDragOverlay: boolean;
  cardActions?: CardActionCallbacks;
  isWatching: boolean;
  setOptimisticWatching: (next: boolean | null) => void;
}

export function useQuickTriageKeyboard({
  cardId,
  isHovered,
  columnId,
  isDragOverlay,
  cardActions,
  isWatching,
  setOptimisticWatching,
}: UseQuickTriageKeyboardOptions) {
  useEffect(() => {
    if (!isHovered || columnId !== "inbox" || isDragOverlay || !cardActions) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "e" || k === "a") {
        e.preventDefault();
        cardActions.onMoveToColumn?.(cardId, "working");
      } else if (k === "x" || k === "r") {
        e.preventDefault();
        cardActions.onMoveToColumn?.(cardId, "archived");
      } else if (k === "w") {
        e.preventDefault();
        const next = !isWatching;
        setOptimisticWatching(next);
        Promise.resolve(cardActions.onToggleWatching?.(cardId, next)).catch(
          () => setOptimisticWatching(null),
        );
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    isHovered,
    columnId,
    isDragOverlay,
    cardActions,
    cardId,
    isWatching,
    setOptimisticWatching,
  ]);
}
