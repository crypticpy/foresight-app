/**
 * WorkstreamKanban — composes the kanban-board page from sibling
 * sub-modules. Responsibilities are intentionally narrow here: UI state
 * orchestration and wiring the hooks into JSX. Domain logic lives in
 * sibling hooks (`useWorkstreamData`, `useKanbanCardOperations`,
 * `useFilteredCards`, `useScanFlow`, `useShareHandlers`, `useBriefFlow`,
 * `useBulkExport`).
 *
 * @module pages/WorkstreamKanban
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import {
  KanbanBoard,
  KanbanErrorBoundary,
  SelectionToolbar,
  type CardActionCallbacks,
  type WorkstreamCard,
} from "../../components/kanban";
import {
  useCardExport,
  useCheckUpdates,
  useQuickUpdate,
} from "../../components/kanban/actions";
import { useCapabilities } from "../../hooks/useCapabilities";

import { ToastContainer } from "./Toast";
import { useToasts } from "./useToasts";
import { useResearchPolling } from "./useResearchPolling";
import { downloadWorkstreamReport } from "./api";
import { StatsBar } from "./StatsBar";
import { FilterSummary } from "./FilterSummary";
import { SearchBar } from "./SearchBar";
import { KanbanHeader } from "./Header";
import { ErrorState } from "./ErrorState";
import { KanbanModals } from "./KanbanModals";
import { useWorkstreamData } from "./useWorkstreamData";
import { useKanbanCardOperations } from "./useKanbanCardOperations";
import { useFilteredCards } from "./useFilteredCards";
import { useScanFlow } from "./useScanFlow";
import { useShareHandlers } from "./useShareHandlers";
import { useBriefFlow } from "./useBriefFlow";
import { useBulkExport } from "./useBulkExport";

const WorkstreamKanban: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthContext();
  const { canExport, canRunResearch, forWorkstream } = useCapabilities();
  const { toasts, showToast, dismissToast } = useToasts();

  const [showEditModal, setShowEditModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [selectedSignalSlug, setSelectedSignalSlug] = useState<string | null>(
    null,
  );
  const [exportLoading, setExportLoading] = useState<"pdf" | "pptx" | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPillar, setFilterPillar] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    () => new Set(),
  );

  const {
    workstream,
    cards,
    setCards,
    hasMore,
    loadMoreColumn,
    loading,
    cardsLoading,
    refreshing,
    autoPopulating,
    error,
    loadWorkstream,
    loadCards,
    handleRefresh,
    handleAutoPopulate,
  } = useWorkstreamData({ workstreamId: id, user, showToast });

  const workstreamCapabilities = forWorkstream(workstream);

  const { researchStatuses, startPolling: startResearchPolling } =
    useResearchPolling({ workstreamId: id, getAuthToken });

  const startResearchPollingRef = useRef(startResearchPolling);
  useEffect(() => {
    startResearchPollingRef.current = startResearchPolling;
  }, [startResearchPolling]);

  useEffect(() => {
    if (workstream && id && Object.values(cards).flat().length > 0) {
      startResearchPolling();
    }
  }, [workstream, id, cards, startResearchPolling]);

  const { triggerQuickUpdate } = useQuickUpdate(getAuthToken, id || "", {
    onSuccess: () => {
      showToast("success", "Quick update started");
      startResearchPollingRef.current();
    },
    onError: (_, error) => showToast("error", error.message),
  });

  const { exportCard } = useCardExport(getAuthToken, {
    onSuccess: (_, format) =>
      showToast("success", `${format.toUpperCase()} export started`),
    onError: (_, format, error) =>
      showToast(
        "error",
        `Failed to export ${format.toUpperCase()}: ${error.message}`,
      ),
  });

  const { checkForUpdates } = useCheckUpdates(getAuthToken, id || "", {
    onSuccess: () => showToast("success", "Update check started"),
    onError: (_, error) => showToast("error", error.message),
  });

  const cardOps = useKanbanCardOperations({
    workstreamId: id,
    cards,
    setCards,
    showToast,
    onResearchStarted: () => startResearchPollingRef.current(),
  });

  const { filteredCards, availablePillars } = useFilteredCards({
    cards,
    researchStatuses,
    searchQuery,
    filterPillar,
  });

  const { scanning, handleStartScan } = useScanFlow({
    workstreamId: id,
    workstreamLoaded: !!workstream,
    showToast,
    reloadCards: loadCards,
  });

  const { handleShareCard, handleCopyShareLink } = useShareHandlers({
    workstreamId: id,
    showToast,
  });

  const briefFlow = useBriefFlow({ workstreamId: id, cards, showToast });
  const bulkExport = useBulkExport({ workstreamId: id, showToast });

  const handleCardClick = useCallback((card: WorkstreamCard) => {
    setSelectedSignalSlug(card.card.slug);
  }, []);

  const handleCheckUpdates = useCallback(
    async (cardId: string) => {
      await checkForUpdates(cardId);
    },
    [checkForUpdates],
  );

  const handleToggleSelect = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCardIds(new Set());
  }, []);

  const cardActions: CardActionCallbacks = {
    onNotesUpdate: cardOps.handleNotesUpdate,
    onDeepDive: cardOps.handleDeepDive,
    onRemove: cardOps.handleRemoveCard,
    onMoveToColumn: cardOps.handleMoveToColumn,
    onQuickUpdate: triggerQuickUpdate,
    onExport: exportCard,
    onExportBrief: briefFlow.handleBriefExportFromCard,
    onCheckUpdates: handleCheckUpdates,
    onGenerateBrief: briefFlow.handleGenerateBrief,
    onToggleWatching: cardOps.handleToggleWatching,
    onShareCard: handleShareCard,
    onCopyShareLink: handleCopyShareLink,
  };

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setFilterPillar(null);
  }, []);

  const handleFormSuccess = useCallback(() => {
    setShowEditModal(false);
    loadWorkstream();
    showToast("success", "Workstream updated");
  }, [loadWorkstream, showToast]);

  const handleFormCancel = useCallback(() => {
    setShowEditModal(false);
  }, []);

  const handleWorkstreamExport = useCallback(
    async (format: "pdf" | "pptx") => {
      if (!workstream || !id) return;
      try {
        setExportLoading(format);
        const token = await getAuthToken();
        if (!token) throw new Error("Authentication required");
        await downloadWorkstreamReport({
          workstreamId: id,
          workstreamName: workstream.name,
          format,
          token,
        });
        showToast("success", `${format.toUpperCase()} export started`);
      } catch (err) {
        console.error("Export failed:", err);
        showToast(
          "error",
          err instanceof Error ? err.message : "Export failed",
        );
      } finally {
        setExportLoading(null);
      }
    },
    [workstream, id, showToast],
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
      <ErrorState
        title="Error"
        description={error}
        iconColorClass="text-red-500 dark:text-red-400"
      />
    );
  }

  if (!workstream) {
    return (
      <ErrorState
        title="Workstream not found"
        description="The workstream you're looking for doesn't exist or has been deleted."
        iconColorClass="text-gray-400 dark:text-gray-500"
      />
    );
  }

  return (
    <div className="min-h-screen dark:bg-brand-dark-blue">
      <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <KanbanHeader
          workstream={workstream}
          canEditBoard={workstreamCapabilities.canEditBoard}
          canManage={workstreamCapabilities.canManage}
          canRunResearch={canRunResearch}
          canExport={canExport}
          scanning={scanning}
          autoPopulating={autoPopulating}
          refreshing={refreshing}
          cardsLoading={cardsLoading}
          exportLoading={exportLoading}
          onStartScan={handleStartScan}
          onAutoPopulate={handleAutoPopulate}
          onRefresh={handleRefresh}
          onOpenShare={() => setShareOpen(true)}
          onOpenMembers={() => setMembersOpen(true)}
          onOpenActivity={() => setActivityOpen(true)}
          onExport={handleWorkstreamExport}
          workstreamId={id!}
          onOpenChat={() => setChatOpen(true)}
          onOpenEdit={() => setShowEditModal(true)}
        />

        <FilterSummary workstream={workstream} />
        <StatsBar cards={cards} />

        <SearchBar
          searchQuery={searchQuery}
          filterPillar={filterPillar}
          availablePillars={availablePillars}
          filteredCards={filteredCards}
          totalCards={cards}
          onSearchChange={setSearchQuery}
          onPillarChange={setFilterPillar}
          onClearFilters={clearFilters}
        />

        {cardsLoading && Object.values(cards).every((c) => c.length === 0) ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-brand-blue" />
              <p className="text-gray-600 dark:text-gray-400">
                Loading cards...
              </p>
            </div>
          </div>
        ) : (
          <KanbanErrorBoundary
            onError={(error) => {
              console.error("Kanban board error:", error);
              showToast("error", "An error occurred in the Kanban board");
            }}
          >
            {workstreamCapabilities.canEditBoard && (
              <SelectionToolbar
                workstreamId={id!}
                selectedCardIds={Array.from(selectedCardIds)}
                getAuthToken={getAuthToken}
                showToast={showToast}
                onClearSelection={handleClearSelection}
                onCardsChanged={loadCards}
              />
            )}
            <KanbanBoard
              cards={filteredCards}
              workstreamId={id!}
              onCardMove={cardOps.handleCardMove}
              readOnly={!workstreamCapabilities.canEditBoard}
              onCardClick={handleCardClick}
              cardActions={
                workstreamCapabilities.canEditBoard ? cardActions : undefined
              }
              selectedCardIds={
                workstreamCapabilities.canEditBoard
                  ? selectedCardIds
                  : undefined
              }
              onToggleSelect={
                workstreamCapabilities.canEditBoard
                  ? handleToggleSelect
                  : undefined
              }
              hasMore={hasMore}
              onLoadMoreColumn={loadMoreColumn}
            />
          </KanbanErrorBoundary>
        )}

        <KanbanModals
          workstream={workstream}
          workstreamId={id!}
          canManage={workstreamCapabilities.canManage}
          showEditModal={showEditModal}
          onEditClose={handleFormCancel}
          onEditSuccess={handleFormSuccess}
          chatOpen={chatOpen}
          onChatClose={() => setChatOpen(false)}
          shareOpen={shareOpen}
          onShareClose={() => setShareOpen(false)}
          membersOpen={membersOpen}
          onMembersClose={() => setMembersOpen(false)}
          activityOpen={activityOpen}
          onActivityClose={() => setActivityOpen(false)}
          selectedSignalSlug={selectedSignalSlug}
          onSignalClose={() => setSelectedSignalSlug(null)}
          onSignalSlugChange={setSelectedSignalSlug}
          briefFlow={briefFlow}
          bulkExport={bulkExport}
        />

        <ToastContainer notifications={toasts} onDismiss={dismissToast} />
      </div>
    </div>
  );
};

export default WorkstreamKanban;
