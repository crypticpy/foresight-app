"""
Discovery orchestration service for Foresight.

Runs automated discovery scans to find emerging trends and technologies
relevant to municipal government. Uses the query generator to create
search queries and the research pipeline to discover, triage, analyze,
and store new sources.

Key Features:
- Generates queries from Pillars and Top 25 Priorities
- Executes searches using GPT Researcher + Exa
- Triages and analyzes results through AI pipeline
- Deduplicates against existing cards (vector similarity 0.92 threshold)
- Creates new cards or enriches existing ones
- Auto-approves high-confidence discoveries (>0.95)
- Configurable scope caps to control costs
- Multi-source content ingestion from 5 categories:
  1. RSS/Atom feeds - Curated feeds from various sources
  2. News outlets - Major news sites (Reuters, AP News, GCN)
  3. Academic publications - arXiv research papers
  4. Government sources - .gov domains, policy documents
  5. Tech blogs - TechCrunch, Ars Technica, company blogs

Usage:
    from app.discovery_service import DiscoveryService, DiscoveryConfig

    service = DiscoveryService(supabase_client, openai_client)
    config = DiscoveryConfig(
        max_queries_per_run=50,
        max_sources_total=200,
        pillars_filter=['CH', 'MC']
    )
    result = await service.execute_discovery_run(config)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from supabase import Client
import openai

from .query_generator import QueryGenerator
from .ai_service import AIService, TriageResult
from .research_service import RawSource, ProcessedSource
from .source_validator import SourceValidator
from .story_clustering_service import cluster_sources
from . import domain_reputation_service

# Configuration layer (dataclasses, enum, registry/override loaders, factory)
# was extracted to ``discovery_config`` in PR-D1. Re-imported here so
# ``app.discovery_service.DiscoveryConfig`` / ``SourceCategory`` /
# ``build_discovery_config`` etc. still resolve for existing callers and
# tests that reach for them by attribute on this module. ``__all__``
# marks them as explicit public re-exports so Ruff doesn't flag them
# as unused. New code should import from ``app.discovery_config`` directly.
from .discovery_config import (
    DEFAULT_RSS_FEEDS,
    DEFAULT_SEARCH_TOPICS,
    DISCOVERY_SETTING_MAP,
    DiscoveryConfig,
    SourceCategory,
    SourceCategoryConfig,
    _apply_schedule_scope,
    _coerce_custom_query,
    apply_source_preferences,
    build_discovery_config,
    get_discovery_defaults,
    load_active_source_urls,
    load_discovery_admin_overrides,
)

# Similarity helpers (``calculate_name_similarity`` / ``cosine_similarity``)
# were extracted into ``discovery_text_utils`` in PR-D2. Re-imported here
# and re-exported via ``__all__`` below so existing callers
# (e.g. ``app.rss_service.cosine_similarity``) keep resolving.
from .discovery_text_utils import (
    calculate_name_similarity,
    cosine_similarity,
)

# Result types (status enums + dataclasses) were extracted into
# ``discovery_result_types`` in PR-D3. Re-imported here and re-exported via
# ``__all__`` so existing callers like ``backend/scripts/run_e2e_pipeline.py``
# (``from app.discovery_service import ProcessingTimeMetrics, ...``) and the
# public-API contract test continue to resolve them.
from .discovery_result_types import (
    APITokenUsage,
    CardAction,
    CardActionResult,
    DeduplicationResult,
    DiscoveryResult,
    DiscoveryStatus,
    MultiSourceFetchResult,
    ProcessingTimeMetrics,
    SourceDiversityMetrics,
)

# Multi-source fetch stage extracted to ``discovery_fetch`` in PR-D4.
# The 5 per-category fetchers were stateless (no ``self`` access) and the
# orchestrator now lives at module scope so future stage modules can call
# it without instantiating ``DiscoveryService``.
from .discovery_fetch import fetch_from_all_source_categories

# Progress / per-source persistence writers extracted to
# ``discovery_progress`` in PR-D5. These were instance methods that only
# touched the Supabase client; they now live as module-level functions
# that take ``supabase`` as their first argument.
from .discovery_progress import (
    persist_discovered_source,
    update_progress_simple,
    update_source_analysis,
    update_source_dedup,
    update_source_outcome,
    update_source_triage,
)

# Blocked-topic filtering extracted to ``discovery_blocked_topics`` in
# PR-D6. Stateless — takes the Supabase client and processed sources.
from .discovery_blocked_topics import check_blocked_topics

# Run lifecycle helpers extracted to ``discovery_run_lifecycle`` in
# PR-D7. Stateless — they take the Supabase client plus the
# pending-lens-tasks set as explicit arguments.
from .discovery_run_lifecycle import (
    create_run_record,
    finalize_run,
)

# Query generation + search execution extracted to ``discovery_search``
# in PR-D8. Stateless — they take the ``QueryGenerator`` /
# ``ResearchService`` instances as explicit arguments.
# ``QUERY_BATCH_SIZE`` is re-imported so the outer step-level wrapper
# timeout in ``run`` can derive ``num_batches`` from the same constant
# the batch loop reads.
from .discovery_search import (
    QUERY_BATCH_SIZE,
    execute_searches,
    generate_queries,
)

# Triage stage extracted to ``discovery_triage`` in PR-D9. Stateless —
# takes the Supabase client, the ``AIService`` instance, and the
# current run id as explicit arguments.
from .discovery_triage import triage_sources_with_metrics

# Deduplication stage extracted to ``discovery_dedup`` in PR-D10.
# Stateless — takes the Supabase client and the ``AIService``
# instance as explicit arguments.
from .discovery_dedup import deduplicate_sources_with_metrics

# Pure cards-stage helpers extracted to ``discovery_cards_helpers`` in
# PR-D11a. Stateless — no Supabase, no AI calls; only inspect
# ``ProcessedSource`` attributes and apply similarity math.
from .discovery_cards_helpers import (
    calculate_discovery_confidence,
    cluster_similar_concepts,
)

# Per-card persistence helpers extracted to
# ``discovery_cards_persistence`` in PR-D11b. Stateless — they take the
# Supabase client (and, for ``store_source_to_card``, the ``AIService``
# instance) as explicit arguments. ``_create_card_from_source`` and the
# orchestrator still live here and will be extracted once the lens
# cascade has its own module.
from .discovery_cards_persistence import (
    auto_approve_card,
    create_timeline_event,
    store_source_to_card,
)

__all__ = [
    "APITokenUsage",
    "CardAction",
    "CardActionResult",
    "DEFAULT_RSS_FEEDS",
    "DEFAULT_SEARCH_TOPICS",
    "DISCOVERY_SETTING_MAP",
    "DeduplicationResult",
    "DiscoveryConfig",
    "DiscoveryResult",
    "DiscoveryStatus",
    "MultiSourceFetchResult",
    "ProcessingTimeMetrics",
    "SourceCategory",
    "SourceCategoryConfig",
    "SourceDiversityMetrics",
    "_apply_schedule_scope",
    "_coerce_custom_query",
    "apply_source_preferences",
    "build_discovery_config",
    "calculate_name_similarity",
    "cosine_similarity",
    "get_discovery_defaults",
    "load_active_source_urls",
    "load_discovery_admin_overrides",
]

logger = logging.getLogger(__name__)


# Stage number to ID mapping (matches stages table)
STAGE_NUMBER_TO_ID = {
    1: "1_concept",
    2: "2_exploring",
    3: "3_pilot",
    4: "4_proof",
    5: "5_implementing",
    6: "6_scaling",
    7: "7_mature",
    8: "8_declining",
}


# Pillar code mapping: AI codes -> Database pillar IDs
# All 6 canonical pillar codes pass through natively (no lossy conversion).
# The database pillars table has been updated to match the AI taxonomy.
PILLAR_CODE_MAP = {
    "CH": "CH",  # Community Health & Sustainability
    "EW": "EW",  # Economic & Workforce Development
    "HG": "HG",  # High-Performing Government
    "HH": "HH",  # Homelessness & Housing
    "MC": "MC",  # Mobility & Critical Infrastructure
    "PS": "PS",  # Public Safety
}


def convert_pillar_id(ai_pillar: str) -> Optional[str]:
    """
    Convert AI pillar code to database pillar ID.

    All 6 canonical pillar codes (CH, EW, HG, HH, MC, PS) pass through
    natively. Unknown codes are returned as-is.
    """
    if not ai_pillar:
        return None

    # Try direct mapping first
    if ai_pillar in PILLAR_CODE_MAP:
        return PILLAR_CODE_MAP[ai_pillar]

    # If not in map, return as-is (may fail FK constraint)
    logger.warning(f"Unknown pillar code: {ai_pillar}, using as-is")
    return ai_pillar


def convert_goal_id(ai_goal: str) -> str:
    """
    Convert AI goal format (e.g., "CH.1") to database format (e.g., "CH-01").

    AI returns: "CH.1", "MC.3", "HG.2"
    Database expects: "CH-01", "MC-03", "HG-02"
    """
    if not ai_goal or "." not in ai_goal:
        return ai_goal

    parts = ai_goal.split(".")
    if len(parts) != 2:
        return ai_goal

    pillar = parts[0]
    try:
        number = int(parts[1])
        # Pillar code passes through natively (no lossy conversion)
        mapped_pillar = PILLAR_CODE_MAP.get(pillar, pillar)
        return f"{mapped_pillar}-{number:02d}"
    except ValueError:
        return ai_goal




# ============================================================================
# Discovery Service
# ============================================================================


class DiscoveryService:
    """
    Orchestrates automated discovery runs.

    Pipeline:
    1. Generate queries from pillars and priorities
    2. Execute searches using GPT Researcher + Exa
    3. Triage sources for relevance
    4. Check against blocked topics
    5. Deduplicate against existing cards
    6. Create new cards or enrich existing ones
    7. Auto-approve high-confidence discoveries
    """

    def __init__(
        self,
        supabase: Client,
        openai_client: openai.OpenAI,
        triggered_by_user_id: Optional[str] = None,
    ):
        """
        Initialize discovery service.

        Args:
            supabase: Supabase client for database operations
            openai_client: OpenAI client for AI operations
            triggered_by_user_id: Optional user ID to attribute created cards to
        """
        self.supabase = supabase
        self.openai_client = openai_client
        self.triggered_by_user_id = triggered_by_user_id
        self.ai_service = AIService(openai_client)
        self.query_generator = QueryGenerator()

        # Lens classification cascade — lazy-instantiated on first new card so
        # discovery runs that only enrich existing cards don't pay the
        # CSP-taxonomy load.
        self._lens_service = None

        # Strong refs for fire-and-forget cascade tasks. The event loop
        # only holds weak refs to bare ``asyncio.create_task`` results, so
        # without this set the task can be GC'd mid-flight and silently
        # leave a card unclassified. Tasks remove themselves on done.
        self._pending_lens_tasks: set[asyncio.Task] = set()

        # Import research service components for search execution
        # Using dynamic import to avoid circular dependencies
        from .research_service import ResearchService

        self.research_service = ResearchService(supabase, openai_client)

    def _get_lens_service(self):
        """Lazy-init the lens cascade. Uses the async OpenAI client."""
        if self._lens_service is None:
            from .lens_classification_service import LensClassificationService
            from .openai_provider import openai_async_client

            self._lens_service = LensClassificationService(
                openai_async_client, self.supabase
            )
        return self._lens_service

    async def _classify_card_lens(
        self, card_id: str, card_dict: Dict[str, Any]
    ) -> None:
        """Run the lens cascade for a freshly-created card. Best-effort.

        Writes only LLM-derived columns; ``user_metadata`` is untouched. A
        failure here never propagates — discovery returning a card without
        lens metadata is recoverable via ``/admin/classify/backfill``.
        """
        try:
            service = self._get_lens_service()
            result = await service.classify_card(card_dict)
            update = result.to_card_update()
            # Only stamp classified_at when classifier_version is set —
            # which the cascade only does when all required stages
            # succeeded. On partial failure, leave timestamps null so the
            # backfill picks the card up again next pass.
            if update.get("classifier_version") is not None:
                update["classified_at"] = service.now_iso()
            await asyncio.to_thread(
                lambda: self.supabase.table("cards")
                .update(update)
                .eq("id", card_id)
                .execute()
            )
            logger.debug("Lens cascade complete for card %s", card_id)
        except Exception as exc:
            logger.warning("Lens cascade failed for card %s: %s", card_id, exc)

    # ========================================================================
    # Main Entry Point
    # ========================================================================

    async def execute_discovery_run(
        self, config: DiscoveryConfig, existing_run_id: Optional[str] = None
    ) -> DiscoveryResult:
        """
        Execute a complete discovery run.

        Args:
            config: Configuration for this run
            existing_run_id: Optional existing run ID to use (skips creating new record)

        Returns:
            DiscoveryResult with complete statistics
        """
        start_time = datetime.now(timezone.utc)

        # Use existing run_id if provided, otherwise create new record
        if existing_run_id:
            run_id = existing_run_id
            logger.info(f"Using existing discovery run {run_id}")
        else:
            run_id = await create_run_record(self.supabase, config)

        errors: List[str] = []
        sources_by_category: Dict[str, int] = {}
        categories_fetched: int = 0
        diversity_metrics: Optional[SourceDiversityMetrics] = None

        # Initialize enhanced metrics tracking
        processing_time = ProcessingTimeMetrics()
        api_token_usage = APITokenUsage()

        logger.info(f"Starting discovery run {run_id} with config: {config}")

        try:
            # Step 1: Generate queries
            await update_progress_simple(self.supabase,
                run_id,
                "queries",
                "Generating search queries from pillars and priorities...",
                [],
            )
            step_start = datetime.now(timezone.utc)
            queries = await generate_queries(self.query_generator, config)
            processing_time.query_generation_seconds = (
                datetime.now(timezone.utc) - step_start
            ).total_seconds()
            logger.info(
                f"Generated {len(queries)} queries in {processing_time.query_generation_seconds:.2f}s"
            )

            # Step 2a: Multi-source content fetching (5 categories)
            raw_sources: List[RawSource] = []
            search_cost = 0.0

            if config.enable_multi_source:
                step_start = datetime.now(timezone.utc)
                logger.info("Fetching from all 5 source categories...")
                multi_source_result = await fetch_from_all_source_categories(config)
                raw_sources.extend(multi_source_result.sources)
                sources_by_category = multi_source_result.sources_by_category.copy()
                categories_fetched = multi_source_result.categories_fetched
                diversity_metrics = multi_source_result.diversity_metrics
                processing_time.multi_source_fetch_seconds = (
                    datetime.now(timezone.utc) - step_start
                ).total_seconds()

                # Add any multi-source errors to error list
                for (
                    category,
                    cat_errors,
                ) in multi_source_result.errors_by_category.items():
                    for error in cat_errors:
                        errors.append(f"[{category}] {error}")

                logger.info(
                    f"Multi-source fetch: {len(raw_sources)} sources from "
                    f"{categories_fetched}/5 categories in {processing_time.multi_source_fetch_seconds:.2f}s"
                )

            # Step 2b: Execute query-based searches (Serper-first + gpt-researcher).
            # Each query has a 210s inner cap; queries run in batches of 5
            # concurrently inside ``execute_searches``. The outer cap scales
            # with the number of batches (~240s/batch budget = inner 210s + the
            # 1s inter-batch sleep + dedup/gather overhead) and clamps at 1200s
            # so a runaway can't hang the discovery run. Without scaling, a
            # 300s wrapper used to fire mid-second-batch and discard every
            # accumulated query_source — the new ceiling fits multi-batch runs.
            if queries:
                step_start = datetime.now(timezone.utc)
                planned_queries = queries[: config.max_queries_per_run]
                batch_size = QUERY_BATCH_SIZE
                num_batches = (len(planned_queries) + batch_size - 1) // batch_size
                per_batch_budget = 240
                search_step_timeout = min(1200, max(300, num_batches * per_batch_budget))
                try:
                    query_sources, query_cost = await asyncio.wait_for(
                        execute_searches(
                            self.research_service, planned_queries, config
                        ),
                        timeout=search_step_timeout,
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        f"Query-based search step timed out after {search_step_timeout}s "
                        f"({num_batches} batches) - continuing with multi-source results only"
                    )
                    query_sources, query_cost = [], 0.0
                search_cost += query_cost
                processing_time.query_search_seconds = (
                    datetime.now(timezone.utc) - step_start
                ).total_seconds()

                # Deduplicate query sources against multi-source results
                seen_urls = {s.url for s in raw_sources if s.url}
                for source in query_sources:
                    if source.url and source.url not in seen_urls:
                        seen_urls.add(source.url)
                        raw_sources.append(source)
                        # Track as "query" category
                        sources_by_category["query"] = (
                            sources_by_category.get("query", 0) + 1
                        )

                logger.info(
                    f"Query-based search: {len(query_sources)} additional sources in {processing_time.query_search_seconds:.2f}s"
                )

            logger.info(f"Total raw sources discovered: {len(raw_sources)}")

            # Persist every discovered source IMMEDIATELY so we never lose
            # paid-for URLs even if downstream LLM analysis fails or hangs.
            # Each source's discovered_source_id is stamped onto the RawSource
            # so later pipeline steps can update its row in place.
            if raw_sources and not config.dry_run:
                persist_step_start = datetime.now(timezone.utc)
                persist_ok = 0
                for src in raw_sources:
                    try:
                        ds_id = await persist_discovered_source(self.supabase,run_id, src)
                        if ds_id:
                            src.discovered_source_id = ds_id
                            persist_ok += 1
                    except Exception as e:
                        logger.warning(
                            f"Failed to persist discovered source {src.url}: {e}"
                        )
                logger.info(
                    f"Persisted {persist_ok}/{len(raw_sources)} raw sources to "
                    f"discovered_sources in "
                    f"{(datetime.now(timezone.utc) - persist_step_start).total_seconds():.2f}s "
                    f"(safe-saved before LLM analysis)"
                )

            if not raw_sources and not queries:
                logger.warning(
                    "No queries generated and no multi-source results - completing run"
                )
                processing_time.total_seconds = (
                    datetime.now(timezone.utc) - start_time
                ).total_seconds()
                return await finalize_run(
                    self.supabase,
                    pending_lens_tasks=self._pending_lens_tasks,
                    run_id=run_id,
                    start_time=start_time,
                    queries_generated=0,
                    queries_executed=0,
                    sources_discovered=0,
                    sources_triaged=0,
                    sources_blocked=0,
                    sources_duplicate=0,
                    sources_by_category=sources_by_category,
                    categories_fetched=categories_fetched,
                    diversity_metrics=diversity_metrics,
                    card_result=CardActionResult([], [], 0, 0, 0),
                    cost=0.0,
                    errors=["No queries generated and no multi-source results"],
                    status=DiscoveryStatus.COMPLETED,
                    processing_time_metrics=processing_time,
                    api_token_usage_metrics=api_token_usage,
                )

            if not raw_sources:
                logger.warning("No sources discovered - completing run")
                processing_time.total_seconds = (
                    datetime.now(timezone.utc) - start_time
                ).total_seconds()
                return await finalize_run(
                    self.supabase,
                    pending_lens_tasks=self._pending_lens_tasks,
                    run_id=run_id,
                    start_time=start_time,
                    queries_generated=len(queries),
                    queries_executed=min(len(queries), config.max_queries_per_run),
                    sources_discovered=0,
                    sources_triaged=0,
                    sources_blocked=0,
                    sources_duplicate=0,
                    sources_by_category=sources_by_category,
                    categories_fetched=categories_fetched,
                    diversity_metrics=diversity_metrics,
                    card_result=CardActionResult([], [], 0, 0, 0),
                    cost=search_cost,
                    errors=[],
                    status=DiscoveryStatus.COMPLETED,
                    processing_time_metrics=processing_time,
                    api_token_usage_metrics=api_token_usage,
                )

            # Step 2c: Content and freshness validation (Task 2.1)
            # Step 2d: Pre-print detection (Task 2.6)
            validator = SourceValidator()
            validated_sources = []
            content_filter_count = 0
            freshness_filter_count = 0
            preprint_count = 0

            for source in raw_sources:
                content_result = validator.validate_content(source.content or "")
                if not content_result.is_valid:
                    content_filter_count += 1
                    logger.info(
                        f"Source filtered (content): {source.url or 'unknown'} - {content_result.reason_code}"
                    )
                    continue

                freshness_result = validator.validate_freshness(
                    source.published_at,
                    source.source_type or "default",
                )
                if not freshness_result.is_valid:
                    freshness_filter_count += 1
                    logger.info(
                        f"Source filtered (freshness): {source.url or 'unknown'} - {freshness_result.reason_code}"
                    )
                    continue

                # Pre-print detection (Task 2.6): flag before triage so AI can use it
                preprint_result = validator.detect_preprint(
                    source.url or "", source.content
                )
                if preprint_result.is_preprint:
                    source.is_preprint = True
                    preprint_count += 1
                    logger.info(
                        f"Pre-print detected ({preprint_result.confidence}): "
                        f"{source.url or 'unknown'} - {preprint_result.indicators}"
                    )

                validated_sources.append(source)

            logger.info(
                f"Content validation: {content_filter_count} filtered, "
                f"freshness validation: {freshness_filter_count} filtered, "
                f"pre-prints detected: {preprint_count}, "
                f"{len(validated_sources)}/{len(raw_sources)} sources passed"
            )

            # Persist quality_stats to discovery run's summary_report
            quality_stats = {
                "content_filter_count": content_filter_count,
                "freshness_filter_count": freshness_filter_count,
                "preprint_count": preprint_count,
                "sources_before_validation": len(raw_sources),
                "sources_after_validation": len(validated_sources),
            }
            try:
                existing = (
                    self.supabase.table("discovery_runs")
                    .select("summary_report")
                    .eq("id", run_id)
                    .single()
                    .execute()
                )
                report = (
                    existing.data.get("summary_report") if existing.data else {}
                ) or {}
                if not isinstance(report, dict):
                    report = {}
                report["quality_stats"] = quality_stats
                self.supabase.table("discovery_runs").update(
                    {"summary_report": report}
                ).eq("id", run_id).execute()
            except Exception as e:
                logger.warning(f"Failed to persist quality_stats: {e}")

            # Step 2e: Preload domain reputation cache (Task 2.7)
            try:
                source_urls = [s.url for s in validated_sources if s.url]
                domain_reputation_service.get_reputation_batch(
                    self.supabase, source_urls
                )
                logger.info(
                    "Domain reputation cache preloaded for %d source URLs",
                    len(source_urls),
                )
            except Exception as e:
                logger.warning(
                    f"Domain reputation cache preload failed (non-fatal): {e}"
                )

            # Step 3: Triage sources
            await update_progress_simple(self.supabase,
                run_id,
                "triage",
                f"Triaging {len(validated_sources)} sources for relevance...",
                ["queries", "search"],
                {"queries_generated": len(queries), "sources_found": len(raw_sources)},
            )
            step_start = datetime.now(timezone.utc)
            triaged_sources, triage_tokens = await triage_sources_with_metrics(
                self.supabase,
                self.ai_service,
                validated_sources,
                current_run_id=run_id,
            )
            processing_time.triage_seconds = (
                datetime.now(timezone.utc) - step_start
            ).total_seconds()
            api_token_usage.add_tokens("triage", triage_tokens)
            logger.info(
                f"Triaged to {len(triaged_sources)} relevant sources in {processing_time.triage_seconds:.2f}s"
            )

            # Step 3b: Clear domain reputation batch cache (Task 2.7)
            try:
                domain_reputation_service.clear_batch_cache()
            except Exception as exc:
                # Non-fatal — cache will eventually time out on its own.
                logger.debug(
                    "discovery: clear_batch_cache failed: %s", exc
                )

            # Step 4: Check blocked topics
            await update_progress_simple(self.supabase,
                run_id,
                "blocked",
                f"Checking {len(triaged_sources)} sources against blocked topics...",
                ["queries", "search", "triage"],
                {
                    "queries_generated": len(queries),
                    "sources_found": len(raw_sources),
                    "sources_relevant": len(triaged_sources),
                },
            )
            step_start = datetime.now(timezone.utc)
            if config.skip_blocked_topics:
                filtered_sources, blocked_count = await check_blocked_topics(
                    self.supabase, triaged_sources
                )
                logger.info(f"Filtered {blocked_count} blocked sources")
            else:
                filtered_sources = triaged_sources
                blocked_count = 0
            processing_time.blocked_topic_check_seconds = (
                datetime.now(timezone.utc) - step_start
            ).total_seconds()

            # Step 5-6: Signal detection (agent-based or legacy)
            step_start = datetime.now(timezone.utc)

            # Initialize dedup_result for both paths (signal agent skips dedup)
            dedup_result = DeduplicationResult(
                unique_sources=[],
                duplicate_count=0,
                enrichment_candidates=[],
                new_concept_candidates=[],
            )

            if config.use_signal_agent and not config.dry_run:
                # --- AI Agent-based signal detection ---
                from app.signal_agent_service import SignalAgentService

                await update_progress_simple(self.supabase,
                    run_id,
                    "signals",
                    f"AI agent analyzing {len(filtered_sources)} sources for signal detection...",
                    ["queries", "search", "triage", "blocked"],
                    {
                        "queries_generated": len(queries),
                        "sources_found": len(raw_sources),
                        "sources_relevant": len(triaged_sources),
                    },
                )

                signal_agent = SignalAgentService(
                    supabase=self.supabase,
                    run_id=run_id,
                    triggered_by_user_id=self.triggered_by_user_id,
                )
                signal_result = await signal_agent.run_signal_detection(
                    processed_sources=filtered_sources,
                    config=config,
                )

                # Map SignalDetectionResult -> CardActionResult for backward compat
                card_result = CardActionResult(
                    cards_created=signal_result.signals_created,
                    cards_enriched=signal_result.signals_enriched,
                    sources_added=signal_result.sources_linked,
                    auto_approved=signal_result.auto_approved_count,
                    pending_review=len(signal_result.signals_created)
                    - signal_result.auto_approved_count,
                    story_cluster_count=0,
                )
                logger.info(
                    f"Signal agent: {len(signal_result.signals_created)} signals created, "
                    f"{len(signal_result.signals_enriched)} enriched, "
                    f"{signal_result.sources_linked} sources linked, "
                    f"cost ~${signal_result.cost_estimate:.2f}"
                )
            else:
                # --- Legacy deterministic pipeline ---
                await update_progress_simple(self.supabase,
                    run_id,
                    "dedupe",
                    f"Deduplicating {len(filtered_sources)} sources against existing cards...",
                    ["queries", "search", "triage", "blocked"],
                    {
                        "queries_generated": len(queries),
                        "sources_found": len(raw_sources),
                        "sources_relevant": len(triaged_sources),
                    },
                )
                dedup_result, dedup_tokens = await deduplicate_sources_with_metrics(
                    self.supabase,
                    self.ai_service,
                    filtered_sources,
                    config,
                )
                api_token_usage.add_tokens("card_match", dedup_tokens)
                logger.info(
                    f"Deduplication: {dedup_result.duplicate_count} duplicates, "
                    f"{len(dedup_result.enrichment_candidates)} enrichments, "
                    f"{len(dedup_result.new_concept_candidates)} new concepts"
                )

                await update_progress_simple(self.supabase,
                    run_id,
                    "cards",
                    f"Creating/enriching cards from {len(dedup_result.new_concept_candidates)} new concepts...",
                    ["queries", "search", "triage", "blocked", "dedupe"],
                    {
                        "queries_generated": len(queries),
                        "sources_found": len(raw_sources),
                        "sources_relevant": len(triaged_sources),
                        "duplicates": dedup_result.duplicate_count,
                        "enrichments": len(dedup_result.enrichment_candidates),
                        "new_concepts": len(dedup_result.new_concept_candidates),
                    },
                )
                if config.dry_run:
                    logger.info("Dry run - skipping card creation/enrichment")
                    card_result = CardActionResult([], [], 0, 0, 0)
                else:
                    card_result = await self._create_or_enrich_cards(
                        run_id, dedup_result, config
                    )
                    logger.info(
                        f"Card actions: {len(card_result.cards_created)} created, "
                        f"{len(card_result.cards_enriched)} enriched, "
                        f"{card_result.auto_approved} auto-approved"
                    )

            processing_time.card_creation_seconds = (
                datetime.now(timezone.utc) - step_start
            ).total_seconds()

            # Persist story_cluster_count to quality_stats
            if card_result.story_cluster_count > 0:
                try:
                    existing = (
                        self.supabase.table("discovery_runs")
                        .select("summary_report")
                        .eq("id", run_id)
                        .single()
                        .execute()
                    )
                    report = (
                        existing.data.get("summary_report") if existing.data else {}
                    ) or {}
                    if not isinstance(report, dict):
                        report = {}
                    qs = report.get("quality_stats", {})
                    if not isinstance(qs, dict):
                        qs = {}
                    qs["story_cluster_count"] = card_result.story_cluster_count
                    report["quality_stats"] = qs
                    self.supabase.table("discovery_runs").update(
                        {"summary_report": report}
                    ).eq("id", run_id).execute()
                except Exception as e:
                    logger.warning(f"Failed to persist story_cluster_count: {e}")

            # Step 7: Finalize run
            # Recompute diversity metrics to include query sources
            if sources_by_category:
                diversity_metrics = SourceDiversityMetrics.compute(sources_by_category)

            # Calculate total processing time
            processing_time.total_seconds = (
                datetime.now(timezone.utc) - start_time
            ).total_seconds()

            # Log comprehensive metrics summary
            logger.info(f"Discovery run {run_id} metrics summary:")
            logger.info(f"  Sources by category: {sources_by_category}")
            processing_time.log_metrics(logger)
            api_token_usage.log_metrics(logger)

            return await finalize_run(
                self.supabase,
                pending_lens_tasks=self._pending_lens_tasks,
                run_id=run_id,
                start_time=start_time,
                queries_generated=len(queries),
                queries_executed=min(len(queries), config.max_queries_per_run),
                sources_discovered=len(raw_sources),
                sources_triaged=len(triaged_sources),
                sources_blocked=blocked_count,
                sources_duplicate=dedup_result.duplicate_count,
                sources_by_category=sources_by_category,
                categories_fetched=categories_fetched,
                diversity_metrics=diversity_metrics,
                card_result=card_result,
                cost=search_cost,
                errors=errors,
                status=DiscoveryStatus.COMPLETED,
                processing_time_metrics=processing_time,
                api_token_usage_metrics=api_token_usage,
            )

        except Exception as e:
            logger.error(f"Discovery run failed: {e}", exc_info=True)
            errors.append(str(e))
            processing_time.total_seconds = (
                datetime.now(timezone.utc) - start_time
            ).total_seconds()

            return await finalize_run(
                self.supabase,
                pending_lens_tasks=self._pending_lens_tasks,
                run_id=run_id,
                start_time=start_time,
                queries_generated=0,
                queries_executed=0,
                sources_discovered=0,
                sources_triaged=0,
                sources_blocked=0,
                sources_duplicate=0,
                sources_by_category=sources_by_category,
                categories_fetched=categories_fetched,
                diversity_metrics=diversity_metrics,
                card_result=CardActionResult([], [], 0, 0, 0),
                cost=0.0,
                errors=errors,
                status=DiscoveryStatus.FAILED,
                processing_time_metrics=processing_time,
                api_token_usage_metrics=api_token_usage,
            )

    async def _python_vector_search(
        self,
        query_embedding: List[float],
        config: DiscoveryConfig,
        suggested_name: str,
        source: ProcessedSource,
        enrichment_candidates: List[Tuple[ProcessedSource, str, float]],
        new_concept_candidates: List[ProcessedSource],
    ) -> str:
        """
        Python-based fallback for vector similarity search when RPC fails.

        This fetches cards with embeddings from the database and calculates
        cosine similarity in Python. Less efficient than DB-side computation
        but works around schema/extension issues.

        Args:
            query_embedding: The source embedding to compare
            config: Discovery configuration with thresholds
            suggested_name: Suggested card name for logging
            source: The source being processed
            enrichment_candidates: List to append enrichment candidates
            new_concept_candidates: List to append new concepts

        Returns:
            "enriched" if matched to existing card, "new" if new concept
        """
        # Fetch cards with embeddings (non-rejected only)
        cards_result = (
            self.supabase.table("cards")
            .select("id, name, summary, pillar_id, horizon, embedding")
            .neq("review_status", "rejected")
            .not_.is_("embedding", "null")
            .limit(100)
            .execute()
        )

        if not cards_result.data:
            logger.info("PYTHON FALLBACK: No cards with embeddings found - NEW CONCEPT")
            new_concept_candidates.append(source)
            if source.discovered_source_id:
                await update_source_dedup(self.supabase,source.discovered_source_id, "unique")
            return "new"

        # Calculate similarities using Python
        best_match = None
        best_similarity = 0.0

        for card in cards_result.data:
            card_embedding = card.get("embedding")
            if not card_embedding:
                continue

            similarity = cosine_similarity(query_embedding, card_embedding)

            if similarity > best_similarity:
                best_similarity = similarity
                best_match = card

        if best_match and best_similarity >= config.similarity_threshold:
            # Strong match - enrich existing card
            logger.info(
                f"PYTHON FALLBACK MATCH (strong): '{suggested_name}' -> '{best_match.get('name', 'unknown')}' "
                f"(similarity: {best_similarity:.3f}) - ENRICHING"
            )
            enrichment_candidates.append((source, best_match["id"], best_similarity))
            if source.discovered_source_id:
                await update_source_dedup(self.supabase,
                    source.discovered_source_id,
                    "enrichment_candidate",
                    best_match["id"],
                    best_similarity,
                )
            return "enriched"

        elif best_match and best_similarity >= config.weak_match_threshold:
            # Weak match - use LLM to decide
            decision = await self.ai_service.check_card_match(
                source_summary=source.analysis.summary,
                source_card_name=source.analysis.suggested_card_name,
                existing_card_name=best_match["name"],
                existing_card_summary=best_match.get("summary", ""),
            )

            if decision.get("is_match") and decision.get("confidence", 0) >= 0.6:
                logger.info(
                    f"PYTHON FALLBACK + LLM MATCH: '{suggested_name}' -> '{best_match['name']}' "
                    f"(similarity: {best_similarity:.3f}, llm_conf: {decision.get('confidence', 0):.2f}) - ENRICHING"
                )
                enrichment_candidates.append(
                    (source, best_match["id"], best_similarity)
                )
                if source.discovered_source_id:
                    await update_source_dedup(self.supabase,
                        source.discovered_source_id,
                        "enrichment_candidate",
                        best_match["id"],
                        best_similarity,
                    )
                return "enriched"
            else:
                logger.info(
                    f"PYTHON FALLBACK + LLM NO MATCH: '{suggested_name}' vs '{best_match['name']}' "
                    f"(reason: {decision.get('reasoning', 'unknown')[:80]}) - NEW CONCEPT"
                )
                new_concept_candidates.append(source)
                if source.discovered_source_id:
                    await update_source_dedup(self.supabase,
                        source.discovered_source_id, "unique"
                    )
                return "new"

        else:
            logger.info(
                f"PYTHON FALLBACK NO MATCH: '{suggested_name}' - best similarity {best_similarity:.3f} "
                f"below threshold {config.weak_match_threshold} - NEW CONCEPT"
            )
            new_concept_candidates.append(source)
            if source.discovered_source_id:
                await update_source_dedup(self.supabase,source.discovered_source_id, "unique")
            return "new"

    # ========================================================================
    # Step 4: Triage Sources
    # ========================================================================

    async def _triage_sources(self, sources: List[RawSource]) -> List[ProcessedSource]:
        """
        Triage sources for municipal relevance.

        Args:
            sources: Raw sources from search

        Returns:
            List of processed sources that passed triage
        """
        processed = []
        triage_threshold = 0.6

        for source in sources:
            try:
                # Skip sources without content for full triage
                if not source.content:
                    # Auto-pass URL-only sources with lower confidence
                    triage = TriageResult(
                        is_relevant=True,
                        confidence=0.65,
                        primary_pillar=getattr(source, "pillar_code", None),
                        reason="Auto-passed (no content)",
                    )
                else:
                    triage = await self.ai_service.triage_source(
                        title=source.title, content=source.content
                    )

                # Pre-print relevance penalty (Task 2.6): soft penalty, not a hard block
                if getattr(source, "is_preprint", False) and triage.confidence > 0:
                    original_confidence = triage.confidence
                    triage.confidence = max(0.0, triage.confidence - 0.2)
                    logger.debug(
                        f"Pre-print penalty applied: {source.url} "
                        f"confidence {original_confidence:.2f} -> {triage.confidence:.2f}"
                    )

                # Domain reputation confidence adjustment (Task 2.7)
                try:
                    reputation = domain_reputation_service.get_reputation(
                        self.supabase, source.url or ""
                    )
                    adj = domain_reputation_service.get_confidence_adjustment(
                        reputation
                    )
                    if adj != 0.0:
                        pre_adj_confidence = triage.confidence
                        triage.confidence = max(0.0, min(1.0, triage.confidence + adj))
                        logger.debug(
                            f"Domain reputation adjustment: {source.url} "
                            f"adj={adj:+.2f} confidence "
                            f"{pre_adj_confidence:.2f} -> {triage.confidence:.2f}"
                        )
                except Exception as e:
                    logger.debug(f"Domain reputation lookup failed (non-fatal): {e}")

                # Determine triage pass/fail
                passed_triage = (
                    triage.is_relevant and triage.confidence >= triage_threshold
                )

                # Record triage result for domain reputation stats (Task 2.7)
                try:
                    from urllib.parse import urlparse as _urlparse

                    if _domain := _urlparse(source.url or "").netloc:
                        domain_reputation_service.record_triage_result(
                            self.supabase, _domain, passed=passed_triage
                        )
                except Exception as e:
                    logger.debug(f"Domain triage recording failed (non-fatal): {e}")

                if passed_triage:
                    # Update discovered_sources with triage passed
                    if source.discovered_source_id:
                        await update_source_triage(self.supabase,
                            source.discovered_source_id, triage, True
                        )

                    # Full analysis
                    analysis = await self.ai_service.analyze_source(
                        title=source.title,
                        content=source.content or "",
                        source_name=source.source_name,
                        published_at=datetime.now(timezone.utc).isoformat(),
                    )

                    # Update discovered_sources with analysis
                    if source.discovered_source_id:
                        await update_source_analysis(self.supabase,
                            source.discovered_source_id, analysis
                        )

                    # Generate embedding
                    embed_text = f"{source.title} {analysis.summary}"
                    embedding = await self.ai_service.generate_embedding(embed_text)

                    processed_source = ProcessedSource(
                        raw=source,
                        triage=triage,
                        analysis=analysis,
                        embedding=embedding,
                        discovered_source_id=source.discovered_source_id,
                    )
                    processed.append(processed_source)
                else:
                    # Update discovered_sources with triage failed
                    if source.discovered_source_id:
                        await update_source_triage(self.supabase,
                            source.discovered_source_id, triage, False
                        )

            except Exception as e:
                logger.warning(f"Triage/analysis failed for {source.url}: {e}")
                # Mark error in discovered_sources
                if source.discovered_source_id:
                    await update_source_outcome(self.supabase,
                        source.discovered_source_id,
                        "error",
                        error_message=str(e),
                        error_stage="triage",
                    )
                continue

        return processed

    async def _deduplicate_sources(
        self, sources: List[ProcessedSource], config: DiscoveryConfig
    ) -> DeduplicationResult:
        """
        Deduplicate sources against existing cards using multi-tier matching:
        1. Exact URL match
        2. Name similarity match
        3. Vector similarity match
        4. LLM decision for weak matches

        PHILOSOPHY: Prefer enrichment over creation. When in doubt, add to existing card.

        Args:
            sources: Processed sources to deduplicate
            config: Run configuration

        Returns:
            DeduplicationResult with categorized sources
        """
        unique_sources = []
        duplicate_count = 0
        enrichment_candidates = []
        new_concept_candidates = []

        # Pre-fetch existing card names for name-based matching
        try:
            existing_cards = (
                self.supabase.table("cards")
                .select("id, name, summary")
                .neq("review_status", "rejected")
                .execute()
            )
            card_name_map = (
                {c["id"]: c for c in existing_cards.data} if existing_cards.data else {}
            )
            logger.info(f"Loaded {len(card_name_map)} existing cards for deduplication")
        except Exception as e:
            logger.warning(f"Could not load existing cards for name matching: {e}")
            card_name_map = {}

        for source in sources:
            try:
                suggested_name = (
                    source.analysis.suggested_card_name if source.analysis else ""
                )
                logger.debug(
                    f"Deduplicating: '{suggested_name}' from {source.raw.url[:50]}..."
                )

                # STEP 1: Check for existing URL first
                url_check = (
                    self.supabase.table("sources")
                    .select("id")
                    .eq("url", source.raw.url)
                    .execute()
                )

                if url_check.data:
                    duplicate_count += 1
                    logger.info(f"URL duplicate found: {source.raw.url[:60]}")
                    if source.discovered_source_id:
                        await update_source_dedup(self.supabase,
                            source.discovered_source_id, "duplicate"
                        )
                    continue

                # STEP 2: Name-based matching (fast, no AI call needed)
                name_match_found = False
                if suggested_name and card_name_map:
                    for card_id, card_data in card_name_map.items():
                        name_sim = calculate_name_similarity(
                            suggested_name, card_data["name"]
                        )
                        if name_sim >= config.name_similarity_threshold:
                            logger.info(
                                f"NAME MATCH: '{suggested_name}' -> '{card_data['name']}' "
                                f"(similarity: {name_sim:.2f}) - ENRICHING"
                            )
                            enrichment_candidates.append((source, card_id, name_sim))
                            if source.discovered_source_id:
                                await update_source_dedup(self.supabase,
                                    source.discovered_source_id,
                                    "enrichment_candidate",
                                    card_id,
                                    name_sim,
                                )
                            name_match_found = True
                            break

                if name_match_found:
                    unique_sources.append(source)
                    continue

                # STEP 3: Vector similarity search against existing cards
                try:
                    match_result = self.supabase.rpc(
                        "find_similar_cards",
                        {
                            "query_embedding": source.embedding,
                            "match_threshold": config.weak_match_threshold,
                            "match_count": 5,  # Get more candidates for better matching
                        },
                    ).execute()

                    if match_result.data:
                        top_match = match_result.data[0]
                        similarity = top_match.get("similarity", 0)

                        if similarity >= config.similarity_threshold:
                            # Strong vector match - enrich existing card
                            logger.info(
                                f"VECTOR MATCH (strong): '{suggested_name}' -> '{top_match.get('name', 'unknown')}' "
                                f"(similarity: {similarity:.3f}) - ENRICHING"
                            )
                            enrichment_candidates.append(
                                (source, top_match["id"], similarity)
                            )
                            if source.discovered_source_id:
                                await update_source_dedup(self.supabase,
                                    source.discovered_source_id,
                                    "enrichment_candidate",
                                    top_match["id"],
                                    similarity,
                                )
                        elif similarity >= config.weak_match_threshold:
                            # Weak match - use LLM to decide (biased toward enrichment)
                            card = (
                                self.supabase.table("cards")
                                .select("name, summary")
                                .eq("id", top_match["id"])
                                .single()
                                .execute()
                            )

                            if card.data:
                                decision = await self.ai_service.check_card_match(
                                    source_summary=source.analysis.summary,
                                    source_card_name=source.analysis.suggested_card_name,
                                    existing_card_name=card.data["name"],
                                    existing_card_summary=card.data.get("summary", ""),
                                )

                                # Lower threshold from 0.7 to 0.6 - prefer enrichment
                                if (
                                    decision.get("is_match")
                                    and decision.get("confidence", 0) >= 0.6
                                ):
                                    logger.info(
                                        f"LLM MATCH: '{suggested_name}' -> '{card.data['name']}' "
                                        f"(vector: {similarity:.3f}, llm_conf: {decision.get('confidence', 0):.2f}) - ENRICHING"
                                    )
                                    enrichment_candidates.append(
                                        (source, top_match["id"], similarity)
                                    )
                                    if source.discovered_source_id:
                                        await update_source_dedup(self.supabase,
                                            source.discovered_source_id,
                                            "enrichment_candidate",
                                            top_match["id"],
                                            similarity,
                                        )
                                else:
                                    logger.info(
                                        f"LLM NO MATCH: '{suggested_name}' vs '{card.data['name']}' "
                                        f"(reason: {decision.get('reasoning', 'unknown')[:80]}) - NEW CONCEPT"
                                    )
                                    new_concept_candidates.append(source)
                                    if source.discovered_source_id:
                                        await update_source_dedup(self.supabase,
                                            source.discovered_source_id, "unique"
                                        )
                            else:
                                new_concept_candidates.append(source)
                                if source.discovered_source_id:
                                    await update_source_dedup(self.supabase,
                                        source.discovered_source_id, "unique"
                                    )
                        else:
                            logger.info(
                                f"NO MATCH: '{suggested_name}' - best vector similarity {similarity:.3f} "
                                f"below threshold {config.weak_match_threshold} - NEW CONCEPT"
                            )
                            new_concept_candidates.append(source)
                            if source.discovered_source_id:
                                await update_source_dedup(self.supabase,
                                    source.discovered_source_id, "unique"
                                )
                    else:
                        logger.info(
                            f"NO MATCHES FOUND: '{suggested_name}' - NEW CONCEPT"
                        )
                        new_concept_candidates.append(source)
                        if source.discovered_source_id:
                            await update_source_dedup(self.supabase,
                                source.discovered_source_id, "unique"
                            )

                except Exception as e:
                    # Vector search RPC failed - use Python fallback
                    logger.warning(
                        f"Vector search RPC failed for '{suggested_name}': {e}"
                    )
                    logger.info("Falling back to Python-based similarity search...")

                    # Python fallback: fetch cards with embeddings and calculate similarity locally
                    try:
                        await self._python_vector_search(
                            source.embedding,
                            config,
                            suggested_name,
                            source,
                            enrichment_candidates,
                            new_concept_candidates,
                        )
                    except Exception as fallback_error:
                        logger.error(f"Python fallback also failed: {fallback_error}")
                        new_concept_candidates.append(source)
                        if source.discovered_source_id:
                            await update_source_dedup(self.supabase,
                                source.discovered_source_id, "unique"
                            )

                unique_sources.append(source)

            except Exception as e:
                logger.warning(f"Deduplication failed for {source.raw.url}: {e}")
                continue

        # Summary logging
        logger.info(
            f"Deduplication complete: {len(sources)} sources -> "
            f"{duplicate_count} duplicates, {len(enrichment_candidates)} enrichments, "
            f"{len(new_concept_candidates)} new concepts"
        )

        return DeduplicationResult(
            unique_sources=unique_sources,
            duplicate_count=duplicate_count,
            enrichment_candidates=enrichment_candidates,
            new_concept_candidates=new_concept_candidates,
        )

    # ========================================================================
    # Step 7: Create or Enrich Cards
    # ========================================================================

    async def _create_or_enrich_cards(
        self, run_id: str, dedup_result: DeduplicationResult, config: DiscoveryConfig
    ) -> CardActionResult:
        """
        Create new cards or enrich existing ones based on deduplication results.

        SAFEGUARDS:
        - Limits new cards per run (max_new_cards_per_run)
        - Clusters similar new concepts before creation
        - Enrichment always processed first (unlimited)

        Args:
            dedup_result: Deduplication results
            config: Run configuration

        Returns:
            CardActionResult with action statistics
        """
        cards_created = []
        cards_enriched = []
        sources_added = 0
        auto_approved = 0
        pending_review = 0
        all_stored_source_ids: List[str] = []  # Track for story clustering

        logger.info(
            f"Processing card actions: {len(dedup_result.enrichment_candidates)} enrichments, "
            f"{len(dedup_result.new_concept_candidates)} new concepts"
        )

        # STEP 1: Process enrichment candidates first (no limit - always enrich)
        for source, card_id, similarity in dedup_result.enrichment_candidates:
            try:
                source_id = await store_source_to_card(
                    self.supabase, self.ai_service, source, card_id
                )
                if source_id:
                    sources_added += 1
                    all_stored_source_ids.append(source_id)
                    if card_id not in cards_enriched:
                        cards_enriched.append(card_id)
                        logger.info(
                            f"Enriched card {card_id} with source: {source.raw.title[:50]}"
                        )
                    # Update discovered_sources with enrichment outcome
                    if source.discovered_source_id:
                        await update_source_outcome(self.supabase,
                            source.discovered_source_id,
                            "card_enriched",
                            card_id=card_id,
                            source_record_id=source_id,
                        )
            except Exception as e:
                logger.warning(f"Failed to enrich card {card_id}: {e}")
                if source.discovered_source_id:
                    await update_source_outcome(self.supabase,
                        source.discovered_source_id,
                        "error",
                        error_message=str(e),
                        error_stage="enrichment",
                    )

        # STEP 2: Cluster similar new concepts before creation
        # Group sources with similar names to avoid creating near-duplicate cards
        new_concepts = dedup_result.new_concept_candidates
        if len(new_concepts) > 1:
            clustered = cluster_similar_concepts(new_concepts, config)
            logger.info(
                f"Clustered {len(new_concepts)} new concepts into {len(clustered)} groups"
            )
        else:
            # Each source is its own cluster
            clustered = [[s] for s in new_concepts]

        # STEP 3: Create cards with limit enforcement
        cards_created_count = 0
        skipped_due_to_limit = 0

        for cluster in clustered:
            if cards_created_count >= config.max_new_cards_per_run:
                skipped_due_to_limit += len(cluster)
                for source in cluster:
                    if source.discovered_source_id:
                        await update_source_outcome(self.supabase,
                            source.discovered_source_id,
                            "error",
                            error_message=f"Card limit reached ({config.max_new_cards_per_run})",
                            error_stage="card_creation",
                        )
                continue

            # Pick the best source from the cluster as the card template
            primary_source = cluster[0]  # First source (could use confidence ranking)
            if not primary_source.analysis:
                logger.warning(
                    f"Skipping cluster without analysis: {primary_source.raw.title}"
                )
                continue

            try:
                # Calculate confidence score for auto-approval
                confidence = calculate_discovery_confidence(primary_source)

                # Create new card from primary source
                card_id = await self._create_card_from_source(
                    primary_source, run_id=run_id, confidence=confidence
                )
                if not card_id:
                    if primary_source.discovered_source_id:
                        await update_source_outcome(self.supabase,
                            primary_source.discovered_source_id,
                            "error",
                            error_message="Card creation returned no ID",
                            error_stage="card_creation",
                        )
                    continue

                cards_created.append(card_id)
                cards_created_count += 1
                logger.info(
                    f"Created card {cards_created_count}/{config.max_new_cards_per_run}: "
                    f"'{primary_source.analysis.suggested_card_name}'"
                )

                # Store primary source to new card
                source_id = await store_source_to_card(
                    self.supabase, self.ai_service, primary_source, card_id
                )
                if source_id:
                    sources_added += 1
                    all_stored_source_ids.append(source_id)

                # Update discovered_sources for primary
                if primary_source.discovered_source_id:
                    await update_source_outcome(self.supabase,
                        primary_source.discovered_source_id,
                        "card_created",
                        card_id=card_id,
                        source_record_id=source_id,
                    )

                # Add remaining cluster sources to the same card (enrichment)
                for additional_source in cluster[1:]:
                    try:
                        add_source_id = await store_source_to_card(
                            self.supabase,
                            self.ai_service,
                            additional_source,
                            card_id,
                        )
                        if add_source_id:
                            sources_added += 1
                            all_stored_source_ids.append(add_source_id)
                            logger.debug(
                                f"Added clustered source to card: {additional_source.raw.title[:40]}"
                            )
                        if additional_source.discovered_source_id:
                            await update_source_outcome(self.supabase,
                                additional_source.discovered_source_id,
                                "card_enriched",
                                card_id=card_id,
                                source_record_id=add_source_id,
                            )
                    except Exception as e:
                        logger.warning(f"Failed to add clustered source: {e}")

                # Auto-approve if confidence exceeds threshold
                if confidence >= config.auto_approve_threshold:
                    await auto_approve_card(self.supabase, card_id)
                    auto_approved += 1
                else:
                    pending_review += 1

            except Exception as e:
                logger.warning(
                    f"Failed to create card for {primary_source.raw.title}: {e}"
                )
                if primary_source.discovered_source_id:
                    await update_source_outcome(self.supabase,
                        primary_source.discovered_source_id,
                        "error",
                        error_message=str(e),
                        error_stage="card_creation",
                    )

        if skipped_due_to_limit > 0:
            logger.warning(
                f"Card creation limit reached: {skipped_due_to_limit} sources skipped "
                f"(limit: {config.max_new_cards_per_run})"
            )

        # STEP 4: Story-level deduplication via semantic clustering
        # Sources are now persisted with DB IDs, so we can cluster them.
        # This assigns story_cluster_id to each source, enabling corroboration
        # counting and deduplication in the discovery queue.
        story_cluster_count = 0
        if all_stored_source_ids:
            try:
                cluster_result = cluster_sources(self.supabase, all_stored_source_ids)
                story_cluster_count = cluster_result.get("cluster_count", 0)
                logger.info(
                    f"Story clustering: {len(all_stored_source_ids)} sources -> "
                    f"{story_cluster_count} story clusters"
                )
            except Exception as e:
                logger.warning(f"Story clustering failed (non-fatal): {e}")

        return CardActionResult(
            cards_created=cards_created,
            cards_enriched=cards_enriched,
            sources_added=sources_added,
            auto_approved=auto_approved,
            pending_review=pending_review,
            story_cluster_count=story_cluster_count,
        )

    async def _create_card_from_source(
        self,
        source: ProcessedSource,
        run_id: str,
        confidence: Optional[float] = None,
    ) -> Optional[str]:
        """
        Create a new card from a processed source.

        Args:
            source: Processed source with analysis

        Returns:
            New card ID or None if failed
        """
        if not source.analysis:
            return None

        analysis = source.analysis

        # Generate slug
        slug = analysis.suggested_card_name.lower()
        slug = "".join(c if c.isalnum() or c == " " else "" for c in slug)
        slug = "-".join(slug.split())[:50]

        # Ensure unique slug
        existing = self.supabase.table("cards").select("id").eq("slug", slug).execute()
        if existing.data:
            slug = f"{slug}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

        # Convert stage number to stage_id (foreign key)
        stage_id = STAGE_NUMBER_TO_ID.get(analysis.suggested_stage, "4_proof")

        goal_id = convert_goal_id(analysis.goals[0]) if analysis.goals else None
        try:
            now = datetime.now(timezone.utc).isoformat()
            ai_confidence = None
            if confidence is not None:
                try:
                    ai_confidence = round(float(confidence), 2)
                except Exception:
                    ai_confidence = None

            result = (
                self.supabase.table("cards")
                .insert(
                    {
                        "name": analysis.suggested_card_name,
                        "slug": slug,
                        "summary": analysis.summary,
                        "horizon": analysis.horizon,
                        "stage_id": stage_id,  # Use mapped stage_id, not integer
                        "pillar_id": (
                            convert_pillar_id(analysis.pillars[0])
                            if analysis.pillars
                            else None
                        ),
                        "goal_id": goal_id,  # Use converted goal_id
                        # Scoring (4-dimensional: Impact, Velocity, Novelty, Risk)
                        "maturity_score": int(analysis.credibility * 20),
                        "novelty_score": int(analysis.novelty * 20),
                        "impact_score": int(analysis.impact * 20),
                        "relevance_score": int(analysis.relevance * 20),
                        "velocity_score": int(
                            analysis.velocity * 10
                        ),  # 1-10 scale to 0-100
                        "risk_score": int(analysis.risk * 10),  # 1-10 scale to 0-100
                        "status": "draft",  # New cards start as draft (review queue)
                        "review_status": "pending_review",
                        "discovered_at": now,
                        "discovery_run_id": run_id,
                        "ai_confidence": ai_confidence,
                        "discovery_metadata": {
                            "source_url": source.raw.url,
                            "source_title": source.raw.title,
                            "source_name": source.raw.source_name,
                        },
                        # Note: removed discovery_source - column doesn't exist in schema
                        "created_by": self.triggered_by_user_id,
                        "created_at": now,
                        "updated_at": now,
                    }
                )
                .execute()
            )

            if result.data:
                card_id = result.data[0]["id"]

                # Store embedding on the card for Related Trends feature
                try:
                    if source.embedding:
                        self.supabase.table("cards").update(
                            {"embedding": source.embedding}
                        ).eq("id", card_id).execute()
                    else:
                        # Generate fresh embedding from card text
                        embed_text = (
                            f"{analysis.suggested_card_name} {analysis.summary}"
                        )
                        embedding = await self.ai_service.generate_embedding(embed_text)
                        self.supabase.table("cards").update(
                            {"embedding": embedding}
                        ).eq("id", card_id).execute()
                except Exception as e:
                    logger.warning(f"Failed to store embedding on card {card_id}: {e}")

                # Create timeline event
                await create_timeline_event(
                    self.supabase,
                    card_id=card_id,
                    event_type="discovered",
                    description="Card discovered via automated scan",
                )

                # Lens cascade — fire-and-forget. The cascade does ~5 LLM
                # round-trips (~$0.006/card); blocking would inflate the
                # discovery-run wall clock by minutes. The admin backfill
                # endpoint is the recovery path if any card slips through.
                primary_pillar_code = (
                    analysis.pillars[0] if analysis.pillars else None
                )
                lens_task = asyncio.create_task(
                    self._classify_card_lens(
                        card_id,
                        {
                            "name": analysis.suggested_card_name,
                            "summary": analysis.summary,
                            "pillar_id": convert_pillar_id(primary_pillar_code)
                            if primary_pillar_code
                            else None,
                            "horizon": analysis.horizon,
                            "stage_id": stage_id,
                        },
                    )
                )
                self._pending_lens_tasks.add(lens_task)
                lens_task.add_done_callback(self._pending_lens_tasks.discard)

                return card_id

        except Exception as e:
            logger.error(f"Failed to create card: {e}")

        return None

# ============================================================================
# Convenience Functions
# ============================================================================


async def run_weekly_discovery(
    supabase: Client, openai_client: openai.OpenAI, pillars: Optional[List[str]] = None
) -> DiscoveryResult:
    """
    Convenience function to run weekly discovery scan.

    Args:
        supabase: Supabase client
        openai_client: OpenAI client
        pillars: Optional list of pillar codes to filter

    Returns:
        DiscoveryResult
    """
    service = DiscoveryService(supabase, openai_client)
    config = await asyncio.to_thread(
        build_discovery_config,
        pillars_filter=pillars or [],
        include_priorities=True,
    )
    return await service.execute_discovery_run(config)


async def run_pillar_discovery(
    supabase: Client, openai_client: openai.OpenAI, pillar_code: str
) -> DiscoveryResult:
    """
    Run discovery for a specific pillar.

    Args:
        supabase: Supabase client
        openai_client: OpenAI client
        pillar_code: Pillar code (e.g., 'CH', 'MC')

    Returns:
        DiscoveryResult
    """
    service = DiscoveryService(supabase, openai_client)
    # Per-pillar runs are intentionally narrower than the global default;
    # explicit caps win over admin overrides.
    config = await asyncio.to_thread(
        build_discovery_config,
        max_queries_per_run=25,
        max_sources_total=100,
        pillars_filter=[pillar_code],
        include_priorities=True,
    )
    return await service.execute_discovery_run(config)
