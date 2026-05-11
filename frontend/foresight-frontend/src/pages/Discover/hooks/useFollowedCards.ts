/**
 * Owns the set of card ids the current user follows. Handles initial load on
 * user change and a `toggleFollow` action with optimistic UI + revert on
 * error.
 *
 * @module pages/Discover/hooks/useFollowedCards
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";

export interface UseFollowedCardsArgs {
  /** Authenticated user id, or undefined when signed out. */
  userId: string | undefined;
  /** Shows a toast on revert. */
  onError: (message: string) => void;
}

export interface UseFollowedCardsReturn {
  /** Set of card ids the user currently follows. */
  followedCardIds: Set<string>;
  /** Toggle follow state with optimistic update + revert on failure. */
  toggleFollow: (cardId: string) => Promise<void>;
}

export function useFollowedCards({
  userId,
  onError,
}: UseFollowedCardsArgs): UseFollowedCardsReturn {
  const [followedCardIds, setFollowedCardIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    if (!userId) {
      setFollowedCardIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("card_follows")
          .select("card_id")
          .eq("user_id", userId);
        if (cancelled) return;
        if (data) {
          setFollowedCardIds(new Set(data.map((f) => f.card_id)));
        }
      } catch (error) {
        console.error("Error loading followed cards:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggleFollow = useCallback(
    async (cardId: string) => {
      if (!userId) return;

      const isFollowing = followedCardIds.has(cardId);

      setFollowedCardIds((prev) => {
        const next = new Set(prev);
        if (isFollowing) next.delete(cardId);
        else next.add(cardId);
        return next;
      });

      try {
        if (isFollowing) {
          await supabase
            .from("card_follows")
            .delete()
            .eq("user_id", userId)
            .eq("card_id", cardId);
        } else {
          await supabase
            .from("card_follows")
            .insert({ user_id: userId, card_id: cardId, priority: "medium" });
        }
      } catch (error) {
        setFollowedCardIds((prev) => {
          const next = new Set(prev);
          if (isFollowing) next.add(cardId);
          else next.delete(cardId);
          return next;
        });
        onError(
          error instanceof Error
            ? error.message
            : "Could not update follow state",
        );
      }
    },
    [userId, followedCardIds, onError],
  );

  return { followedCardIds, toggleFollow };
}
