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
  /** Set when the input exceeded TAG_BATCH_CARD_LIMIT and was truncated.
   * Surfaces silent truncation so list views can show "showing N of M
   * tag badges" or otherwise alert the user. */
  truncatedFrom: number | null;
}

const EMPTY: Record<string, TagOnCard[]> = Object.freeze({});

/**
 * Fetch tags for many cards in one trip — designed for list views where
 * each tile renders a mini tag badge. Re-fetches when the set of card IDs
 * changes (compared as a sorted-join key so order-only changes don't
 * trigger an extra round-trip).
 *
 * Dedupes input IDs (callers commonly concat overlapping lists like
 * pinned + paginated). If the unique count still exceeds
 * `TAG_BATCH_CARD_LIMIT`, the hook truncates to the first N unique IDs,
 * emits a `console.warn`, and exposes `truncatedFrom` in state so the
 * caller can surface the gap to users instead of silently missing
 * badges.
 */
export function useCardTagsBatch(
  cardIds: string[],
  getAuthToken: () => Promise<string | null>,
) {
  const [state, setState] = useState<UseCardTagsBatchState>({
    tagsByCard: EMPTY,
    loading: false,
    error: null,
    truncatedFrom: null,
  });

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Dedupe before keying the effect: callers like Signals concat
  // `pinned + signals` which often have overlap. Without dedupe, those
  // overlaps waste batch slots and can push genuinely unique IDs past
  // the 250 cap.
  const uniqueIds = Array.from(new Set(cardIds));
  // Key the effect on a sorted-join of the deduped IDs so reordering
  // doesn't trigger a redundant fetch.
  const idsKey = [...uniqueIds].sort().join(",");

  useEffect(() => {
    if (uniqueIds.length === 0) {
      setState({
        tagsByCard: EMPTY,
        loading: false,
        error: null,
        truncatedFrom: null,
      });
      return;
    }
    let cancelled = false;
    const exceeded = uniqueIds.length > TAG_BATCH_CARD_LIMIT;
    const trimmed = exceeded
      ? uniqueIds.slice(0, TAG_BATCH_CARD_LIMIT)
      : uniqueIds;
    if (exceeded) {
      console.warn(
        `useCardTagsBatch: ${uniqueIds.length} unique card IDs exceeds the ` +
          `${TAG_BATCH_CARD_LIMIT}-card batch cap. The first ${TAG_BATCH_CARD_LIMIT} ` +
          `will be hydrated; the rest will render without tag badges. ` +
          `Page the list view further or split the request.`,
      );
    }

    setState((s) => ({
      ...s,
      loading: true,
      error: null,
      truncatedFrom: exceeded ? uniqueIds.length : null,
    }));

    getAuthToken()
      .then((token) => (token ? getCardTagsBatch(token, trimmed) : null))
      .then((res) => {
        if (cancelled || !mounted.current) return;
        setState({
          tagsByCard: res?.tags_by_card ?? EMPTY,
          loading: false,
          error: null,
          truncatedFrom: exceeded ? uniqueIds.length : null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled || !mounted.current) return;
        const message =
          err instanceof Error ? err.message : "Failed to load tags";
        setState({
          tagsByCard: EMPTY,
          loading: false,
          error: message,
          truncatedFrom: exceeded ? uniqueIds.length : null,
        });
      });

    return () => {
      cancelled = true;
    };
    // idsKey is the stable derivation of uniqueIds we actually care
    // about; including the array itself causes a fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, getAuthToken]);

  return state;
}
