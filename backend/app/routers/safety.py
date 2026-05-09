"""Admin safety endpoints: prompt-injection + abuse incident triage.

Mirrors the shape of ``routers/usage.py``: list with filters, single-row
fetch, and a PATCH for admin disposition. The data lives in the
``safety_incidents`` table populated by ``app.safety.injection`` and
``app.safety.abuse``.

Service-role reads only — RLS forbids ``authenticated`` from touching
this table directly. The Supabase client we use is the service-role
singleton from ``app.deps``.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from app.authz import require_admin
from app.deps import get_current_user, limiter, supabase
from app.safety.abuse import detect_user_abuse, record_abuse_findings

router = APIRouter(prefix="/api/v1", tags=["safety"])


_DISPOSITIONS = ("true_positive", "false_positive", "needs_review")
_KINDS = ("injection", "abuse")
_SEVERITIES = ("low", "medium", "high")


def _validate_iso8601(value: Optional[str], field_name: str) -> Optional[str]:
    """Validate the value is an ISO8601 timestamp with explicit timezone.

    Naive timestamps (no offset, no ``Z``) are rejected — the database stores
    UTC and we don't want to silently treat the caller's wall clock as UTC.
    The returned value is normalized to UTC ISO8601.
    """
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail=f"Invalid ISO8601 timestamp for {field_name}"
        ) from exc
    if parsed.tzinfo is None:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Timestamp for {field_name} must include a timezone offset "
                "(e.g. '2026-05-09T00:00:00Z' or '+00:00')"
            ),
        )
    return parsed.astimezone(timezone.utc).isoformat()


@router.get("/admin/safety/incidents")
@limiter.limit("60/minute")
async def list_safety_incidents(
    request: Request,
    kind: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    pattern_id: Optional[str] = Query(None),
    disposition: Optional[str] = Query(
        None,
        description=(
            "Filter by disposition. Pass 'open' to fetch incidents whose "
            "disposition is still NULL (the default admin queue)."
        ),
    ),
    from_ts: Optional[str] = Query(None, alias="from"),
    to_ts: Optional[str] = Query(None, alias="to"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Paginated list of safety incidents with admin filters."""
    require_admin(current_user)

    if kind and kind not in _KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {_KINDS}")
    if severity and severity not in _SEVERITIES:
        raise HTTPException(
            status_code=400, detail=f"severity must be one of {_SEVERITIES}"
        )
    if disposition and disposition not in _DISPOSITIONS + ("open",):
        raise HTTPException(
            status_code=400,
            detail=f"disposition must be one of {_DISPOSITIONS + ('open',)}",
        )

    from_ts = _validate_iso8601(from_ts, "from")
    to_ts = _validate_iso8601(to_ts, "to")

    def _fetch():
        query = (
            supabase.table("safety_incidents")
            .select("*")
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit)
        )
        if kind:
            query = query.eq("kind", kind)
        if severity:
            query = query.eq("severity", severity)
        if source:
            query = query.eq("source", source)
        if user_id:
            query = query.eq("user_id", user_id)
        if pattern_id:
            query = query.eq("pattern_id", pattern_id)
        if disposition == "open":
            query = query.is_("disposition", "null")
        elif disposition:
            query = query.eq("disposition", disposition)
        if from_ts:
            query = query.gte("created_at", from_ts)
        if to_ts:
            query = query.lt("created_at", to_ts)
        return query.execute().data or []

    def _open_counts():
        # Cheap aggregate for the admin badge: number of unreviewed
        # incidents per severity. We do three eq queries with limit=0+count
        # via head=true to avoid pulling rows.
        out = {"high": 0, "medium": 0, "low": 0}
        for sev in out:
            try:
                resp = (
                    supabase.table("safety_incidents")
                    .select("id", count="exact", head=True)
                    .is_("disposition", "null")
                    .eq("severity", sev)
                    .execute()
                )
                out[sev] = int(getattr(resp, "count", 0) or 0)
            except Exception:
                out[sev] = 0
        return out

    rows, counts = await asyncio.gather(
        asyncio.to_thread(_fetch),
        asyncio.to_thread(_open_counts),
    )

    has_more = len(rows) > limit
    items = rows[:limit]
    return {
        "items": items,
        "limit": limit,
        "offset": offset,
        "next_offset": offset + limit if has_more else None,
        "open_counts": counts,
    }


@router.get("/admin/safety/incidents/{incident_id}")
@limiter.limit("120/minute")
async def get_safety_incident(
    request: Request,
    incident_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    require_admin(current_user)

    def _fetch():
        resp = (
            supabase.table("safety_incidents")
            .select("*")
            .eq("id", incident_id)
            .limit(1)
            .execute()
        )
        return (resp.data or [None])[0]

    row = await asyncio.to_thread(_fetch)
    if not row:
        raise HTTPException(status_code=404, detail="Incident not found")
    return row


class SafetyDispositionUpdate(BaseModel):
    disposition: str = Field(..., description="One of true_positive / false_positive / needs_review")
    note: Optional[str] = Field(
        None, max_length=2000, description="Optional admin note stored in metadata.review_note"
    )


@router.patch("/admin/safety/incidents/{incident_id}")
@limiter.limit("60/minute")
async def update_safety_incident(
    request: Request,
    incident_id: str,
    payload: SafetyDispositionUpdate,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Set the admin disposition on a single incident."""
    require_admin(current_user)

    if payload.disposition not in _DISPOSITIONS:
        raise HTTPException(
            status_code=400,
            detail=f"disposition must be one of {_DISPOSITIONS}",
        )

    def _update():
        existing = (
            supabase.table("safety_incidents")
            .select("metadata")
            .eq("id", incident_id)
            .limit(1)
            .execute()
        )
        row = (existing.data or [None])[0]
        if not row:
            return None
        metadata = row.get("metadata") or {}
        if not isinstance(metadata, dict):
            metadata = {}
        if payload.note:
            metadata["review_note"] = payload.note
        update = {
            "disposition": payload.disposition,
            "reviewed_by": current_user.get("id"),
            "reviewed_at": datetime.now(timezone.utc).isoformat(),
            "metadata": metadata,
        }
        resp = (
            supabase.table("safety_incidents")
            .update(update)
            .eq("id", incident_id)
            .execute()
        )
        return (resp.data or [None])[0]

    updated = await asyncio.to_thread(_update)
    if not updated:
        raise HTTPException(status_code=404, detail="Incident not found")
    return updated


@router.post("/admin/safety/abuse-scan")
@limiter.limit("6/minute")
async def run_abuse_scan(
    request: Request,
    window_min: int = Query(60, ge=5, le=1440),
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Run the usage-anomaly aggregation on demand and persist findings.

    The same job runs on a schedule; this endpoint is for the admin
    "Run now" button on the Safety tab.
    """
    require_admin(current_user)

    def _run():
        findings = detect_user_abuse(supabase, window_min=window_min)
        inserted = record_abuse_findings(supabase, findings)
        return findings, inserted

    findings, inserted = await asyncio.to_thread(_run)
    return {
        "window_min": window_min,
        "findings": [
            {
                "user_id": f.user_id,
                "kind": f.kind,
                "severity": f.severity,
                "description": f.description,
                "metrics": f.metrics,
            }
            for f in findings
        ],
        "inserted": inserted,
    }
