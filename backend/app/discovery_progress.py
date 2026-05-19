"""Progress tracking and source-row persistence for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D5. Owns:
- Per-run progress updates written to ``discovery_runs.summary_report.progress``
  (``update_progress`` / ``update_progress_simple``).
- Per-source row writes throughout the pipeline: initial insert
  (``persist_discovered_source``) and stage-by-stage updates
  (``update_source_triage`` / ``update_source_analysis`` /
  ``update_source_dedup`` / ``update_source_outcome``).

These functions are stateless — they take the Supabase client and the
relevant row IDs as explicit arguments. They never raise: each helper
swallows DB errors and logs a warning, because progress/observability
writes must not be allowed to fail the pipeline. This mirrors the
behavior of the original instance-method versions on ``DiscoveryService``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Dict, List, Optional
from urllib.parse import urlparse

from supabase import Client

from . import domain_reputation_service

if TYPE_CHECKING:
    from .ai_service import AnalysisResult, TriageResult
    from .query_generator import QueryConfig
    from .research_service import RawSource

logger = logging.getLogger(__name__)


# ============================================================================
# Run-level progress
# ============================================================================


async def update_progress(
    supabase: Client,
    run_id: str,
    stage: str,
    message: str,
    stages_status: Dict[str, str],
    stats: Optional[Dict[str, int]] = None,
) -> None:
    """
    Update progress in the ``discovery_runs`` record.

    Args:
        supabase: Supabase client
        run_id: Discovery run ID
        stage: Current stage name
        message: Human-readable progress message
        stages_status: Dict of stage_name -> status (pending/in_progress/completed)
        stats: Optional dict of current statistics
    """
    try:
        # Build progress object
        progress: Dict[str, object] = {
            "current_stage": stage,
            "message": message,
            "stages": stages_status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        if stats:
            progress["stats"] = stats

        # Read current summary_report. The Supabase Python client is sync;
        # calling .execute() directly here would block the event loop and
        # serialize every other async task in the pipeline. Wrap in
        # asyncio.to_thread so the network round-trip happens off-loop.
        result = await asyncio.to_thread(
            lambda: supabase.table("discovery_runs")
            .select("summary_report")
            .eq("id", run_id)
            .single()
            .execute()
        )

        # Two failure modes the old code didn't handle:
        # 1. Row missing (result.data is None) — pre-fix we silently wrote
        #    a no-op UPDATE that matched zero rows. Skip the write and log
        #    so we surface that the run id is bogus instead of pretending
        #    progress was recorded.
        # 2. ``summary_report`` column is JSONB null — ``.get("k", {})``
        #    only returns the default when the key is *missing*. When the
        #    key exists with value None, ``.get`` returns None and the
        #    ``{**current_report, ...}`` splat below would raise TypeError.
        #    Coerce non-dict values to ``{}`` (the lifecycle helper uses
        #    the same defensive pattern — see ``discovery_run_lifecycle``).
        if not result.data:
            logger.warning(
                "Progress update skipped: discovery_runs row %s not found",
                run_id,
            )
            return
        raw_report = result.data.get("summary_report")
        current_report = raw_report if isinstance(raw_report, dict) else {}

        # Merge progress into summary_report
        updated_report = {**current_report, "progress": progress}

        # Update the record (also off-loop — see note above).
        await asyncio.to_thread(
            lambda: supabase.table("discovery_runs")
            .update({"summary_report": updated_report})
            .eq("id", run_id)
            .execute()
        )

        logger.debug(f"Progress update: {stage} - {message}")
    except Exception as e:
        # Don't fail on progress update errors
        logger.warning(f"Could not update progress: {e}")


async def update_progress_simple(
    supabase: Client,
    run_id: str,
    stage: str,
    message: str,
    completed_stages: List[str],
    stats: Optional[Dict[str, int]] = None,
) -> None:
    """
    Simplified progress update that builds stages_status automatically.
    """
    all_stages = ["queries", "search", "triage", "blocked", "dedupe", "cards"]
    stages_status: Dict[str, str] = {}

    for s in all_stages:
        if s in completed_stages:
            stages_status[s] = "completed"
        elif s == stage:
            stages_status[s] = "in_progress"
        else:
            stages_status[s] = "pending"

    await update_progress(supabase, run_id, stage, message, stages_status, stats)


# ============================================================================
# Per-source row writes
# ============================================================================


async def persist_discovered_source(
    supabase: Client,
    run_id: str,
    source: "RawSource",
    query: Optional["QueryConfig"] = None,
) -> Optional[str]:
    """
    Persist a discovered source immediately when found.
    Returns the discovered_source ID for later updates.
    """
    try:
        domain = urlparse(source.url).netloc if source.url else None

        # Look up domain reputation ID (Task 2.7). The reputation service
        # talks to Supabase synchronously, so run it off-loop.
        _domain_rep_id = None
        try:
            _rep = await asyncio.to_thread(
                domain_reputation_service.get_reputation,
                supabase,
                source.url or "",
            )
            if _rep:
                _domain_rep_id = _rep.get("id")
        except Exception as exc:
            # Non-fatal — missing rep just means no quality bonus on the row.
            logger.debug(
                "discovery: get_reputation failed for %s: %s",
                source.url,
                exc,
            )

        record: Dict[str, object] = {
            "discovery_run_id": run_id,
            "url": source.url,
            "title": source.title,
            "content_snippet": (source.content or "")[:2000],
            "full_content": source.content,
            "published_at": source.published_at,
            "source_type": source.source_type,
            "domain": domain,
            "search_query": query.query_text if query else None,
            "query_pillar": query.pillar_code if query else None,
            "query_priority": query.priority_id if query else None,
            "processing_status": "discovered",
        }

        # Add domain_reputation_id if available (Task 2.7)
        if _domain_rep_id:
            record["domain_reputation_id"] = _domain_rep_id

        result = await asyncio.to_thread(
            lambda: supabase.table("discovered_sources").insert(record).execute()
        )
        if result.data:
            return result.data[0]["id"]
    except Exception as e:
        logger.warning(f"Could not persist discovered source: {e}")
    return None


async def update_source_triage(
    supabase: Client,
    source_id: str,
    triage: "TriageResult",
    passed: bool,
) -> None:
    """Update source with triage results."""
    try:
        await asyncio.to_thread(
            lambda: supabase.table("discovered_sources")
            .update(
                {
                    "triage_is_relevant": triage.is_relevant,
                    "triage_confidence": triage.confidence,
                    "triage_primary_pillar": triage.primary_pillar,
                    "triage_reason": triage.reason,
                    "triaged_at": datetime.now(timezone.utc).isoformat(),
                    "processing_status": "triaged" if passed else "filtered_triage",
                }
            )
            .eq("id", source_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Could not update source triage: {e}")


async def update_source_analysis(
    supabase: Client,
    source_id: str,
    analysis: "AnalysisResult",
) -> None:
    """Update source with full analysis results."""
    try:
        entities_json = [
            {"name": e.name, "type": e.entity_type, "context": e.context}
            for e in (analysis.entities or [])
        ]

        await asyncio.to_thread(
            lambda: supabase.table("discovered_sources")
            .update(
                {
                    "analysis_summary": analysis.summary,
                    "analysis_key_excerpts": analysis.key_excerpts,
                    "analysis_pillars": analysis.pillars,
                    "analysis_goals": analysis.goals,
                    "analysis_steep_categories": analysis.steep_categories,
                    "analysis_anchors": analysis.anchors,
                    "analysis_horizon": analysis.horizon,
                    "analysis_suggested_stage": analysis.suggested_stage,
                    "analysis_triage_score": analysis.triage_score,
                    "analysis_credibility": analysis.credibility,
                    "analysis_novelty": analysis.novelty,
                    "analysis_likelihood": analysis.likelihood,
                    "analysis_impact": analysis.impact,
                    "analysis_relevance": analysis.relevance,
                    "analysis_time_to_awareness_months": analysis.time_to_awareness_months,
                    "analysis_time_to_prepare_months": analysis.time_to_prepare_months,
                    "analysis_suggested_card_name": analysis.suggested_card_name,
                    "analysis_is_new_concept": analysis.is_new_concept,
                    "analysis_reasoning": analysis.reasoning,
                    "analysis_entities": entities_json,
                    "analyzed_at": datetime.now(timezone.utc).isoformat(),
                    "processing_status": "analyzed",
                }
            )
            .eq("id", source_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Could not update source analysis: {e}")


async def update_source_dedup(
    supabase: Client,
    source_id: str,
    status: str,  # 'unique', 'duplicate', 'enrichment_candidate'
    matched_card_id: Optional[str] = None,
    similarity: Optional[float] = None,
) -> None:
    """Update source with deduplication results."""
    try:
        processing_status = {
            "unique": "deduplicated",
            "duplicate": "filtered_duplicate",
            "enrichment_candidate": "deduplicated",
        }.get(status, "deduplicated")

        await asyncio.to_thread(
            lambda: supabase.table("discovered_sources")
            .update(
                {
                    "dedup_status": status,
                    "dedup_matched_card_id": matched_card_id,
                    "dedup_similarity_score": similarity,
                    "deduplicated_at": datetime.now(timezone.utc).isoformat(),
                    "processing_status": processing_status,
                }
            )
            .eq("id", source_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Could not update source dedup: {e}")


async def update_source_outcome(
    supabase: Client,
    source_id: str,
    status: str,  # 'card_created', 'card_enriched', 'filtered_blocked', 'error'
    card_id: Optional[str] = None,
    source_record_id: Optional[str] = None,
    error_message: Optional[str] = None,
    error_stage: Optional[str] = None,
) -> None:
    """Update source with final outcome."""
    try:
        update: Dict[str, object] = {
            "processing_status": status,
            "resulting_card_id": card_id,
            "resulting_source_id": source_record_id,
        }
        if error_message:
            update["error_message"] = error_message
            update["error_stage"] = error_stage

        await asyncio.to_thread(
            lambda: supabase.table("discovered_sources")
            .update(update)
            .eq("id", source_id)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Could not update source outcome: {e}")
