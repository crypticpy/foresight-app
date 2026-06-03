"""Research tasks router."""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from app.authz import (
    require_card_in_workstream,
    require_card_research_access,
    require_workstream_access,
)
from app.cost_guardrail import check_budget_or_raise
from app.deps import supabase, get_current_user, openai_client, limiter
from app.job_events import (
    EVENT_STATUS_CHANGED,
    EVENT_WATCHDOG_KILLED,
    JOB_RESEARCH,
    emit,
    record_event,
)
from app.models.research import ResearchTaskCreate, ResearchTask
from app.research_service import ResearchService
from app.usage_telemetry import llm_usage_context

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["research"])

TRUTHY = {"1", "true", "yes", "y", "on"}
RESEARCH_TASK_COST_ESTIMATE_USD = {
    "update": 0.25,
    "deep_research": 4.00,
    "workstream_analysis": 2.00,
}


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in TRUTHY


def _env_float(name: str) -> float | None:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return None
    try:
        return float(raw)
    except ValueError:
        logger.warning("Ignoring invalid %s=%r", name, raw)
        return None


def _estimated_task_cost(task_type: str) -> float:
    env_name = f"RESEARCH_TASK_ESTIMATED_COST_{task_type.upper()}_USD"
    return _env_float(env_name) or RESEARCH_TASK_COST_ESTIMATE_USD.get(task_type, 0.0)


# ============================================================================
# Background task
# ============================================================================


async def execute_research_task_background(
    task_id: str, task_data: ResearchTaskCreate, user_id: str
):
    """
    Background task to execute research.

    Updates task status through lifecycle: queued -> processing -> completed/failed

    Research Pipeline (hybrid approach):
    1. Discovery: GPT Researcher with municipal-focused queries
    2. Triage: Quick relevance check (mini chat tier)
    3. Analysis: Full classification and scoring (chat tier)
    4. Matching: Vector similarity to existing cards
    5. Storage: Persist with entities for graph building
    """
    service = ResearchService(supabase, openai_client)

    try:

        def _get_timeout_seconds(task_type: str) -> int:
            defaults = {
                "update": 15 * 60,
                "deep_research": 45 * 60,
                "workstream_analysis": 45 * 60,
            }
            env_keys = {
                "update": "RESEARCH_TASK_TIMEOUT_UPDATE_SECONDS",
                "deep_research": "RESEARCH_TASK_TIMEOUT_DEEP_RESEARCH_SECONDS",
                "workstream_analysis": "RESEARCH_TASK_TIMEOUT_WORKSTREAM_ANALYSIS_SECONDS",
            }
            env_key = env_keys.get(task_type)
            if env_key:
                try:
                    return int(
                        os.getenv(env_key, str(defaults.get(task_type, 45 * 60)))
                    )
                except ValueError:
                    return defaults.get(task_type, 45 * 60)
            return defaults.get(task_type, 45 * 60)

        # Update status to processing. Liveness is no longer carried by
        # ``result_summary.heartbeat_at`` — the JobEventEmitter below
        # writes to ``job_events`` and the watchdog reads from there.
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("research_tasks").update(
            {
                "status": "processing",
                "started_at": now,
                "result_summary": {"stage": f"running:{task_data.task_type}"},
            }
        ).eq("id", task_id).execute()
        await asyncio.to_thread(
            record_event,
            JOB_RESEARCH,
            task_id,
            EVENT_STATUS_CHANGED,
            stage="claim",
            message="queued -> processing",
            payload={"task_type": task_data.task_type},
        )

        timeout_seconds = _get_timeout_seconds(task_data.task_type)

        with emit(JOB_RESEARCH, task_id) as events:
            events.stage(
                "start",
                message=f"research task {task_data.task_type} started",
                payload={
                    "task_type": task_data.task_type,
                    "card_id": task_data.card_id,
                    "workstream_id": task_data.workstream_id,
                },
            )
            with llm_usage_context(
                user_id=user_id,
                task_id=task_id,
                card_id=task_data.card_id,
                workstream_id=task_data.workstream_id,
                operation=f"research.{task_data.task_type}",
            ):
                if task_data.task_type == "update":
                    result = await asyncio.wait_for(
                        service.execute_update(
                            task_data.card_id, task_id, events=events
                        ),
                        timeout=timeout_seconds,
                    )
                elif task_data.task_type == "deep_research":
                    result = await asyncio.wait_for(
                        service.execute_deep_research(
                            task_data.card_id, task_id, events=events
                        ),
                        timeout=timeout_seconds,
                    )
                elif task_data.task_type == "workstream_analysis":
                    result = await asyncio.wait_for(
                        service.execute_workstream_analysis(
                            task_data.workstream_id,
                            task_id,
                            user_id,
                            events=events,
                        ),
                        timeout=timeout_seconds,
                    )
                else:
                    raise ValueError(f"Unknown task type: {task_data.task_type}")

        # Convert ResearchResult dataclass to dict for storage
        result_summary = {
            "sources_found": result.sources_found,
            "sources_relevant": result.sources_relevant,
            "sources_added": result.sources_added,
            "cards_matched": result.cards_matched,
            "cards_created": result.cards_created,
            "entities_extracted": result.entities_extracted,
            "cost_estimate": result.cost_estimate,
            "report_preview": result.report_preview,  # Full research report text
        }

        # Update as completed — but only if the watchdog hasn't already
        # failed this task. Without the status guard, a slow run can finish
        # after the watchdog's heartbeat-stale failure and flip the row from
        # `failed` back to `completed`, leaving a confused state where the
        # watchdog's error_message lingers on a "completed" row.
        completion_result = (
            supabase.table("research_tasks")
            .update(
                {
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "result_summary": result_summary,
                    # Uncapped paid research output, kept for recovery / re-embed.
                    # result_summary.report_preview remains a capped UI preview.
                    "raw_report": result.raw_report,
                    "full_report": result.full_report,
                }
            )
            .eq("id", task_id)
            .eq("status", "processing")
            .execute()
        )
        if not completion_result.data:
            logger.warning(
                "Research task %s completed work but row was already %s "
                "(watchdog likely won the race); leaving terminal state intact",
                task_id,
                "non-processing",
            )

        # Update signal quality score after research completion
        if task_data.card_id:
            try:
                from app.signal_quality import update_signal_quality_score

                update_signal_quality_score(supabase, task_data.card_id)
            except Exception as e:
                logger.warning(
                    f"Failed to update signal quality score for {task_data.card_id}: {e}"
                )

    except asyncio.TimeoutError:
        # Update as failed (timeout) — same race guard as completion path.
        supabase.table("research_tasks").update(
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": f"Research task timed out while {task_data.task_type} was running",
            }
        ).eq("id", task_id).eq("status", "processing").execute()

    except Exception as e:
        # Update as failed — same race guard as completion path.
        supabase.table("research_tasks").update(
            {
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "error_message": str(e),
            }
        ).eq("id", task_id).eq("status", "processing").execute()


# ============================================================================
# Routes
# ============================================================================


@router.post("/research", response_model=ResearchTask)
@limiter.limit("5/minute")
async def create_research_task(
    request: Request,
    task_data: ResearchTaskCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Create and execute a research task.

    Task types:
    - update: Quick refresh with 5-10 new sources
    - deep_research: Comprehensive research with 15-20 sources (limited to 2/day/card)
    - workstream_analysis: Research based on workstream keywords

    Returns immediately with task ID. Poll GET /research/{task_id} for status.
    """
    # Validate input
    if not task_data.card_id and not task_data.workstream_id:
        raise HTTPException(
            status_code=400, detail="Either card_id or workstream_id required"
        )

    if task_data.task_type not in ["update", "deep_research", "workstream_analysis"]:
        raise HTTPException(
            status_code=400,
            detail="Invalid task_type. Use: update, deep_research, workstream_analysis",
        )

    # deep_research is a card-global artifact: it lights the card-level
    # `has_deep_research` badge and is shared via the card arm of the
    # research_tasks RLS policy, both scoped to `workstream_id IS NULL`
    # (see migration 20260603000005 and card_artifacts._fetch_research). The
    # kanban deep-dive endpoint already persists these card-only even when
    # triggered from a workstream. Accepting a workstream_id here would create a
    # row the badge/shared-read policy intentionally exclude, leaving an
    # owner-only badge/tab mismatch. Workstream-scoped research uses
    # task_type=workstream_analysis instead.
    if task_data.task_type == "deep_research" and task_data.workstream_id:
        raise HTTPException(
            status_code=400,
            detail=(
                "deep_research is card-global and cannot be scoped to a "
                "workstream; omit workstream_id or use "
                "task_type=workstream_analysis"
            ),
        )

    if not _env_bool("FORESIGHT_ENABLE_AI_RESEARCH", True):
        raise HTTPException(
            status_code=403,
            detail="AI research is temporarily disabled",
        )

    if task_data.task_type == "deep_research" and not _env_bool(
        "FORESIGHT_ENABLE_DEEP_RESEARCH", True
    ):
        raise HTTPException(
            status_code=403,
            detail="Deep research is temporarily disabled",
        )

    # Rolling-window cost guardrail. No-op when disabled in admin settings.
    await check_budget_or_raise()

    estimated_cost = _estimated_task_cost(task_data.task_type)
    max_estimated_cost = _env_float("FORESIGHT_MAX_RESEARCH_TASK_ESTIMATED_COST_USD")
    if max_estimated_cost is not None and estimated_cost > max_estimated_cost:
        raise HTTPException(
            status_code=429,
            detail=(
                "Research task exceeds configured pilot cost cap "
                f"(${estimated_cost:.2f} > ${max_estimated_cost:.2f})"
            ),
        )

    # Pilot-safe authorization.  Research tasks spend external/LLM budget, so
    # org-workstream read visibility is not enough to queue work.
    if task_data.workstream_id:
        require_workstream_access(
            supabase, task_data.workstream_id, current_user, capability="edit"
        )
        if task_data.card_id:
            require_card_in_workstream(
                supabase, task_data.card_id, task_data.workstream_id
            )
    elif task_data.card_id:
        require_card_research_access(supabase, task_data.card_id, current_user)

    # Check rate limit for deep research
    if task_data.task_type == "deep_research" and task_data.card_id:
        service = ResearchService(supabase, openai_client)
        if not await service.check_rate_limit(task_data.card_id):
            raise HTTPException(
                status_code=429, detail="Daily deep research limit reached (2 per card)"
            )

    # Create task record
    task_record = {
        "user_id": current_user["id"],
        "task_type": task_data.task_type,
        "status": "queued",
        "result_summary": {
            "pilot_cost_estimate_usd": estimated_cost,
            "pilot_budget_checked_at": datetime.now(timezone.utc).isoformat(),
        },
    }

    if task_data.card_id:
        task_record["card_id"] = task_data.card_id
    if task_data.workstream_id:
        task_record["workstream_id"] = task_data.workstream_id

    task_result = supabase.table("research_tasks").insert(task_record).execute()

    if not task_result.data:
        raise HTTPException(status_code=500, detail="Failed to create research task")

    task = task_result.data[0]

    # Execute research in background (non-blocking)
    # Task execution is handled by the background worker (see `app.worker`).

    return ResearchTask(**task)


@router.get("/research/{task_id}", response_model=ResearchTask)
async def get_research_task(
    task_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get research task status.

    Use this endpoint to poll for task completion after creating a research task.
    Status values: queued, processing, completed, failed
    """
    result = (
        supabase.table("research_tasks")
        .select("*")
        .eq("id", task_id)
        .eq("user_id", current_user["id"])
        .single()
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Research task not found")

    task = result.data

    def _parse_dt(value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            dt = value
        else:
            try:
                dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)

    def _get_timeout_seconds(task_type: str, status: str) -> int:
        if status == "queued":
            try:
                return int(os.getenv("RESEARCH_TASK_QUEUED_TIMEOUT_SECONDS", "900"))
            except ValueError:
                return 900
        defaults = {
            "update": 15 * 60,
            "deep_research": 45 * 60,
            "workstream_analysis": 45 * 60,
        }
        env_keys = {
            "update": "RESEARCH_TASK_TIMEOUT_UPDATE_SECONDS",
            "deep_research": "RESEARCH_TASK_TIMEOUT_DEEP_RESEARCH_SECONDS",
            "workstream_analysis": "RESEARCH_TASK_TIMEOUT_WORKSTREAM_ANALYSIS_SECONDS",
        }
        env_key = env_keys.get(task_type)
        if env_key:
            try:
                return int(os.getenv(env_key, str(defaults.get(task_type, 45 * 60))))
            except ValueError:
                return defaults.get(task_type, 45 * 60)
        return defaults.get(task_type, 45 * 60)

    async def _maybe_fail_stale_task(task_row: Dict[str, Any]) -> Dict[str, Any]:
        status_val = task_row.get("status")
        if status_val not in ("queued", "processing"):
            return task_row

        summary = task_row.get("result_summary") or {}
        now = datetime.now(timezone.utc)

        # Liveness comes from job_events: the JobEventEmitter on the worker
        # side flushes every 5s during long inner loops and immediately on
        # stage boundaries. No event for EVENTS_STALE_SECONDS means the
        # asyncio task is gone (container restart, OOM, blocked supabase
        # write) and waiting for the overall 45-min timeout just leaves the
        # UI spinning.
        try:
            EVENTS_STALE_SECONDS = int(
                os.getenv("RESEARCH_TASK_EVENTS_STALE_SECONDS", "180")
            )
        except ValueError:
            logger.warning(
                "Invalid RESEARCH_TASK_EVENTS_STALE_SECONDS; using 180"
            )
            EVENTS_STALE_SECONDS = 180
        last_event_dt: Optional[datetime] = None
        last_event_stage: Optional[str] = None
        try:
            ev = await asyncio.to_thread(
                lambda: supabase.table("job_events")
                .select("created_at, stage, event_type")
                .eq("job_id", task_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if ev.data:
                last_event_dt = _parse_dt(ev.data[0].get("created_at"))
                last_event_stage = ev.data[0].get("stage")
        except Exception as e:
            logger.warning(
                f"job_events lookup failed for task {task_id}: {e}"
            )

        if (
            status_val == "processing"
            and last_event_dt is not None
            and (now - last_event_dt).total_seconds() > EVENTS_STALE_SECONDS
        ):
            stale_seconds = (now - last_event_dt).total_seconds()
            stale_minutes = int(stale_seconds // 60)

            error_message = (
                "Research task stopped making progress "
                f"(no events for ~{stale_minutes} minutes, last stage: "
                f"{last_event_stage or 'unknown'}). "
                "The worker process likely crashed or was restarted. "
                "Please retry."
            )

            new_summary = dict(summary) if isinstance(summary, dict) else {}
            new_summary.update(
                {
                    "events_stale": True,
                    "failed_at": now.isoformat(),
                    "events_age_seconds": int(stale_seconds),
                    "last_event_stage": last_event_stage,
                    "last_event_at": last_event_dt.isoformat(),
                }
            )

            updates = {
                "status": "failed",
                "completed_at": now.isoformat(),
                "error_message": error_message,
                "result_summary": new_summary,
            }

            try:
                # Race-guard the update on the status we *read* so a worker
                # that finished between SELECT and UPDATE doesn't get
                # clobbered back to failed.
                res = await asyncio.to_thread(
                    lambda: supabase.table("research_tasks")
                    .update(updates)
                    .eq("id", task_id)
                    .eq("user_id", current_user["id"])
                    .eq("status", status_val)
                    .execute()
                )
                if res.data:
                    task_row.update(updates)
                    await asyncio.to_thread(
                        record_event,
                        JOB_RESEARCH,
                        task_id,
                        EVENT_WATCHDOG_KILLED,
                        message=error_message,
                        payload={
                            "events_age_seconds": int(stale_seconds),
                            "last_event_stage": last_event_stage,
                        },
                    )
            except Exception as e:
                logger.warning(
                    f"Stale-events fail-update for task {task_id} errored: {e}"
                )
                return task_row
            return task_row

        # Backstop: catch tasks that never registered a job_event (queued
        # tasks, or processing tasks that died before emitting anything).
        # Uses the overall task-type timeout (45 min for deep research).
        base_dt = None
        if status_val == "processing":
            base_dt = (
                last_event_dt
                or _parse_dt(task_row.get("started_at"))
                or _parse_dt(task_row.get("created_at"))
            )
        else:
            base_dt = _parse_dt(task_row.get("created_at"))

        if not base_dt:
            return task_row

        timeout_seconds = _get_timeout_seconds(
            task_row.get("task_type", ""), status_val
        )
        age_seconds = (now - base_dt).total_seconds()

        if age_seconds <= timeout_seconds:
            return task_row

        age_minutes = int(age_seconds // 60)
        error_message = (
            f"Research task stalled (no progress for ~{age_minutes} minutes). "
            "This can happen if the server restarts mid-task. Please retry."
        )

        new_summary = dict(summary) if isinstance(summary, dict) else {}
        new_summary.update(
            {
                "timed_out": True,
                "timed_out_at": now.isoformat(),
                "timeout_seconds": timeout_seconds,
            }
        )

        updates = {
            "status": "failed",
            "completed_at": now.isoformat(),
            "error_message": error_message,
            "result_summary": new_summary,
        }

        try:
            # Same race guard as the events-stale branch above.
            res = await asyncio.to_thread(
                lambda: supabase.table("research_tasks")
                .update(updates)
                .eq("id", task_id)
                .eq("user_id", current_user["id"])
                .eq("status", status_val)
                .execute()
            )
            if res.data:
                task_row.update(updates)
                await asyncio.to_thread(
                    record_event,
                    JOB_RESEARCH,
                    task_id,
                    EVENT_WATCHDOG_KILLED,
                    message=error_message,
                    payload={
                        "age_seconds": int(age_seconds),
                        "timeout_seconds": timeout_seconds,
                    },
                )
        except Exception as e:
            logger.warning(
                f"Timeout fail-update for task {task_id} errored: {e}"
            )
            return task_row

        return task_row

    task = await _maybe_fail_stale_task(task)

    return ResearchTask(**task)


@router.get("/me/research-tasks", response_model=List[ResearchTask])
async def list_research_tasks(
    current_user: dict = Depends(get_current_user), limit: int = 10
):
    """
    List user's recent research tasks.

    Returns the most recent tasks, ordered by creation date descending.
    """
    result = (
        supabase.table("research_tasks")
        .select("*")
        .eq("user_id", current_user["id"])
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    return [ResearchTask(**t) for t in result.data]
