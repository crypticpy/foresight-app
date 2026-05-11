/**
 * Hook that loads the asset list (briefs, research reports, exports) for a
 * card and exposes a `refetch` so the Assets tab can pull-to-refresh after
 * a new artifact lands.
 *
 * @module CardDetail/hooks/useCardAssets
 */

import { useState, useEffect, useCallback } from "react";

import { getAuthToken } from "../../../lib/auth";
import { fetchCardAssets, type CardAsset } from "../../../lib/discovery-api";

export interface UseCardAssetsReturn {
  assets: CardAsset[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCardAssets(cardId: string | undefined): UseCardAssetsReturn {
  const [assets, setAssets] = useState<CardAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!cardId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (token) {
        const response = await fetchCardAssets(token, cardId);
        setAssets(response.assets);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [cardId]);

  useEffect(() => {
    if (cardId) load();
  }, [cardId, load]);

  return { assets, loading, error, refetch: load };
}

export default useCardAssets;
