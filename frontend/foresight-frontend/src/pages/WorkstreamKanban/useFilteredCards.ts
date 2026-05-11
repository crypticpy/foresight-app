/**
 * Filtering + research-status enrichment for the kanban board. Splits
 * the search-and-pillar filter logic out of the page composer so it
 * stays a pure transform memo.
 *
 * @module pages/WorkstreamKanban/useFilteredCards
 */

import { useMemo } from "react";

import type { KanbanStatus, WorkstreamCard } from "../../components/kanban";
import type { WorkstreamResearchStatus } from "../../lib/workstream-api";

const EMPTY_COLUMNS: () => Record<KanbanStatus, WorkstreamCard[]> = () => ({
  inbox: [],
  working: [],
  ready: [],
  archived: [],
});

export interface UseFilteredCardsOptions {
  cards: Record<KanbanStatus, WorkstreamCard[]>;
  researchStatuses: Map<string, WorkstreamResearchStatus>;
  searchQuery: string;
  filterPillar: string | null;
}

export interface UseFilteredCardsReturn {
  cardsWithResearchStatus: Record<KanbanStatus, WorkstreamCard[]>;
  filteredCards: Record<KanbanStatus, WorkstreamCard[]>;
  availablePillars: string[];
}

export function useFilteredCards({
  cards,
  researchStatuses,
  searchQuery,
  filterPillar,
}: UseFilteredCardsOptions): UseFilteredCardsReturn {
  const cardsWithResearchStatus = useMemo(() => {
    const enriched = EMPTY_COLUMNS();
    for (const [status, columnCards] of Object.entries(cards)) {
      enriched[status as KanbanStatus] = columnCards.map((card) => {
        const researchStatus = researchStatuses.get(card.card_id);
        if (researchStatus) {
          return {
            ...card,
            research_status: {
              status: researchStatus.status,
              task_type: researchStatus.task_type,
              task_id: researchStatus.task_id,
              started_at: researchStatus.started_at,
              completed_at: researchStatus.completed_at,
            },
          };
        }
        return card;
      });
    }
    return enriched;
  }, [cards, researchStatuses]);

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim() && !filterPillar) return cardsWithResearchStatus;

    const filtered = EMPTY_COLUMNS();
    const query = searchQuery.toLowerCase().trim();

    for (const [status, columnCards] of Object.entries(
      cardsWithResearchStatus,
    )) {
      filtered[status as KanbanStatus] = columnCards.filter((card) => {
        if (filterPillar && card.card.pillar_id !== filterPillar) return false;
        if (query) {
          const cardText = [
            card.card.name || "",
            card.card.summary || "",
            card.notes || "",
          ]
            .join(" ")
            .toLowerCase();
          if (!cardText.includes(query)) return false;
        }
        return true;
      });
    }
    return filtered;
  }, [cardsWithResearchStatus, searchQuery, filterPillar]);

  const availablePillars = useMemo(() => {
    const pillarSet = new Set<string>();
    for (const columnCards of Object.values(cards)) {
      for (const card of columnCards) {
        if (card.card.pillar_id) pillarSet.add(card.card.pillar_id);
      }
    }
    return Array.from(pillarSet).sort();
  }, [cards]);

  return { cardsWithResearchStatus, filteredCards, availablePillars };
}
