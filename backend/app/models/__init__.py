"""
Foresight API Models

Pydantic models for data validation and serialization.
Re-exports every public symbol from all model sub-modules so that
existing ``from app.models import Foo`` imports continue to work.
"""

# -- Pre-existing model modules ------------------------------------------------

from .validation import (
    ClassificationValidation,
    ClassificationValidationCreate,
    ClassificationAccuracyMetrics,
    ValidationSummary,
)

from .search import (
    # Filter components
    DateRange,
    ScoreThreshold,
    ScoreThresholds,
    SearchFilters,
    # Search request/response
    AdvancedSearchRequest,
    SearchResultItem,
    AdvancedSearchResponse,
    # Saved searches
    SavedSearchCreate,
    SavedSearchUpdate,
    SavedSearch,
    SavedSearchList,
    # Search history
    SearchHistoryEntry,
    SearchHistoryCreate,
    SearchHistoryList,
)

from .export import (
    ExportFormat,
    ChartOptions,
    ExportRequest,
    ExportResponse,
    CardExportData,
    WorkstreamExportRequest,
    WorkstreamExportResponse,
    EXPORT_CONTENT_TYPES,
    get_export_filename,
)

from .history import (
    ScoreHistory,
    ScoreHistoryCreate,
    ScoreHistoryResponse,
    StageHistory,
    StageHistoryList,
    RelatedCard,
    RelatedCardsList,
    CardData,
    CardComparisonItem,
    CardComparisonResponse,
)

from .brief import (
    BriefStatusEnum,
    BriefSection,
    ExecutiveBriefCreate,
    ExecutiveBriefResponse,
    BriefGenerateResponse,
    BriefStatusResponse,
    BriefListItem,
    BriefVersionsResponse,
    BriefVersionListItem,
    VALID_BRIEF_STATUSES,
)

from .source_rating import (
    RelevanceRating,
    SourceRatingCreate,
    SourceRatingResponse,
    SourceRatingAggregate,
)

from .quality import (
    QualityTier,
    QualityBreakdown,
    QualityTierFilter,
)

from .domain_reputation import (
    DomainReputationResponse,
    DomainReputationCreate,
    DomainReputationUpdate,
    TopDomainsResponse,
    DomainReputationList,
)

from .card_creation import (
    CreateCardFromTopicRequest,
    CreateCardFromTopicResponse,
    ManualCardCreateRequest,
    KeywordSuggestionResponse,
)

from .analytics import (
    VelocityDataPoint,
    VelocityResponse,
    PillarCoverageItem,
    PillarCoverageResponse,
    InsightItem,
    InsightsResponse,
    StageDistribution,
    HorizonDistribution,
    TrendingTopic,
    SourceStats,
    DiscoveryStats,
    WorkstreamEngagement,
    FollowStats,
    SystemWideStats,
    UserFollowItem,
    PopularCard,
    UserEngagementComparison,
    PillarAffinity,
    PersonalStats,
    AnchorOverview,
    CspGoalCoverage,
    SignalTypeMix,
    IssueTagCount,
    SparklinePoint,
    KpiSparkline,
    LensDelta24h,
    LensOverviewResponse,
)

# -- New model modules added during Wave 2 decomposition ----------------------

from .core import (
    UserProfile,
    Card,
    CardCreate,
    SimilarCard,
    BlockedTopic,
)

from .card_artifacts import CardArtifacts

from .card_followers import (
    CardFollowerResponse,
    FollowToggleResponse,
)

from .workstream import (
    Workstream,
    WorkstreamCreate,
    WorkstreamUpdate,
    WorkstreamCreateResponse,
    VALID_WORKSTREAM_CARD_STATUSES,
    WorkstreamCardBase,
    WorkstreamCardWithDetails,
    WorkstreamCardCreate,
    WorkstreamCardUpdate,
    WorkstreamCardsGroupedResponse,
    WorkstreamCardsColumnPage,
    AutoPopulateResponse,
    Note,
    NoteCreate,
    PinSignalResponse,
    WorkstreamResearchStatus,
    WorkstreamResearchStatusResponse,
    FilterPreviewRequest,
    FilterPreviewResponse,
    WorkstreamScanResponse,
    WorkstreamScanStatusResponse,
    WorkstreamScanHistoryResponse,
)

from .discovery_models import (
    CustomQuerySpec,
    DiscoveryConfigRequest,
    DiscoveryRun,
    get_discovery_max_queries,
    get_discovery_max_sources,
)

from .review import (
    CardReviewRequest,
    BulkReviewRequest,
    CardDismissRequest,
)

from .research import (
    VALID_TASK_TYPES,
    ResearchTaskCreate,
    ResearchTask,
)

from .notification import (
    VALID_DIGEST_FREQUENCIES,
    VALID_DIGEST_DAYS,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdate,
    DigestPreviewResponse,
)

from .processing_metrics import (
    SourceCategoryMetrics,
    DiscoveryRunMetrics,
    ResearchTaskMetrics,
    ClassificationMetrics,
    ProcessingMetrics,
)

from .chat import (
    ChatRequest,
    ChatSuggestRequest,
)

from .classification_models import (
    VALID_PILLAR_CODES,
    ValidationSubmission,
    ValidationSubmissionResponse,
)

from .assets import (
    CardAsset,
    CardAssetsResponse,
)

from .ai_helpers import (
    SuggestDescriptionRequest,
    SuggestDescriptionResponse,
)

from .briefs_extra import (
    BulkExportRequest,
    BulkBriefCardStatus,
    BulkBriefStatusResponse,
)

from .portfolio import (
    PORTFOLIO_MAX_ITEMS,
    Portfolio,
    PortfolioWithItems,
    PortfolioItem,
    PortfolioItemCardSnapshot,
    PortfolioItemCreate,
    PortfolioItemReorder,
    PortfolioCreate,
    PortfolioUpdate,
    AddItemsRequest,
    ReorderItemsRequest,
    PortfolioExportRequest,
)

from .lens import (
    VALID_ANCHOR_CODES,
    VALID_BUDGET_CYCLES,
    VALID_BUDGET_DIMENSIONS,
    VALID_BUDGET_MAGNITUDE_BANDS,
    VALID_CLIMATE_DRIVERS,
    VALID_CLIMATE_HORIZONS,
    VALID_ISSUE_TAGS,
    VALID_SIGNAL_TYPES,
    AnchorScores,
    BudgetAssessment,
    ClimateAssessment,
    LensClassificationResult,
    LensCoreClassification,
    LensTriage,
    UserMetadata,
    effective_anchor_scores,
    effective_array,
)

from .workstream_collab import (
    WorkstreamMember,
    WorkstreamMemberCreate,
    WorkstreamMemberUpdate,
    WorkstreamInvite,
    WorkstreamInviteCreate,
    WorkstreamInviteCreateResponse,
    WorkstreamInvitePreview,
    InviteAcceptResponse,
    CompleteSignupRequest,
    CommentCreate,
    CommentUpdate,
    CommentReactionToggle,
    CommentResponse,
    ActivityEvent,
    NotificationItem,
    MarkNotificationsReadRequest,
    ShareLinkCreate,
    ShareLinkResponse,
    RevokeShareLinkResponse,
    PublicSharePayload,
    PresenceHeartbeatResponse,
)


__all__ = [
    # validation
    "ClassificationValidation",
    "ClassificationValidationCreate",
    "ClassificationAccuracyMetrics",
    "ValidationSummary",
    # search
    "DateRange",
    "ScoreThreshold",
    "ScoreThresholds",
    "SearchFilters",
    "AdvancedSearchRequest",
    "SearchResultItem",
    "AdvancedSearchResponse",
    "SavedSearchCreate",
    "SavedSearchUpdate",
    "SavedSearch",
    "SavedSearchList",
    "SearchHistoryEntry",
    "SearchHistoryCreate",
    "SearchHistoryList",
    # export
    "ExportFormat",
    "ChartOptions",
    "ExportRequest",
    "ExportResponse",
    "CardExportData",
    "WorkstreamExportRequest",
    "WorkstreamExportResponse",
    "EXPORT_CONTENT_TYPES",
    "get_export_filename",
    # history
    "ScoreHistory",
    "ScoreHistoryCreate",
    "ScoreHistoryResponse",
    "StageHistory",
    "StageHistoryList",
    "RelatedCard",
    "RelatedCardsList",
    "CardData",
    "CardComparisonItem",
    "CardComparisonResponse",
    # brief
    "BriefStatusEnum",
    "BriefSection",
    "ExecutiveBriefCreate",
    "ExecutiveBriefResponse",
    "BriefGenerateResponse",
    "BriefStatusResponse",
    "BriefListItem",
    "BriefVersionsResponse",
    "BriefVersionListItem",
    "VALID_BRIEF_STATUSES",
    # source_rating
    "RelevanceRating",
    "SourceRatingCreate",
    "SourceRatingResponse",
    "SourceRatingAggregate",
    # quality
    "QualityTier",
    "QualityBreakdown",
    "QualityTierFilter",
    # domain_reputation
    "DomainReputationResponse",
    "DomainReputationCreate",
    "DomainReputationUpdate",
    "TopDomainsResponse",
    "DomainReputationList",
    # card_creation
    "CreateCardFromTopicRequest",
    "CreateCardFromTopicResponse",
    "ManualCardCreateRequest",
    "KeywordSuggestionResponse",
    # analytics
    "VelocityDataPoint",
    "VelocityResponse",
    "PillarCoverageItem",
    "PillarCoverageResponse",
    "InsightItem",
    "InsightsResponse",
    "StageDistribution",
    "HorizonDistribution",
    "TrendingTopic",
    "SourceStats",
    "DiscoveryStats",
    "WorkstreamEngagement",
    "FollowStats",
    "SystemWideStats",
    "UserFollowItem",
    "PopularCard",
    "UserEngagementComparison",
    "PillarAffinity",
    "PersonalStats",
    "AnchorOverview",
    "CspGoalCoverage",
    "SignalTypeMix",
    "IssueTagCount",
    "SparklinePoint",
    "KpiSparkline",
    "LensDelta24h",
    "LensOverviewResponse",
    # core
    "UserProfile",
    "Card",
    "CardCreate",
    "SimilarCard",
    "BlockedTopic",
    "CardArtifacts",
    "CardFollowerResponse",
    "FollowToggleResponse",
    # workstream
    "Workstream",
    "WorkstreamCreate",
    "WorkstreamUpdate",
    "WorkstreamCreateResponse",
    "VALID_WORKSTREAM_CARD_STATUSES",
    "WorkstreamCardBase",
    "WorkstreamCardWithDetails",
    "WorkstreamCardCreate",
    "WorkstreamCardUpdate",
    "WorkstreamCardsGroupedResponse",
    "WorkstreamCardsColumnPage",
    "AutoPopulateResponse",
    "Note",
    "NoteCreate",
    "PinSignalResponse",
    "WorkstreamResearchStatus",
    "WorkstreamResearchStatusResponse",
    "FilterPreviewRequest",
    "FilterPreviewResponse",
    "WorkstreamScanResponse",
    "WorkstreamScanStatusResponse",
    "WorkstreamScanHistoryResponse",
    # discovery_models
    "CustomQuerySpec",
    "DiscoveryConfigRequest",
    "DiscoveryRun",
    "get_discovery_max_queries",
    "get_discovery_max_sources",
    # review
    "CardReviewRequest",
    "BulkReviewRequest",
    "CardDismissRequest",
    # research
    "VALID_TASK_TYPES",
    "ResearchTaskCreate",
    "ResearchTask",
    # notification
    "VALID_DIGEST_FREQUENCIES",
    "VALID_DIGEST_DAYS",
    "NotificationPreferencesResponse",
    "NotificationPreferencesUpdate",
    "DigestPreviewResponse",
    # processing_metrics
    "SourceCategoryMetrics",
    "DiscoveryRunMetrics",
    "ResearchTaskMetrics",
    "ClassificationMetrics",
    "ProcessingMetrics",
    # chat
    "ChatRequest",
    "ChatSuggestRequest",
    # classification_models
    "VALID_PILLAR_CODES",
    "ValidationSubmission",
    "ValidationSubmissionResponse",
    # assets
    "CardAsset",
    "CardAssetsResponse",
    # ai_helpers
    "SuggestDescriptionRequest",
    "SuggestDescriptionResponse",
    # briefs_extra
    "BulkExportRequest",
    "BulkBriefCardStatus",
    "BulkBriefStatusResponse",
    # portfolio
    "PORTFOLIO_MAX_ITEMS",
    "Portfolio",
    "PortfolioWithItems",
    "PortfolioItem",
    "PortfolioItemCardSnapshot",
    "PortfolioItemCreate",
    "PortfolioItemReorder",
    "PortfolioCreate",
    "PortfolioUpdate",
    "AddItemsRequest",
    "ReorderItemsRequest",
    "PortfolioExportRequest",
    # lens
    "VALID_ANCHOR_CODES",
    "VALID_BUDGET_CYCLES",
    "VALID_BUDGET_DIMENSIONS",
    "VALID_BUDGET_MAGNITUDE_BANDS",
    "VALID_CLIMATE_DRIVERS",
    "VALID_CLIMATE_HORIZONS",
    "VALID_ISSUE_TAGS",
    "VALID_SIGNAL_TYPES",
    "AnchorScores",
    "BudgetAssessment",
    "ClimateAssessment",
    "LensClassificationResult",
    "LensCoreClassification",
    "LensTriage",
    "UserMetadata",
    "effective_anchor_scores",
    "effective_array",
    # workstream_collab
    "WorkstreamMember",
    "WorkstreamMemberCreate",
    "WorkstreamMemberUpdate",
    "WorkstreamInvite",
    "WorkstreamInviteCreate",
    "WorkstreamInviteCreateResponse",
    "WorkstreamInvitePreview",
    "InviteAcceptResponse",
    "CompleteSignupRequest",
    "CommentCreate",
    "CommentUpdate",
    "CommentReactionToggle",
    "CommentResponse",
    "ActivityEvent",
    "NotificationItem",
    "MarkNotificationsReadRequest",
    "ShareLinkCreate",
    "ShareLinkResponse",
    "RevokeShareLinkResponse",
    "PublicSharePayload",
    "PresenceHeartbeatResponse",
]
