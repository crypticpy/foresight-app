/**
 * CardDetail Component
 *
 * Top-level orchestrator for the card-detail route. State, polling, and data
 * loading live in the hooks under `./hooks/`; this file owns the tab chrome,
 * loading/not-found states, and the dispatch between tab panels.
 *
 * @module components/CardDetail/CardDetail
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
} from "react";
import {
  useParams,
  useNavigate,
  useSearchParams,
  useLocation,
} from "react-router-dom";
import {
  Eye,
  FileText,
  Calendar,
  TrendingUp,
  GitBranch,
  FolderOpen,
  MessageCircle,
  MessageSquare,
  Microscope,
} from "lucide-react";

import { getAuthToken } from "../../lib/auth";
import { useAuthContext } from "../../hooks/useAuthContext";
import { useFollowCard } from "../../hooks/useFollowCard";
import { useToast } from "../ui/Toast";
import { cn } from "../../lib/utils";
import { getCardArtifacts } from "../../lib/card-artifacts-api";
import type {
  AnchorScores,
  PillarCode,
  SignalType,
  UserMetadata,
} from "../../lib/lens-api";

import { CardDetailLoading, CardDetailNotFound } from "./CardDetailStates";
import { CardDetailHeader } from "./CardDetailHeader";
import { CardActionButtons } from "./CardActionButtons";
import { ResearchStatusBanner } from "./ResearchStatusBanner";
import {
  CardDescription,
  CardClassification,
  ImpactMetricsPanel,
  MaturityScorePanel,
  ActivityStatsPanel,
} from "./tabs/OverviewTab";
import { LensMetadataPanel } from "../lens/LensMetadataPanel";
import { SourcesTab } from "./tabs/SourcesTab";
import { TimelineTab } from "./tabs/TimelineTab";
import { NotesTab } from "./tabs/NotesTab";
import { ResearchTab } from "./tabs/ResearchTab";
import { AssetsTab } from "./AssetsTab";
import { CommentThread } from "../comments/CommentThread";
import { ScoreTimelineChart } from "../visualizations/ScoreTimelineChart";
import { ConceptNetworkDiagram } from "../visualizations/ConceptNetworkDiagram";

import { useCardData, useResearch, useCardAssets } from "./hooks";
import type { CardDetailTab } from "./types";

const ChatTabContent = React.lazy(() => import("./ChatTabContent"));

export interface CardDetailProps {
  className?: string;
  /** Optional slug for embedded views that do not own the route. */
  slugOverride?: string;
  /** Render inside another surface instead of as a full page. */
  embedded?: boolean;
  /** Hide mutating controls for authenticated shared-link views. */
  readOnly?: boolean;
  /** Optional related-card navigation override for embedded flows. */
  onRelatedCardClick?: (cardSlug: string) => void;
}

export const CardDetail: React.FC<CardDetailProps> = ({
  className = "",
  slugOverride,
  embedded = false,
  readOnly = false,
  onRelatedCardClick,
}) => {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = slugOverride ?? routeSlug;
  const { user } = useAuthContext();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const mode = searchParams.get("mode");
  const isReviewMode = mode === "review" || mode === "edit";
  const fromPath = (location.state as { from?: string })?.from;
  const backLink = isReviewMode ? "/discover/queue" : fromPath || "/discover";
  const backLinkText = isReviewMode
    ? "Back to Review Queue"
    : fromPath === "/signals"
      ? "Back to Signals"
      : fromPath === "/"
        ? "Back to Dashboard"
        : "Back to Discover";

  const [activeTab, setActiveTab] = useState<CardDetailTab>("overview");
  const [newNote, setNewNote] = useState("");

  const {
    card: rawCard,
    sources,
    timeline,
    notes,
    researchHistory,
    loading,
    scoreHistory,
    scoreHistoryLoading,
    scoreHistoryError,
    stageHistory,
    stageHistoryLoading,
    relatedCards,
    relatedCardsLoading,
    relatedCardsError,
    addNote,
    refetch,
    refetchScoreHistory,
    refetchRelatedCards,
  } = useCardData(slug, user, { reviewMode: isReviewMode });

  // Enrich card with on-demand artifacts (fetched after initial load).
  const [artifacts, setArtifacts] =
    useState<NonNullable<typeof rawCard>["artifacts"]>(undefined);
  useEffect(() => {
    setArtifacts(undefined);
    if (!rawCard?.id) return;
    let cancelled = false;
    getAuthToken()
      .then((token) => (token ? getCardArtifacts(token, rawCard.id) : null))
      .then((next) => {
        if (next && !cancelled) setArtifacts(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rawCard?.id]);

  const card = useMemo(
    () =>
      rawCard
        ? { ...rawCard, artifacts: artifacts ?? rawCard.artifacts }
        : null,
    [rawCard, artifacts],
  );

  const {
    isFollowing,
    followerCount,
    isSaving: followSaving,
    toggleFollow,
  } = useFollowCard(card?.id, getAuthToken, card ?? undefined);

  const {
    researchTask,
    isResearching,
    researchError,
    showReport,
    reportCopied,
    canDeepResearch,
    triggerResearch,
    toggleReport,
    copyReport,
    dismissError,
    dismissTask,
  } = useResearch(card, getAuthToken, refetch);

  const {
    assets,
    loading: assetsLoading,
    error: assetsError,
    refetch: refetchAssets,
  } = useCardAssets(card?.id);

  const handleAddNote = useCallback(async () => {
    if (!newNote.trim()) return;
    const ok = await addNote(newNote);
    if (ok) {
      setNewNote("");
    } else {
      pushToast("Failed to add note", { variant: "error" });
    }
  }, [addNote, newNote, pushToast]);

  const handleDeepResearch = useCallback(() => {
    triggerResearch("deep_research");
  }, [triggerResearch]);

  const handleRelatedCardClick = useCallback(
    (_cardId: string, cardSlug: string) => {
      if (!cardSlug) return;
      if (onRelatedCardClick) {
        onRelatedCardClick(cardSlug);
      } else {
        navigate(`/signals/${cardSlug}`);
      }
    },
    [navigate, onRelatedCardClick],
  );

  const handleArtifactSelect = useCallback(
    (type: "deep" | "brief" | "scan") => {
      setActiveTab(type === "deep" || type === "brief" ? "assets" : "timeline");
    },
    [],
  );

  const tabs = useMemo(
    () => [
      { id: "overview" as const, name: "Overview", icon: Eye },
      { id: "research" as const, name: "Research", icon: Microscope },
      { id: "sources" as const, name: "Sources", icon: FileText },
      { id: "timeline" as const, name: "Timeline", icon: Calendar },
      ...(!readOnly
        ? [{ id: "notes" as const, name: "Notes", icon: TrendingUp }]
        : []),
      { id: "related" as const, name: "Related", icon: GitBranch },
      ...(!readOnly
        ? [{ id: "chat" as const, name: "Chat", icon: MessageSquare }]
        : []),
      { id: "discussion" as const, name: "Discussion", icon: MessageCircle },
      { id: "assets" as const, name: "Assets", icon: FolderOpen },
    ],
    [readOnly],
  );

  // Snap back to overview if the active tab disappears under readOnly.
  useEffect(() => {
    if (!tabs.some((t) => t.id === activeTab)) setActiveTab("overview");
  }, [tabs, activeTab]);

  if (loading) {
    return <CardDetailLoading embedded={embedded} />;
  }

  if (!card) {
    return (
      <CardDetailNotFound
        backLink={backLink}
        backLinkText={backLinkText}
        embedded={embedded}
      />
    );
  }

  return (
    <div
      className={cn(
        "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8",
        embedded && "max-w-none px-0 sm:px-0 lg:px-0 py-0",
        className,
      )}
    >
      <CardDetailHeader
        card={card}
        backLink={backLink}
        backLinkText={backLinkText}
        showBackLink={!embedded}
        onArtifactSelect={handleArtifactSelect}
      >
        {!readOnly && (
          <CardActionButtons
            card={card}
            isFollowing={isFollowing}
            followerCount={followerCount}
            followSaving={followSaving}
            isResearching={isResearching}
            researchTask={researchTask}
            canDeepResearch={canDeepResearch}
            onTriggerResearch={triggerResearch}
            onToggleFollow={toggleFollow}
            getAuthToken={getAuthToken}
          />
        )}
      </CardDetailHeader>

      {(isResearching ||
        researchError ||
        researchTask?.status === "completed") && (
        <ResearchStatusBanner
          isResearching={isResearching}
          researchError={researchError}
          researchTask={researchTask}
          showReport={showReport}
          reportCopied={reportCopied}
          onToggleReport={toggleReport}
          onCopyReport={copyReport}
          onDismissError={dismissError}
          onDismissTask={dismissTask}
        />
      )}

      <div className="border-b border-gray-200 dark:border-gray-700 mb-6 sm:mb-8 -mx-4 px-4 sm:mx-0 sm:px-0">
        <nav
          className="-mb-px flex space-x-4 sm:space-x-8 overflow-x-auto scrollbar-hide"
          role="tablist"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                aria-selected={activeTab === tab.id}
                className={cn(
                  "py-2 px-1 border-b-2 font-medium text-sm flex items-center whitespace-nowrap transition-colors flex-shrink-0",
                  activeTab === tab.id
                    ? "border-brand-blue text-brand-blue"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300",
                )}
              >
                <Icon className="h-4 w-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <CardDescription
              description={card.description}
              cardId={card.id}
              onRestore={refetch}
            />
            <CardClassification
              card={card}
              stageHistory={stageHistory}
              stageHistoryLoading={stageHistoryLoading}
            />
          </div>
          <div className="space-y-4 sm:space-y-6">
            <ImpactMetricsPanel
              impactScore={card.impact_score}
              relevanceScore={card.relevance_score}
              velocityScore={card.velocity_score}
              noveltyScore={card.novelty_score}
              opportunityScore={card.opportunity_score}
              riskScore={card.risk_score}
            />
            <MaturityScorePanel
              maturityScore={card.maturity_score}
              stageId={card.stage_id}
            />
            <ActivityStatsPanel
              sourcesCount={sources.length}
              timelineCount={timeline.length}
              notesCount={notes.length}
              scoreHistory={scoreHistory}
              scoreHistoryLoading={scoreHistoryLoading}
              createdAt={card.created_at}
              updatedAt={card.updated_at}
              deepResearchAt={card.deep_research_at}
            />
            <LensMetadataPanel
              cardId={card.id}
              primaryPillar={(card.pillar_id as PillarCode) || null}
              signalType={(card.signal_type as SignalType) ?? null}
              llmSecondaryPillars={
                (card.secondary_pillars ?? []) as PillarCode[]
              }
              llmAnchorScores={(card.anchor_scores as AnchorScores) ?? null}
              llmIssueTags={card.issue_tags ?? []}
              userMetadata={(card.user_metadata as UserMetadata) ?? null}
              budgetAssessment={card.budget_assessment ?? null}
              climateAssessment={card.climate_assessment ?? null}
            />
            <ScoreTimelineChart
              data={scoreHistory}
              title="Score History"
              height={180}
              loading={scoreHistoryLoading}
              error={scoreHistoryError}
              onRetry={refetchScoreHistory}
              compact
            />
          </div>
        </div>
      )}

      {activeTab === "research" && (
        <ResearchTab
          researchHistory={researchHistory}
          onRequestDeepResearch={readOnly ? undefined : handleDeepResearch}
          canRequestDeepResearch={!readOnly && canDeepResearch}
        />
      )}
      {activeTab === "sources" && <SourcesTab sources={sources} />}
      {activeTab === "timeline" && <TimelineTab timeline={timeline} />}
      {activeTab === "notes" && (
        <NotesTab
          notes={notes}
          newNoteValue={newNote}
          onNewNoteChange={setNewNote}
          onAddNote={handleAddNote}
        />
      )}
      {activeTab === "related" && (
        <ConceptNetworkDiagram
          sourceCardId={card.id}
          sourceCardName={card.name}
          sourceCardSummary={card.summary}
          sourceCardHorizon={card.horizon}
          relatedCards={relatedCards}
          height={600}
          loading={relatedCardsLoading}
          error={relatedCardsError}
          onRetry={refetchRelatedCards}
          onCardClick={handleRelatedCardClick}
          showMinimap
          showBackground
          title="Related Trends Network"
        />
      )}
      {activeTab === "chat" && (
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-8 text-gray-500">
              Loading chat...
            </div>
          }
        >
          <ChatTabContent
            cardId={card.id}
            cardName={card.name}
            primaryPillar={card.pillar_id}
          />
        </Suspense>
      )}
      {activeTab === "discussion" && (
        <CommentThread
          targetType="card"
          targetId={card.id}
          canComment={!readOnly && Boolean(user)}
          title="Signal discussion"
          emptyHint="Be the first to start a discussion on this signal."
        />
      )}
      {activeTab === "assets" && (
        <AssetsTab
          cardId={card.id}
          assets={assets}
          isLoading={assetsLoading}
          error={assetsError}
          onRefresh={refetchAssets}
        />
      )}
    </div>
  );
};

export default CardDetail;
