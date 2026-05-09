"""Admin usage telemetry endpoints for pilot cost benchmarking."""

import asyncio
import csv
import io
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.authz import require_admin
from app.deps import get_current_user, limiter, supabase

router = APIRouter(prefix="/api/v1", tags=["usage"])

# Operations / request_kinds that the admin audit tab will surface.
# `record_llm_usage_event` writes ``operation = context.get("operation") or
# operation``, so a research path stores ``operation = "research.deep_research"``
# while ``request_kind`` stays ``"chat.completions"``. The audited filter must
# match either column to avoid silently dropping legitimate audited rows.
_AUDITED_OPERATIONS = ("openai.chat.completions", "openai.responses")
_AUDITED_REQUEST_KINDS = ("chat.completions", "responses")


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
    "conversation_id,redaction_flags"
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
            # Stable secondary key — avoids duplicate/missed rows across pages
            # when multiple events share the same created_at timestamp.
            .order("id", desc=True)
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
            ops = ",".join(_AUDITED_OPERATIONS)
            kinds = ",".join(_AUDITED_REQUEST_KINDS)
            query = query.or_(f"operation.in.({ops}),request_kind.in.({kinds})")
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


# ---------------------------------------------------------------------------
# Replay — interleave a chat conversation's stored messages with every LLM
# call recorded under the same conversation_id. Powers the admin "Replay"
# view in the LLM-activity tab and the FOIA-style timeline export.
# ---------------------------------------------------------------------------


@router.get("/admin/usage/conversations/{conversation_id}/replay")
@limiter.limit("60/minute")
async def replay_conversation(
    request: Request,
    conversation_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return an ordered timeline for ``conversation_id``.

    Joins ``chat_messages`` (the user/assistant turns the operator typed and
    received) with ``llm_usage_events`` (every LLM call recorded under that
    conversation, including RAG query expansion, reranking, and suggestions).
    Items are sorted by ``created_at`` ASC; ties break by kind so messages
    sort before the LLM events that produced them. Returns 404 if no
    conversation row exists with that id.
    """
    require_admin(current_user)

    def _fetch():
        conv_resp = (
            supabase.table("chat_conversations")
            .select("id,user_id,scope,scope_id,title,created_at,updated_at")
            .eq("id", conversation_id)
            .limit(1)
            .execute()
        )
        conv = (conv_resp.data or [None])[0]
        if conv is None:
            return None, [], []
        messages = (
            supabase.table("chat_messages")
            .select("id,role,content,citations,tokens_used,model,created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )
        events = (
            supabase.table("llm_usage_events")
            .select("*")
            .eq("conversation_id", conversation_id)
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )
        return conv, messages, events

    conv, messages, events = await asyncio.to_thread(_fetch)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    timeline: list[dict[str, Any]] = []
    for msg in messages:
        timeline.append(
            {
                "kind": "message",
                "created_at": msg.get("created_at"),
                "data": msg,
            }
        )
    for evt in events:
        timeline.append(
            {
                "kind": "llm_event",
                "created_at": evt.get("created_at"),
                "data": evt,
            }
        )
    # Stable sort by (created_at, kind) — message before llm_event on ties so
    # the user message reads before the calls it triggered.
    timeline.sort(
        key=lambda item: (item["created_at"] or "", 0 if item["kind"] == "message" else 1)
    )
    return {
        "conversation": conv,
        "timeline": timeline,
        "message_count": len(messages),
        "llm_event_count": len(events),
    }


# ---------------------------------------------------------------------------
# Export — bulk CSV / JSON download of LLM events matching a filter snapshot.
# Streams the rows directly so we never materialise the whole result in
# memory; capped at 10k rows per export to keep run-time bounded.
# ---------------------------------------------------------------------------


_EXPORT_HARD_CAP = 10_000


class _ExportFilters(BaseModel):
    operation: Optional[str] = None
    request_kind: Optional[str] = None
    user_id: Optional[str] = None
    model: Optional[str] = None
    status: Optional[str] = None
    from_ts: Optional[str] = Field(default=None, alias="from")
    to_ts: Optional[str] = Field(default=None, alias="to")
    min_cost: Optional[float] = Field(default=None, ge=0)
    audited_only: bool = False
    conversation_id: Optional[str] = None
    format: str = Field(default="csv", pattern="^(csv|json)$")
    limit: int = Field(default=_EXPORT_HARD_CAP, ge=1, le=_EXPORT_HARD_CAP)

    model_config = ConfigDict(populate_by_name=True)


_EXPORT_COLUMNS = (
    "id",
    "created_at",
    "user_id",
    "conversation_id",
    "provider",
    "model",
    "operation",
    "request_kind",
    "status",
    "error_type",
    "input_tokens",
    "output_tokens",
    "cached_input_tokens",
    "total_tokens",
    "estimated_cost_usd",
    "latency_ms",
    "run_id",
    "task_id",
    "card_id",
    "workstream_id",
    "redaction_flags",
    "prompt_excerpt",
    "response_excerpt",
)


@router.post("/admin/usage/export")
@limiter.limit("12/minute")
async def export_usage_events(
    request: Request,
    filters: _ExportFilters,
    current_user: dict = Depends(get_current_user),
):
    """Stream a CSV or NDJSON export of LLM usage events.

    Reuses the same filter shape as ``/admin/usage/events`` plus an optional
    ``conversation_id`` and ``format`` knob. Includes the redacted
    ``prompt_excerpt`` / ``response_excerpt`` columns so the file is
    self-contained for FOIA fulfilment. Capped at ``_EXPORT_HARD_CAP`` rows.
    """
    require_admin(current_user)
    from_ts = _validate_iso8601(filters.from_ts, "from")
    to_ts = _validate_iso8601(filters.to_ts, "to")

    def _fetch_all() -> list[dict[str, Any]]:
        # PostgREST hard-caps a single query at 1k rows by default, so paginate
        # until we hit the requested limit or exhaust the result set.
        chunk = 1000
        collected: list[dict[str, Any]] = []
        offset = 0
        while len(collected) < filters.limit:
            remaining = filters.limit - len(collected)
            page_size = min(chunk, remaining)
            query = (
                supabase.table("llm_usage_events")
                .select(",".join(_EXPORT_COLUMNS))
                .order("created_at", desc=True)
                .order("id", desc=True)
                .range(offset, offset + page_size - 1)
            )
            if filters.operation:
                query = query.eq("operation", filters.operation)
            if filters.request_kind:
                query = query.eq("request_kind", filters.request_kind)
            if filters.user_id:
                query = query.eq("user_id", filters.user_id)
            if filters.model:
                query = query.eq("model", filters.model)
            if filters.status:
                query = query.eq("status", filters.status)
            if filters.conversation_id:
                query = query.eq("conversation_id", filters.conversation_id)
            if from_ts:
                query = query.gte("created_at", from_ts)
            if to_ts:
                query = query.lt("created_at", to_ts)
            if filters.min_cost is not None:
                query = query.gte("estimated_cost_usd", filters.min_cost)
            if filters.audited_only:
                ops = ",".join(_AUDITED_OPERATIONS)
                kinds = ",".join(_AUDITED_REQUEST_KINDS)
                query = query.or_(
                    f"operation.in.({ops}),request_kind.in.({kinds})"
                )
            page = query.execute().data or []
            collected.extend(page)
            if len(page) < page_size:
                break
            offset += page_size
        return collected

    rows = await asyncio.to_thread(_fetch_all)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    if filters.format == "json":
        import json as _json

        def _stream_ndjson():
            for row in rows:
                yield _json.dumps(row, default=str) + "\n"

        return StreamingResponse(
            _stream_ndjson(),
            media_type="application/x-ndjson",
            headers={
                "Content-Disposition": (
                    f'attachment; filename="llm-audit-{stamp}.ndjson"'
                )
            },
        )

    def _stream_csv():
        buffer = io.StringIO()
        writer = csv.DictWriter(
            buffer,
            fieldnames=_EXPORT_COLUMNS,
            extrasaction="ignore",
        )
        writer.writeheader()
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        for row in rows:
            flat = {col: row.get(col) for col in _EXPORT_COLUMNS}
            # CSV cells can't hold lists/dicts cleanly — stringify them.
            for key, value in list(flat.items()):
                if isinstance(value, (list, dict)):
                    flat[key] = str(value)
            writer.writerow(flat)
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    return StreamingResponse(
        _stream_csv(),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="llm-audit-{stamp}.csv"'
            )
        },
    )
