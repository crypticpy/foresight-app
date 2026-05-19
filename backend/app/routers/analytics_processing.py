"""Processing-metrics sub-router (monitoring dashboard).

Endpoints
---------
* ``GET /metrics/processing`` — aggregated discovery / research / classification
  metrics for the monitoring dashboard, looking back ``days`` (default 7).

This is a FastAPI sub-router with no prefix; the parent ``analytics``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The endpoint is read-only and fans out four Supabase queries via
``asyncio.to_thread`` so the sync client doesn't block the event loop.
Each section (discovery / research / classification / cards / errors) is
self-contained and folds its inputs into the corresponding Pydantic
sub-model on ``ProcessingMetrics``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional

from fastapi import APIRouter, Depends

from app.deps import get_current_user, supabase
from app.models.processing_metrics import (
    ClassificationMetrics,
    DiscoveryRunMetrics,
    ProcessingMetrics,
    ResearchTaskMetrics,
    SourceCategoryMetrics,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analytics"])


def _round_or_none(value: Optional[float], digits: int = 2) -> Optional[float]:
    """Round a metric, distinguishing 0.0 from "no data".

    Use this instead of ``round(x, n) if x else None`` for percentage /
    average metrics: the truthy form silently converts 0.0 to None,
    which makes 0% accuracy and 0% error rate render as "—" on the
    dashboard. ``None`` stays None; every other numeric (including
    0.0 and negative numbers) round-trips.
    """
    return None if value is None else round(value, digits)


@router.get("/metrics/processing", response_model=ProcessingMetrics)
async def get_processing_metrics(
    current_user: dict = Depends(get_current_user), days: int = 7
):
    """
    Get comprehensive processing metrics for monitoring dashboard.

    Returns aggregated metrics including:
    - Source diversity (sources fetched per category)
    - Discovery run statistics (completed, failed, cards generated)
    - Research task statistics (by status, avg processing time)
    - Classification accuracy metrics
    - Card generation summary

    Args:
        days: Number of days to look back for metrics (default: 7)

    Returns:
        ProcessingMetrics object with all aggregated metrics
    """
    # Calculate time range
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=days)
    period_start_iso = period_start.isoformat()

    # -------------------------------------------------------------------------
    # Discovery Run Metrics
    # -------------------------------------------------------------------------
    discovery_runs_response = await asyncio.to_thread(
        lambda: supabase.table("discovery_runs")
        .select(
            "id, status, cards_created, cards_enriched, sources_found, sources_relevant, summary_report, started_at, completed_at"
        )
        .gte("started_at", period_start_iso)
        .execute()
    )

    discovery_runs_data = discovery_runs_response.data or []

    completed_runs = [r for r in discovery_runs_data if r.get("status") == "completed"]
    failed_runs = [r for r in discovery_runs_data if r.get("status") == "failed"]

    total_cards_created = sum(
        r.get("cards_created", 0) or 0 for r in discovery_runs_data
    )
    total_cards_enriched = sum(
        r.get("cards_enriched", 0) or 0 for r in discovery_runs_data
    )
    total_sources = sum(r.get("sources_found", 0) or 0 for r in discovery_runs_data)

    avg_cards_per_run = (
        total_cards_created / len(completed_runs) if completed_runs else 0.0
    )
    avg_sources_per_run = (
        total_sources / len(discovery_runs_data) if discovery_runs_data else 0.0
    )

    discovery_metrics = DiscoveryRunMetrics(
        total_runs=len(discovery_runs_data),
        completed_runs=len(completed_runs),
        failed_runs=len(failed_runs),
        avg_cards_per_run=round(avg_cards_per_run, 2),
        avg_sources_per_run=round(avg_sources_per_run, 2),
        total_cards_created=total_cards_created,
        total_cards_enriched=total_cards_enriched,
    )

    # Extract source category metrics from discovery run summary_report
    sources_by_category: Dict[str, SourceCategoryMetrics] = {}
    for run in discovery_runs_data:
        report = run.get("summary_report") or {}
        categories_data = report.get("sources_by_category", {})
        for category, count in categories_data.items():
            if category not in sources_by_category:
                sources_by_category[category] = SourceCategoryMetrics(
                    category=category,
                    sources_fetched=0,
                    articles_processed=0,
                    cards_generated=0,
                    errors=0,
                )
            sources_by_category[category].sources_fetched += (
                count if isinstance(count, int) else 0
            )

    # -------------------------------------------------------------------------
    # Research Task Metrics
    # -------------------------------------------------------------------------
    research_tasks_response = await asyncio.to_thread(
        lambda: supabase.table("research_tasks")
        .select("id, status, started_at, completed_at")
        .gte("created_at", period_start_iso)
        .execute()
    )

    research_tasks_data = research_tasks_response.data or []

    completed_tasks = [t for t in research_tasks_data if t.get("status") == "completed"]
    failed_tasks = [t for t in research_tasks_data if t.get("status") == "failed"]
    queued_tasks = [t for t in research_tasks_data if t.get("status") == "queued"]
    processing_tasks = [
        t for t in research_tasks_data if t.get("status") == "processing"
    ]

    # Calculate average processing time for completed tasks
    processing_times = []
    for task in completed_tasks:
        started = task.get("started_at")
        completed = task.get("completed_at")
        if started and completed:
            try:
                start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(completed.replace("Z", "+00:00"))
                processing_times.append((end_dt - start_dt).total_seconds())
            except (ValueError, TypeError):
                pass

    avg_processing_time = (
        sum(processing_times) / len(processing_times) if processing_times else None
    )

    research_metrics = ResearchTaskMetrics(
        total_tasks=len(research_tasks_data),
        completed_tasks=len(completed_tasks),
        failed_tasks=len(failed_tasks),
        queued_tasks=len(queued_tasks),
        processing_tasks=len(processing_tasks),
        # ``_round_or_none`` keeps 0.0 as a real value. With the old
        # truthy guard a "no slow tasks" period would render as
        # "no data" on the dashboard.
        avg_processing_time_seconds=_round_or_none(avg_processing_time),
    )

    # -------------------------------------------------------------------------
    # Classification Accuracy Metrics
    # -------------------------------------------------------------------------
    # Scope validations to the same ``days`` window the response reports
    # under ``period_start``/``period_days``. Without the filter this
    # block was all-time accuracy on a windowed response — a real
    # behavior change worth flagging in the PR description.
    validations_response = await asyncio.to_thread(
        lambda: supabase.table("classification_validations")
        .select("is_correct")
        .not_.is_("is_correct", "null")
        .gte("created_at", period_start_iso)
        .execute()
    )

    validations_data = validations_response.data or []
    total_validations = len(validations_data)
    correct_count = sum(bool(v.get("is_correct")) for v in validations_data)
    accuracy = (
        (correct_count / total_validations * 100) if total_validations > 0 else None
    )

    classification_metrics = ClassificationMetrics(
        total_validations=total_validations,
        correct_count=correct_count,
        # 0.0% accuracy (every validation wrong) is a real value,
        # not "no data".
        accuracy_percentage=_round_or_none(accuracy),
        target_accuracy=85.0,
        meets_target=accuracy is not None and accuracy >= 85.0,
    )

    # -------------------------------------------------------------------------
    # Card Generation Summary
    # -------------------------------------------------------------------------
    cards_response = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select(
            "id, impact_score, velocity_score, novelty_score, risk_score", count="exact"
        )
        .gte("created_at", period_start_iso)
        .execute()
    )

    cards_data = cards_response.data or []
    cards_generated = len(cards_data)

    # Count cards with all 4 scoring dimensions
    cards_with_all_scores = sum(
        bool(
            c.get("impact_score") is not None
            and c.get("velocity_score") is not None
            and c.get("novelty_score") is not None
            and c.get("risk_score") is not None
        )
        for c in cards_data
    )

    # -------------------------------------------------------------------------
    # Error Summary
    # -------------------------------------------------------------------------
    total_errors = len(failed_runs) + len(failed_tasks)
    total_operations = len(discovery_runs_data) + len(research_tasks_data)
    error_rate = (
        (total_errors / total_operations * 100) if total_operations > 0 else None
    )

    # -------------------------------------------------------------------------
    # Build Response
    # -------------------------------------------------------------------------
    return ProcessingMetrics(
        period_start=period_start,
        period_end=period_end,
        period_days=days,
        sources_by_category=list(sources_by_category.values()),
        total_source_categories=len(sources_by_category),
        discovery_runs=discovery_metrics,
        research_tasks=research_metrics,
        classification=classification_metrics,
        cards_generated_in_period=cards_generated,
        cards_with_all_scores=cards_with_all_scores,
        total_errors=total_errors,
        # 0.0% error rate (a perfectly clean period) is a real
        # value, not "no data".
        error_rate_percentage=_round_or_none(error_rate),
    )
