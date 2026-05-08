import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Download, Loader2, Share2, X } from "lucide-react";
import { API_BASE_URL } from "../lib/config";
import { useToast } from "./ui/Toast";
import type { CardArtifacts } from "../types/card";

interface ShareSignalModalProps {
  open: boolean;
  onClose: () => void;
  card: {
    id: string;
    name: string;
    slug: string;
    summary?: string;
    artifacts?: CardArtifacts;
  };
  getAuthToken: () => Promise<string | undefined>;
}

export function ShareSignalModal({
  open,
  onClose,
  card,
  getAuthToken,
}: ShareSignalModalProps) {
  const { pushToast } = useToast();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close on Escape and move focus into the dialog when it opens.
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const getOrCreateShareUrl = useCallback(async () => {
    if (shareUrl) return shareUrl;
    const token = await getAuthToken();
    if (!token) throw new Error("Not authenticated");
    const response = await fetch(`${API_BASE_URL}/api/v1/me/share-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        target_type: "card",
        target_id: card.id,
        expires_in_days: 30,
      }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to create share link");
    }
    const data = await response.json();
    setShareUrl(data.share_url);
    return data.share_url as string;
  }, [card.id, getAuthToken, shareUrl]);

  const handleShare = useCallback(async () => {
    setLoading(true);
    try {
      const url = await getOrCreateShareUrl();
      const shareData = {
        title: card.name,
        text: card.summary || "Foresight signal",
        url,
      };
      // Prefer the native share sheet when present. canShare() is more
      // restrictive than share() and returns false on browsers (e.g. some
      // desktop Safari builds) where share() would actually work — so we
      // gate on share() availability and let the platform reject if it
      // can't handle the payload.
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        pushToast("Share sheet opened", { variant: "success" });
      } else {
        await navigator.clipboard.writeText(url);
        pushToast("Link copied to clipboard", { variant: "success" });
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        pushToast(error instanceof Error ? error.message : "Share failed", {
          variant: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [card.name, card.summary, getOrCreateShareUrl, pushToast]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const includeResearch = card.artifacts?.has_deep_research
        ? "true"
        : "false";
      const response = await fetch(
        `${API_BASE_URL}/api/v1/cards/${card.id}/export/pdf?include_research=${includeResearch}&include_brief=true`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error("PDF download failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${card.slug}-export.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : "Download failed", {
        variant: "error",
      });
    } finally {
      setDownloading(false);
    }
  }, [
    card.artifacts?.has_deep_research,
    card.id,
    card.slug,
    getAuthToken,
    pushToast,
  ]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-dark-surface"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <h2
            id={titleId}
            className="text-lg font-semibold text-gray-900 dark:text-white"
          >
            Share signal
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-700 dark:hover:text-white"
            aria-label="Close share modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {card.name}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
              {card.summary}
            </p>
          </div>
          {card.artifacts?.has_deep_research && (
            <span className="inline-flex items-center rounded-full border border-brand-green/25 bg-brand-green/10 px-2.5 py-1 text-xs font-medium text-brand-green">
              Includes deep research report
            </span>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={handleShare}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark-blue disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              Share
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60 dark:border-gray-600 dark:bg-dark-surface-elevated dark:text-gray-200"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
