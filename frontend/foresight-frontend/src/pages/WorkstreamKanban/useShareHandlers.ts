/**
 * Per-card share affordances: open the user's mail client with a
 * pre-filled subject/body, or copy the public-share URL to the clipboard.
 * Both hit the same `share-payload` endpoint behind the scenes.
 *
 * @module pages/WorkstreamKanban/useShareHandlers
 */

import { useCallback } from "react";

import { getAuthToken } from "../../lib/auth";
import { fetchWorkstreamCardSharePayload } from "../../lib/workstream-api";

import type { ToastType } from "./types";

export interface UseShareHandlersOptions {
  workstreamId: string | undefined;
  showToast: (type: ToastType, message: string) => void;
}

export interface UseShareHandlersReturn {
  handleShareCard: (cardId: string) => Promise<void>;
  handleCopyShareLink: (cardId: string) => Promise<void>;
}

export function useShareHandlers({
  workstreamId,
  showToast,
}: UseShareHandlersOptions): UseShareHandlersReturn {
  const handleShareCard = useCallback(
    async (cardId: string) => {
      if (!workstreamId) return;
      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }
      try {
        const payload = await fetchWorkstreamCardSharePayload(
          token,
          workstreamId,
          cardId,
        );
        const subject = encodeURIComponent(payload.subject);
        const body = encodeURIComponent(payload.body);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      } catch (err) {
        console.error("share-payload fetch failed:", err);
        showToast("error", "Could not prepare share email");
      }
    },
    [workstreamId, showToast],
  );

  const handleCopyShareLink = useCallback(
    async (cardId: string) => {
      if (!workstreamId) return;
      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }
      try {
        const payload = await fetchWorkstreamCardSharePayload(
          token,
          workstreamId,
          cardId,
        );
        await navigator.clipboard.writeText(payload.url);
        showToast("success", "Share link copied to clipboard");
      } catch (err) {
        console.error("copy share link failed:", err);
        showToast("error", "Could not copy share link");
      }
    },
    [workstreamId, showToast],
  );

  return { handleShareCard, handleCopyShareLink };
}
