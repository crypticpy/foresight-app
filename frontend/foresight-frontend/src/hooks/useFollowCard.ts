import { useCallback, useEffect, useState } from "react";
import {
  followCard,
  getCardFollowers,
  unfollowCard,
} from "../lib/card-followers-api";

export function useFollowCard(
  cardId: string | undefined,
  getAuthToken: () => Promise<string | undefined>,
  initialState?: { is_following?: boolean; follower_count?: number },
) {
  const [isFollowing, setIsFollowing] = useState(
    Boolean(initialState?.is_following),
  );
  const [followerCount, setFollowerCount] = useState(
    initialState?.follower_count ?? 0,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setIsFollowing(Boolean(initialState?.is_following));
    setFollowerCount(initialState?.follower_count ?? 0);
  }, [initialState?.is_following, initialState?.follower_count]);

  useEffect(() => {
    if (!cardId) return;
    let cancelled = false;
    getAuthToken()
      .then((token) => (token ? getCardFollowers(cardId, token) : null))
      .then((state) => {
        if (!state || cancelled) return;
        setIsFollowing(state.is_following);
        setFollowerCount(state.follower_count);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [cardId, getAuthToken]);

  const toggleFollow = useCallback(async () => {
    if (!cardId || isSaving) return;
    const token = await getAuthToken();
    if (!token) return;
    const next = !isFollowing;
    const previous = { isFollowing, followerCount };
    setIsSaving(true);
    setIsFollowing(next);
    setFollowerCount((count) => Math.max(0, count + (next ? 1 : -1)));
    try {
      const state = next
        ? await followCard(cardId, token)
        : await unfollowCard(cardId, token);
      setIsFollowing(state.is_following);
      setFollowerCount(state.follower_count);
    } catch {
      setIsFollowing(previous.isFollowing);
      setFollowerCount(previous.followerCount);
    } finally {
      setIsSaving(false);
    }
  }, [cardId, followerCount, getAuthToken, isFollowing, isSaving]);

  return { isFollowing, followerCount, isSaving, toggleFollow };
}
