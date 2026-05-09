"""Admin usage telemetry endpoints for pilot cost benchmarking."""

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.authz import require_admin
from app.deps import get_current_user, limiter, supabase

router = APIRouter(prefix="/api/v1", tags=["usage"])

# Operations / request_kinds that the admin audit tab will surface. Mirrors
# the audited request_kinds in usage_telemetry, but accepts both forms (raw
# request_kind and the prefixed operation string) since older rows persisted
# only one or the other.
_AUDITED_OPERATION_PREFIXES = ("openai.chat.completions", "openai.responses")


def _since(days: int) -> str:
    safe_days = max(1, min(days, 90))
    return (datetime.now(timezone.utc) - timedelta(days=safe_days)).isoformat()


def _sum_int(rows: list[dict], key: str) -> int:
    return sum(int(row.get(key) or 0) for row in rows)


def _sum_float(rows: list[dict], key: str) -> float:
    return round(sum(float(row.get(key) or 0) for row in rows), 6)


@router.get("/admin/usage/summary")
async def get_usage_summary(
    days: int = Query(1, ge=1, le=90),
    task_id: Optional[str] = None,
    workstream_id: Optional[str] = None,
    card_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return an admin-only cost waterfall for LLM and external API usage."""
    require_admin(current_user)
    since = _since(days)

    def _fetch():
        def _apply_filters(query):
            if task_id:
                query = query.eq("task_id", task_id)
            if workstream_id:
                query = query.eq("workstream_id", workstream_id)
            if card_id:
                query = query.eq("card_id", card_id)
            return query

        llm_query = _apply_filters(
            supabase.table("llm_usage_events")
            .select("*")
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(5000)
        )
        external_query = _apply_filters(
            supabase.table("external_api_usage_events")
            .select("*")
            .gte("created_at", since)
            .order("created_at", desc=True)
            .limit(5000)
        )

        return llm_query.execute().data or [], external_query.execute().data or []

    llm_rows, external_rows = await asyncio.to_thread(_fetch)

    by_operation: dict[str, dict] = defaultdict(
        lambda: {
            "calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cached_input_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
        }
    )
    by_model: dict[str, dict] = defaultdict(
        lambda: {
            "calls": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
        }
    )

    for row in llm_rows:
        op = row.get("operation") or "unknown"
        model = row.get("model") or "unknown"
        by_operation[op]["calls"] += 1
        by_model[model]["calls"] += 1
        for key in (
            "input_tokens",
            "output_tokens",
            "cached_input_tokens",
            "total_tokens",
        ):
            by_operation[op][key] += int(row.get(key) or 0)
            if key != "cached_input_tokens":
                by_model[model][key] += int(row.get(key) or 0)
        cost = float(row.get("estimated_cost_usd") or 0)
        by_operation[op]["estimated_cost_usd"] += cost
        by_model[model]["estimated_cost_usd"] += cost

    external_by_provider: dict[str, dict] = defaultdict(
        lambda: {"calls": 0, "units": 0, "estimated_cost_usd": 0.0}
    )
    for row in external_rows:
        provider = row.get("provider") or "unknown"
        external_by_provider[provider]["calls"] += 1
        external_by_provider[provider]["units"] += int(row.get("units") or 0)
        external_by_provider[provider]["estimated_cost_usd"] += float(
            row.get("estimated_cost_usd") or 0
        )

    for buckets in (by_operation, by_model, external_by_provider):
        for values in buckets.values():
            values["estimated_cost_usd"] = round(values["estimated_cost_usd"], 6)

    return {
        "window_days": days,
        "filters": {
            "task_id": task_id,
            "workstream_id": workstream_id,
            "card_id": card_id,
        },
        "llm_totals": {
            "calls": len(llm_rows),
            "input_tokens": _sum_int(llm_rows, "input_tokens"),
            "output_tokens": _sum_int(llm_rows, "output_tokens"),
            "cached_input_tokens": _sum_int(llm_rows, "cached_input_tokens"),
            "total_tokens": _sum_int(llm_rows, "total_tokens"),
            "estimated_cost_usd": _sum_float(llm_rows, "estimated_cost_usd"),
        },
        "llm_by_operation": dict(by_operation),
        "llm_by_model": dict(by_model),
        "external_api_totals": {
            "calls": len(external_rows),
            "units": _sum_int(external_rows, "units"),
            "estimated_cost_usd": _sum_float(external_rows, "estimated_cost_usd"),
        },
        "external_api_by_provider": dict(external_by_provider),
    }


@router.get("/admin/usage/recent")
async def get_recent_usage_events(
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    """Return recent LLM usage events for admin debugging."""
    require_admin(current_user)

    def _fetch():
        return (
            supabase.table("llm_usage_events")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )

    return await asyncio.to_thread(_fetch)


# ---------------------------------------------------------------------------
# Admin LLM audit endpoints (PR 2 of the LLM audit trail plan).
#
# These are the read APIs the upcoming admin "LLM activity" tab consumes.
# The list endpoint excludes large payload columns (prompt_excerpt /
# response_excerpt / tool_calls / metadata) to keep responses lightweight;
# the detail endpoint returns the full row.
# ---------------------------------------------------------------------------


_LIST_COLUMNS = (
    "id,created_at,user_id,provider,model,operation,request_kind,status,"
    "error_type,input_tokens,output_tokens,cached_input_tokens,total_tokens,"
    "estimated_cost_usd,latency_ms,run_id,task_id,card_id,workstream_id,"
    "redaction_flags"
)


def _validate_iso8601(value: str | None, field: str) -> str | None:
    if not value:
        return None
    try:
        # ``fromisoformat`` accepts the trailing ``Z`` only in 3.11+; we run
        # 3.12, so trust it to validate. The result is discarded — we pass
        # the original string to PostgREST.
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ISO 8601 timestamp for {field!r}",
        ) from exc
    return value


@router.get("/admin/usage/events")
@limiter.limit("60/minute")
async def list_usage_events(
    request: Request,
    operation: Optional[str] = Query(
        None,
        description="Filter by exact operation (e.g. 'openai.chat.completions').",
    ),
    request_kind: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    model: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(
        None,
        alias="status",
        description="Filter by event status (success / error / stream_started).",
    ),
    from_ts: Optional[str] = Query(
        None,
        alias="from",
        description="ISO 8601 lower bound on created_at (inclusive).",
    ),
    to_ts: Optional[str] = Query(
        None,
        alias="to",
        description="ISO 8601 upper bound on created_at (exclusive).",
    ),
    min_cost: Optional[float] = Query(
        None,
        ge=0,
        description="Minimum estimated_cost_usd to include.",
    ),
    audited_only: bool = Query(
        False,
        description="When true, restrict to operations whose payloads are captured (chat / responses).",
    ),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Paginated list of LLM usage events with filters.

    Returns ``{"items": [...], "limit": int, "offset": int, "next_offset": int|None}``.
    Excerpt columns are intentionally omitted — fetch the detail endpoint for
    a single event when surface needs the redacted prompt/response.
    """
    require_admin(current_user)

    from_ts = _validate_iso8601(from_ts, "from")
    to_ts = _validate_iso8601(to_ts, "to")

    def _fetch():
        query = (
            supabase.table("llm_usage_events")
            .select(_LIST_COLUMNS)
            .order("created_at", desc=True)
            # Fetch one extra row so we can flag whether more pages exist
            # without a separate count query.
            .range(offset, offset + limit)
        )
        if operation:
            query = query.eq("operation", operation)
        if request_kind:
            query = query.eq("request_kind", request_kind)
        if user_id:
            query = query.eq("user_id", user_id)
        if model:
            query = query.eq("model", model)
        if status_filter:
            query = query.eq("status", status_filter)
        if from_ts:
            query = query.gte("created_at", from_ts)
        if to_ts:
            query = query.lt("created_at", to_ts)
        if min_cost is not None:
            query = query.gte("estimated_cost_usd", min_cost)
        if audited_only:
            query = query.in_("operation", list(_AUDITED_OPERATION_PREFIXES))
        return query.execute().data or []

    rows = await asyncio.to_thread(_fetch)
    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": items,
        "limit": limit,
        "offset": offset,
        "next_offset": offset + limit if has_more else None,
    }


@router.get("/admin/usage/events/{event_id}")
@limiter.limit("120/minute")
async def get_usage_event(
    request: Request,
    event_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return a single usage event with redacted prompt/response excerpts."""
    require_admin(current_user)

    def _fetch():
        resp = (
            supabase.table("llm_usage_events")
            .select("*")
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        return (resp.data or [None])[0]

    row = await asyncio.to_thread(_fetch)
    if row is None:
        raise HTTPException(status_code=404, detail="Usage event not found")
    return row
