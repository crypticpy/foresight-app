/**
 * State + handlers for the "Compare Signals" mode. Reads the initial seed
 * card from sessionStorage when arriving via `?compare=true` (set by other
 * pages that hand off a card), and routes the user to `/compare` once two
 * cards are selected.
 *
 * @module pages/Discover/hooks/useCompareMode
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export interface CompareCard {
  id: string;
  name: string;
}

export interface UseCompareModeReturn {
  compareMode: boolean;
  selectedForCompare: CompareCard[];
  setCompareMode: (active: boolean) => void;
  setSelectedForCompare: (cards: CompareCard[]) => void;
  /** Add/remove a card; caps at 2 entries (drops oldest). */
  toggleCardForCompare: (card: CompareCard) => void;
  /** Navigate to `/compare?card_ids=...` when exactly 2 are selected. */
  navigateToCompare: () => void;
  /** Exit compare mode and clear the `?compare=true` URL flag. */
  exitCompareMode: () => void;
}

export function useCompareMode(): UseCompareModeReturn {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<CompareCard[]>(
    [],
  );

  // Pick up the seed card stashed in sessionStorage by the originating page
  // when we arrive at `/discover?compare=true`. We only consume it once.
  useEffect(() => {
    const isCompare = searchParams.get("compare") === "true";
    if (!isCompare) return;

    setCompareMode(true);
    const storedCard = sessionStorage.getItem("compareCard");
    if (storedCard) {
      try {
        const cardData = JSON.parse(storedCard);
        if (cardData.id && cardData.name) {
          setSelectedForCompare([cardData]);
        }
      } catch {
        // Invalid stored data — ignore.
      }
      sessionStorage.removeItem("compareCard");
    }
  }, [searchParams]);

  const toggleCardForCompare = useCallback((card: CompareCard) => {
    setSelectedForCompare((prev): CompareCard[] => {
      const isSelected = prev.some((c) => c.id === card.id);
      if (isSelected) {
        return prev.filter((c) => c.id !== card.id);
      }
      if (prev.length >= 2) {
        const second = prev[1];
        return second ? [second, card] : [card];
      }
      return [...prev, card];
    });
  }, []);

  const navigateToCompare = useCallback(() => {
    if (selectedForCompare.length === 2) {
      const ids = selectedForCompare.map((c) => c.id).join(",");
      navigate(`/compare?card_ids=${ids}`);
    }
  }, [selectedForCompare, navigate]);

  const exitCompareMode = useCallback(() => {
    setCompareMode(false);
    setSelectedForCompare([]);
    const next = new URLSearchParams(searchParams);
    next.delete("compare");
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  return {
    compareMode,
    selectedForCompare,
    setCompareMode,
    setSelectedForCompare,
    toggleCardForCompare,
    navigateToCompare,
    exitCompareMode,
  };
}
