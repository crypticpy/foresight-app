import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyTagToCard,
  getCardTags,
  removeTagFromCard,
  type TagOnCard,
} from "../lib/tags-api";

interface UseCardTagsState {
  tags: TagOnCard[];
  loading: boolean;
  saving: boolean;
  error: string | null;
}

export function useCardTags(
  cardId: string | undefined,
  getAuthToken: () => Promise<string | null>,
) {
  const [state, setState] = useState<UseCardTagsState>({
    tags: [],
    loading: false,
    saving: false,
    error: null,
  });

  // Track mount status so async mutation callbacks don't setState on an
  // unmounted hook (user navigates away mid-flight).
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const safeSetState = useCallback(
    (updater: (s: UseCardTagsState) => UseCardTagsState) => {
      if (mounted.current) setState(updater);
    },
    [],
  );

  // Hydrate from server. Re-runs on cardId change.
  useEffect(() => {
    if (!cardId) {
      // Clearing the card context (modal close, navigation away) must reset
      // local state so the next opened card doesn't briefly show stale tags.
      setState({ tags: [], loading: false, saving: false, error: null });
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    getAuthToken()
      .then((token) => (token ? getCardTags(token, cardId) : null))
      .then((res) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          tags: res?.tags ?? [],
          loading: false,
        }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load tags";
        setState((s) => ({ ...s, loading: false, error: message }));
      });
    return () => {
      cancelled = true;
    };
  }, [cardId, getAuthToken]);

  const apply = useCallback(
    async (label: string, workstreamId?: string) => {
      if (!cardId) {
        const err = new Error("Cannot apply tag: card context missing");
        safeSetState((s) => ({ ...s, error: err.message }));
        throw err;
      }
      const token = await getAuthToken();
      if (!token) {
        const err = new Error("Cannot apply tag: not signed in");
        safeSetState((s) => ({ ...s, error: err.message }));
        throw err;
      }
      safeSetState((s) => ({ ...s, saving: true, error: null }));
      try {
        const res = await applyTagToCard(token, cardId, label, workstreamId);
        safeSetState((s) => ({ ...s, tags: res.tags, saving: false }));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to apply tag";
        safeSetState((s) => ({ ...s, saving: false, error: message }));
        throw err;
      }
    },
    [cardId, getAuthToken, safeSetState],
  );

  const remove = useCallback(
    async (slug: string) => {
      if (!cardId) {
        const err = new Error("Cannot remove tag: card context missing");
        safeSetState((s) => ({ ...s, error: err.message }));
        throw err;
      }
      const token = await getAuthToken();
      if (!token) {
        const err = new Error("Cannot remove tag: not signed in");
        safeSetState((s) => ({ ...s, error: err.message }));
        throw err;
      }
      safeSetState((s) => ({ ...s, saving: true, error: null }));
      try {
        const res = await removeTagFromCard(token, cardId, slug);
        safeSetState((s) => ({ ...s, tags: res.tags, saving: false }));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to remove tag";
        safeSetState((s) => ({ ...s, saving: false, error: message }));
        throw err;
      }
    },
    [cardId, getAuthToken, safeSetState],
  );

  return {
    tags: state.tags,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    apply,
    remove,
  };
}
