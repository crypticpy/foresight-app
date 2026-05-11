/**
 * Shows a small "Continuing from {time} · {title}" banner the first time
 * a chat panel mounts onto a restored conversation, and auto-dismisses
 * it after 5 seconds. The banner also disappears the moment the user
 * sends their own message.
 *
 * @module components/Chat/hooks/useContinueBanner
 */

import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_DISMISS_MS = 5000;

export interface UseContinueBannerOptions {
  messagesLength: number;
  conversationTitle: string | null | undefined;
  conversationUpdatedAt: string | null | undefined;
}

export interface UseContinueBannerResult {
  showContinueBanner: boolean;
  dismissBanner: () => void;
  /** Should be called when the user sends a message. */
  markUserSent: () => void;
}

export function useContinueBanner({
  messagesLength,
  conversationTitle,
  conversationUpdatedAt,
}: UseContinueBannerOptions): UseContinueBannerResult {
  const [showContinueBanner, setShowContinueBanner] = useState(false);
  const userHasSentMessage = useRef(false);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (
      messagesLength > 0 &&
      !userHasSentMessage.current &&
      conversationTitle &&
      conversationUpdatedAt
    ) {
      setShowContinueBanner(true);

      bannerTimerRef.current = setTimeout(() => {
        setShowContinueBanner(false);
      }, AUTO_DISMISS_MS);
    }

    return () => {
      if (bannerTimerRef.current) {
        clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = null;
      }
    };
    // Only trigger on initial load — when conversationTitle/updatedAt arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationTitle, conversationUpdatedAt]);

  const dismissBanner = useCallback(() => {
    setShowContinueBanner(false);
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  const markUserSent = useCallback(() => {
    userHasSentMessage.current = true;
    setShowContinueBanner(false);
    if (bannerTimerRef.current) {
      clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
  }, []);

  return { showContinueBanner, dismissBanner, markUserSent };
}
