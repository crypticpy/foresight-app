/**
 * In-place card-detail modal — clicking a card on the board pops this open
 * instead of navigating away, so the user keeps their column scroll
 * position. Escape and backdrop-click both dismiss; following a related
 * card swaps the slug without unmounting.
 *
 * @module pages/WorkstreamKanban/SignalDetailModal
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FileText, X } from "lucide-react";
import { CardDetail } from "../../components/CardDetail";

interface SignalDetailModalProps {
  slug: string | null;
  onClose: () => void;
  onSlugChange: (slug: string) => void;
}

export function SignalDetailModal({
  slug,
  onClose,
  onSlugChange,
}: SignalDetailModalProps) {
  useEffect(() => {
    if (!slug) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [slug, onClose]);

  if (!slug) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-4 lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Signal details"
      onClick={onClose}
    >
      <div
        className="relative z-10 flex max-h-[calc(100vh-1rem)] w-full max-w-[112rem] flex-col overflow-hidden rounded-lg bg-brand-faded-white shadow-2xl dark:bg-brand-dark-blue sm:max-h-[calc(100vh-2rem)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-dark-surface">
          <Link
            to={`/signals/${slug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-brand-blue hover:text-brand-dark-blue dark:hover:text-brand-green"
          >
            <FileText className="h-4 w-4" />
            Open full signal page
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-surface-hover dark:hover:text-white"
            aria-label="Close signal details"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5 lg:p-6">
          <CardDetail
            key={slug}
            slugOverride={slug}
            embedded
            onRelatedCardClick={onSlugChange}
          />
        </div>
      </div>
    </div>
  );
}
