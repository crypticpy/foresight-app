/**
 * WorkstreamFeed composer: loads a single workstream + its matching cards,
 * coordinates follow toggling, exposes the export download flow, and renders
 * the header / filter / cards / modal / chat sections.
 *
 * @module pages/WorkstreamFeed
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Edit, Filter, Loader2 } from "lucide-react";
import { WorkstreamChatPanel } from "../../components/WorkstreamChatPanel";
import { useToast } from "../../components/ui/Toast";
import { useAuthContext } from "../../hooks/useAuthContext";
import {
  WorkstreamAccessError,
  downloadWorkstreamExport,
  fetchFollowedCardIds,
  fetchWorkstream,
  fetchWorkstreamFeed,
  toggleFollow,
} from "./api";
import { CardItem } from "./CardItem";
import { EditModal } from "./EditModal";
import { FilterDisplay } from "./FilterDisplay";
import { Header } from "./Header";
import type { Card, Workstream } from "./types";

export default function WorkstreamFeed() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const { pushToast } = useToast();

  const [workstream, setWorkstream] = useState<Workstream | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [followedCardIds, setFollowedCardIds] = useState<Set<string>>(
    new Set(),
  );
  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exportLoading, setExportLoading] = useState<"pdf" | "pptx" | null>(
    null,
  );
  const [showEditModal, setShowEditModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const loadWorkstream = useCallback(async () => {
    if (!id || !user) return;
    try {
      setLoading(true);
      setError(null);
      const data = await fetchWorkstream(id, user.id);
      setWorkstream(data);
    } catch (err) {
      if (err instanceof WorkstreamAccessError) {
        setError(err.message);
      } else {
        console.error("Error loading workstream:", err);
        setError("An unexpected error occurred.");
      }
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  const loadFeed = useCallback(async () => {
    if (!workstream) return;
    try {
      setCardsLoading(true);
      const result = await fetchWorkstreamFeed(workstream);
      setCards(result);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Failed to load feed", {
        variant: "error",
      });
    } finally {
      setCardsLoading(false);
    }
  }, [workstream, pushToast]);

  const loadFollowed = useCallback(async () => {
    if (!user) return;
    try {
      const ids = await fetchFollowedCardIds(user.id);
      setFollowedCardIds(ids);
    } catch (err) {
      console.error("Error loading followed cards:", err);
    }
  }, [user]);

  useEffect(() => {
    loadWorkstream();
  }, [loadWorkstream]);

  useEffect(() => {
    if (workstream) {
      loadFeed();
      loadFollowed();
    }
  }, [workstream, loadFeed, loadFollowed]);

  const handleToggleFollow = useCallback(
    async (cardId: string, isCurrentlyFollowed: boolean) => {
      if (!user) return;
      try {
        await toggleFollow(user.id, cardId, isCurrentlyFollowed);
        setFollowedCardIds((prev) => {
          const next = new Set(prev);
          if (isCurrentlyFollowed) {
            next.delete(cardId);
          } else {
            next.add(cardId);
          }
          return next;
        });
      } catch (err) {
        pushToast(
          err instanceof Error ? err.message : "Could not update follow state",
          { variant: "error" },
        );
      }
    },
    [user, pushToast],
  );

  const handleExport = useCallback(
    async (format: "pdf" | "pptx") => {
      if (!workstream || !id) return;
      try {
        setExportLoading(format);
        await downloadWorkstreamExport(id, workstream.name, format);
      } catch (err) {
        pushToast(err instanceof Error ? err.message : "Export failed", {
          variant: "error",
        });
      } finally {
        setExportLoading(null);
      }
    },
    [workstream, id, pushToast],
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
          <p className="text-gray-600 dark:text-gray-400">
            Loading workstream...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
          <div className="text-red-500 dark:text-red-400 mb-4">
            <Filter className="mx-auto h-12 w-12" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            Error
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <Link
            to="/workstreams"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Workstreams
          </Link>
        </div>
      </div>
    );
  }

  if (!workstream) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
          <Filter className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
            Workstream not found
          </h3>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            The workstream you&apos;re looking for doesn&apos;t exist or has
            been deleted.
          </p>
          <div className="mt-6">
            <Link
              to="/workstreams"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Workstreams
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Org-owned workstreams are read-only for non-admin users; suppress edit
  // affordances rather than letting them 403.
  const isOrgOwned = workstream.owner_type === "org";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Header
        workstream={workstream}
        isOrgOwned={isOrgOwned}
        cardsLoading={cardsLoading}
        exportLoading={exportLoading}
        onRefresh={loadFeed}
        onExport={handleExport}
        onOpenChat={() => setChatOpen(true)}
        onOpenEdit={() => setShowEditModal(true)}
      />

      <FilterDisplay workstream={workstream} />

      {cardsLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
            <p className="text-gray-600 dark:text-gray-400">
              Loading signals...
            </p>
          </div>
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
          <Filter className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">
            No matching signals
          </h3>
          <p className="mt-1 text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            No intelligence signals currently match this workstream&apos;s
            filters.
            {!isOrgOwned &&
              " Try adjusting the filter criteria to broaden your results."}
          </p>
          {!isOrgOwned && (
            <div className="mt-6">
              <button
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-brand-blue hover:bg-brand-dark-blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue dark:focus:ring-offset-dark-surface transition-colors"
              >
                <Edit className="h-4 w-4 mr-2" />
                Adjust Filters
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing {cards.length} {cards.length === 1 ? "card" : "cards"}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((card) => (
              <CardItem
                key={card.id}
                card={card}
                isFollowed={followedCardIds.has(card.id)}
                onToggleFollow={handleToggleFollow}
              />
            ))}
          </div>
        </>
      )}

      {showEditModal && (
        <EditModal
          workstream={workstream}
          onSuccess={() => {
            setShowEditModal(false);
            loadWorkstream();
          }}
          onCancel={() => setShowEditModal(false)}
        />
      )}

      <WorkstreamChatPanel
        workstreamId={id!}
        workstreamName={workstream.name || "Workstream"}
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </div>
  );
}
