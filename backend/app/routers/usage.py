"""Admin usage telemetry endpoints for pilot cost benchmarking."""

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.authz import require_admin
from app.deps import get_current_user, supabase

router = APIRouter(prefix="/api/v1", tags=["usage"])


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
