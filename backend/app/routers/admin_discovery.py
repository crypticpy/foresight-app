"""Admin endpoints for managing the discovery source catalog.

Adds CRUD over ``discovery_sources_registry`` plus per-source health
aggregations sourced live from ``discovered_sources``. The pipeline reads
this table to decide which RSS feeds to scan; other categories are
display-only in v1 (PR A2 will wire news/academic/etc. fetchers to read
from here too).

The mutating endpoints reuse ``_log_admin_action`` from
``app.routers.admin`` so every change shows up in the existing audit log.
"""

from __future__ import annotations

import asyncio
import copy
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl

from app.authz import require_admin
from app.deps import get_current_user, supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["admin-discovery"])

ALLOWED_CATEGORIES = (
    "rss",
    "news",
    "academic",
    "government",
    "tech_blog",
    "web_search",
)

CategoryLiteral = Literal[
    "rss", "news", "academic", "government", "tech_blog", "web_search"
]

# How long to wait when validating a candidate RSS URL. Short enough to
# keep the admin's "Add source" click responsive, long enough to clear
# slow but legitimate feeds.
RSS_VALIDATION_TIMEOUT_S = 8.0


class AdminSourceCreate(BaseModel):
    """Body for ``POST /admin/sources``.

    URL is required for every category except ``web_search`` (which stores
    its query template in ``config.query``). The route validator enforces
    that contract.
    """

    category: CategoryLiteral
    name: str = Field(min_length=1, max_length=200)
    url: Optional[HttpUrl] = None
    config: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    weight: float = Field(default=1.0, ge=0.0, le=10.0)
    notes: Optional[str] = Field(default=None, max_length=500)


class AdminSourceUpdate(BaseModel):
    """Body for ``PATCH /admin/sources/{id}``.

    All fields optional; only present fields are written. ``url`` and
    ``category`` are intentionally not patchable — changing them is a
    delete + re-create so the (category, url) UNIQUE index stays clean and
    the audit history stays tied to a stable target_id.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    enabled: Optional[bool] = None
    weight: Optional[float] = Field(default=None, ge=0.0, le=10.0)
    notes: Optional[str] = Field(default=None, max_length=500)
    config: Optional[dict[str, Any]] = None


def _aggregate_health_stats(
    discovered_rows: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Bucket discovered_sources rows into per-source-domain health stats.

    Buckets by exact URL when available, else by host. Returns a map keyed
    by URL (or host) to {items, accept_rate, last_seen} so the route can
    join it onto the registry.
    """
    by_key: dict[str, dict[str, Any]] = {}
    for row in discovered_rows:
        url = row.get("url") or ""
        if not url:
            continue
        # Exact-URL bucket primarily; hosts are the fallback for news/web
        # search-style fetchers that rotate through query results.
        try:
            host = urlparse(url).netloc.lower()
        except ValueError:
            host = ""
        key = url
        bucket = by_key.setdefault(
            key,
            {
                "host": host,
                "items": 0,
                "passed": 0,
                "last_seen": None,
            },
        )
        bucket["items"] += 1
        if row.get("triage_passed"):
            bucket["passed"] += 1
        seen_at = row.get("created_at")
        if seen_at and (not bucket["last_seen"] or seen_at > bucket["last_seen"]):
            bucket["last_seen"] = seen_at
    return by_key


def _attach_health(
    sources: list[dict[str, Any]], discovered_rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Decorate registry rows with last-7d health metrics from discovered_sources.

    For RSS / fixed-URL sources the join is on full URL. For categories
    where the registry URL is a domain pattern (news, web_search) we fall
    back to a host match so a registry row like ``cnn.com`` still picks up
    discovered_sources entries under that domain.
    """
    by_url = _aggregate_health_stats(discovered_rows)

    # Pre-bucket by host for domain-pattern matching.
    host_buckets: dict[str, dict[str, Any]] = {}
    for bucket in by_url.values():
        host = bucket["host"]
        if not host:
            continue
        agg = host_buckets.setdefault(
            host, {"items": 0, "passed": 0, "last_seen": None}
        )
        agg["items"] += bucket["items"]
        agg["passed"] += bucket["passed"]
        seen_at = bucket["last_seen"]
        if seen_at and (not agg["last_seen"] or seen_at > agg["last_seen"]):
            agg["last_seen"] = seen_at

    decorated: list[dict[str, Any]] = []
    for source in sources:
        url = (source.get("url") or "").strip()
        items = passed = 0
        last_seen = None
        if url and url in by_url:
            bucket = by_url[url]
            items, passed, last_seen = (
                bucket["items"],
                bucket["passed"],
                bucket["last_seen"],
            )
        elif url:
            try:
                host = urlparse(url).netloc.lower()
            except ValueError:
                host = ""
            if host and host in host_buckets:
                bucket = host_buckets[host]
                items, passed, last_seen = (
                    bucket["items"],
                    bucket["passed"],
                    bucket["last_seen"],
                )
        accept_rate = round(passed / items, 4) if items else None
        decorated.append(
            {
                **source,
                "items_7d": items,
                "passed_7d": passed,
                "accept_rate_7d": accept_rate,
                "last_discovered_at": last_seen,
            }
        )
    return decorated


@router.get("/admin/sources")
async def list_admin_sources(
    category: Optional[CategoryLiteral] = None,
    enabled_only: bool = False,
    current_user: dict = Depends(get_current_user),
):
    """List registered discovery sources with last-7d health stats.

    Health is computed live from ``discovered_sources`` (last 7 days)
    rather than stored on the registry row, so the numbers stay accurate
    without a recurring aggregation job.
    """
    require_admin(current_user)

    def load() -> dict[str, Any]:
        registry_query = supabase.table("discovery_sources_registry").select("*")
        if category:
            registry_query = registry_query.eq("category", category)
        if enabled_only:
            registry_query = registry_query.eq("enabled", True)
        sources = (
            registry_query.order("category", desc=False)
            .order("name", desc=False)
            .execute()
            .data
            or []
        )
        seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        discovered = (
            supabase.table("discovered_sources")
            .select("url,triage_passed,created_at")
            .gte("created_at", seven_days_ago)
            .limit(5000)
            .execute()
            .data
            or []
        )
        return {
            "items": _attach_health(sources, discovered),
            "total": len(sources),
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to list admin sources")
        raise HTTPException(status_code=500, detail=str(e))


async def _validate_rss_url(url: str) -> None:
    """Confirm a URL responds with 2xx/3xx before adding it as an RSS feed.

    Reaches out for HEAD first; falls back to GET because some feeds (e.g.
    Substack) reject HEAD with 405. Failure raises ``HTTPException(400)``
    with a human-readable reason. We do NOT verify XML payload here —
    feedparser inside the discovery pipeline handles that, and a feed that
    serves valid XML but a 200 HTML fallback would still pass triage.
    """
    try:
        async with httpx.AsyncClient(
            timeout=RSS_VALIDATION_TIMEOUT_S, follow_redirects=True
        ) as client:
            try:
                response = await client.head(url)
                if response.status_code == 405:
                    response = await client.get(url)
            except httpx.UnsupportedProtocol as exc:
                raise HTTPException(
                    status_code=400, detail=f"Unsupported URL scheme: {exc}"
                )
        if response.status_code >= 400:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Source URL returned HTTP {response.status_code}. "
                    "Confirm the feed is publicly reachable."
                ),
            )
    except HTTPException:
        raise
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400, detail=f"Could not reach source URL: {exc}"
        )


@router.post("/admin/sources", status_code=status.HTTP_201_CREATED)
async def create_admin_source(
    request: Request,
    body: AdminSourceCreate,
    current_user: dict = Depends(get_current_user),
):
    """Add a new discovery source.

    URL is required for every category except ``web_search``. RSS URLs are
    validated with a HEAD/GET probe so we don't admit a 404 into the
    catalog and silently waste budget on the next run.
    """
    require_admin(current_user)
    if body.category != "web_search" and body.url is None:
        raise HTTPException(
            status_code=400, detail="url is required for this category"
        )
    if body.category == "rss" and body.url is not None:
        await _validate_rss_url(str(body.url))

    payload: dict[str, Any] = {
        "category": body.category,
        "name": body.name,
        "url": str(body.url) if body.url is not None else None,
        "config": body.config,
        "enabled": body.enabled,
        "weight": body.weight,
        "notes": body.notes,
        "created_by": current_user.get("id"),
    }

    def insert() -> dict[str, Any]:
        result = (
            supabase.table("discovery_sources_registry").insert(payload).execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(status_code=500, detail="Insert returned no row")
        return rows[0]

    try:
        row = await asyncio.to_thread(insert)
    except HTTPException:
        raise
    except Exception as e:
        # Most likely a (category, url) UNIQUE collision — surface that
        # specifically so the UI can ask the user to update or delete the
        # existing row instead.
        message = str(e)
        if "duplicate key" in message.lower() or "unique" in message.lower():
            raise HTTPException(
                status_code=409,
                detail="A source with this category and URL already exists",
            )
        logger.exception("Failed to create admin source")
        raise HTTPException(status_code=500, detail=message)

    # Audit-log the create. Done after the insert so we never write an
    # audit row for a failed mutation.
    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.source.create",
        target_type="source",
        target_id=row["id"],
        before=None,
        after=row,
        request=request,
    )
    return row


@router.patch("/admin/sources/{source_id}")
async def update_admin_source(
    request: Request,
    source_id: str,
    body: AdminSourceUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an existing discovery source.

    Only the fields explicitly present in the body are written. Returns
    the updated row.
    """
    require_admin(current_user)
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    def fetch_and_update() -> tuple[dict[str, Any], dict[str, Any]]:
        before_resp = (
            supabase.table("discovery_sources_registry")
            .select("*")
            .eq("id", source_id)
            .limit(1)
            .execute()
        )
        before_rows = before_resp.data or []
        if not before_rows:
            raise HTTPException(status_code=404, detail="Source not found")
        # Deep copy so the audit `before` snapshot stays stable even if the
        # supabase client (or our mock in tests) returns rows that share
        # storage with the table's in-memory state.
        before_row = copy.deepcopy(before_rows[0])
        result = (
            supabase.table("discovery_sources_registry")
            .update(patch)
            .eq("id", source_id)
            .execute()
        )
        after_rows = result.data or []
        if not after_rows:
            raise HTTPException(
                status_code=500, detail="Update returned no row"
            )
        return before_row, after_rows[0]

    try:
        before_row, after_row = await asyncio.to_thread(fetch_and_update)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update admin source")
        raise HTTPException(status_code=500, detail=str(e))

    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.source.update",
        target_type="source",
        target_id=source_id,
        before=before_row,
        after=after_row,
        request=request,
    )
    return after_row


@router.delete("/admin/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_source(
    request: Request,
    source_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a discovery source.

    Hard-delete is fine because last_success/failure tracking lives in
    discovered_sources / discovery_runs and stays attached to URL strings
    independent of the registry row.
    """
    require_admin(current_user)

    def fetch_and_delete() -> dict[str, Any]:
        before_resp = (
            supabase.table("discovery_sources_registry")
            .select("*")
            .eq("id", source_id)
            .limit(1)
            .execute()
        )
        rows = before_resp.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Source not found")
        before_row = copy.deepcopy(rows[0])
        supabase.table("discovery_sources_registry").delete().eq(
            "id", source_id
        ).execute()
        return before_row

    try:
        before_row = await asyncio.to_thread(fetch_and_delete)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete admin source")
        raise HTTPException(status_code=500, detail=str(e))

    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.source.delete",
        target_type="source",
        target_id=source_id,
        before=before_row,
        after=None,
        request=request,
    )
    return None


@router.get("/admin/sources/categories")
async def list_source_categories(
    current_user: dict = Depends(get_current_user),
):
    """Static metadata about discovery source categories.

    Lets the frontend render category labels and the "v1 fetcher reads
    from registry" badge without duplicating the list.
    """
    require_admin(current_user)
    return {
        "items": [
            {
                "key": "rss",
                "label": "RSS / Atom feeds",
                "live": True,
                "description": "Curated RSS feeds. Pipeline reads enabled rows from the registry.",
            },
            {
                "key": "news",
                "label": "News outlets",
                "live": False,
                "description": "Major news fetchers. Display-only in v1; PR A2 wires the fetcher.",
            },
            {
                "key": "academic",
                "label": "Academic / arXiv",
                "live": False,
                "description": "Academic search queries. Display-only in v1.",
            },
            {
                "key": "government",
                "label": "Government (.gov)",
                "live": False,
                "description": "Government source queries. Display-only in v1.",
            },
            {
                "key": "tech_blog",
                "label": "Tech blogs",
                "live": False,
                "description": "Tech blog fetchers. Display-only in v1.",
            },
            {
                "key": "web_search",
                "label": "Web search templates",
                "live": False,
                "description": "Stored query templates for SearXNG / Serper.",
            },
        ]
    }


# ---------------------------------------------------------------------------
# Coverage dashboards
# ---------------------------------------------------------------------------

# Single source-of-truth for the six Austin strategic pillars used in the
# pillar-balance widget. Mirrors the database `pillars` table (and the
# existing analytics router definitions) — duplicated here so that we don't
# import a router-private constant.
PILLAR_DEFINITIONS: dict[str, str] = {
    "CH": "Community Health & Sustainability",
    "EW": "Economic & Workforce Development",
    "HG": "High-Performing Government",
    "HH": "Homelessness & Housing",
    "MC": "Mobility & Critical Infrastructure",
    "PS": "Public Safety",
}

# Allowed window sizes (days) for the pillar-balance histogram. We keep the
# set small so the cache key is tight and so the UI radio buttons map 1:1.
ALLOWED_COVERAGE_DAYS = (7, 30, 90)


@router.get("/admin/coverage/pillars")
async def get_pillar_coverage(
    days: int = 7,
    current_user: dict = Depends(get_current_user),
):
    """Cards-created-by-pillar histogram over the requested window.

    Used by the Coverage tab to spot pillar starvation. The expected share
    in the response is uniform across the six pillars (1/6 each). The UI
    can compare actual share vs expected share to flag drift.
    """
    require_admin(current_user)
    if days not in ALLOWED_COVERAGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"days must be one of {sorted(ALLOWED_COVERAGE_DAYS)}",
        )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    def load() -> dict[str, Any]:
        rows = (
            supabase.table("cards")
            .select("pillar_id,created_at")
            .gte("created_at", cutoff)
            .eq("status", "active")
            .limit(10_000)
            .execute()
            .data
            or []
        )
        counts: dict[str, int] = {code: 0 for code in PILLAR_DEFINITIONS}
        unassigned = 0
        for row in rows:
            pillar = row.get("pillar_id")
            if pillar in counts:
                counts[pillar] += 1
            else:
                unassigned += 1
        total = len(rows)
        # Expected share is uniform — six pillars, 1/6 each. Recorded so the
        # frontend can render a baseline line without re-deriving the
        # constant on its end.
        expected_share = round(1.0 / len(PILLAR_DEFINITIONS), 4)
        by_pillar: dict[str, dict[str, Any]] = {}
        for code, name in PILLAR_DEFINITIONS.items():
            cards = counts[code]
            share = round(cards / total, 4) if total else 0.0
            by_pillar[code] = {
                "name": name,
                "cards": cards,
                "share": share,
                "expected_share": expected_share,
                # Positive drift = over-represented; negative = starved. Lets
                # the UI sort or color-code without re-doing the math.
                "drift": round(share - expected_share, 4),
            }
        return {
            "window_days": days,
            "since": cutoff,
            "total": total,
            "unassigned": unassigned,
            "by_pillar": by_pillar,
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute pillar coverage")
        raise HTTPException(status_code=500, detail=str(e))


def _aggregate_workstream_freshness(
    workstreams: list[dict[str, Any]],
    completed_scans: list[dict[str, Any]],
    recent_scans: list[dict[str, Any]],
    recent_cards: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Join workstream rows with scan + card-add timestamps.

    Pure function so the test suite can hit it without a Supabase mock.
    """
    last_scanned: dict[str, Optional[str]] = {}
    for scan in completed_scans:
        ws_id = scan.get("workstream_id")
        if not ws_id:
            continue
        # Prefer completed_at; some schemas only set started_at on early
        # completions, so fall back to created_at to avoid a None gap.
        seen = (
            scan.get("completed_at")
            or scan.get("started_at")
            or scan.get("created_at")
        )
        prev = last_scanned.get(ws_id)
        if seen and (prev is None or seen > prev):
            last_scanned[ws_id] = seen

    scans_30d: dict[str, int] = {}
    for scan in recent_scans:
        ws_id = scan.get("workstream_id")
        if not ws_id:
            continue
        scans_30d[ws_id] = scans_30d.get(ws_id, 0) + 1

    cards_30d: dict[str, int] = {}
    for entry in recent_cards:
        ws_id = entry.get("workstream_id")
        if not ws_id:
            continue
        cards_30d[ws_id] = cards_30d.get(ws_id, 0) + 1

    rows: list[dict[str, Any]] = []
    for ws in workstreams:
        rows.append(
            {
                "id": ws.get("id"),
                "name": ws.get("name"),
                "owner_type": ws.get("owner_type") or "user",
                "auto_scan": bool(ws.get("auto_scan")),
                "last_scanned_at": last_scanned.get(ws.get("id")),
                "scans_30d": scans_30d.get(ws.get("id"), 0),
                "cards_added_30d": cards_30d.get(ws.get("id"), 0),
            }
        )

    # Stale-first ordering: NULL (never scanned) bubbles to the top, then
    # ascending by last_scanned_at. Within ties, preserve insertion order.
    rows.sort(
        key=lambda r: (
            r["last_scanned_at"] is not None,
            r["last_scanned_at"] or "",
        )
    )
    return rows


@router.get("/admin/coverage/workstreams")
async def get_workstream_coverage(
    current_user: dict = Depends(get_current_user),
):
    """Per-workstream freshness table sorted stale-first.

    Joins workstreams with their most recent completed scan, the count of
    scans in the last 30d, and the count of cards added to the workstream
    in the last 30d.
    """
    require_admin(current_user)
    cutoff_30d = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()

    def load() -> dict[str, Any]:
        workstreams = (
            supabase.table("workstreams")
            .select("id,name,owner_type,auto_scan,user_id,created_at")
            .limit(2000)
            .execute()
            .data
            or []
        )
        # All-time most-recent-completed scans, capped at the latest 1000 so
        # we don't over-fetch on a long-lived deployment. For workstreams
        # whose last completed scan is older than this window the
        # last_scanned_at will appear None — which is the correct "very
        # stale" signal for the freshness widget anyway.
        completed_scans = (
            supabase.table("workstream_scans")
            .select("workstream_id,completed_at,started_at,created_at")
            .eq("status", "completed")
            .order("completed_at", desc=True)
            .limit(1000)
            .execute()
            .data
            or []
        )
        recent_scans = (
            supabase.table("workstream_scans")
            .select("workstream_id,created_at")
            .gte("created_at", cutoff_30d)
            .limit(5000)
            .execute()
            .data
            or []
        )
        recent_cards = (
            supabase.table("workstream_cards")
            .select("workstream_id,added_at")
            .gte("added_at", cutoff_30d)
            .limit(20_000)
            .execute()
            .data
            or []
        )
        items = _aggregate_workstream_freshness(
            workstreams, completed_scans, recent_scans, recent_cards
        )
        return {"items": items, "total": len(items)}

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute workstream coverage")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/admin/workstreams/{workstream_id}/scan", status_code=status.HTTP_201_CREATED
)
async def admin_force_workstream_scan(
    request: Request,
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Admin-initiated targeted scan of any workstream.

    The user-facing endpoint at ``POST /me/workstreams/{id}/scan`` requires
    the caller to own the workstream, which makes it useless for an admin
    triaging org workstreams from the freshness dashboard. This variant
    skips the ownership check (admin role still required) and writes the
    same ``workstream_scans`` row the worker already polls. It also writes
    an audit-log row so admin-initiated scans are distinguishable from
    user-initiated ones.
    """
    require_admin(current_user)

    def fetch_and_queue() -> dict[str, Any]:
        ws_resp = (
            supabase.table("workstreams")
            .select("id,name,user_id,keywords,pillar_ids,horizon,owner_type")
            .eq("id", workstream_id)
            .limit(1)
            .execute()
        )
        rows = ws_resp.data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Workstream not found")
        ws = rows[0]
        keywords = ws.get("keywords") or []
        pillar_ids = ws.get("pillar_ids") or []
        if not keywords and not pillar_ids:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Workstream has no keywords or pillars configured; "
                    "nothing to scan."
                ),
            )
        config: dict[str, Any] = {
            "workstream_id": workstream_id,
            # The scan worker keys some logging by user_id; preserve the WS
            # owner so admin-initiated scans show up under the right user
            # rather than the admin themselves.
            "user_id": ws.get("user_id"),
            "triggered_by": "admin",
            "admin_user_id": current_user.get("id"),
            "keywords": keywords,
            "pillar_ids": pillar_ids,
            "horizon": ws.get("horizon") or "ALL",
        }
        scan_record = {
            "workstream_id": workstream_id,
            # The DB has a NOT NULL on user_id — admin force-scan still
            # records as the workstream owner so the data model stays
            # consistent. The triggered_by/admin_user_id fields in config
            # carry the actual admin identity.
            "user_id": ws.get("user_id") or current_user.get("id"),
            "status": "queued",
            "config": config,
        }
        result = (
            supabase.table("workstream_scans").insert(scan_record).execute()
        )
        scan_rows = result.data or []
        if not scan_rows:
            raise HTTPException(
                status_code=500, detail="Failed to enqueue scan"
            )
        return {"workstream": ws, "scan": scan_rows[0]}

    try:
        outcome = await asyncio.to_thread(fetch_and_queue)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to force-scan workstream")
        raise HTTPException(status_code=500, detail=str(e))

    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.workstream.force_scan",
        target_type="workstream",
        target_id=workstream_id,
        before=None,
        after={
            "scan_id": outcome["scan"].get("id"),
            "workstream_name": outcome["workstream"].get("name"),
        },
        request=request,
    )
    return {
        "scan_id": outcome["scan"].get("id"),
        "workstream_id": workstream_id,
        "status": outcome["scan"].get("status", "queued"),
    }


# ---------------------------------------------------------------------------
# Run-detail (PR D)
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


@router.get("/admin/discovery/runs/{run_id}/detail")
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

        page_rows = (
            supabase.table("discovered_sources")
            .select(DISCOVERED_SOURCE_DETAIL_SELECT)
            .eq("discovery_run_id", run_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
            .data
            or []
        )

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
                "has_more": offset + len(page_rows) < sources_total,
            },
        }

    try:
        return await asyncio.to_thread(load)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to load discovery run detail")
        raise HTTPException(status_code=500, detail=str(e))
