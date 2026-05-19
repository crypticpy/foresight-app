import { useEffect, useRef, useState } from "react";
import {
  getCardTagsBatch,
  TAG_BATCH_CARD_LIMIT,
  type TagOnCard,
} from "../lib/tags-api";

interface UseCardTagsBatchState {
  tagsByCard: Record<string, TagOnCard[]>;
  loading: boolean;
  error: string | null;
}

const EMPTY: Record<string, TagOnCard[]> = Object.freeze({});

/**
 * Fetch tags for many cards in one trip — designed for list views where
 * each tile renders a mini tag badge. Re-fetches when the set of card IDs
 * changes (compared as a sorted-join key so order-only changes don't
 * trigger an extra round-trip).
 *
 * The caller passes a string[] of card IDs and `getAuthToken`. If the
 * input list is larger than `TAG_BATCH_CARD_LIMIT`, it is silently
 * truncated to the first N — list views should already be paginating
 * below that cap, so this is a guardrail rather than a feature.
 */
export function useCardTagsBatch(
  cardIds: string[],
  getAuthToken: () => Promise<string | null>,
) {
  const [state, setState] = useState<UseCardTagsBatchState>({
    tagsByCard: EMPTY,
    loading: false,
    error: null,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Key the effect on a sorted-join of the IDs so reordering doesn't
  // trigger a redundant fetch. The effect closure captures the original
  // (unsorted) array for the actual request payload.
  const idsKey = [...cardIds].sort().join(",");

  useEffect(() => {
    if (cardIds.length === 0) {
      setState({ tagsByCard: EMPTY, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    const trimmed = cardIds.slice(0, TAG_BATCH_CARD_LIMIT);
    getAuthToken()
      .then((token) => (token ? getCardTagsBatch(token, trimmed) : null))
      .then((res) => {
        if (cancelled || !mounted.current) return;
        setState({
          tagsByCard: res?.tags_by_card ?? EMPTY,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return;
        const message =
          err instanceof Error ? err.message : "Failed to load tags";
        setState({ tagsByCard: EMPTY, loading: false, error: message });
      });

    return () => {
      cancelled = true;
    };
    // idsKey is the stable derivation of cardIds we actually care about;
    // including the array itself causes a fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, getAuthToken]);

  return state;
}
