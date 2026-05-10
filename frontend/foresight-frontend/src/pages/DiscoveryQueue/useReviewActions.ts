/**
 * Per-card and bulk review mutation handlers. Owns `actionLoading`, the
 * inflight-action error message, and routes successful actions through
 * `pushToUndoStack` + the toast so undo works for every path.
 *
 * Card removal and selection cleanup is delegated to the host page via
 * `removeCard` / `removeCards` / `deselectCard` callbacks so this hook stays
 * scoped to "do the API call, queue the undo, show the toast".
 *
 * @module pages/DiscoveryQueue/useReviewActions
 */

import { useCallback, useState } from "react";
import { getAuthToken } from "../../lib/auth";
import {
  bulkReviewCards,
  dismissCard,
  reviewCard,
  type DismissReason,
  type PendingCard,
  type ReviewAction,
} from "../../lib/discovery-api";
import type { UndoAction, UndoActionType } from "./types";

export interface UseReviewActionsArgs {
  /** Authenticated user, or null if signed out. */
  user: { id: string } | null | undefined;
  /** Current visible cards — used to look up the row being mutated. */
  cards: PendingCard[];
  /** Drops a card from local state on success. */
  removeCard: (cardId: string) => void;
  /** Drops many cards from local state on bulk success. */
  removeCards: (cardIds: string[]) => void;
  /** Clears a single card id from the selection set. */
  deselectCard: (cardId: string) => void;
  /** Resets the selection set entirely. */
  clearSelection: () => void;
  /** Push the mutated card onto the undo stack. */
  pushToUndoStack: (action: UndoAction) => void;
  /** Show the undo toast with the 5s countdown. */
  showUndoToast: () => void;
  /** Reset the open-dropdown overlay (if any). */
  closeDropdown: () => void;
}

export interface UseReviewActionsResult {
  /** ID of the card currently being mutated, "bulk", or null. */
  actionLoading: string | null;
  /** Last error message from a failed action, or null. */
  error: string | null;
  setError: (value: string | null) => void;
  handleReview: (cardId: string, action: ReviewAction) => Promise<void>;
  handleDismiss: (cardId: string, reason?: DismissReason) => Promise<void>;
  handleBulk: (
    action: ReviewAction,
    selectedCards: Set<string>,
  ) => Promise<void>;
}

export function useReviewActions({
  user,
  cards,
  removeCard,
  removeCards,
  deselectCard,
  clearSelection,
  pushToUndoStack,
  showUndoToast,
  closeDropdown,
}: UseReviewActionsArgs): UseReviewActionsResult {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReview = useCallback(
    async (cardId: string, action: ReviewAction) => {
      if (!user) return;
      const cardToAction = cards.find((c) => c.id === cardId);
      if (!cardToAction) return;

      try {
        setActionLoading(cardId);
        closeDropdown();

        const token = await getAuthToken();
        if (!token) throw new Error("Not authenticated");

        await reviewCard(token, cardId, action);

        const undoActionType: UndoActionType =
          action === "approve"
            ? "approve"
            : action === "reject"
              ? "reject"
              : "defer";
        pushToUndoStack({
          type: undoActionType,
          card: cardToAction,
          timestamp: Date.now(),
        });

        removeCard(cardId);
        deselectCard(cardId);
        showUndoToast();
      } catch (err) {
        console.error("Error reviewing card:", err);
        setError(
          err instanceof Error ? err.message : "Failed to review signal",
        );
      } finally {
        setActionLoading(null);
      }
    },
    [
      user,
      cards,
      closeDropdown,
      pushToUndoStack,
      removeCard,
      deselectCard,
      showUndoToast,
    ],
  );

  const handleDismiss = useCallback(
    async (cardId: string, reason?: DismissReason) => {
      if (!user) return;
      const cardToDismiss = cards.find((c) => c.id === cardId);
      if (!cardToDismiss) return;

      try {
        setActionLoading(cardId);
        closeDropdown();

        const token = await getAuthToken();
        if (!token) throw new Error("Not authenticated");

        await dismissCard(token, cardId, reason);

        pushToUndoStack({
          type: "dismiss",
          card: cardToDismiss,
          timestamp: Date.now(),
          dismissReason: reason,
        });

        removeCard(cardId);
        deselectCard(cardId);
        showUndoToast();
      } catch (err) {
        console.error("Error dismissing card:", err);
        setError(
          err instanceof Error ? err.message : "Failed to dismiss signal",
        );
      } finally {
        setActionLoading(null);
      }
    },
    [
      user,
      cards,
      closeDropdown,
      pushToUndoStack,
      removeCard,
      deselectCard,
      showUndoToast,
    ],
  );

  const handleBulk = useCallback(
    async (action: ReviewAction, selectedCards: Set<string>) => {
      if (!user || selectedCards.size === 0) return;

      try {
        setActionLoading("bulk");

        const token = await getAuthToken();
        if (!token) throw new Error("Not authenticated");

        const cardIds = Array.from(selectedCards);
        await bulkReviewCards(token, cardIds, action);

        removeCards(cardIds);
        clearSelection();
      } catch (err) {
        console.error("Error bulk reviewing cards:", err);
        setError(
          err instanceof Error ? err.message : "Failed to bulk review signals",
        );
      } finally {
        setActionLoading(null);
      }
    },
    [user, removeCards, clearSelection],
  );

  return {
    actionLoading,
    error,
    setError,
    handleReview,
    handleDismiss,
    handleBulk,
  };
}
