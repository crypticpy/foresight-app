"""Card creation + enrichment orchestrator for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D11e. Owns Step 7 of the
run pipeline: turning the ``DeduplicationResult`` from the dedup
stage into actual card writes — first enriching existing cards with
their matched sources, then clustering and creating new cards from
the new-concept candidates (subject to ``max_new_cards_per_run``),
then running story-level semantic clustering across every source
that landed in the database.

The public entry point is ``create_or_enrich_cards`` — it takes the
Supabase client, the ``AIService`` instance, the run id, the dedup
result, the run config, and (keyword-only) the run context the card
creator needs: the triggering user id, the pending lens-task set,
and the per-run lens service. Returns a ``CardActionResult``.

Per-source exceptions are caught so one bad enrichment / creation
cannot abort the rest of the batch. The story-clustering pass at
the end is also wrapped in try/except so a clustering failure never
fails the run.
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Set

from supabase import Client

from .ai_service import AIService
from .discovery_card_creation import create_card_from_source
from .discovery_cards_helpers import (
    calculate_discovery_confidence,
    cluster_similar_concepts,
)
from .discovery_cards_persistence import auto_approve_card, store_source_to_card
from .discovery_config import DiscoveryConfig
from .discovery_progress import update_source_outcome
from .discovery_result_types import CardActionResult, DeduplicationResult
from .lens_classification_service import LensClassificationService
from .story_clustering_service import cluster_sources

logger = logging.getLogger(__name__)


async def create_or_enrich_cards(
    supabase: Client,
    ai_service: AIService,
    run_id: str,
    dedup_result: DeduplicationResult,
    config: DiscoveryConfig,
    *,
    triggered_by_user_id: str | None,
    pending_lens_tasks: Set[asyncio.Task],
    lens_service: LensClassificationService,
) -> CardActionResult:
    """
    Create new cards or enrich existing ones based on deduplication results.

    SAFEGUARDS:
    - Limits new cards per run (``max_new_cards_per_run``)
    - Clusters similar new concepts before creation
    - Enrichment always processed first (no limit)

    Args:
        supabase: Supabase client.
        ai_service: AI service used by ``store_source_to_card`` for
            embedding-based dedup.
        run_id: Current discovery run id.
        dedup_result: Output of the dedup stage — enrichment vs new
            concept candidates.
        config: Run configuration (used for ``max_new_cards_per_run``
            and ``auto_approve_threshold``).
        triggered_by_user_id: Forwarded to ``create_card_from_source``
            so newly inserted cards inherit the run trigger user.
        pending_lens_tasks: Mutable set the card creator pushes its
            fire-and-forget lens-cascade tasks into; awaited later in
            ``finalize_run``.
        lens_service: Shared ``LensClassificationService`` for the run.

    Returns:
        ``CardActionResult`` with the per-stage counts.
    """
    cards_created: List[str] = []
    cards_enriched: List[str] = []
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
                supabase, ai_service, source, card_id
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
                    await update_source_outcome(
                        supabase,
                        source.discovered_source_id,
                        "card_enriched",
                        card_id=card_id,
                        source_record_id=source_id,
                    )
        except Exception as e:
            logger.warning(f"Failed to enrich card {card_id}: {e}")
            if source.discovered_source_id:
                await update_source_outcome(
                    supabase,
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
                    await update_source_outcome(
                        supabase,
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
            card_id = await create_card_from_source(
                supabase,
                ai_service,
                primary_source,
                run_id,
                triggered_by_user_id=triggered_by_user_id,
                pending_lens_tasks=pending_lens_tasks,
                lens_service=lens_service,
                confidence=confidence,
            )
            if not card_id:
                if primary_source.discovered_source_id:
                    await update_source_outcome(
                        supabase,
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
                supabase, ai_service, primary_source, card_id
            )
            if source_id:
                sources_added += 1
                all_stored_source_ids.append(source_id)

            # Update discovered_sources for primary
            if primary_source.discovered_source_id:
                await update_source_outcome(
                    supabase,
                    primary_source.discovered_source_id,
                    "card_created",
                    card_id=card_id,
                    source_record_id=source_id,
                )

            # Add remaining cluster sources to the same card (enrichment)
            for additional_source in cluster[1:]:
                try:
                    add_source_id = await store_source_to_card(
                        supabase,
                        ai_service,
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
                        await update_source_outcome(
                            supabase,
                            additional_source.discovered_source_id,
                            "card_enriched",
                            card_id=card_id,
                            source_record_id=add_source_id,
                        )
                except Exception as e:
                    logger.warning(f"Failed to add clustered source: {e}")

            # Auto-approve if confidence exceeds threshold
            if confidence >= config.auto_approve_threshold:
                await auto_approve_card(supabase, card_id)
                auto_approved += 1
            else:
                pending_review += 1

        except Exception as e:
            logger.warning(
                f"Failed to create card for {primary_source.raw.title}: {e}"
            )
            if primary_source.discovered_source_id:
                await update_source_outcome(
                    supabase,
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
            cluster_result = cluster_sources(supabase, all_stored_source_ids)
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
