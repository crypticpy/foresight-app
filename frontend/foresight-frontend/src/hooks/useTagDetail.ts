import { useCallback, useEffect, useRef, useState } from "react";
import {
  getTagDetail,
  TagsApiError,
  type Tag,
  type TagDetailCard,
  type TagDetailResponse,
} from "../lib/tags-api";

interface UseTagDetailState {
  tag: Tag | null;
  cards: TagDetailCard[];
  total: number;
  loading: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  error: string | null;
}

const PAGE_SIZE = 20;

/**
 * Fetch + paginate the `/tags/{slug}` payload for the tag detail page.
 *
 * First page is loaded on mount (or slug change). `loadMore()` appends
 * subsequent pages by offset. `hasMore` flips false once we've drained
 * the server-reported `total`. Cancelled state from a slug change is
 * tracked through a request-sequence guard so a stale response can't
 * overwrite the active page.
 */
export function useTagDetail(
  slug: string,
  getAuthToken: () => Promise<string | null>,
) {
  const [state, setState] = useState<UseTagDetailState>({
    tag: null,
    cards: [],
    total: 0,
    loading: true,
    isFetchingMore: false,
    hasMore: true,
    error: null,
  });

  const mounted = useRef(true);
  const requestSeq = useRef(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const seq = ++requestSeq.current;
      if (!append) {
        setState((s) => ({ ...s, loading: true, error: null }));
      } else {
        setState((s) => ({ ...s, isFetchingMore: true, error: null }));
      }
      try {
        const token = await getAuthToken();
        if (!token) throw new Error("Not authenticated");
        const res: TagDetailResponse = await getTagDetail(
          token,
          slug,
          PAGE_SIZE,
          offset,
        );
        if (seq !== requestSeq.current || !mounted.current) return;
        offsetRef.current = offset + res.cards.length;
        setState((prev) => {
          const cards = append ? [...prev.cards, ...res.cards] : res.cards;
          return {
            tag: res.tag,
            cards,
            total: res.total,
            loading: false,
            isFetchingMore: false,
            hasMore: cards.length < res.total && res.cards.length > 0,
            error: null,
          };
        });
      } catch (err) {
        if (seq !== requestSeq.current || !mounted.current) return;
        // 404 means the slug doesn't exist — settle into a clean missing
        // state so the page renders its dedicated empty UI (`isMissing`
        // in pages/TagDetail/index.tsx) instead of an error banner.
        if (err instanceof TagsApiError && err.status === 404) {
          setState({
            tag: null,
            cards: [],
            total: 0,
            loading: false,
            isFetchingMore: false,
            hasMore: false,
            error: null,
          });
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to load tag";
        setState((prev) => ({
          ...prev,
          loading: false,
          isFetchingMore: false,
          error: message,
        }));
      }
    },
    [slug, getAuthToken],
  );

  useEffect(() => {
    offsetRef.current = 0;
    setState({
      tag: null,
      cards: [],
      total: 0,
      loading: true,
      isFetchingMore: false,
      hasMore: true,
      error: null,
    });
    void fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (state.isFetchingMore || state.loading || !state.hasMore) return;
    void fetchPage(offsetRef.current, true);
  }, [state.isFetchingMore, state.loading, state.hasMore, fetchPage]);

  const refresh = useCallback(() => {
    offsetRef.current = 0;
    void fetchPage(0, false);
  }, [fetchPage]);

  return { ...state, loadMore, refresh };
}
