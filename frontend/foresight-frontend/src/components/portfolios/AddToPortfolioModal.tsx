/**
 * AddToPortfolioModal
 *
 * Lets the user drop a single card into one of their existing portfolios
 * (filtered to the current workstream) or create a new portfolio seeded with
 * the card. Used from per-card menus on kanban cards.
 */

import { useCallback, useEffect, useState } from "react";
import { Briefcase, Loader2, Plus, X } from "lucide-react";
import { cn } from "../../lib/utils";
import {
  addItemsToPortfolio,
  listPortfolios,
  type Portfolio,
} from "../../lib/portfolios-api";
import { SavePortfolioModal } from "./SavePortfolioModal";

export interface AddToPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  cardName?: string;
  workstreamId: string | null;
  getAuthToken: () => Promise<string | null>;
  onAdded: (portfolio: Portfolio) => void;
}

export function AddToPortfolioModal({
  isOpen,
  onClose,
  cardId,
  cardName,
  workstreamId,
  getAuthToken,
  onAdded,
}: AddToPortfolioModalProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required");
      const list = await listPortfolios(token, workstreamId ?? undefined);
      setPortfolios(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [getAuthToken, workstreamId]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !submittingId) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, submittingId]);

  if (!isOpen && !showCreateModal) return null;

  const handleAdd = async (portfolio: Portfolio) => {
    setSubmittingId(portfolio.id);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Authentication required");
      await addItemsToPortfolio(token, portfolio.id, [cardId]);
      onAdded(portfolio);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <>
      {isOpen && !showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div
            className={cn(
              "w-full max-w-md rounded-xl shadow-2xl",
              "bg-white dark:bg-dark-surface-elevated",
              "border border-gray-200 dark:border-gray-700",
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-to-portfolio-title"
          >
            <div className="flex items-start justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-brand-blue" />
                <h2
                  id="add-to-portfolio-title"
                  className="text-lg font-semibold text-gray-900 dark:text-white"
                >
                  Add to portfolio
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submittingId !== null}
                className="p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-surface disabled:opacity-50"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 max-h-[60vh] overflow-auto">
              {cardName && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                  Add{" "}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {cardName}
                  </span>{" "}
                  to a portfolio.
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center py-6 text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading…
                </div>
              ) : error ? (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              ) : (
                <ul className="space-y-1">
                  {portfolios.map((p) => {
                    const atLimit = p.item_count >= 15;
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => handleAdd(p)}
                          disabled={submittingId !== null || atLimit}
                          className={cn(
                            "w-full text-left rounded-md px-3 py-2",
                            "border border-transparent",
                            "hover:bg-gray-50 dark:hover:bg-dark-surface-hover hover:border-gray-200 dark:hover:border-gray-700",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "flex items-center justify-between gap-2",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {p.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {p.item_count} signal
                              {p.item_count === 1 ? "" : "s"}
                              {atLimit && " — at 15-card limit"}
                            </div>
                          </div>
                          {submittingId === p.id && (
                            <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                  <li>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      disabled={submittingId !== null}
                      className={cn(
                        "w-full text-left rounded-md px-3 py-2",
                        "border border-dashed border-gray-300 dark:border-gray-600",
                        "text-brand-blue hover:bg-brand-blue/5",
                        "flex items-center gap-2",
                        "disabled:opacity-50",
                      )}
                    >
                      <Plus className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        New portfolio…
                      </span>
                    </button>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <SavePortfolioModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        cardIds={[cardId]}
        workstreamId={workstreamId}
        getAuthToken={getAuthToken}
        onCreated={(portfolio) => {
          setShowCreateModal(false);
          onAdded(portfolio);
        }}
      />
    </>
  );
}

export default AddToPortfolioModal;
