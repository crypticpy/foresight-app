/**
 * Auto-scrolls the chat messages container to the bottom on two triggers:
 *   1. A new committed message arrives (smooth scroll)
 *   2. The current stream emits new content (instant scroll, rAF-throttled)
 *
 * The caller owns the refs and the dependent values; this hook only wires
 * the effects.
 *
 * @module components/Chat/hooks/useChatAutoScroll
 */

import { useCallback, useEffect, type RefObject } from "react";

export interface UseChatAutoScrollOptions {
  messagesEndRef: RefObject<HTMLElement>;
  messagesLength: number;
  streamingContent: string | null | undefined;
}

export function useChatAutoScroll({
  messagesEndRef,
  messagesLength,
  streamingContent,
}: UseChatAutoScrollOptions): void {
  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      messagesEndRef.current?.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
      });
    },
    [messagesEndRef],
  );

  useEffect(() => {
    scrollToBottom(true);
  }, [messagesLength, scrollToBottom]);

  useEffect(() => {
    if (!streamingContent) return;
    const id = requestAnimationFrame(() => scrollToBottom(false));
    return () => cancelAnimationFrame(id);
  }, [streamingContent, scrollToBottom]);
}
