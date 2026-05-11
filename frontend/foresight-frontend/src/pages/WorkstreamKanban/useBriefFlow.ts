/**
 * Executive-brief modal + per-card export wiring for the kanban page.
 * Owns the modal-open state and the two brief-export handlers that
 * hand off to `useExportWithProgress`. Returns enough for the composer
 * to render `BriefPreviewModal` and pass `onExportBrief` into card actions.
 *
 * @module pages/WorkstreamKanban/useBriefFlow
 */

import { useCallback, useState } from "react";

import type { KanbanStatus, WorkstreamCard } from "../../components/kanban";
import { useBriefGeneration } from "../../components/kanban/actions";
import { useExportWithProgress } from "../../hooks/useExportWithProgress";
import { getAuthToken } from "../../lib/auth";

import type { ToastType } from "./types";

export interface UseBriefFlowOptions {
  workstreamId: string | undefined;
  cards: Record<KanbanStatus, WorkstreamCard[]>;
  showToast: (type: ToastType, message: string) => void;
}

export function useBriefFlow({
  workstreamId,
  cards,
  showToast,
}: UseBriefFlowOptions) {
  const [briefModalCard, setBriefModalCard] = useState<WorkstreamCard | null>(
    null,
  );
  const [showBriefModal, setShowBriefModal] = useState(false);

  const {
    triggerBriefGeneration,
    isCardGenerating,
    getCardBrief,
    getCardError,
  } = useBriefGeneration(getAuthToken, workstreamId || "", {
    onGenerating: () => showToast("info", "Generating executive brief..."),
    onSuccess: () => showToast("success", "Executive brief generated"),
    onError: (_, error) =>
      showToast("error", `Brief generation failed: ${error.message}`),
  });

  const exportProgress = useExportWithProgress(getAuthToken);

  const handleGenerateBrief = useCallback(
    async (workstreamCardId: string, cardId: string) => {
      for (const columnCards of Object.values(cards)) {
        const card = columnCards.find((c) => c.id === workstreamCardId);
        if (card) {
          setBriefModalCard(card);
          setShowBriefModal(true);
          break;
        }
      }
      await triggerBriefGeneration(cardId);
    },
    [cards, triggerBriefGeneration],
  );

  const handleBriefModalClose = useCallback(() => {
    setShowBriefModal(false);
    setBriefModalCard(null);
  }, []);

  const handleBriefExport = useCallback(
    async (format: "pdf" | "pptx") => {
      if (briefModalCard && workstreamId) {
        const cardName = briefModalCard.card.name || "Executive Brief";
        await exportProgress.exportBrief(
          workstreamId,
          briefModalCard.card.id,
          format,
          cardName,
        );
      }
    },
    [briefModalCard, workstreamId, exportProgress],
  );

  const handleBriefExportFromCard = useCallback(
    async (cardId: string, format: "pdf" | "pptx") => {
      if (!workstreamId) return;
      let cardName = "Executive Brief";
      for (const columnCards of Object.values(cards)) {
        const card = columnCards.find((c) => c.card.id === cardId);
        if (card) {
          cardName = card.card.name || cardName;
          break;
        }
      }
      await exportProgress.exportBrief(workstreamId, cardId, format, cardName);
    },
    [workstreamId, cards, exportProgress],
  );

  return {
    briefModalCard,
    showBriefModal,
    triggerBriefGeneration,
    isCardGenerating,
    getCardBrief,
    getCardError,
    exportProgress,
    handleGenerateBrief,
    handleBriefModalClose,
    handleBriefExport,
    handleBriefExportFromCard,
  };
}
