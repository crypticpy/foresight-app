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
import ipaddress
import logging
import socket
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, HttpUrl

from app.authz import require_admin
from app.deps import _safe_error, get_current_user, limiter, supabase

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


async def _safe_audit_log(**kwargs: Any) -> None:
    """Best-effort audit log — never fail the primary request.

    The audit table is non-critical metadata; if it's down or its schema
    has drifted, the underlying source mutation has already succeeded and
    the operator should still see a 2xx. Swallow + log the error rather
    than turning a successful mutation into a 500.
    """
    from app.routers.admin import _log_admin_action

    try:
        await asyncio.to_thread(_log_admin_action, **kwargs)
    except Exception:
        logger.exception("Audit log write failed (non-fatal)")


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
        if row.get("triage_is_relevant"):
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
            .select("url,triage_is_relevant,created_at")
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
        raise HTTPException(status_code=500, detail=_safe_error("list admin sources", e))


_MAX_VALIDATION_REDIRECTS = 5


def _assert_public_host(url: str) -> None:
    """Reject URLs that resolve to a non-public IP.

    Guards the validator's outbound HEAD/GET against SSRF: an admin token
    must not be reusable to probe loopback, link-local, RFC1918, or
    multicast endpoints from the backend's network. Public DNS names that
    resolve to private space are also rejected, so a CNAME like
    ``internal.example.com → 10.0.0.1`` cannot slip past the check.

    Only ``http(s)`` schemes are allowed; raises ``HTTPException(400)``.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400, detail="Only http(s) URLs are allowed."
        )
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="URL is missing a host.")
    try:
        infos = socket.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=400, detail=f"Could not resolve host: {exc}"
        )
    for info in infos:
        sockaddr = info[4]
        try:
            ip = ipaddress.ip_address(sockaddr[0])
        except ValueError:
            continue
        if (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise HTTPException(
                status_code=400,
                detail=f"Host {host} resolves to a non-public address ({ip}).",
            )


async def _validate_rss_url(url: str) -> None:
    """Confirm a URL responds with 2xx/3xx before adding it as an RSS feed.

    Reaches out for HEAD first; falls back to GET because some feeds (e.g.
    Substack) reject HEAD with 405. Failure raises ``HTTPException(400)``
    with a human-readable reason. We do NOT verify XML payload here —
    feedparser inside the discovery pipeline handles that, and a feed that
    serves valid XML but a 200 HTML fallback would still pass triage.

    Redirects are walked manually (rather than letting httpx follow them) so
    every hop is re-validated against the public-host check. This blocks
    SSRF attacks where the initial URL is public but redirects to an
    internal host.
    """
    current_url = url
    try:
        async with httpx.AsyncClient(
            timeout=RSS_VALIDATION_TIMEOUT_S, follow_redirects=False
        ) as client:
            for _ in range(_MAX_VALIDATION_REDIRECTS + 1):
                _assert_public_host(current_url)
                try:
                    response = await client.head(current_url)
                    if response.status_code == 405:
                        response = await client.get(current_url)
                except httpx.UnsupportedProtocol as exc:
                    raise HTTPException(
                        status_code=400, detail=f"Unsupported URL scheme: {exc}"
                    )
                if 300 <= response.status_code < 400:
                    location = response.headers.get("location")
                    if not location:
                        break
                    current_url = str(httpx.URL(current_url).join(location))
                    continue
                break
            else:
                raise HTTPException(
                    status_code=400,
                    detail="Source URL exceeded the redirect limit.",
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
@limiter.limit("10/minute")
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
        raise HTTPException(status_code=500, detail=_safe_error("create admin source", e))

    # Audit-log the create. Done after the insert so we never write an
    # audit row for a failed mutation. Best-effort: a failure here must not
    # turn a successful insert into a 500.
    await _safe_audit_log(
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
@limiter.limit("30/minute")
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
        raise HTTPException(status_code=500, detail=_safe_error("update admin source", e))

    await _safe_audit_log(
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
@limiter.limit("10/minute")
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
        raise HTTPException(status_code=500, detail=_safe_error("delete admin source", e))

    await _safe_audit_log(
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

# Aggregation modes for ``get_pillar_coverage``. ``primary`` is the original
# behavior (count ``cards.pillar_id`` only). ``primary_or_secondary`` adds
# ``secondary_pillars``. ``union`` additionally counts cards whose
# ``csp_goal_ids`` resolve to a goal under each pillar — this is the same
# notion of coverage the lens-overview endpoint uses, so the two views can
# finally agree on direction (see analytics.py:1856-2006).
ALLOWED_COVERAGE_MODES = ("primary", "primary_or_secondary", "union")
CoverageMode = Literal["primary", "primary_or_secondary", "union"]


@router.get("/admin/coverage/pillars")
async def get_pillar_coverage(
    days: int = 7,
    mode: CoverageMode = "primary",
    current_user: dict = Depends(get_current_user),
):
    """Cards-created-by-pillar histogram over the requested window.

    Used by the Coverage tab to spot pillar starvation. The expected share
    in the response is uniform across the six pillars (1/6 each). The UI
    can compare actual share vs expected share to flag drift.

    The ``mode`` selector decides which links count toward each pillar:

    - ``primary`` (default): only the primary ``cards.pillar_id``. Preserves
      the original behavior so cached clients keep working.
    - ``primary_or_secondary``: union of ``pillar_id`` and ``secondary_pillars``.
    - ``union``: also includes any pillar reachable via ``csp_goal_ids``
      (mapped through ``csp_goals.pillar_code``). This matches what the
      lens-overview endpoint counts, so the two views agree on direction.

    Regardless of mode, every bucket reports ``primary_cards``,
    ``secondary_cards`` and ``csp_linked_cards`` so the UI can show all
    three at once without re-fetching.

    Share semantics: ``share = bucket.cards / mode_total`` where
    ``mode_total = sum(mode_counts.values())``. In ``primary`` this is
    just the count of cards with a pillar assigned (``total - unassigned``)
    so a card with no pillar doesn't dilute the others. In the union
    modes, a single card may credit several pillars, so the denominator
    is the total number of pillar-touches; this keeps
    ``sum(share) == 1.0`` across pillars in every mode and makes the
    uniform 1/6 drift baseline meaningful regardless of mode. The raw
    card count is still returned as ``total`` (and the pillar-touch count
    as ``mode_total``) so callers can render both.
    """
    require_admin(current_user)
    if days not in ALLOWED_COVERAGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"days must be one of {sorted(ALLOWED_COVERAGE_DAYS)}",
        )
    if mode not in ALLOWED_COVERAGE_MODES:
        # FastAPI's Literal coercion catches this for query params, but the
        # explicit check guards against in-process callers (tests, the
        # gap-detector in PR-C) that pass through directly.
        raise HTTPException(
            status_code=400,
            detail=f"mode must be one of {list(ALLOWED_COVERAGE_MODES)}",
        )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    def load() -> dict[str, Any]:
        rows = (
            supabase.table("cards")
            .select("pillar_id,secondary_pillars,csp_goal_ids,created_at")
            .gte("created_at", cutoff)
            .eq("status", "active")
            .limit(10_000)
            .execute()
            .data
            or []
        )

        # Build a goal_id -> pillar_code map once. csp_goals is small (~23
        # rows) so a single full scan is cheaper than a per-card join.
        goal_rows = (
            supabase.table("csp_goals")
            .select("id,pillar_code")
            .limit(1_000)
            .execute()
            .data
            or []
        )
        goal_pillar: dict[str, str] = {}
        for g in goal_rows:
            gid = g.get("id")
            pc = g.get("pillar_code")
            if gid and pc in PILLAR_DEFINITIONS:
                goal_pillar[str(gid)] = pc

        primary_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        secondary_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        csp_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        mode_counts: dict[str, int] = {c: 0 for c in PILLAR_DEFINITIONS}
        unassigned = 0

        for row in rows:
            primary = row.get("pillar_id")
            secondary = row.get("secondary_pillars") or []
            goal_ids = row.get("csp_goal_ids") or []

            primary_set: set[str] = set()
            if primary in PILLAR_DEFINITIONS:
                primary_set.add(primary)
                primary_counts[primary] += 1

            # A pillar listed in both primary and secondary still only counts
            # once toward ``secondary_cards`` for that pillar — the bucket
            # answers "is this pillar mentioned secondarily on any card",
            # not "how many secondary slots reference it."
            secondary_set: set[str] = set()
            for s in secondary:
                if s in PILLAR_DEFINITIONS and s not in secondary_set:
                    secondary_set.add(s)
                    secondary_counts[s] += 1

            csp_set: set[str] = set()
            for gid in goal_ids:
                pc = goal_pillar.get(str(gid))
                if pc and pc not in csp_set:
                    csp_set.add(pc)
                    csp_counts[pc] += 1

            if mode == "primary":
                touched = primary_set
            elif mode == "primary_or_secondary":
                touched = primary_set | secondary_set
            else:  # union
                touched = primary_set | secondary_set | csp_set

            if touched:
                for code in touched:
                    mode_counts[code] += 1
            else:
                unassigned += 1

        total = len(rows)
        # Share denominator. In ``primary`` each card credits at most one
        # pillar, so this equals total - unassigned. In the union modes a
        # card can credit several pillars, so this is the sum of all
        # mode-counts (pillar-touches). Using a mode-aware denominator
        # keeps ``sum(share) == 1.0`` across pillars in every mode, which
        # is what makes the uniform 1/6 drift baseline meaningful — a
        # raw-card denominator would let every drift go positive in union
        # modes and the starvation signal would stop working.
        mode_total = sum(mode_counts.values())
        # Expected share is uniform — six pillars, 1/6 each. Recorded so the
        # frontend can render a baseline line without re-deriving the
        # constant on its end.
        expected_share = round(1.0 / len(PILLAR_DEFINITIONS), 4)
        by_pillar: dict[str, dict[str, Any]] = {}
        for code, name in PILLAR_DEFINITIONS.items():
            cards = mode_counts[code]
            share = round(cards / mode_total, 4) if mode_total else 0.0
            by_pillar[code] = {
                "name": name,
                # ``cards`` reflects the selected mode so the UI can size
                # bars without branching on mode. The per-channel counts
                # below let the UI annotate the same bar with badges.
                "cards": cards,
                "primary_cards": primary_counts[code],
                "secondary_cards": secondary_counts[code],
                "csp_linked_cards": csp_counts[code],
                "share": share,
                "expected_share": expected_share,
                # Positive drift = over-represented; negative = starved. Lets
                # the UI sort or color-code without re-doing the math.
                "drift": round(share - expected_share, 4),
            }
        return {
            "window_days": days,
            "mode": mode,
            "since": cutoff,
            # ``total`` stays the raw card count so the UI's "N cards in
            # window" line is honest. ``mode_total`` is exposed so a caller
            # can verify it's the denominator for ``share`` (and so the
            # gap-detector in PR-C can reuse it).
            "total": total,
            "mode_total": mode_total,
            "unassigned": unassigned,
            "by_pillar": by_pillar,
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute pillar coverage")
        raise HTTPException(status_code=500, detail=_safe_error("compute pillar coverage", e))


# Drift-score thresholds for the gap detector. A drift_score of -1.0 means
# zero cards under that goal; -0.5 means "half the expected volume." We keep
# the bands wide enough that one short window doesn't flap a goal between
# bands every refresh.
GAP_PRIORITY_HIGH_THRESHOLD = -0.5
GAP_PRIORITY_MEDIUM_THRESHOLD = -0.25
TargetDistribution = Literal["uniform"]
ALLOWED_GAP_TARGETS = ("uniform",)


def _gap_priority(drift_score: float) -> str:
    """Bucket a goal's drift_score into the priority bands the UI colors."""
    if drift_score <= GAP_PRIORITY_HIGH_THRESHOLD:
        return "high"
    if drift_score <= GAP_PRIORITY_MEDIUM_THRESHOLD:
        return "medium"
    return "none"


@router.get("/admin/coverage/gaps")
@limiter.limit("30/minute")
async def get_coverage_gaps(
    request: Request,
    days: int = 30,
    target_distribution: TargetDistribution = "uniform",
    current_user: dict = Depends(get_current_user),
):
    """Per-(pillar, csp_goal) coverage heatmap with drift scores.

    The pillar-balance widget (``/admin/coverage/pillars``) tells operators
    *which pillar* is starved. This endpoint zooms one level in and tells
    them *which strategic goal* under that pillar is starved, so a balance
    run can target the specific gap rather than carpet-bombing the pillar.

    Aggregation: for each active card created within ``days``, every entry
    in its ``csp_goal_ids`` array contributes one credit to that goal's
    cell. The cell's ``pillar_code`` comes from ``csp_goals.pillar_code``.

    ``target_distribution=uniform`` (only mode for v1) sets the expected
    number of cards per goal to ``total_credits / total_goals``. ``drift``
    is ``cards_in_window - expected``; ``drift_score`` is ``drift / expected``
    clamped to ``[-1.0, +inf)``. ``priority`` is bucketed by ``drift_score``:

    - ``high``:   drift_score ≤ -0.5 (more than half short of expected)
    - ``medium``: drift_score ≤ -0.25
    - ``none``:   otherwise

    The cells list is sorted starvation-first (drift_score ascending) so
    the UI can render the heatmap with the worst-off goals on top.
    """
    require_admin(current_user)
    if days not in ALLOWED_COVERAGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"days must be one of {sorted(ALLOWED_COVERAGE_DAYS)}",
        )
    if target_distribution not in ALLOWED_GAP_TARGETS:
        raise HTTPException(
            status_code=400,
            detail=(
                "target_distribution must be one of "
                f"{list(ALLOWED_GAP_TARGETS)}"
            ),
        )

    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    def load() -> dict[str, Any]:
        # Explicit newest-first ordering on the card scan so that, if the
        # 10k cap ever bites (90d window on a very active tenant), the
        # truncation is deterministic and biased toward the most recent
        # cards — the ones the operator cares about for "what's starved
        # right now" decisions. Without an ORDER BY, Supabase's row order
        # is undefined.
        rows = (
            supabase.table("cards")
            .select("csp_goal_ids,created_at")
            .gte("created_at", cutoff)
            .eq("status", "active")
            .order("created_at", desc=True)
            .limit(10_000)
            .execute()
            .data
            or []
        )

        # The csp_goals table is small (~23 rows) but order by display_order
        # so any future truncation behaves like the rest of the UI.
        goal_rows = (
            supabase.table("csp_goals")
            .select("id,code,name,pillar_code,display_order")
            .order("display_order", desc=False)
            .limit(1_000)
            .execute()
            .data
            or []
        )

        # Normalize the goal rows up-front: drop any with a missing id or an
        # unknown pillar_code so we never produce a cell the UI can't render.
        goals: list[dict[str, Any]] = []
        for g in goal_rows:
            gid = g.get("id")
            pc = g.get("pillar_code")
            if not gid or pc not in PILLAR_DEFINITIONS:
                continue
            goals.append(
                {
                    "id": str(gid),
                    "code": g.get("code") or "",
                    "name": g.get("name") or "",
                    "pillar_code": pc,
                    "display_order": g.get("display_order") or 0,
                }
            )

        goal_counts: dict[str, int] = {g["id"]: 0 for g in goals}
        total_credits = 0
        for row in rows:
            for gid in row.get("csp_goal_ids") or []:
                key = str(gid)
                if key in goal_counts:
                    goal_counts[key] += 1
                    total_credits += 1

        # Expected: uniform distribution across all goals. Falls back to 0
        # when there are no goals at all (empty seed DB) so the math never
        # divides by zero.
        expected_per_cell = (
            total_credits / len(goals) if goals else 0.0
        )

        cells: list[dict[str, Any]] = []
        for g in goals:
            cards_in_window = goal_counts[g["id"]]
            drift = cards_in_window - expected_per_cell
            if expected_per_cell > 0:
                # Clamp the negative tail to -1.0 — "zero coverage" is the
                # worst we can express, and a smaller denominator would let
                # the score balloon below -1 misleadingly.
                drift_score = max(-1.0, drift / expected_per_cell)
            else:
                # No data anywhere — flat 0 so the UI doesn't paint
                # everything as "high priority" on a fresh install.
                drift_score = 0.0
            cells.append(
                {
                    "pillar_code": g["pillar_code"],
                    "goal_id": g["id"],
                    "goal_code": g["code"],
                    "goal_name": g["name"],
                    "cards_in_window": cards_in_window,
                    "expected": round(expected_per_cell, 2),
                    "drift": round(drift, 2),
                    "drift_score": round(drift_score, 4),
                    "priority": _gap_priority(drift_score),
                }
            )

        # Starvation-first, then by pillar/goal code so the order is stable
        # across refreshes (no jitter from equal drift_scores). ``goal_id``
        # is the final tie-breaker because ``goal_code`` can be empty or
        # duplicated for seed rows and would otherwise allow row jitter.
        cells.sort(
            key=lambda c: (
                c["drift_score"],
                c["pillar_code"],
                c["goal_code"],
                c["goal_id"],
            )
        )

        underrepresented = sum(1 for c in cells if c["priority"] != "none")

        return {
            "window_days": days,
            "target_distribution": target_distribution,
            "since": cutoff,
            "cells": cells,
            "totals": {
                # Raw card count credited under at least one goal in window.
                # A card linked to multiple goals contributes once per goal.
                "credits": total_credits,
                "goals": len(goals),
                "expected_per_cell": round(expected_per_cell, 2),
                "underrepresented_cells": underrepresented,
            },
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to compute coverage gaps")
        raise HTTPException(status_code=500, detail=_safe_error("compute coverage gaps", e))


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
        raise HTTPException(status_code=500, detail=_safe_error("compute workstream coverage", e))


@router.post("/admin/csp-goals/{goal_id}/refresh-queries")
@limiter.limit("10/minute")
async def admin_refresh_goal_queries(
    request: Request,
    goal_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Force-rederive cached ``query_aliases`` for a CSP goal.

    Used by the operator when a goal's name/description changes mid-cycle
    and they want the next coverage-balance dispatch to use fresh queries
    instead of waiting for the cache-version stamp to roll. The handler is
    intentionally narrow: it triggers the same service the PR-E
    dispatcher will use, so there's exactly one code path that writes
    ``query_aliases``.
    """
    require_admin(current_user)
    # Local import: csp_goal_query_service pulls in the async OpenAI
    # client at import time, and we don't want to pay that cost on every
    # admin_discovery import (most admin endpoints don't touch the LLM).
    from uuid import UUID as _UUID

    from app import csp_goal_query_service

    try:
        parsed = _UUID(goal_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=400, detail="goal_id must be a UUID"
        ) from exc

    try:
        queries = await csp_goal_query_service.derive_queries(parsed, force=True)
    except csp_goal_query_service.GoalNotFoundError as exc:
        # 404 — the goal_id doesn't resolve to a row. Distinct from 422
        # below so a typo'd UUID surfaces as "not found" rather than
        # "server couldn't produce a result" (which would prompt retries).
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except csp_goal_query_service.QueryDerivationError as exc:
        # 422 — goal exists but the LLM didn't yield a usable result. The
        # detail string makes the failure mode visible so the operator
        # knows whether to retry or fix the goal text.
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to refresh queries for goal %s", goal_id)
        raise HTTPException(status_code=500, detail=_safe_error("refresh goal queries", exc)) from exc

    return {"goal_id": goal_id, "queries": queries, "count": len(queries)}


# ---------------------------------------------------------------------------
# PR-E: Coverage-balance dispatcher
# ---------------------------------------------------------------------------
#
# Hands the operator one button that says "fill the gap": pick the starved
# CSP goals (auto or by id), translate each to web-search queries via the
# PR-D service, queue a discovery_runs row carrying those queries plus a
# pillar filter, and return the run_id so the UI can link to Operations.
#
# Why this lives in admin_discovery.py: the discovery router already owns
# the discovery_runs insert pattern (see `trigger_discovery_run`), and this
# endpoint is fundamentally an admin shortcut around that same row insert
# with a balancer-shaped config. Keeping it next to the gap detector keeps
# the coverage-balancer surface in one file.

# Cap the number of goals one balance dispatch will target. Each goal can
# produce up to MAX_QUERIES_PER_GOAL_CAP queries, so 5 * 4 = 20 — that's
# the discovery service's global per-run query budget. Going above this
# risks the run silently dropping queries past the cap.
BALANCE_MAX_GOALS = 5
BALANCE_DEFAULT_QUERIES_PER_GOAL = 4
BALANCE_MAX_QUERIES_PER_GOAL = 6  # Mirrors csp_goal_query_service.MAX_QUERIES.
BALANCE_GLOBAL_QUERY_CAP = 20
BALANCE_DEFAULT_CATEGORIES = ("rss", "web_search")


class BalanceDispatchRequest(BaseModel):
    """Payload for the coverage-balance dispatcher.

    All fields optional. When ``goal_ids`` is empty / omitted the dispatcher
    auto-picks the highest-drift CSP goals from the same data the gap
    detector surfaces.
    """

    goal_ids: list[str] | None = Field(
        default=None,
        description="UUIDs of csp_goals to target. When omitted, auto-derive from gaps.",
    )
    max_queries_per_goal: int = Field(
        default=BALANCE_DEFAULT_QUERIES_PER_GOAL,
        ge=1,
        le=BALANCE_MAX_QUERIES_PER_GOAL,
        description="Cap on queries kept per goal. Hard cap is the service's MAX_QUERIES.",
    )
    categories: list[str] | None = Field(
        default=None,
        description=(
            "Source categories to enable for this run. Defaults to "
            "['rss', 'web_search']. Pass an explicit list to override."
        ),
    )
    window_days: int = Field(
        default=30,
        description="Lookback window for the auto-pick gap query. Ignored when goal_ids is set.",
    )


async def _auto_pick_starved_goals(window_days: int) -> list[dict[str, Any]]:
    """Return the most-starved goals in the window, capped at ``BALANCE_MAX_GOALS``.

    Reads the same data the gap detector uses (cards.csp_goal_ids + csp_goals)
    but skips the priority-band bookkeeping — for dispatch we only need the
    ordering. Inlined here so this endpoint doesn't depend on PR-C's gap
    endpoint being merged.
    """
    since_dt = datetime.now(timezone.utc) - timedelta(days=window_days)

    def fetch() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        goals_resp = (
            supabase.table("csp_goals")
            .select("id,code,name,pillar_code")
            .execute()
        )
        cards_resp = (
            supabase.table("cards")
            .select("csp_goal_ids,created_at")
            .gte("created_at", since_dt.isoformat())
            # Match the coverage widget: archived/deleted cards shouldn't
            # mask a gap. Without this, a goal whose recent cards were all
            # archived would look "covered" and skip the dispatcher.
            .eq("status", "active")
            .execute()
        )
        return goals_resp.data or [], cards_resp.data or []

    goals, cards = await asyncio.to_thread(fetch)
    if not goals:
        return []

    goal_index = {g["id"]: g for g in goals}
    counts: dict[str, int] = {g["id"]: 0 for g in goals}
    total_links = 0
    for card in cards:
        for gid in card.get("csp_goal_ids") or []:
            if gid in counts:
                counts[gid] += 1
                total_links += 1

    # ``counts`` is keyed off ``goals`` (guarded non-empty above), so it
    # can never be empty here.
    expected = total_links / len(counts)
    # Drift score: (actual - expected) / max(expected, 1) so a 0-count goal
    # against expected=12 yields -1.0 and sorts to the top.
    scored: list[tuple[float, dict[str, Any]]] = []
    for gid, count in counts.items():
        drift_score = (count - expected) / max(expected, 1.0)
        scored.append((drift_score, goal_index[gid]))
    scored.sort(key=lambda x: x[0])
    return [g for _score, g in scored[:BALANCE_MAX_GOALS]]


@router.post("/admin/discovery/balance", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def admin_balance_dispatch(
    request: Request,
    body: BalanceDispatchRequest | None = None,
    current_user: dict = Depends(get_current_user),
):
    """Queue a targeted discovery run aimed at starved CSP goals.

    The operator clicks "Balance now" (or hits this endpoint directly). We:

    1. Pick goals — explicit ``goal_ids`` if supplied, otherwise the
       highest-drift cells in the last 30 days (auto cap ``BALANCE_MAX_GOALS``).
    2. Translate each goal to queries via ``csp_goal_query_service`` (cached
       — only the first call per goal hits the LLM).
    3. Trim per-goal queries to ``max_queries_per_goal`` and the union to
       ``BALANCE_GLOBAL_QUERY_CAP``.
    4. Insert a ``discovery_runs`` row with the balancer config in
       ``summary_report.config`` so the worker picks it up via the same
       claim path manual / scheduled runs use.

    Returns ``{run_id, goals_used, queued_queries}`` so the UI can link to
    Operations and the operator can verify which goals fired.
    """
    require_admin(current_user)

    # Local imports — csp_goal_query_service pulls openai_provider at import
    # time, and admin_discovery is imported on every API boot.
    from uuid import UUID as _UUID
    from uuid import uuid4

    from app import csp_goal_query_service
    from app.cost_guardrail import check_budget_or_raise
    from app.models import CustomQuerySpec

    payload = body or BalanceDispatchRequest()
    await check_budget_or_raise()  # 503 with friendly detail if tripped.

    # Resolve goals.
    if payload.goal_ids:
        try:
            parsed_ids = [_UUID(g) for g in payload.goal_ids]
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail=f"goal_ids must be UUIDs: {exc}"
            ) from exc
        if len(parsed_ids) > BALANCE_MAX_GOALS:
            raise HTTPException(
                status_code=400,
                detail=f"At most {BALANCE_MAX_GOALS} goal_ids per dispatch.",
            )

        def fetch_explicit() -> list[dict[str, Any]]:
            return (
                supabase.table("csp_goals")
                .select("id,code,name,pillar_code")
                .in_("id", [str(g) for g in parsed_ids])
                .execute()
                .data
                or []
            )

        goals = await asyncio.to_thread(fetch_explicit)
        if len(goals) != len(parsed_ids):
            missing = {str(g) for g in parsed_ids} - {g["id"] for g in goals}
            raise HTTPException(
                status_code=404, detail=f"Unknown goal_ids: {sorted(missing)}"
            )
    else:
        if payload.window_days not in (7, 30, 90):
            raise HTTPException(
                status_code=400,
                detail="window_days must be one of 7, 30, 90",
            )
        goals = await _auto_pick_starved_goals(payload.window_days)
        if not goals:
            raise HTTPException(
                status_code=404,
                detail="No active CSP goals available for auto-pick.",
            )

    # Translate each goal -> queries.
    queries: list[CustomQuerySpec] = []
    goals_used: list[dict[str, Any]] = []
    pillars_seen: set[str] = set()
    derivation_errors: list[dict[str, Any]] = []

    for goal in goals:
        try:
            derived = await csp_goal_query_service.derive_queries(_UUID(goal["id"]))
        except csp_goal_query_service.QueryDerivationError as exc:
            # One bad goal shouldn't drop the whole batch — record and skip.
            derivation_errors.append(
                {"goal_id": goal["id"], "code": goal.get("code"), "error": str(exc)}
            )
            continue
        trimmed = derived[: payload.max_queries_per_goal]
        if not trimmed:
            continue
        pillar = (goal.get("pillar_code") or "").strip()
        if not pillar:
            # Goal without a pillar code is meaningless to the discovery
            # pipeline's pillar-bucketed scoring. Skip.
            derivation_errors.append(
                {
                    "goal_id": goal["id"],
                    "code": goal.get("code"),
                    "error": "goal has no pillar_code",
                }
            )
            continue
        added = 0
        for q in trimmed:
            if len(queries) >= BALANCE_GLOBAL_QUERY_CAP:
                break
            queries.append(
                CustomQuerySpec(
                    query_text=q, pillar_code=pillar, source_context="balance"
                )
            )
            added += 1
        if added == 0:
            continue
        pillars_seen.add(pillar)
        goals_used.append(
            {
                "id": goal["id"],
                "code": goal.get("code"),
                "name": goal.get("name"),
                "pillar_code": pillar,
                "query_count": added,
            }
        )
        if len(queries) >= BALANCE_GLOBAL_QUERY_CAP:
            break

    if not queries:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "No usable queries derived for the selected goals.",
                "errors": derivation_errors,
            },
        )

    categories = payload.categories or list(BALANCE_DEFAULT_CATEGORIES)

    # Build the persisted run config — this is what the worker will read
    # back via ``summary_report.config`` (see worker.py:408). The shape must
    # match ``DiscoveryConfigRequest``.
    run_id = str(uuid4())
    resolved_config = {
        "max_queries_per_run": min(len(queries), BALANCE_GLOBAL_QUERY_CAP),
        "max_sources_total": 200,
        "auto_approve_threshold": 0.95,
        "pillars_filter": sorted(pillars_seen),
        "dry_run": False,
        "categories_to_scan": categories,
        "source_ids": None,
        "custom_queries": [q.model_dump() for q in queries],
        # Multi-source must stay on: it is the RSS/news/government fetch path,
        # which `categories_to_scan` then filters down. Disabling it skips RSS
        # entirely, leaving only the gpt-researcher web_search path — and that
        # path frequently exhausts its 120s per-query timeout on broad goal-
        # derived queries, producing 0 sources. Verified end-to-end on
        # run b3c14108 (multi_source=True → 36 sources, 7 cards) vs
        # run f3e1b489 (multi_source=False → 0 sources, 0 cards).
        "enable_multi_source": True,
    }

    run_record = {
        "id": run_id,
        "status": "running",
        "triggered_by": "manual",
        "triggered_by_user": current_user["id"],
        "summary_report": {
            "stage": "queued",
            "config": resolved_config,
            "balance": {
                "goals": goals_used,
                "derivation_errors": derivation_errors,
            },
        },
        "cards_created": 0,
        "cards_enriched": 0,
        "cards_deduplicated": 0,
        "sources_found": 0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "pillars_scanned": sorted(pillars_seen),
    }

    def insert_run() -> None:
        supabase.table("discovery_runs").insert(run_record).execute()

    try:
        await asyncio.to_thread(insert_run)
    except Exception as exc:
        logger.exception("Failed to enqueue balance discovery run")
        raise HTTPException(
            status_code=500, detail=_safe_error("enqueue balance discovery run", exc)
        ) from exc

    return {
        "run_id": run_id,
        "goals_used": goals_used,
        "queued_queries": [q.model_dump() for q in queries],
        "derivation_errors": derivation_errors,
        "categories": categories,
    }


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
        raise HTTPException(status_code=500, detail=_safe_error("force-scan workstream", e))

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
        raise HTTPException(status_code=500, detail=_safe_error("load discovery run detail", e))


# ---------------------------------------------------------------------------
# Schedule CRUD (PR E)
# ---------------------------------------------------------------------------
#
# The legacy single-row endpoints (``GET/PUT /api/v1/discovery/schedule``) stay
# wired up for back-compat — the worker also still polls the same table. These
# admin endpoints are a fully replicated CRUD surface that lets ops manage
# multiple schedules without touching SQL. Multi-row scheduling already works
# at the worker layer (``ForesightWorker._run_scheduled_discovery`` claims any
# enabled row whose ``next_run_at`` is past), so this router only needs to
# add the surface area, not rewire dispatch.

ALLOWED_SCHEDULE_CATEGORIES = (
    "rss",
    "news",
    "academic",
    "government",
    "tech_blog",
    "web_search",
)

ALLOWED_PILLAR_CODES = ("CH", "EW", "HG", "HH", "MC", "PS")


class AdminScheduleBase(BaseModel):
    """Common fields shared by create/update schedule payloads.

    Validates pillar codes and source-category names at the API edge so the
    DB never sees garbage. The pillar/category whitelists are intentionally
    duplicated here rather than imported from the analytics router so the
    admin surface keeps zero coupling to non-admin code.
    """

    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    enabled: Optional[bool] = None
    interval_hours: Optional[int] = Field(default=None, ge=1, le=168)
    max_search_queries_per_run: Optional[int] = Field(default=None, ge=1, le=200)
    pillars_to_scan: Optional[list[str]] = None
    process_rss_first: Optional[bool] = None
    next_run_at: Optional[datetime] = None
    cron_expression: Optional[str] = Field(default=None, max_length=100)
    timezone: Optional[str] = Field(default=None, max_length=64)
    categories_to_scan: Optional[list[str]] = None
    source_ids: Optional[list[str]] = None
    notes: Optional[str] = Field(default=None, max_length=500)


def _validate_schedule_lists(
    pillars: Optional[list[str]],
    categories: Optional[list[str]],
) -> None:
    """Reject pillar codes / category names that aren't in the whitelist.

    Pulled out so create + update share validation without re-implementing it.
    """
    if pillars is not None:
        unknown = [p for p in pillars if p not in ALLOWED_PILLAR_CODES]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown pillar codes: {unknown}. "
                    f"Allowed: {list(ALLOWED_PILLAR_CODES)}"
                ),
            )
    if categories is not None:
        unknown = [c for c in categories if c not in ALLOWED_SCHEDULE_CATEGORIES]
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown source categories: {unknown}. "
                    f"Allowed: {list(ALLOWED_SCHEDULE_CATEGORIES)}"
                ),
            )


class AdminScheduleCreate(AdminScheduleBase):
    """Body for ``POST /admin/discovery/schedules``.

    ``name`` is required for create (sub-classes Optional in the base for
    PATCH ergonomics, so we re-tighten here).
    """

    name: str = Field(min_length=1, max_length=120)


class AdminScheduleUpdate(AdminScheduleBase):
    """Body for ``PATCH /admin/discovery/schedules/{id}``.

    All fields optional — only the ones present in the JSON body are
    written. Empty body is rejected at the route so the audit log doesn't
    pick up no-op updates.
    """


def _serialize_schedule(row: dict[str, Any]) -> dict[str, Any]:
    """Normalize a discovery_schedule row for the JSON response.

    Keeps the shape stable even on rows from the v1 schema that don't yet
    have the columns added in 20260509000002.
    """
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "enabled": bool(row.get("enabled")),
        "interval_hours": row.get("interval_hours") or 24,
        "max_search_queries_per_run": row.get("max_search_queries_per_run") or 20,
        "pillars_to_scan": row.get("pillars_to_scan") or [],
        "process_rss_first": bool(row.get("process_rss_first", True)),
        "cron_expression": row.get("cron_expression"),
        "timezone": row.get("timezone"),
        "next_run_at": row.get("next_run_at"),
        "last_run_at": row.get("last_run_at"),
        "last_run_status": row.get("last_run_status"),
        "last_run_summary": row.get("last_run_summary"),
        "categories_to_scan": row.get("categories_to_scan") or [],
        "source_ids": row.get("source_ids") or [],
        "notes": row.get("notes"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@router.get("/admin/discovery/schedules")
async def list_admin_schedules(
    current_user: dict = Depends(get_current_user),
):
    """Return every discovery schedule (enabled + disabled).

    The response is a flat list — admins typically have a handful of
    schedules at most, so we don't bother paginating.
    """
    require_admin(current_user)

    def load() -> dict[str, Any]:
        rows = (
            supabase.table("discovery_schedule")
            .select("*")
            .order("created_at", desc=False)
            .limit(200)
            .execute()
            .data
            or []
        )
        return {
            "items": [_serialize_schedule(r) for r in rows],
            "total": len(rows),
        }

    try:
        return await asyncio.to_thread(load)
    except Exception as e:
        logger.exception("Failed to list discovery schedules")
        raise HTTPException(status_code=500, detail=_safe_error("list discovery schedules", e))


def _coerce_schedule_payload(body: AdminScheduleBase) -> dict[str, Any]:
    """Convert the Pydantic body into a dict suitable for Supabase.

    ``next_run_at`` is a ``datetime`` on the model so FastAPI parses ISO 8601
    cleanly, but Supabase wants a string. ``source_ids`` arrives as strings
    (UUIDs) and we leave them as-is — Supabase handles the cast on insert.
    """
    payload = body.model_dump(exclude_none=True)
    if "next_run_at" in payload and isinstance(payload["next_run_at"], datetime):
        payload["next_run_at"] = payload["next_run_at"].isoformat()
    return payload


@router.post(
    "/admin/discovery/schedules", status_code=status.HTTP_201_CREATED
)
async def create_admin_schedule(
    request: Request,
    body: AdminScheduleCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new discovery schedule row.

    The worker will pick the row up on its next polling cycle if
    ``enabled=true`` and ``next_run_at`` is in the past or unset.
    """
    require_admin(current_user)
    _validate_schedule_lists(body.pillars_to_scan, body.categories_to_scan)

    def insert_row() -> dict[str, Any]:
        payload = _coerce_schedule_payload(body)
        # Default next_run_at to "now + interval" if the caller didn't set it,
        # so a freshly-created enabled schedule actually fires.
        if "next_run_at" not in payload:
            interval = payload.get("interval_hours") or 24
            payload["next_run_at"] = (
                datetime.now(timezone.utc) + timedelta(hours=interval)
            ).isoformat()
        result = (
            supabase.table("discovery_schedule").insert(payload).execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(
                status_code=500, detail="Failed to create schedule"
            )
        return rows[0]

    try:
        row = await asyncio.to_thread(insert_row)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to create discovery schedule")
        raise HTTPException(status_code=500, detail=_safe_error("create discovery schedule", e))

    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.schedule.create",
        target_type="schedule",
        target_id=str(row.get("id")),
        before=None,
        after=_serialize_schedule(row),
        request=request,
    )
    return _serialize_schedule(row)


@router.patch("/admin/discovery/schedules/{schedule_id}")
async def update_admin_schedule(
    request: Request,
    schedule_id: str,
    body: AdminScheduleUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Patch an existing discovery schedule.

    Only fields present in the JSON body are written; everything else stays
    at the row's current value. Empty bodies are rejected so each audit-log
    entry corresponds to a real change.
    """
    require_admin(current_user)
    _validate_schedule_lists(body.pillars_to_scan, body.categories_to_scan)

    payload = _coerce_schedule_payload(body)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")

    def patch_row() -> tuple[dict[str, Any], dict[str, Any]]:
        existing = (
            supabase.table("discovery_schedule")
            .select("*")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Schedule not found")
        before_row = copy.deepcopy(existing[0])
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("discovery_schedule")
            .update(payload)
            .eq("id", schedule_id)
            .execute()
        )
        rows = result.data or []
        if not rows:
            raise HTTPException(
                status_code=500, detail="Failed to update schedule"
            )
        return before_row, rows[0]

    try:
        before, after = await asyncio.to_thread(patch_row)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to update discovery schedule")
        raise HTTPException(status_code=500, detail=_safe_error("update discovery schedule", e))

    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.schedule.update",
        target_type="schedule",
        target_id=schedule_id,
        before=_serialize_schedule(before),
        after=_serialize_schedule(after),
        request=request,
    )
    return _serialize_schedule(after)


@router.delete(
    "/admin/discovery/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_admin_schedule(
    request: Request,
    schedule_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a discovery schedule.

    Past discovery_runs and discovered_sources are unaffected — only the
    schedule row is removed. The audit row's ``before`` snapshot is what
    operators use to recover deleted schedules from the audit log if needed.
    """
    require_admin(current_user)

    def remove_row() -> dict[str, Any]:
        existing = (
            supabase.table("discovery_schedule")
            .select("*")
            .eq("id", schedule_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Schedule not found")
        before_row = copy.deepcopy(existing[0])
        (
            supabase.table("discovery_schedule")
            .delete()
            .eq("id", schedule_id)
            .execute()
        )
        return before_row

    try:
        before = await asyncio.to_thread(remove_row)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Failed to delete discovery schedule")
        raise HTTPException(status_code=500, detail=_safe_error("delete discovery schedule", e))

    from app.routers.admin import _log_admin_action

    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.schedule.delete",
        target_type="schedule",
        target_id=schedule_id,
        before=_serialize_schedule(before),
        after=None,
        request=request,
    )
    return None
