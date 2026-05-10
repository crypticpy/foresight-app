/**
 * WorkstreamKanban — composes the kanban-board page from sibling
 * sub-modules. Responsibilities are intentionally narrow here: state
 * orchestration, data fetching, event handlers that touch the React-tree.
 * Presentation lives in `Header`, `FilterSummary`, `SearchBar`, `StatsBar`,
 * `Toast`, and `SignalDetailModal`/`FormModal`.
 *
 * @module pages/WorkstreamKanban
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Filter, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import { logger } from "../../lib/logger";
import {
  KanbanBoard,
  KanbanErrorBoundary,
  SelectionToolbar,
  type CardActionCallbacks,
  type KanbanStatus,
  type WorkstreamCard,
} from "../../components/kanban";
import {
  useBriefGeneration,
  useCardExport,
  useCheckUpdates,
  useQuickUpdate,
} from "../../components/kanban/actions";
import { BriefPreviewModal } from "../../components/kanban/BriefPreviewModal";
import { BulkExportModal } from "../../components/BulkExportModal";
import { ExportProgressModal } from "../../components/ExportProgressModal";
import { useExportWithProgress } from "../../hooks/useExportWithProgress";
import {
  autoPopulateWorkstream,
  exportBulkBriefs,
  fetchWorkstreamCardSharePayload,
  fetchWorkstreamCards,
  removeCardFromWorkstream,
  setWorkstreamCardWatching,
  startWorkstreamScan,
  triggerDeepDive,
  updateWorkstreamCard,
  type BulkBriefStatusResponse,
  type WorkstreamScanStatusResponse,
} from "../../lib/workstream-api";
import { useCapabilities } from "../../hooks/useCapabilities";
import { useWorkstreamScanPolling } from "../../hooks/useWorkstreamScanPolling";
import { ActivityRail } from "../../components/activity/ActivityRail";
import { MembersDrawer } from "../../components/collaboration/MembersDrawer";
import { ShareWorkstreamModal } from "../../components/collaboration/ShareWorkstreamModal";
import { WorkstreamChatPanel } from "../../components/WorkstreamChatPanel";
import type { Workstream } from "../../components/WorkstreamForm";
import { ToastContainer } from "./Toast";
import { useToasts } from "./useToasts";
import { useResearchPolling } from "./useResearchPolling";
import { downloadWorkstreamReport } from "./api";
import { StatsBar } from "./StatsBar";
import { FilterSummary } from "./FilterSummary";
import { SearchBar } from "./SearchBar";
import { KanbanHeader } from "./Header";
import { FormModal } from "./FormModal";
import { SignalDetailModal } from "./SignalDetailModal";

const EMPTY_COLUMNS: Record<KanbanStatus, WorkstreamCard[]> = {
  inbox: [],
  working: [],
  ready: [],
  archived: [],
};

const WorkstreamKanban: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthContext();
  const { canExport, canRunResearch, forWorkstream } = useCapabilities();

  const scanJustStarted =
    (location.state as { scanJustStarted?: boolean })?.scanJustStarted === true;

  const [workstream, setWorkstream] = useState<Workstream | null>(null);
  const [cards, setCards] =
    useState<Record<KanbanStatus, WorkstreamCard[]>>(EMPTY_COLUMNS);

  const [loading, setLoading] = useState(true);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [autoPopulating, setAutoPopulating] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [, setScanStatus] = useState<WorkstreamScanStatusResponse | null>(null);

  const [error, setError] = useState<string | null>(null);

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

  const { toasts, showToast, dismissToast } = useToasts();

  const [briefModalCard, setBriefModalCard] = useState<WorkstreamCard | null>(
    null,
  );
  const [showBriefModal, setShowBriefModal] = useState(false);

  const [showBulkExportModal, setShowBulkExportModal] = useState(false);
  const [bulkExportStatus, setBulkExportStatus] =
    useState<BulkBriefStatusResponse | null>(null);
  const workstreamCapabilities = forWorkstream(workstream);
  // Phase 4 will reattach a setter when the selection toolbar invokes bulk export.
  const bulkExportLoading = false;
  const [bulkExportError, setBulkExportError] = useState<string | null>(null);
  const [isBulkExporting, setIsBulkExporting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterPillar, setFilterPillar] = useState<string | null>(null);

  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(
    () => new Set(),
  );

  const { researchStatuses, startPolling: startResearchPolling } =
    useResearchPolling({ workstreamId: id, getAuthToken });

  const startResearchPollingRef = useRef(startResearchPolling);
  useEffect(() => {
    startResearchPollingRef.current = startResearchPolling;
  }, [startResearchPolling]);

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

  const {
    triggerBriefGeneration,
    isCardGenerating,
    getCardBrief,
    getCardError,
  } = useBriefGeneration(getAuthToken, id || "", {
    onGenerating: () => showToast("info", "Generating executive brief..."),
    onSuccess: () => showToast("success", "Executive brief generated"),
    onError: (_, error) =>
      showToast("error", `Brief generation failed: ${error.message}`),
  });

  const {
    state: exportState,
    exportBrief: exportBriefWithProgress,
    closeModal: closeExportModal,
    retryExport,
    downloadExport,
  } = useExportWithProgress(getAuthToken);

  const loadWorkstream = useCallback(async () => {
    if (!id || !user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from("workstreams")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.error("Error loading workstream:", fetchError);
        setError(
          "Failed to load workstream. It may not exist or you may not have access.",
        );
        return;
      }

      const isOwner = data.user_id === user.id;
      const isOrgOwned = data.owner_type === "org";
      if (!isOwner && !isOrgOwned) {
        setError("You do not have access to this workstream.");
        return;
      }

      // Stamp a derived `role` so useCapabilities.forWorkstream returns the
      // right caps — the raw row has no `role` column.
      setWorkstream({
        ...data,
        role: isOwner ? "owner" : isOrgOwned ? "org_viewer" : undefined,
      });
    } catch (err) {
      console.error("Error loading workstream:", err);
      setError("An unexpected error occurred.");
    }
  }, [id, user]);

  const loadCards = useCallback(async () => {
    if (!id) return;

    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return;
    }

    try {
      setCardsLoading(true);
      const groupedCards = await fetchWorkstreamCards(token, id);
      setCards(groupedCards);
    } catch (err) {
      console.error("Error loading cards:", err);
      showToast("error", "Failed to load signals");
    } finally {
      setCardsLoading(false);
    }
  }, [id, showToast]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      await loadWorkstream();
      setLoading(false);
    };
    run();
  }, [loadWorkstream]);

  useEffect(() => {
    if (!workstream || !id) return;

    const run = async () => {
      await loadCards();
      try {
        const token = await getAuthToken();
        if (!token) return;
        const result = await autoPopulateWorkstream(token, id, 20);
        if (result.added > 0) {
          showToast(
            "info",
            `${result.added} new signal${result.added !== 1 ? "s" : ""} added to inbox`,
          );
          await loadCards();
        }
      } catch (err) {
        logger.warn("Auto-populate on load failed:", err);
      }
    };

    run();
  }, [workstream, id, loadCards, showToast]);

  useEffect(() => {
    if (workstream && id && Object.values(cards).flat().length > 0) {
      startResearchPolling();
    }
  }, [workstream, id, cards, startResearchPolling]);

  const cardsWithResearchStatus = useMemo(() => {
    const enriched: Record<KanbanStatus, WorkstreamCard[]> = {
      inbox: [],
      working: [],
      ready: [],
      archived: [],
    };

    for (const [status, columnCards] of Object.entries(cards)) {
      enriched[status as KanbanStatus] = columnCards.map((card) => {
        const researchStatus = researchStatuses.get(card.card_id);
        if (researchStatus) {
          return {
            ...card,
            research_status: {
              status: researchStatus.status,
              task_type: researchStatus.task_type,
              task_id: researchStatus.task_id,
              started_at: researchStatus.started_at,
              completed_at: researchStatus.completed_at,
            },
          };
        }
        return card;
      });
    }

    return enriched;
  }, [cards, researchStatuses]);

  const handleCardMove = useCallback(
    async (cardId: string, newStatus: KanbanStatus, newPosition: number) => {
      if (!id) return;

      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }

      let sourceStatus: KanbanStatus | null = null;
      let sourceCard: WorkstreamCard | null = null;
      for (const [status, columnCards] of Object.entries(cards)) {
        const card = columnCards.find((c) => c.id === cardId);
        if (card) {
          sourceStatus = status as KanbanStatus;
          sourceCard = card;
          break;
        }
      }
      if (!sourceStatus || !sourceCard) return;

      const previousCards = { ...cards };

      setCards((prev) => {
        const updated = { ...prev };
        updated[sourceStatus as KanbanStatus] = updated[
          sourceStatus as KanbanStatus
        ].filter((c) => c.id !== cardId);
        const movedCard = { ...sourceCard!, status: newStatus };
        const targetCards = [...updated[newStatus]];
        targetCards.splice(newPosition, 0, movedCard);
        updated[newStatus] = targetCards;
        return updated;
      });

      try {
        await updateWorkstreamCard(token, id, sourceCard.id, {
          status: newStatus,
          position: newPosition,
        });
        showToast("success", "Signal moved successfully");
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        console.error("Error moving card:", errorMessage);
        setCards(previousCards);
        showToast("error", "Failed to move signal. Changes reverted.");
      }
    },
    [id, cards, showToast],
  );

  const handleCardClick = useCallback((card: WorkstreamCard) => {
    setSelectedSignalSlug(card.card.slug);
  }, []);

  const handleNotesUpdate = useCallback(
    async (cardId: string, notes: string) => {
      if (!id) return;

      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }

      try {
        await updateWorkstreamCard(token, id, cardId, { notes });
        setCards((prev) => {
          const updated = { ...prev };
          for (const status of Object.keys(updated) as KanbanStatus[]) {
            updated[status] = updated[status].map((card) =>
              card.id === cardId ? { ...card, notes } : card,
            );
          }
          return updated;
        });
        showToast("success", "Notes saved");
      } catch (err) {
        console.error("Error updating notes:", err);
        showToast("error", "Failed to save notes");
      }
    },
    [id, showToast],
  );

  const handleToggleWatching = useCallback(
    async (cardId: string, isWatching: boolean) => {
      if (!id) return;

      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        throw new Error("Authentication required");
      }

      try {
        await setWorkstreamCardWatching(token, id, cardId, isWatching);
        setCards((prev) => {
          const updated = { ...prev };
          for (const status of Object.keys(updated) as KanbanStatus[]) {
            updated[status] = updated[status].map((card) =>
              card.id === cardId ? { ...card, is_watching: isWatching } : card,
            );
          }
          return updated;
        });
      } catch (err) {
        console.error("Error toggling watch:", err);
        showToast("error", "Failed to update watch state");
        throw err;
      }
    },
    [id, showToast],
  );

  const handleDeepDive = useCallback(
    async (cardId: string) => {
      if (!id) return;

      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }

      try {
        await triggerDeepDive(token, id, cardId);
        showToast("success", "Deep dive analysis started");
        startResearchPollingRef.current();
      } catch (err) {
        console.error("Error triggering deep dive:", err);
        showToast("error", "Failed to start deep dive analysis");
      }
    },
    [id, showToast],
  );

  const handleRemoveCard = useCallback(
    async (cardId: string) => {
      if (!id) return;

      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }

      const previousCards = { ...cards };

      setCards((prev) => {
        const updated = { ...prev };
        for (const status of Object.keys(updated) as KanbanStatus[]) {
          updated[status] = updated[status].filter(
            (card) => card.id !== cardId,
          );
        }
        return updated;
      });

      try {
        await removeCardFromWorkstream(token, id, cardId);
        showToast("success", "Card removed from workstream");
      } catch (err) {
        console.error("Error removing card:", err);
        setCards(previousCards);
        showToast("error", "Failed to remove signal");
      }
    },
    [id, cards, showToast],
  );

  const handleMoveToColumn = useCallback(
    async (cardId: string, status: KanbanStatus) => {
      if (!id) return;

      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }

      let sourceCard: WorkstreamCard | null = null;
      let sourceStatus: KanbanStatus | null = null;
      for (const [s, columnCards] of Object.entries(cards)) {
        const card = columnCards.find((c) => c.id === cardId);
        if (card) {
          sourceCard = card;
          sourceStatus = s as KanbanStatus;
          break;
        }
      }
      if (!sourceCard || !sourceStatus || sourceStatus === status) return;

      const previousCards = { ...cards };
      const targetPosition = cards[status].length;

      setCards((prev) => {
        const updated = { ...prev };
        updated[sourceStatus!] = updated[sourceStatus!].filter(
          (c) => c.id !== cardId,
        );
        const movedCard = { ...sourceCard!, status, position: targetPosition };
        updated[status] = [...updated[status], movedCard];
        return updated;
      });

      try {
        await updateWorkstreamCard(token, id, cardId, {
          status,
          position: targetPosition,
        });
        showToast("success", "Signal moved successfully");
      } catch (err) {
        console.error("Error moving card:", err);
        setCards(previousCards);
        showToast("error", "Failed to move signal");
      }
    },
    [id, cards, showToast],
  );

  const handleCheckUpdates = useCallback(
    async (cardId: string) => {
      await checkForUpdates(cardId);
    },
    [checkForUpdates],
  );

  const handleGenerateBrief = useCallback(
    async (workstreamCardId: string, cardId: string) => {
      for (const columnCards of Object.values(cards)) {
        const card = columnCards.find((c) => c.id === workstreamCardId);
        if (card) {
          setBriefModalCard(card);
          setShowBriefModal(true);
          break;
        }
      }
      await triggerBriefGeneration(cardId);
    },
    [cards, triggerBriefGeneration],
  );

  const handleBriefModalClose = useCallback(() => {
    setShowBriefModal(false);
    setBriefModalCard(null);
  }, []);

  const handleBriefExport = useCallback(
    async (format: "pdf" | "pptx") => {
      if (briefModalCard && id) {
        const cardName = briefModalCard.card.name || "Executive Brief";
        await exportBriefWithProgress(
          id,
          briefModalCard.card.id,
          format,
          cardName,
        );
      }
    },
    [briefModalCard, id, exportBriefWithProgress],
  );

  const handleBriefExportFromCard = useCallback(
    async (cardId: string, format: "pdf" | "pptx") => {
      if (!id) return;
      let cardName = "Executive Brief";
      for (const columnCards of Object.values(cards)) {
        const card = columnCards.find((c) => c.card.id === cardId);
        if (card) {
          cardName = card.card.name || cardName;
          break;
        }
      }
      await exportBriefWithProgress(id, cardId, format, cardName);
    },
    [id, cards, exportBriefWithProgress],
  );

  const handleCloseBulkExport = useCallback(() => {
    if (isBulkExporting) return;
    setShowBulkExportModal(false);
    setBulkExportStatus(null);
    setBulkExportError(null);
  }, [isBulkExporting]);

  const handleExecuteBulkExport = useCallback(
    async (format: "pptx" | "pdf", cardOrder: string[]) => {
      if (!id) return;

      setIsBulkExporting(true);

      try {
        const token = await getAuthToken();
        if (!token) {
          showToast("error", "Authentication required");
          return;
        }

        showToast("info", `Generating ${format.toUpperCase()} portfolio...`);
        const result = await exportBulkBriefs(token, id, format, cardOrder);

        if (result.status === "success" || result.status === "completed") {
          if (result.pptx_url) {
            window.open(result.pptx_url, "_blank");
            showToast("success", "Portfolio presentation opened in new tab");
          } else {
            showToast("success", "Portfolio export completed");
          }
          setShowBulkExportModal(false);
        } else if (result.error) {
          showToast("error", result.error);
        }
      } catch (err) {
        console.error("Bulk export error:", err);
        showToast(
          "error",
          err instanceof Error ? err.message : "Export failed",
        );
      } finally {
        setIsBulkExporting(false);
      }
    },
    [id, showToast],
  );

  const handleShareCard = useCallback(
    async (cardId: string) => {
      if (!id) return;
      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }
      try {
        const payload = await fetchWorkstreamCardSharePayload(
          token,
          id,
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
    [id, showToast],
  );

  const handleCopyShareLink = useCallback(
    async (cardId: string) => {
      if (!id) return;
      const token = await getAuthToken();
      if (!token) {
        showToast("error", "Authentication required");
        return;
      }
      try {
        const payload = await fetchWorkstreamCardSharePayload(
          token,
          id,
          cardId,
        );
        await navigator.clipboard.writeText(payload.url);
        showToast("success", "Share link copied to clipboard");
      } catch (err) {
        console.error("copy share link failed:", err);
        showToast("error", "Could not copy share link");
      }
    },
    [id, showToast],
  );

  const handleToggleSelect = useCallback((cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCardIds(new Set());
  }, []);

  const cardActions: CardActionCallbacks = {
    onNotesUpdate: handleNotesUpdate,
    onDeepDive: handleDeepDive,
    onRemove: handleRemoveCard,
    onMoveToColumn: handleMoveToColumn,
    onQuickUpdate: triggerQuickUpdate,
    onExport: exportCard,
    onExportBrief: handleBriefExportFromCard,
    onCheckUpdates: handleCheckUpdates,
    onGenerateBrief: handleGenerateBrief,
    onToggleWatching: handleToggleWatching,
    onShareCard: handleShareCard,
    onCopyShareLink: handleCopyShareLink,
  };

  const filteredCards = useMemo(() => {
    if (!searchQuery.trim() && !filterPillar) {
      return cardsWithResearchStatus;
    }

    const filtered: Record<KanbanStatus, WorkstreamCard[]> = {
      inbox: [],
      working: [],
      ready: [],
      archived: [],
    };

    const query = searchQuery.toLowerCase().trim();

    for (const [status, columnCards] of Object.entries(
      cardsWithResearchStatus,
    )) {
      filtered[status as KanbanStatus] = columnCards.filter((card) => {
        if (filterPillar && card.card.pillar_id !== filterPillar) {
          return false;
        }
        if (query) {
          const cardText = [
            card.card.name || "",
            card.card.summary || "",
            card.notes || "",
          ]
            .join(" ")
            .toLowerCase();
          if (!cardText.includes(query)) {
            return false;
          }
        }
        return true;
      });
    }
    return filtered;
  }, [cardsWithResearchStatus, searchQuery, filterPillar]);

  const availablePillars = useMemo(() => {
    const pillarSet = new Set<string>();
    for (const columnCards of Object.values(cards)) {
      for (const card of columnCards) {
        if (card.card.pillar_id) {
          pillarSet.add(card.card.pillar_id);
        }
      }
    }
    return Array.from(pillarSet).sort();
  }, [cards]);

  const clearFilters = useCallback(() => {
    setSearchQuery("");
    setFilterPillar(null);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadCards();
    setRefreshing(false);
    showToast("success", "Signals refreshed");
  }, [loadCards, showToast]);

  const handleAutoPopulate = useCallback(async () => {
    if (!id) return;
    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return;
    }
    try {
      setAutoPopulating(true);
      const result = await autoPopulateWorkstream(token, id);
      if (result.added > 0) {
        showToast(
          "success",
          `Added ${result.added} signal${result.added !== 1 ? "s" : ""} to inbox`,
        );
        await loadCards();
      } else {
        showToast("info", "No new matching signals found");
      }
    } catch (err) {
      console.error("Error auto-populating:", err);
      showToast("error", "Failed to auto-populate workstream");
    } finally {
      setAutoPopulating(false);
    }
  }, [id, loadCards, showToast]);

  const { startPollingExistingScan } = useWorkstreamScanPolling({
    workstreamId: id,
    getAuthToken,
    onStatus: (status) => {
      setScanning(status.status === "queued" || status.status === "running");
      setScanStatus(status);
    },
    onComplete: async (status) => {
      setScanning(false);
      if (status.status === "completed") {
        const cardsAdded = status.results?.cards_added_to_workstream ?? 0;
        const cardsCreated = status.results?.cards_created ?? 0;
        if (cardsAdded > 0 || cardsCreated > 0) {
          showToast(
            "success",
            `Scan complete! ${cardsCreated} new signal${cardsCreated !== 1 ? "s" : ""} created, ${cardsAdded} added to inbox`,
          );
          await loadCards();
        } else {
          showToast("info", "Scan complete - no new signals found");
        }
      } else if (status.status === "failed") {
        showToast("error", status.error_message || "Scan failed");
      }
    },
    onError: (msg) => {
      setScanning(false);
      showToast("error", msg);
    },
  });

  const handleStartScan = useCallback(async () => {
    if (!id) return;

    const token = await getAuthToken();
    if (!token) {
      showToast("error", "Authentication required");
      return;
    }

    try {
      setScanning(true);
      const response = await startWorkstreamScan(token, id);
      setScanStatus({
        scan_id: response.scan_id,
        workstream_id: response.workstream_id,
        status: response.status,
        created_at: new Date().toISOString(),
      });
      showToast("info", response.message);
      startPollingExistingScan(response.scan_id);
    } catch (err: unknown) {
      setScanning(false);
      const message =
        err instanceof Error ? err.message : "Failed to start scan";
      if (message.includes("Rate limit")) {
        showToast(
          "error",
          "Scan limit reached (2 per day). Try again tomorrow.",
        );
      } else if (message.includes("already in progress")) {
        showToast(
          "error",
          "A scan is already running. Please wait for it to complete.",
        );
      } else if (message.includes("keywords or pillars")) {
        showToast(
          "error",
          "Add keywords or pillars to this workstream to enable scanning.",
        );
      } else {
        showToast("error", message);
      }
    }
  }, [id, showToast, startPollingExistingScan]);

  useEffect(() => {
    if (!scanJustStarted || !id || !workstream) return;
    navigate(location.pathname, { replace: true, state: {} });
    showToast(
      "info",
      "Scan started! We're looking for signals matching your workstream...",
    );
    startPollingExistingScan();
  }, [
    scanJustStarted,
    id,
    workstream,
    navigate,
    location.pathname,
    startPollingExistingScan,
    showToast,
  ]);

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
        if (!token) {
          throw new Error("Authentication required");
        }
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
              onCardMove={handleCardMove}
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
            />
          </KanbanErrorBoundary>
        )}

        {showEditModal && (
          <FormModal
            workstream={workstream}
            onSuccess={handleFormSuccess}
            onCancel={handleFormCancel}
          />
        )}

        <BriefPreviewModal
          isOpen={showBriefModal}
          onClose={handleBriefModalClose}
          brief={
            briefModalCard
              ? (() => {
                  const brief = getCardBrief(briefModalCard.card.id);
                  if (!brief) return null;
                  return {
                    id: brief.id,
                    card_id: brief.card_id,
                    title: briefModalCard.card.name,
                    executive_summary: brief.summary || "",
                    content_markdown: brief.content_markdown || "",
                    created_at: brief.created_at,
                  };
                })()
              : null
          }
          isGenerating={
            briefModalCard ? isCardGenerating(briefModalCard.card.id) : false
          }
          error={
            briefModalCard
              ? getCardError(briefModalCard.card.id)?.message || null
              : null
          }
          onExportPdf={() => handleBriefExport("pdf")}
          onExportPptx={() => handleBriefExport("pptx")}
          cardName={briefModalCard?.card.name || ""}
          onRetry={
            briefModalCard
              ? () => triggerBriefGeneration(briefModalCard.card.id)
              : undefined
          }
        />

        <ExportProgressModal
          isOpen={exportState.showModal}
          onClose={closeExportModal}
          status={exportState.status}
          format={exportState.format || "pptx"}
          progress={exportState.progress}
          statusMessage={exportState.statusMessage}
          errorMessage={exportState.errorMessage || undefined}
          downloadUrl={exportState.downloadUrl || undefined}
          filename={exportState.filename || undefined}
          onDownload={downloadExport}
          onRetry={retryExport}
          itemName={exportState.itemName || undefined}
          isGammaPowered={exportState.isGammaPowered}
          estimatedTimeSeconds={exportState.estimatedTimeSeconds}
        />

        <BulkExportModal
          isOpen={showBulkExportModal}
          onClose={handleCloseBulkExport}
          workstreamName={workstream.name}
          statusData={bulkExportStatus}
          isLoading={bulkExportLoading}
          error={bulkExportError}
          onExport={handleExecuteBulkExport}
          isExporting={isBulkExporting}
        />

        <SignalDetailModal
          slug={selectedSignalSlug}
          onClose={() => setSelectedSignalSlug(null)}
          onSlugChange={setSelectedSignalSlug}
        />

        <WorkstreamChatPanel
          workstreamId={id!}
          workstreamName={workstream.name}
          isOpen={chatOpen}
          onClose={() => setChatOpen(false)}
        />

        <ShareWorkstreamModal
          workstreamId={workstream.id}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
        <MembersDrawer
          workstreamId={workstream.id}
          open={membersOpen}
          canManage={workstreamCapabilities.canManage}
          onClose={() => setMembersOpen(false)}
        />
        <ActivityRail
          workstreamId={workstream.id}
          open={activityOpen}
          onClose={() => setActivityOpen(false)}
        />

        <ToastContainer notifications={toasts} onDismiss={dismissToast} />
      </div>
    </div>
  );
};

interface ErrorStateProps {
  title: string;
  description: string;
  iconColorClass: string;
}

function ErrorState({ title, description, iconColorClass }: ErrorStateProps) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center py-12 bg-white dark:bg-dark-surface rounded-lg shadow">
        <div className={iconColorClass}>
          <Filter className="mx-auto h-12 w-12" />
        </div>
        <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white mb-2">
          {title}
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{description}</p>
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

export default WorkstreamKanban;
