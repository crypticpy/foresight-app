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
from app.deps import get_current_user, limiter, supabase

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
        raise HTTPException(status_code=500, detail=str(e))


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
        raise HTTPException(status_code=500, detail=message)

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
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=500, detail=str(e))

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
