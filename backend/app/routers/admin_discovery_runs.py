"""Admin discovery-run detail (sub-router).

Endpoints
---------
* ``GET /admin/discovery/runs/{run_id}/detail`` — drill-down view of one
  ``discovery_runs`` row with aggregate counts and a paginated slice of
  the ``discovered_sources`` rows it produced.

This module is a FastAPI sub-router with no prefix; the parent aggregator
(``admin_discovery.py``) mounts it under the ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix at exactly one place
(the aggregator) so the URL surface doesn't drift.

This is the read-only debug surface for individual runs. Recover /
reprocess action endpoints live elsewhere — they're untouched here.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.authz import require_admin
from app.deps import _safe_error, get_current_user, supabase
from app.models import DiscoveryRunDetailResponse

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin-discovery"])


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Columns we surface for each ``discovered_sources`` row in the detail view.
# We deliberately exclude ``full_content`` (potentially many KB per row) and
# ``content_embedding`` (1536-float vector) — neither helps the admin debug a
# run but together they would dominate the payload.
DISCOVERED_SOURCE_DETAIL_COLUMNS: tuple[str, ...] = (
    "id",
    "url",
    "title",
    "content_snippet",
    "domain",
    "source_type",
    "published_at",
    "search_query",
    "query_pillar",
    "query_priority",
    "triage_is_relevant",
    "triage_confidence",
    "triage_primary_pillar",
    "triage_reason",
    "triaged_at",
    "analysis_summary",
    "analysis_horizon",
    "analysis_suggested_card_name",
    "analysis_credibility",
    "analysis_novelty",
    "analysis_likelihood",
    "analysis_impact",
    "analysis_relevance",
    "analyzed_at",
    "dedup_status",
    "dedup_matched_card_id",
    "dedup_similarity_score",
    "deduplicated_at",
    "processing_status",
    "resulting_card_id",
    "resulting_source_id",
    "error_message",
    "error_stage",
    "created_at",
    "updated_at",
)

DISCOVERED_SOURCE_DETAIL_SELECT: str = ",".join(DISCOVERED_SOURCE_DETAIL_COLUMNS)

# Hard ceiling on aggregate-count fetch. A single run that produced more than
# this many sources is already pathological; the detail page should not be
# the place where we discover that.
MAX_AGGREGATE_FETCH = 50_000


def _aggregate_run_counts(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Pure aggregator over a list of discovered-source summary rows.

    Splitting this out keeps the route function thin and lets the unit tests
    feed in fixtures without touching Supabase at all. The keys are stable
    so the frontend can render them without re-deriving labels.
    """
    by_status: dict[str, int] = {}
    by_triage = {"passed": 0, "failed": 0, "pending": 0}
    by_error_stage: dict[str, int] = {}
    cards_created = 0
    cards_enriched = 0
    for row in rows:
        status_label = row.get("processing_status") or "unknown"
        by_status[status_label] = by_status.get(status_label, 0) + 1
        if status_label == "card_created":
            cards_created += 1
        elif status_label == "card_enriched":
            cards_enriched += 1
        triage_flag = row.get("triage_is_relevant")
        if triage_flag is True:
            by_triage["passed"] += 1
        elif triage_flag is False:
            by_triage["failed"] += 1
        else:
            by_triage["pending"] += 1
        stage = row.get("error_stage")
        if stage:
            by_error_stage[stage] = by_error_stage.get(stage, 0) + 1
    return {
        "by_processing_status": by_status,
        "by_triage": by_triage,
        "by_error_stage": by_error_stage,
        "card_outcomes": {
            "card_created": cards_created,
            "card_enriched": cards_enriched,
        },
    }


@router.get(
    "/admin/discovery/runs/{run_id}/detail",
    response_model=DiscoveryRunDetailResponse,
)
async def get_discovery_run_detail(
    run_id: str,
    limit: int = 50,
    offset: int = 0,
    current_user: dict = Depends(get_current_user),
):
    """Drill-down view of one ``discovery_runs`` row.

    Returns the run row, aggregate counts grouped by ``processing_status``,
    ``triage_is_relevant`` and ``error_stage``, plus a paginated slice of
    ``discovered_sources`` rows. The aggregate-count fetch is capped at
    ``MAX_AGGREGATE_FETCH`` so a runaway run doesn't blow up the response.
    The recover/reprocess action endpoints are left untouched — the UI just
    calls them; this endpoint only assembles the read model.
    """
    require_admin(current_user)
    if limit < 1 or limit > 200:
        raise HTTPException(
            status_code=400, detail="limit must be between 1 and 200"
        )
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset must be >= 0")

    def load() -> dict[str, Any]:
        run_resp = (
            supabase.table("discovery_runs")
            .select(
                "id,started_at,completed_at,status,pillars_scanned,"
                "priorities_scanned,queries_generated,sources_found,"
                "sources_relevant,cards_created,cards_enriched,"
                "cards_deduplicated,estimated_cost,error_message,"
                "error_details,summary_report,triggered_by,"
                "triggered_by_user,created_at"
            )
            .eq("id", run_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not run_resp:
            raise HTTPException(status_code=404, detail="Discovery run not found")
        run_row = run_resp[0]

        # Light-weight rows for aggregate counts. Only the columns we
        # actually fold over so this stays cheap even if a run produced
        # thousands of sources.
        agg_rows = (
            supabase.table("discovered_sources")
            .select("processing_status,triage_is_relevant,error_stage")
            .eq("discovery_run_id", run_id)
            .limit(MAX_AGGREGATE_FETCH)
            .execute()
            .data
            or []
        )
        totals = _aggregate_run_counts(agg_rows)
        sources_total = len(agg_rows)
        truncated = sources_total >= MAX_AGGREGATE_FETCH

        # Fetch one extra row so ``has_more`` can be derived from the page
        # slice itself rather than the (possibly truncated) aggregate total.
        # This keeps the answer correct even when ``aggregate_truncated`` is
        # True or when ``offset`` lands past the end of the result set —
        # both cases would otherwise return ``items=[], has_more=True``.
        page_rows_full = (
            supabase.table("discovered_sources")
            .select(DISCOVERED_SOURCE_DETAIL_SELECT)
            .eq("discovery_run_id", run_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit)
            .execute()
            .data
            or []
        )
        has_more = len(page_rows_full) > limit
        page_rows = page_rows_full[:limit]

        return {
            "run": run_row,
            "totals": {
                **totals,
                "sources_total": sources_total,
                "aggregate_truncated": truncated,
            },
            "sources": {
                "items": page_rows,
                "limit": limit,
                "offset": offset,
                "has_more": has_more,
            },
        }

    try:
        return await asyncio.to_thread(load)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load discovery run detail")
        raise HTTPException(status_code=500, detail=_safe_error("load discovery run detail", e))
