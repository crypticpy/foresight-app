"""Run-lifecycle helpers for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D7. Owns the bookkeeping
side of a discovery run, separate from the actual pipeline stages:

- ``create_run_record`` — initial insert into ``discovery_runs`` when a
  run starts.
- ``update_run_record`` — final write of the terminal payload (status,
  counts, summary report). Uses a conditional ``.eq("status", "running")``
  guard so a late call cannot resurrect a run that already failed.
- ``generate_summary_report`` — pure formatting; builds the markdown
  block stored in ``summary_report.markdown``.
- ``finalize_run`` — orchestrator: computes derived fields, assembles
  the ``DiscoveryResult``, calls ``update_run_record``, then drains any
  in-flight lens-cascade tasks so newly-created cards actually get
  budget/climate/issue tags written before the loop tears down.

These functions are stateless — they take the Supabase client and
pending-lens-tasks set as explicit arguments. ``create_run_record`` and
``update_run_record`` swallow DB errors and log warnings, mirroring the
original instance-method behavior so observability writes don't block
the pipeline.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Awaitable, Dict, List, Optional, Set

from supabase import Client

from .discovery_config import DiscoveryConfig
from .discovery_result_types import (
    APITokenUsage,
    CardActionResult,
    DiscoveryResult,
    DiscoveryStatus,
    ProcessingTimeMetrics,
    SourceDiversityMetrics,
)

logger = logging.getLogger(__name__)


async def create_run_record(supabase: Client, config: DiscoveryConfig) -> str:
    """
    Create a discovery run record in the ``discovery_runs`` table.

    Returns the new run ID. On DB error logs a warning and still returns
    the generated ID so the run can proceed (later writes will also be
    no-ops).
    """
    run_id = str(uuid.uuid4())
    record = {
        "id": run_id,
        "status": DiscoveryStatus.RUNNING.value,
        "triggered_by": "manual",
        "pillars_scanned": config.pillars_filter or [],
        "priorities_scanned": config.horizons_filter or [],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "summary_report": {
            "config": {
                "max_queries_per_run": config.max_queries_per_run,
                "max_sources_per_query": config.max_sources_per_query,
                "max_sources_total": config.max_sources_total,
                "auto_approve_threshold": config.auto_approve_threshold,
                "similarity_threshold": config.similarity_threshold,
                "dry_run": config.dry_run,
            }
        },
    }

    try:
        # supabase-py is synchronous; .execute() would block the event
        # loop until the network round-trip returned. The pipeline calls
        # this at run-start and depends on the loop staying responsive
        # for the heartbeat coroutine that starts right after, so push
        # the insert onto a worker thread.
        await asyncio.to_thread(
            lambda: supabase.table("discovery_runs").insert(record).execute()
        )
    except Exception as e:
        # Log but don't fail - table might not exist yet
        logger.warning(f"Could not create run record (table may not exist): {e}")

    return run_id


async def update_run_record(
    supabase: Client, run_id: str, result: DiscoveryResult
) -> None:
    """
    Write the terminal payload for a discovery run.

    Preserves any existing ``summary_report`` fields (e.g. initial
    config + live progress) by merging them into the final report.

    Uses a conditional ``.eq("status", "running")`` so a late call
    cannot overwrite a run already marked failed/cancelled.
    """
    try:
        existing_report: Dict[str, Any] = {}
        try:
            # supabase-py is sync — wrap to keep the event loop free for
            # the heartbeat coroutine that's running alongside.
            existing = await asyncio.to_thread(
                lambda: supabase.table("discovery_runs")
                .select("summary_report")
                .eq("id", run_id)
                .single()
                .execute()
            )
            raw_report = (
                existing.data.get("summary_report") if existing.data else None
            )
            if isinstance(raw_report, dict):
                existing_report = raw_report
        except Exception:
            existing_report = {}

        final_report = {
            "stage": result.status.value,
            "markdown": result.summary_report,
            "queries_executed": result.queries_executed,
            "sources_blocked": result.sources_blocked,
            "sources_added": result.sources_added,
            "auto_approved": result.auto_approved,
            "pending_review": result.pending_review,
            "execution_time_seconds": result.execution_time_seconds,
            "cards_created_ids": result.cards_created,
            "cards_enriched_ids": result.cards_enriched,
        }

        updated_report = existing_report | final_report

        terminal_payload = {
            "status": result.status.value,
            "completed_at": (
                result.completed_at.isoformat()
                if result.completed_at
                else None
            ),
            "queries_generated": result.queries_generated,
            "sources_found": result.sources_discovered,
            "sources_relevant": result.sources_triaged,
            "cards_created": (
                len(result.cards_created)
                if isinstance(result.cards_created, list)
                else result.cards_created
            ),
            "cards_enriched": (
                len(result.cards_enriched)
                if isinstance(result.cards_enriched, list)
                else result.cards_enriched
            ),
            "cards_deduplicated": result.sources_duplicate,
            "estimated_cost": result.estimated_cost,
            "error_message": result.errors[0] if result.errors else None,
            "error_details": (
                {"errors": result.errors} if result.errors else None
            ),
            "summary_report": updated_report,
        }
        terminal_update = await asyncio.to_thread(
            lambda: supabase.table("discovery_runs")
            .update(terminal_payload)
            .eq("id", run_id)
            .eq("status", "running")
            .execute()
        )
        if not (terminal_update.data or []):
            logger.warning(
                "Discovery run %s already in a terminal state; "
                "skipped writing %s",
                run_id,
                result.status.value,
            )
    except Exception as e:
        logger.warning(f"Failed to update run record: {e}")


def generate_summary_report(
    queries_generated: int,
    queries_executed: int,
    sources_discovered: int,
    sources_triaged: int,
    sources_blocked: int,
    sources_duplicate: int,
    card_result: CardActionResult,
    cost: float,
    execution_time: float,
    errors: List[str],
    sources_by_category: Optional[Dict[str, int]] = None,
    categories_fetched: int = 0,
    diversity_metrics: Optional[SourceDiversityMetrics] = None,
    processing_time_metrics: Optional[ProcessingTimeMetrics] = None,
    api_token_usage_metrics: Optional[APITokenUsage] = None,
) -> str:
    """Generate a human-readable markdown summary report."""
    report = f"""# Discovery Run Summary

## Overview
- **Queries Generated**: {queries_generated}
- **Queries Executed**: {queries_executed}
- **Execution Time**: {execution_time:.1f} seconds
- **Estimated Cost**: ${cost:.4f}

## Sources
- **Discovered**: {sources_discovered}
- **Passed Triage**: {sources_triaged}
- **Blocked**: {sources_blocked}
- **Duplicates**: {sources_duplicate}
"""

    if sources_by_category:
        report += f"""
## Source Categories ({categories_fetched}/5 categories)
"""
        for category, count in sources_by_category.items():
            if count > 0:
                report += f"- **{category}**: {count} sources\n"

    if diversity_metrics:
        report += f"""
## Source Diversity Metrics
- **Category Coverage**: {diversity_metrics.category_coverage:.1%}
- **Balance Score**: {diversity_metrics.balance_score:.2f}
- **Shannon Entropy**: {diversity_metrics.shannon_entropy:.2f}
"""
        if diversity_metrics.dominant_category:
            report += (
                f"- **Dominant Category**: {diversity_metrics.dominant_category}\n"
            )
        if diversity_metrics.underrepresented_categories:
            report += f"- **Underrepresented**: {', '.join(diversity_metrics.underrepresented_categories)}\n"

    if processing_time_metrics:
        report += f"""
## Processing Time Breakdown
- **Query Generation**: {processing_time_metrics.query_generation_seconds:.2f}s
- **Multi-Source Fetch**: {processing_time_metrics.multi_source_fetch_seconds:.2f}s
- **Query Search**: {processing_time_metrics.query_search_seconds:.2f}s
- **Triage**: {processing_time_metrics.triage_seconds:.2f}s
- **Block Check**: {processing_time_metrics.blocked_topic_check_seconds:.2f}s
- **Deduplication**: {processing_time_metrics.deduplication_seconds:.2f}s
- **Card Creation**: {processing_time_metrics.card_creation_seconds:.2f}s
- **Total**: {processing_time_metrics.total_seconds:.2f}s
"""

    if api_token_usage_metrics:
        report += f"""
## API Token Usage
- **Triage Tokens**: {api_token_usage_metrics.triage_tokens:,}
- **Analysis Tokens**: {api_token_usage_metrics.analysis_tokens:,}
- **Embedding Tokens**: {api_token_usage_metrics.embedding_tokens:,}
- **Card Match Tokens**: {api_token_usage_metrics.card_match_tokens:,}
- **Total Tokens**: {api_token_usage_metrics.total_tokens:,}
- **Estimated Cost**: ${api_token_usage_metrics.estimated_cost_usd:.4f}
"""

    report += f"""
## Cards
- **Created**: {len(card_result.cards_created)}
- **Enriched**: {len(card_result.cards_enriched)}
- **Sources Added**: {card_result.sources_added}
- **Auto-Approved**: {card_result.auto_approved}
- **Pending Review**: {card_result.pending_review}
"""

    if errors:
        report += "\n## Errors\n"
        for error in errors:
            report += f"- {error}\n"

    return report


async def finalize_run(
    supabase: Client,
    run_id: str,
    start_time: datetime,
    queries_generated: int,
    queries_executed: int,
    sources_discovered: int,
    sources_triaged: int,
    sources_blocked: int,
    sources_duplicate: int,
    card_result: CardActionResult,
    cost: float,
    errors: List[str],
    status: DiscoveryStatus,
    pending_lens_tasks: Set[Awaitable],
    sources_by_category: Optional[Dict[str, int]] = None,
    categories_fetched: int = 0,
    diversity_metrics: Optional[SourceDiversityMetrics] = None,
    processing_time_metrics: Optional[ProcessingTimeMetrics] = None,
    api_token_usage_metrics: Optional[APITokenUsage] = None,
) -> DiscoveryResult:
    """
    Finalize the discovery run: assemble ``DiscoveryResult``, persist
    it, and drain any in-flight lens-cascade tasks.

    The ``pending_lens_tasks`` set is awaited (with a 120s cap) before
    returning so newly created cards actually get budget/climate/issue
    tags written. Without that drain, the asyncio loop tears down on
    return and cancels the cascade tasks in flight.
    """
    end_time = datetime.now(timezone.utc)
    execution_time = (end_time - start_time).total_seconds()

    if sources_by_category is None:
        sources_by_category = {}

    if diversity_metrics is None and sources_by_category:
        diversity_metrics = SourceDiversityMetrics.compute(sources_by_category)

    summary = generate_summary_report(
        queries_generated=queries_generated,
        queries_executed=queries_executed,
        sources_discovered=sources_discovered,
        sources_triaged=sources_triaged,
        sources_blocked=sources_blocked,
        sources_duplicate=sources_duplicate,
        sources_by_category=sources_by_category,
        categories_fetched=categories_fetched,
        card_result=card_result,
        cost=cost,
        execution_time=execution_time,
        errors=errors,
        diversity_metrics=diversity_metrics,
        processing_time_metrics=processing_time_metrics,
        api_token_usage_metrics=api_token_usage_metrics,
    )

    result = DiscoveryResult(
        run_id=run_id,
        status=status,
        started_at=start_time,
        completed_at=end_time,
        queries_generated=queries_generated,
        queries_executed=queries_executed,
        sources_discovered=sources_discovered,
        sources_triaged=sources_triaged,
        sources_blocked=sources_blocked,
        sources_duplicate=sources_duplicate,
        sources_by_category=sources_by_category,
        categories_fetched=categories_fetched,
        diversity_metrics=(
            diversity_metrics.to_dict() if diversity_metrics else None
        ),
        cards_created=card_result.cards_created,
        cards_enriched=card_result.cards_enriched,
        sources_added=card_result.sources_added,
        auto_approved=card_result.auto_approved,
        pending_review=card_result.pending_review,
        estimated_cost=cost,
        execution_time_seconds=execution_time,
        processing_time=(
            processing_time_metrics.to_dict() if processing_time_metrics else None
        ),
        api_token_usage=(
            api_token_usage_metrics.to_dict() if api_token_usage_metrics else None
        ),
        summary_report=summary,
        errors=errors,
    )

    await update_run_record(supabase, run_id, result)

    if pending_lens_tasks:
        pending = list(pending_lens_tasks)
        logger.info(
            f"Awaiting {len(pending)} pending lens-cascade task(s) before run exit"
        )
        try:
            await asyncio.wait_for(
                asyncio.gather(*pending, return_exceptions=True),
                timeout=120,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "Lens cascade drain timed out after 120s; cards may need backfill"
            )

    logger.info(f"Discovery run {run_id} completed: {summary[:200]}...")

    return result
