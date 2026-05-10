/**
 * The six card-mutation handlers (move-by-drop, move-by-column, notes,
 * watching toggle, deep-dive trigger, remove) shared by the kanban
 * page. Each does an optimistic local update and reverts on failure;
 * keeping them in one hook keeps the composer focused on layout.
 *
 * @module pages/WorkstreamKanban/useKanbanCardOperations
 */

import { useCallback } from "react";

import { getAuthToken } from "../../lib/auth";
import {
  removeCardFromWorkstream,
  setWorkstreamCardWatching,
  triggerDeepDive,
  updateWorkstreamCard,
} from "../../lib/workstream-api";
import type { KanbanStatus, WorkstreamCard } from "../../components/kanban";

import type { ToastType } from "./types";

export interface UseKanbanCardOperationsOptions {
  workstreamId: string | undefined;
  cards: Record<KanbanStatus, WorkstreamCard[]>;
  setCards: React.Dispatch<
    React.SetStateAction<Record<KanbanStatus, WorkstreamCard[]>>
  >;
  showToast: (type: ToastType, message: string) => void;
  onResearchStarted: () => void;
}

export interface UseKanbanCardOperationsReturn {
  handleCardMove: (
    cardId: string,
    newStatus: KanbanStatus,
    newPosition: number,
  ) => Promise<void>;
  handleNotesUpdate: (cardId: string, notes: string) => Promise<void>;
  handleToggleWatching: (cardId: string, isWatching: boolean) => Promise<void>;
  handleDeepDive: (cardId: string) => Promise<void>;
  handleRemoveCard: (cardId: string) => Promise<void>;
  handleMoveToColumn: (cardId: string, status: KanbanStatus) => Promise<void>;
}

export function useKanbanCardOperations({
  workstreamId,
  cards,
  setCards,
  showToast,
  onResearchStarted,
}: UseKanbanCardOperationsOptions): UseKanbanCardOperationsReturn {
  const requireToken = useCallback(async (): Promise<string | null> => {
    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return null;
    }
    return token;
  }, [showToast]);

  const handleCardMove = useCallback(
    async (cardId: string, newStatus: KanbanStatus, newPosition: number) => {
      if (!workstreamId) return;
      const token = await requireToken();
      if (!token) return;

      let sourceStatus: KanbanStatus | null = null;
      let sourceCard: WorkstreamCard | null = null;
      for (const [status, columnCards] of Object.entries(cards)) {
        const card = columnCards.find((c) => c.id === cardId);
        if (card) {
          sourceStatus = status as KanbanStatus;
          sourceCard = card;
          break;
        }
      }
      if (!sourceStatus || !sourceCard) return;

      const previousCards = { ...cards };

      setCards((prev) => {
        const updated = { ...prev };
        updated[sourceStatus as KanbanStatus] = updated[
          sourceStatus as KanbanStatus
        ].filter((c) => c.id !== cardId);
        const movedCard = { ...sourceCard!, status: newStatus };
        const targetCards = [...updated[newStatus]];
        targetCards.splice(newPosition, 0, movedCard);
        updated[newStatus] = targetCards;
        return updated;
      });

      try {
        await updateWorkstreamCard(token, workstreamId, sourceCard.id, {
          status: newStatus,
          position: newPosition,
        });
        showToast("success", "Signal moved successfully");
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error("Error moving card:", errorMessage);
        setCards(previousCards);
        showToast("error", "Failed to move signal. Changes reverted.");
      }
    },
    [workstreamId, cards, setCards, requireToken, showToast],
  );

  const handleNotesUpdate = useCallback(
    async (cardId: string, notes: string) => {
      if (!workstreamId) return;
      const token = await requireToken();
      if (!token) return;

      try {
        await updateWorkstreamCard(token, workstreamId, cardId, { notes });
        setCards((prev) => {
          const updated = { ...prev };
          for (const status of Object.keys(updated) as KanbanStatus[]) {
            updated[status] = updated[status].map((card) =>
              card.id === cardId ? { ...card, notes } : card,
            );
          }
          return updated;
        });
        showToast("success", "Notes saved");
      } catch (err) {
        console.error("Error updating notes:", err);
        showToast("error", "Failed to save notes");
      }
    },
    [workstreamId, setCards, requireToken, showToast],
  );

  const handleToggleWatching = useCallback(
    async (cardId: string, isWatching: boolean) => {
      if (!workstreamId) return;
      const token = await requireToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      try {
        await setWorkstreamCardWatching(
          token,
          workstreamId,
          cardId,
          isWatching,
        );
        setCards((prev) => {
          const updated = { ...prev };
          for (const status of Object.keys(updated) as KanbanStatus[]) {
            updated[status] = updated[status].map((card) =>
              card.id === cardId ? { ...card, is_watching: isWatching } : card,
            );
          }
          return updated;
        });
      } catch (err) {
        console.error("Error toggling watch:", err);
        showToast("error", "Failed to update watch state");
        throw err;
      }
    },
    [workstreamId, setCards, requireToken, showToast],
  );

  const handleDeepDive = useCallback(
    async (cardId: string) => {
      if (!workstreamId) return;
      const token = await requireToken();
      if (!token) return;

      try {
        await triggerDeepDive(token, workstreamId, cardId);
        showToast("success", "Deep dive analysis started");
        onResearchStarted();
      } catch (err) {
        console.error("Error triggering deep dive:", err);
        showToast("error", "Failed to start deep dive analysis");
      }
    },
    [workstreamId, requireToken, showToast, onResearchStarted],
  );

  const handleRemoveCard = useCallback(
    async (cardId: string) => {
      if (!workstreamId) return;
      const token = await requireToken();
      if (!token) return;

      const previousCards = { ...cards };

      setCards((prev) => {
        const updated = { ...prev };
        for (const status of Object.keys(updated) as KanbanStatus[]) {
          updated[status] = updated[status].filter(
            (card) => card.id !== cardId,
          );
        }
        return updated;
      });

      try {
        await removeCardFromWorkstream(token, workstreamId, cardId);
        showToast("success", "Card removed from workstream");
      } catch (err) {
        console.error("Error removing card:", err);
        setCards(previousCards);
        showToast("error", "Failed to remove signal");
      }
    },
    [workstreamId, cards, setCards, requireToken, showToast],
  );

  const handleMoveToColumn = useCallback(
    async (cardId: string, status: KanbanStatus) => {
      if (!workstreamId) return;
      const token = await requireToken();
      if (!token) return;

      let sourceCard: WorkstreamCard | null = null;
      let sourceStatus: KanbanStatus | null = null;
      for (const [s, columnCards] of Object.entries(cards)) {
        const card = columnCards.find((c) => c.id === cardId);
        if (card) {
          sourceCard = card;
          sourceStatus = s as KanbanStatus;
          break;
        }
      }
      if (!sourceCard || !sourceStatus || sourceStatus === status) return;

      const previousCards = { ...cards };
      const targetPosition = cards[status].length;

      setCards((prev) => {
        const updated = { ...prev };
        updated[sourceStatus!] = updated[sourceStatus!].filter(
          (c) => c.id !== cardId,
        );
        const movedCard = { ...sourceCard!, status, position: targetPosition };
        updated[status] = [...updated[status], movedCard];
        return updated;
      });

      try {
        await updateWorkstreamCard(token, workstreamId, cardId, {
          status,
          position: targetPosition,
        });
        showToast("success", "Signal moved successfully");
      } catch (err) {
        console.error("Error moving card:", err);
        setCards(previousCards);
        showToast("error", "Failed to move signal");
      }
    },
    [workstreamId, cards, setCards, requireToken, showToast],
  );

  return {
    handleCardMove,
    handleNotesUpdate,
    handleToggleWatching,
    handleDeepDive,
    handleRemoveCard,
    handleMoveToColumn,
  };
}
