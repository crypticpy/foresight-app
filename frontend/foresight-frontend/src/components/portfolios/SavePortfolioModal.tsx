/**
 * SavePortfolioModal
 *
 * Captures a name (and optional description) to create a portfolio. Used by
 * the SelectionToolbar's "Save as portfolio…" bulk action and by per-card
 * "New portfolio…" entry points.
 */

import { useEffect, useRef, useState } from "react";
import { Briefcase, Loader2, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  createPortfolio,
  PORTFOLIO_MAX_ITEMS,
  type PortfolioWithItems,
} from "../../lib/portfolios-api";

export interface SavePortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (portfolio: PortfolioWithItems) => void;
  /** Cards to seed the portfolio with (≤15). */
  cardIds: string[];
  /** Workstream to scope to. Pass null to create an unscoped (cross-workstream) portfolio. */
  workstreamId: string | null;
  getAuthToken: () => Promise<string | null>;
}

export function SavePortfolioModal({
  isOpen,
  onClose,
  onCreated,
  cardIds,
  workstreamId,
  getAuthToken,
}: SavePortfolioModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setDescription("");
      setError(null);
      setSubmitting(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const overLimit = cardIds.length > PORTFOLIO_MAX_ITEMS;
  const canSubmit = name.trim().length >= 2 && !submitting && !overLimit;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const token = await getAuthToken();
    if (!token) {
      setError("Authentication required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const portfolio = await createPortfolio(token, {
        name: name.trim(),
        description: description.trim() || undefined,
        workstream_id: workstreamId,
        card_ids: cardIds,
      });
      onCreated(portfolio);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create portfolio",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={cn(
          "w-full max-w-md rounded-xl shadow-2xl",
          "bg-white dark:bg-dark-surface-elevated",
          "border border-gray-200 dark:border-gray-700",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-portfolio-title"
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-brand-blue" />
            <h2
              id="save-portfolio-title"
              className="text-lg font-semibold text-gray-900 dark:text-white"
            >
              Save as portfolio
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-surface disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Bundle {cardIds.length} signal{cardIds.length === 1 ? "" : "s"} into
            a named collection you can revisit and export as a presentation.
          </p>

          {overLimit && (
            <div className="text-sm text-red-600 dark:text-red-400">
              You selected {cardIds.length} cards. The limit is{" "}
              {PORTFOLIO_MAX_ITEMS} per portfolio.
            </div>
          )}

          <div>
            <label
              htmlFor="portfolio-name"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
            >
              Name
            </label>
            <input
              id="portfolio-name"
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) handleSubmit();
              }}
              maxLength={120}
              placeholder="e.g. Q3 mobility brief"
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm",
                "border-gray-300 dark:border-gray-600",
                "bg-white dark:bg-dark-surface text-gray-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue/30",
              )}
            />
          </div>

          <div>
            <label
              htmlFor="portfolio-description"
              className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1"
            >
              Description{" "}
              <span className="text-xs font-normal text-gray-500">
                (optional)
              </span>
            </label>
            <textarea
              id="portfolio-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="What's this collection for?"
              className={cn(
                "w-full rounded-md border px-3 py-2 text-sm",
                "border-gray-300 dark:border-gray-600",
                "bg-white dark:bg-dark-surface text-gray-900 dark:text-white",
                "focus:outline-none focus:ring-2 focus:ring-brand-blue/30",
              )}
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={cn(
              "rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm",
              "text-gray-700 dark:text-gray-200",
              "hover:bg-gray-50 dark:hover:bg-dark-surface-hover",
              "disabled:opacity-50",
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              "bg-brand-blue text-white hover:bg-brand-blue/90",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create portfolio
          </button>
        </div>
      </div>
    </div>
  );
}

export default SavePortfolioModal;
