"""Discovery pipeline router."""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.cost_guardrail import (
    BudgetExceededError,
    check_budget_or_raise,
    check_budget_or_skip,
)
from app.deps import supabase, get_current_user, _safe_error, openai_client, limiter
from app.supabase_in_guard import chunked_in_query
from app.models.discovery_models import (
    DiscoveryConfigRequest,
    DiscoveryRun,
    get_discovery_max_queries,
    get_discovery_max_sources,
)
from app.discovery_service import DiscoveryService
from app.helpers.workstream_utils import _filter_cards_for_workstream

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["discovery"])


async def _distribute_cards_to_auto_add_workstreams(new_card_ids: List[str]):
    """Distribute newly discovered cards to workstreams with auto_add=true.

    For each active workstream with auto_add enabled, checks if any of the
    newly created cards match the workstream's filter criteria (pillar, goal,
    stage, horizon, keywords). Matching cards are added to the workstream's
    inbox with added_from='auto_discovery'.

    This is a lightweight operation that only checks the new cards from the
    current discovery run, not the full card pool.

    Args:
        new_card_ids: List of card IDs created during this discovery run
    """
    if not new_card_ids:
        return

    logger.info(f"Distributing {len(new_card_ids)} new cards to auto_add workstreams")

    # Fetch the new cards. Chunked because a productive discovery run can
    # produce more than SAFE_IN_LIMIT new cards in a single distribution call.
    def _fetch_new_cards(chunk):
        resp = (
            supabase.table("cards")
            .select("id, pillar_id, goal_id, stage_id, horizon, name, summary, description")
            .in_("id", chunk)
            .execute()
        )
        return resp.data or []

    new_cards = await asyncio.to_thread(
        chunked_in_query, _fetch_new_cards, new_card_ids
    )
    if not new_cards:
        return

    # Fetch all active workstreams with auto_add enabled
    ws_response = await asyncio.to_thread(
        lambda: supabase.table("workstreams")
        .select("id, user_id, pillar_ids, goal_ids, stage_ids, horizon, keywords")
        .eq("auto_add", True)
        .eq("is_active", True)
        .execute()
    )
    workstreams = ws_response.data or []
    if not workstreams:
        logger.info("No active workstreams with auto_add enabled")
        return

    total_distributed = 0

    for ws in workstreams:
        try:
            # Get existing card IDs in this workstream to avoid duplicates
            # Bind ws_id as default arg to avoid late-binding closure trap in loop
            existing_response = await asyncio.to_thread(
                lambda ws_id=ws["id"]: supabase.table("workstream_cards")
                .select("card_id")
                .eq("workstream_id", ws_id)
                .execute()
            )
            existing_card_ids = {
                item["card_id"] for item in existing_response.data or []
            }

            # Filter new cards against workstream criteria using shared helper
            non_duplicate_cards = [
                c for c in new_cards if c["id"] not in existing_card_ids
            ]
            matching_cards = _filter_cards_for_workstream(ws, non_duplicate_cards)

            if not matching_cards:
                continue

            # Get current max position in inbox for this workstream
            # Bind ws_id as default arg to avoid late-binding closure trap in loop
            pos_response = await asyncio.to_thread(
                lambda ws_id=ws["id"]: supabase.table("workstream_cards")
                .select("position")
                .eq("workstream_id", ws_id)
                .eq("status", "inbox")
                .order("position", desc=True)
                .limit(1)
                .execute()
            )
            start_position = 0
            if pos_response.data:
                start_position = pos_response.data[0]["position"] + 1

            # Insert matching cards into workstream inbox
            now = datetime.now(timezone.utc).isoformat()
            records = [
                {
                    "workstream_id": ws["id"],
                    "card_id": card["id"],
                    "added_by": ws["user_id"],
                    "added_at": now,
                    "status": "inbox",
                    "position": start_position + idx,
                    "added_from": "auto_discovery",
                    "updated_at": now,
                }
                for idx, card in enumerate(matching_cards)
            ]

            await asyncio.to_thread(
                lambda recs=records: supabase.table("workstream_cards")
                .insert(recs)
                .execute()
            )
            total_distributed += len(records)
            logger.info(
                f"Auto-added {len(records)} cards to workstream "
                f"'{ws['id']}' (auto_discovery)"
            )

        except Exception as e:
            logger.error(
                f"Failed to distribute cards to workstream {ws.get('id')}: {e}"
            )
            continue

    logger.info(
        f"Post-discovery distribution complete: {total_distributed} cards "
        f"distributed across {len(workstreams)} auto_add workstreams"
    )


async def execute_discovery_run_background(
    run_id: str, config: DiscoveryConfigRequest, user_id: str
):
    """
    Background task to execute discovery run using DiscoveryService.

    Updates run status through lifecycle: running -> completed/failed
    """
    from app.discovery_service import build_discovery_config

    # Re-check the cost guardrail at execution time. The HTTP entry point
    # also calls ``check_budget_or_raise``, but worker-driven runs (scheduled
    # discovery, recovered runs) reach this function without going through it.
    # Use ``check_budget_or_skip`` here because we are not inside a request and
    # cannot raise HTTPException — fail the run instead.
    try:
        await check_budget_or_skip()
    except BudgetExceededError as exc:
        logger.warning(
            "Discovery run %s aborted before start: cost guardrail tripped (%s)",
            run_id,
            exc,
        )
        update_payload = {
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error_message": "Cost guardrail tripped — discovery run aborted",
        }

        def _mark_aborted() -> None:
            supabase.table("discovery_runs").update(update_payload).eq(
                "id", run_id
            ).execute()

        try:
            await asyncio.to_thread(_mark_aborted)
        except Exception:
            logger.exception(
                "Failed to mark discovery run %s as guardrail-aborted", run_id
            )
        return

    try:
        logger.info(f"Starting discovery run {run_id}")

        # Caller-supplied request fields override admin_settings, which
        # override env, which override in-code defaults. Pydantic's
        # ``auto_approve_threshold`` always has a value (default 0.95) so
        # it cannot fall through to admin overrides; that's intentional —
        # if a caller cares enough to specify the threshold, they win.
        discovery_config = await asyncio.to_thread(
            build_discovery_config,
            max_queries_per_run=config.max_queries_per_run,
            max_sources_total=config.max_sources_total,
            auto_approve_threshold=config.auto_approve_threshold,
            pillars_filter=config.pillars_filter or [],
            dry_run=config.dry_run,
            categories_to_scan=config.categories_to_scan,
            source_ids=config.source_ids,
            custom_queries=config.custom_queries,
            enable_multi_source=config.enable_multi_source,
        )

        # Execute discovery using the service (pass existing run_id to avoid duplicate)
        service = DiscoveryService(
            supabase, openai_client, triggered_by_user_id=user_id
        )
        result = await service.execute_discovery_run(
            discovery_config, existing_run_id=run_id
        )

        # Update the run record with results (service already updates its own record,
        # but we update the one we created in the endpoint)
        success_payload = {
            "status": result.status.value,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "queries_generated": result.queries_generated,
            "sources_found": result.sources_discovered,
            "sources_relevant": result.sources_triaged,
            "cards_created": len(result.cards_created),
            "cards_enriched": len(result.cards_enriched),
            "cards_deduplicated": result.sources_duplicate,
            "estimated_cost": result.estimated_cost,
        }

        def _update_success() -> int:
            res = (
                supabase.table("discovery_runs")
                .update(success_payload)
                .eq("id", run_id)
                .eq("status", "running")
                .execute()
            )
            return len(res.data or [])

        updated = await asyncio.to_thread(_update_success)
        if not updated:
            logger.warning(
                "Discovery run %s already terminal; skipped success status write",
                run_id,
            )

        logger.info(
            f"Discovery run {run_id} completed: {len(result.cards_created)} cards created, {len(result.cards_enriched)} enriched"
        )

        # --- Post-processing: distribute new cards to auto_add workstreams ---
        if result.cards_created:
            try:
                await _distribute_cards_to_auto_add_workstreams(result.cards_created)
            except Exception as dist_err:
                logger.error(
                    f"Post-discovery card distribution failed (non-fatal): {dist_err}"
                )

    except Exception as e:
        logger.error(f"Discovery run {run_id} failed: {str(e)}", exc_info=True)
        failure_payload = {
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error_message": str(e),
        }

        def _update_failure() -> None:
            supabase.table("discovery_runs").update(failure_payload).eq(
                "id", run_id
            ).execute()

        try:
            await asyncio.to_thread(_update_failure)
        except Exception:
            logger.exception(
                "Failed to mark discovery run %s as failed after error", run_id
            )


# ============================================================================
# Weekly Discovery Scheduler
# ============================================================================


async def run_weekly_discovery():
    """
    Run weekly automated discovery.

    Scheduled to run every Sunday at 2:00 AM UTC. Executes a full
    discovery run with default configuration across all pillars.
    """
    logger.info("Starting weekly discovery run...")

    try:
        # Get system user for automated tasks
        system_user = await asyncio.to_thread(
            lambda: supabase.table("users").select("id").limit(1).execute()
        )
        user_id = system_user.data[0]["id"] if system_user.data else None

        if not user_id:
            logger.warning("Weekly discovery: No system user found, skipping")
            return

        # Create discovery run with default config
        run_id = str(uuid.uuid4())
        config = DiscoveryConfigRequest()  # Default values

        run_record = {
            "id": run_id,
            "status": "running",
            "triggered_by": "scheduled",
            "triggered_by_user": user_id,
            "cards_created": 0,
            "cards_enriched": 0,
            "cards_deduplicated": 0,
            "sources_found": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "summary_report": {"stage": "queued", "config": config.dict()},
        }

        await asyncio.to_thread(
            lambda: supabase.table("discovery_runs").insert(run_record).execute()
        )

        logger.info(f"Weekly discovery run queued: {run_id}")

    except Exception as e:
        logger.error(f"Weekly discovery failed: {str(e)}")


# ============================================================================
# Routes
# ============================================================================


@router.get("/discovery/config")
async def get_discovery_config(current_user: dict = Depends(get_current_user)):
    """
    Get current discovery configuration defaults.

    Returns environment-configured defaults for discovery runs.
    Frontend can use this to display current limits.
    """
    return {
        "max_queries_per_run": get_discovery_max_queries(),
        "max_sources_total": get_discovery_max_sources(),
        "max_sources_per_query": int(
            os.getenv("DISCOVERY_MAX_SOURCES_PER_QUERY", "10")
        ),
        "auto_approve_threshold": 0.95,
        "similarity_threshold": 0.92,
    }


@router.post("/discovery/run", response_model=DiscoveryRun)
@limiter.limit("3/minute")
async def trigger_discovery_run(
    request: Request,
    config: DiscoveryConfigRequest = DiscoveryConfigRequest(),
    current_user: dict = Depends(get_current_user),
):
    """
    Trigger a new discovery run.

    Creates a discovery run record and starts the discovery process in the background.

    Returns immediately with run ID. Poll GET /discovery/runs/{run_id} for status.
    """
    # Rolling-window cost guardrail. No-op when disabled in admin settings.
    await check_budget_or_raise()

    try:
        # Apply env defaults for any unset values
        resolved_config = {
            "max_queries_per_run": config.max_queries_per_run
            or get_discovery_max_queries(),
            "max_sources_total": config.max_sources_total
            or get_discovery_max_sources(),
            "auto_approve_threshold": config.auto_approve_threshold,
            "pillars_filter": config.pillars_filter,
            "dry_run": config.dry_run,
        }

        # Create discovery run record with resolved config
        run_record = {
            "status": "running",
            "triggered_by": "manual",
            "triggered_by_user": current_user["id"],
            "summary_report": {"stage": "queued", "config": resolved_config},
            "cards_created": 0,
            "cards_enriched": 0,
            "cards_deduplicated": 0,
            "sources_found": 0,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }

        result = await asyncio.to_thread(
            lambda: supabase.table("discovery_runs").insert(run_record).execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=500, detail="Failed to create discovery run"
            )

        # Discovery execution is handled by the background worker (see `app.worker`).

        return DiscoveryRun(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to trigger discovery run: {str(e)}")
        raise HTTPException(
            status_code=500, detail=_safe_error("discovery run trigger", e)
        ) from e


@router.get("/discovery/runs/{run_id}", response_model=DiscoveryRun)
async def get_discovery_run(
    run_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get discovery run status.

    Use this endpoint to poll for run completion after triggering a discovery run.
    Status values: running, completed, failed, cancelled
    """
    result = await asyncio.to_thread(
        lambda: supabase.table("discovery_runs")
        .select("*")
        .eq("id", run_id)
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Discovery run not found")

    return DiscoveryRun(**result.data)


@router.get("/discovery/runs", response_model=List[DiscoveryRun])
async def list_discovery_runs(
    current_user: dict = Depends(get_current_user), limit: int = 20
):
    """
    List recent discovery runs.

    Returns the most recent runs, ordered by start time descending.
    """
    result = await asyncio.to_thread(
        lambda: supabase.table("discovery_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
    )

    return [DiscoveryRun(**r) for r in result.data]


@router.post("/discovery/runs/{run_id}/cancel")
async def cancel_discovery_run(
    run_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Cancel a running discovery run.

    Only runs with status 'running' can be cancelled.
    """
    # Get current run status
    response = await asyncio.to_thread(
        lambda: supabase.table("discovery_runs")
        .select("*")
        .eq("id", run_id)
        .execute()
    )

    if not response.data:
        raise HTTPException(status_code=404, detail="Discovery run not found")

    run = response.data[0]

    # Check if run can be cancelled
    if run["status"] != "running":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel run with status '{run['status']}'. Only 'running' runs can be cancelled.",
        )

    # Update status to cancelled — guard against late writes resurrecting a
    # run that already reached a terminal state.
    update_response = await asyncio.to_thread(
        lambda: supabase.table("discovery_runs")
        .update(
            {
                "status": "cancelled",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": f"Cancelled by user {current_user['id']}",
            }
        )
        .eq("id", run_id)
        .eq("status", "running")
        .execute()
    )

    if update_response.data:
        logger.info(f"Discovery run {run_id} cancelled by user {current_user['id']}")
        return DiscoveryRun(**update_response.data[0])
    else:
        raise HTTPException(status_code=500, detail="Failed to cancel discovery run")


@router.post("/discovery/recover")
@limiter.limit("1/hour")
async def recover_cards(
    request: Request,
    current_user: dict = Depends(get_current_user),
    date_start: str = "2025-12-01",
    date_end: str = "2026-01-01",
):
    """Recover cards from discovered_sources audit trail.

    Finds orphaned sources (cards deleted or never created) in the date range,
    reconstructs ProcessedSource objects, and feeds them through the signal agent
    for intelligent re-grouping into signals.
    """
    from app.recovery_service import recover_cards_from_discovered_sources

    try:
        result = await recover_cards_from_discovered_sources(
            supabase=supabase,
            date_start=date_start,
            date_end=date_end,
            triggered_by_user_id=current_user["id"],
        )
        return result
    except Exception as e:
        logger.error(f"Recovery failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=_safe_error("card recovery", e))


@router.post("/discovery/reprocess")
@limiter.limit("1/hour")
async def reprocess_errored_sources(
    request: Request,
    current_user: dict = Depends(get_current_user),
    date_start: str = "2025-12-01",
    date_end: str = "2026-02-13",
):
    """Re-process errored discovered_sources through the full AI pipeline.

    Takes sources that errored or were filtered during original processing,
    re-runs triage + analysis + embedding, then feeds through the signal agent.
    """
    from app.recovery_service import reprocess_errored_sources as _reprocess

    try:
        result = await _reprocess(
            supabase=supabase,
            date_start=date_start,
            date_end=date_end,
            triggered_by_user_id=current_user["id"],
        )
        return result
    except Exception as e:
        logger.error(f"Reprocess failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_safe_error("source reprocessing", e)
        )


@router.post("/discovery/recover-analyzed")
@limiter.limit("3/hour")
async def recover_analyzed_errors(
    request: Request,
    current_user: dict = Depends(get_current_user),
    date_start: str = "2025-12-01",
    date_end: str = "2026-02-01",
):
    """Recover sources that already passed triage+analysis but failed at card creation.

    Unlike /reprocess (which re-runs triage from scratch), this endpoint uses
    the existing analysis data to skip triage and feed directly to the signal agent.
    """
    from app.recovery_service import recover_analyzed_errors as _recover

    try:
        result = await _recover(
            supabase=supabase,
            date_start=date_start,
            date_end=date_end,
            triggered_by_user_id=current_user["id"],
        )
        return result
    except Exception as e:
        logger.error(f"Recovery of analyzed errors failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_safe_error("analyzed error recovery", e)
        )


@router.post("/discovery/enrich")
@limiter.limit("3/hour")
async def enrich_weak_signals(
    request: Request,
    current_user: dict = Depends(get_current_user),
    min_sources: int = 3,
    max_new_sources_per_card: int = 5,
):
    """Enrich signals that have fewer than min_sources with additional web sources.

    Uses the configured web-search providers (SearXNG / Serper, with Exa as a
    fallback) to find supporting articles for each weak signal, then stores
    them as supporting sources.
    """
    from app.enrichment_service import enrich_weak_signals as _enrich

    try:
        result = await _enrich(
            supabase=supabase,
            min_sources=min_sources,
            max_new_sources_per_card=max_new_sources_per_card,
            triggered_by_user_id=current_user["id"],
        )
        return result
    except Exception as e:
        logger.error(f"Enrichment failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=_safe_error("signal enrichment", e))


@router.post("/discovery/enrich-profiles")
@limiter.limit("30/hour")
async def enrich_profiles(
    request: Request,
    current_user: dict = Depends(get_current_user),
    max_cards: int = 50,
):
    """Batch-generate rich signal profiles for cards with blank/thin descriptions."""
    from app.enrichment_service import enrich_signal_profiles

    try:
        result = await enrich_signal_profiles(
            supabase=supabase,
            max_cards=max_cards,
            triggered_by_user_id=current_user["id"],
        )
        return result
    except Exception as e:
        logger.error(f"Profile enrichment failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_safe_error("profile enrichment", e)
        )


# ============================================================================
# Card Snapshots — version history for description/summary
# ============================================================================


@router.get("/cards/{card_id}/snapshots")
async def list_card_snapshots(
    card_id: str,
    field_name: str = "description",
    current_user: dict = Depends(get_current_user),
):
    """List all snapshots for a card field, newest first."""
    result = await asyncio.to_thread(
        lambda: supabase.table("card_snapshots")
        .select("id, field_name, content_length, trigger, created_at, created_by")
        .eq("card_id", card_id)
        .eq("field_name", field_name)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"snapshots": result.data or [], "card_id": card_id}


@router.get("/cards/{card_id}/snapshots/{snapshot_id}")
async def get_card_snapshot(
    card_id: str,
    snapshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get full content of a specific snapshot."""
    result = await asyncio.to_thread(
        lambda: supabase.table("card_snapshots")
        .select("*")
        .eq("id", snapshot_id)
        .eq("card_id", card_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Snapshot not found")
    return result.data


@router.post("/cards/{card_id}/snapshots/{snapshot_id}/restore")
async def restore_card_snapshot(
    card_id: str,
    snapshot_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Restore a card field from a snapshot. Saves current value as a new snapshot first."""
    # Get the snapshot to restore
    snapshot = await asyncio.to_thread(
        lambda: supabase.table("card_snapshots")
        .select("*")
        .eq("id", snapshot_id)
        .eq("card_id", card_id)
        .single()
        .execute()
    )
    if not snapshot.data:
        raise HTTPException(status_code=404, detail="Snapshot not found")

    field_name = snapshot.data["field_name"]
    restore_content = snapshot.data["content"]

    # Get current value and save it as a snapshot before overwriting
    card = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select(f"id, {field_name}")
        .eq("id", card_id)
        .single()
        .execute()
    )
    if not card.data:
        raise HTTPException(status_code=404, detail="Card not found")

    current_content = card.data.get(field_name, "")
    now = datetime.now(timezone.utc).isoformat()

    if current_content and len(current_content) > 10:
        await asyncio.to_thread(
            lambda: supabase.table("card_snapshots")
            .insert(
                {
                    "card_id": card_id,
                    "field_name": field_name,
                    "content": current_content,
                    "content_length": len(current_content),
                    "trigger": "restore",
                    "created_at": now,
                    "created_by": current_user.get("id", "user"),
                }
            )
            .execute()
        )

    # Restore the old content
    await asyncio.to_thread(
        lambda: supabase.table("cards")
        .update({field_name: restore_content, "updated_at": now})
        .eq("id", card_id)
        .execute()
    )

    logger.info(
        f"Card {card_id} {field_name} restored from snapshot {snapshot_id} "
        f"by user {current_user.get('id')}"
    )

    return {
        "restored": True,
        "field_name": field_name,
        "snapshot_id": snapshot_id,
        "content_length": len(restore_content),
    }


# ============================================================================
# Discovery Schedule Management
# ============================================================================


class DiscoveryScheduleResponse(BaseModel):
    """Response model for discovery schedule settings."""

    id: str
    name: str
    enabled: bool = True
    cron_expression: Optional[str] = None
    timezone: Optional[str] = None
    interval_hours: int = 24
    max_search_queries_per_run: int = 20
    pillars_to_scan: Optional[List[str]] = None
    process_rss_first: bool = True
    last_run_at: Optional[str] = None
    next_run_at: Optional[str] = None
    last_run_status: Optional[str] = None
    last_run_summary: Optional[dict] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        extra = "allow"


class DiscoveryScheduleUpdate(BaseModel):
    """Request model for updating discovery schedule settings."""

    enabled: Optional[bool] = None
    cron_expression: Optional[str] = Field(
        None, description="Cron expression (for display/reference)"
    )
    interval_hours: Optional[int] = Field(
        None, ge=1, le=168, description="Run interval in hours"
    )
    max_search_queries_per_run: Optional[int] = Field(None, ge=1, le=200)
    pillars_to_scan: Optional[List[str]] = Field(
        None, description="Pillar codes to scan: CH, MC, HS, EC, ES, CE"
    )
    process_rss_first: Optional[bool] = None
    next_run_at: Optional[str] = Field(
        None, description="Override next run time (ISO 8601)"
    )


@router.get("/discovery/schedule", response_model=DiscoveryScheduleResponse)
async def get_discovery_schedule(current_user: dict = Depends(get_current_user)):
    """Get the current discovery schedule settings.

    Returns the default (or only) schedule configuration that controls
    automated discovery runs in the background worker.
    """
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("discovery_schedule")
            .select("*")
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="No discovery schedule configured. Run the migration first.",
            )

        return DiscoveryScheduleResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get discovery schedule: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_safe_error("get discovery schedule", e)
        ) from e


@router.put("/discovery/schedule", response_model=DiscoveryScheduleResponse)
async def update_discovery_schedule(
    body: DiscoveryScheduleUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update discovery schedule settings.

    Accepts partial updates. Only provided fields are changed.
    Use this to enable/disable the schedule, change the interval,
    adjust which pillars are scanned, or override the next run time.
    """
    try:
        # Get existing schedule
        existing = await asyncio.to_thread(
            lambda: supabase.table("discovery_schedule")
            .select("id")
            .order("created_at", desc=False)
            .limit(1)
            .execute()
        )

        if not existing.data:
            raise HTTPException(
                status_code=404,
                detail="No discovery schedule configured. Run the migration first.",
            )

        schedule_id = existing.data[0]["id"]

        # Build update dict from non-None fields
        update_data = body.dict(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

        result = await asyncio.to_thread(
            lambda: supabase.table("discovery_schedule")
            .update(update_data)
            .eq("id", schedule_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update schedule")

        logger.info(
            f"Discovery schedule updated by user {current_user['id']}",
            extra={
                "schedule_id": schedule_id,
                "updated_fields": list(update_data.keys()),
            },
        )

        return DiscoveryScheduleResponse(**result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update discovery schedule: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=_safe_error("update discovery schedule", e)
        ) from e
