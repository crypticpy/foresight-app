"""Unit tests for the admin discovery source catalog endpoints.

Covers:
- ``list_admin_sources`` joins registry rows with last-7d health stats from
  ``discovered_sources``.
- ``create_admin_source`` validates URL presence, runs RSS HEAD validation,
  inserts, and writes an audit log row.
- ``update_admin_source`` returns 404 for missing IDs, audits before/after.
- ``delete_admin_source`` removes the row and audits the prior state.
- The ``(category, url)`` UNIQUE collision surfaces as 409, not 500.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock supabase chain
# ---------------------------------------------------------------------------


class _MockResponse:
    def __init__(
        self,
        data: Optional[List[Dict[str, Any]]] = None,
        count: Optional[int] = None,
    ) -> None:
        self.data = data or []
        self.count = count


class _MockTable:
    def __init__(
        self,
        rows: List[Dict[str, Any]],
        sink: Dict[str, List[Dict[str, Any]]],
        table_name: str,
    ) -> None:
        self._rows = rows
        self._sink = sink
        self._table_name = table_name
        self._mode: str = "select"
        self._payload: Optional[Dict[str, Any]] = None
        self._filters: Dict[str, Any] = {}
        self._gte: Dict[str, Any] = {}
        self._order: list[tuple[str, bool]] = []

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def insert(self, payload: Dict[str, Any]):
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload: Dict[str, Any]):
        self._mode = "update"
        self._payload = payload
        return self

    def delete(self):
        self._mode = "delete"
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def gte(self, key, value):
        self._gte[key] = value
        return self

    def order(self, key, desc=False):
        self._order.append((key, desc))
        return self

    def limit(self, *_a, **_kw):
        return self

    def execute(self) -> _MockResponse:
        if self._mode == "insert":
            payload = dict(self._payload or {})
            payload.setdefault("id", str(uuid.uuid4()))
            self._rows.append(payload)
            self._sink.setdefault(self._table_name, []).append(payload)
            # Force a UNIQUE collision on (category, url) the second time.
            cat_urls = [
                (row.get("category"), row.get("url"))
                for row in self._rows
                if row.get("url") is not None
            ]
            if (
                payload.get("url")
                and cat_urls.count((payload["category"], payload["url"])) > 1
            ):
                raise RuntimeError(
                    "duplicate key value violates unique constraint"
                )
            return _MockResponse([payload])

        if self._mode == "update":
            updated: List[Dict[str, Any]] = []
            for row in self._rows:
                if all(row.get(k) == v for k, v in self._filters.items()):
                    row.update(self._payload or {})
                    updated.append(row)
            return _MockResponse(updated)

        if self._mode == "delete":
            kept: List[Dict[str, Any]] = []
            removed: List[Dict[str, Any]] = []
            for row in self._rows:
                if all(row.get(k) == v for k, v in self._filters.items()):
                    removed.append(row)
                else:
                    kept.append(row)
            self._rows[:] = kept
            return _MockResponse(removed)

        # select
        out = []
        for row in self._rows:
            if all(row.get(k) == v for k, v in self._filters.items()):
                if all(
                    (row.get(k) or "") >= v for k, v in self._gte.items()
                ):
                    out.append(row)
        return _MockResponse(out, count=len(out))


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables
        self.sink: Dict[str, List[Dict[str, Any]]] = {}

    def table(self, name: str) -> _MockTable:
        return _MockTable(
            self._tables.setdefault(name, []),
            self.sink,
            name,
        )


def _mock_request() -> Any:
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        state=SimpleNamespace(),
        scope={"type": "http"},
        method="POST",
        headers={},
    )


def _bypass_admin(monkeypatch):
    from app import authz

    monkeypatch.setattr(authz, "require_admin", lambda user: None)


def _disable_rate_limiter(monkeypatch):
    from app.deps import limiter

    monkeypatch.setattr(limiter, "enabled", False)


def _patch_supabase(monkeypatch, mock_sb):
    """Patch supabase in every module that touches the registry / audit log."""
    from app import audit_service
    from app.routers import admin_discovery_sources as admin_discovery

    # Source CRUD endpoints live in the ``admin_discovery_sources``
    # sub-router. ``admin.py`` is now a pure aggregator with no
    # ``supabase`` binding, so we patch the sub-router + audit_service.
    monkeypatch.setattr(admin_discovery, "supabase", mock_sb)
    # audit_service holds its own ``supabase`` reference (the audit insert
    # was extracted out of admin.py); patch it too so audit rows land in the
    # same mock as the primary mutation.
    monkeypatch.setattr(audit_service, "supabase", mock_sb)


def _stub_rss_validator(monkeypatch):
    """Skip the live HEAD probe — we test validation separately."""
    from app.routers import admin_discovery_sources as admin_discovery

    async def _ok(_url: str) -> None:
        return None

    monkeypatch.setattr(admin_discovery, "_validate_rss_url", _ok)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_list_sources_joins_health_stats(monkeypatch):
    from app.routers import admin_discovery_sources as admin_discovery

    source_id = str(uuid.uuid4())
    rss_url = "https://example.com/feed"
    # Single "now" reference so all three mock rows share one anchor and a
    # midnight-rollover during fixture construction can't shift one row's day
    # relative to the others.
    now = datetime.now(timezone.utc)
    tables = {
        "discovery_sources_registry": [
            {
                "id": source_id,
                "category": "rss",
                "name": "Example",
                "url": rss_url,
                "enabled": True,
                "weight": 1.0,
                "config": {},
            }
        ],
        # Anchor the mock rows to "now" so all three fall inside the rolling
        # 7-day window the production query uses (>= now() - 7 days). Fixed
        # date literals drift outside the window after a week and turn this
        # test into a date-relative flake.
        "discovered_sources": [
            {
                "url": rss_url,
                "triage_is_relevant": True,
                "created_at": (now - timedelta(days=2)).isoformat(),
            },
            {
                "url": rss_url,
                "triage_is_relevant": True,
                "created_at": (now - timedelta(days=1)).isoformat(),
            },
            {
                "url": rss_url,
                "triage_is_relevant": False,
                "created_at": (now - timedelta(days=1)).isoformat(),
            },
        ],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.list_admin_sources(current_user=actor)
    )

    assert result["total"] == 1
    item = result["items"][0]
    assert item["id"] == source_id
    assert item["items_7d"] == 3
    assert item["passed_7d"] == 2
    assert item["accept_rate_7d"] == round(2 / 3, 4)


def test_create_rss_source_writes_audit_row(monkeypatch):
    from app.routers import admin_discovery_sources as admin_discovery

    actor_id = str(uuid.uuid4())
    actor = {"id": actor_id, "email": "admin@example.com", "role": "admin"}

    tables = {"discovery_sources_registry": [], "admin_audit_log": []}
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)
    _stub_rss_validator(monkeypatch)

    body = admin_discovery.AdminSourceCreate(
        category="rss",
        name="Test Feed",
        url="https://example.com/feed.xml",
        enabled=True,
        weight=1.0,
    )

    row = asyncio.run(
        admin_discovery.create_admin_source(
            request=_mock_request(), body=body, current_user=actor
        )
    )

    assert row["category"] == "rss"
    assert row["name"] == "Test Feed"
    assert row["url"] == "https://example.com/feed.xml"
    assert row["created_by"] == actor_id

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 1
    audit = audit_rows[0]
    assert audit["action"] == "admin.source.create"
    assert audit["target_type"] == "source"
    assert audit["target_id"] == row["id"]
    assert audit["before"] is None
    assert audit["after"]["url"] == row["url"]


def test_create_source_rejects_missing_url(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery_sources as admin_discovery

    actor = {"id": str(uuid.uuid4()), "email": "a@example.com", "role": "admin"}
    mock_sb = _MockSupabase({"discovery_sources_registry": []})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)

    body = admin_discovery.AdminSourceCreate(
        category="rss", name="Missing URL", url=None
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            admin_discovery.create_admin_source(
                request=_mock_request(), body=body, current_user=actor
            )
        )
    assert exc_info.value.status_code == 400


def test_create_web_search_allows_null_url(monkeypatch):
    """``web_search`` rows store their query in ``config``; URL is optional."""
    from app.routers import admin_discovery_sources as admin_discovery

    actor = {"id": str(uuid.uuid4()), "email": "a@example.com", "role": "admin"}
    mock_sb = _MockSupabase(
        {"discovery_sources_registry": [], "admin_audit_log": []}
    )
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)

    body = admin_discovery.AdminSourceCreate(
        category="web_search",
        name="Austin smart-city query",
        url=None,
        config={"query": "site:austintexas.gov smart city"},
    )
    row = asyncio.run(
        admin_discovery.create_admin_source(
            request=_mock_request(), body=body, current_user=actor
        )
    )
    assert row["url"] is None
    assert row["config"]["query"] == "site:austintexas.gov smart city"


def test_create_duplicate_returns_409(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery_sources as admin_discovery

    actor = {"id": str(uuid.uuid4()), "email": "a@example.com", "role": "admin"}
    mock_sb = _MockSupabase(
        {
            "discovery_sources_registry": [
                {
                    "id": str(uuid.uuid4()),
                    "category": "rss",
                    "url": "https://example.com/feed.xml",
                    "name": "Existing",
                }
            ],
            "admin_audit_log": [],
        }
    )
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)
    _stub_rss_validator(monkeypatch)

    body = admin_discovery.AdminSourceCreate(
        category="rss",
        name="Duplicate",
        url="https://example.com/feed.xml",
    )
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            admin_discovery.create_admin_source(
                request=_mock_request(), body=body, current_user=actor
            )
        )
    assert exc_info.value.status_code == 409


def test_update_source_audits_before_after(monkeypatch):
    from app.routers import admin_discovery_sources as admin_discovery

    source_id = str(uuid.uuid4())
    actor = {"id": str(uuid.uuid4()), "email": "a@example.com", "role": "admin"}
    mock_sb = _MockSupabase(
        {
            "discovery_sources_registry": [
                {
                    "id": source_id,
                    "category": "rss",
                    "name": "Old name",
                    "url": "https://example.com/feed",
                    "enabled": True,
                    "weight": 1.0,
                }
            ],
            "admin_audit_log": [],
        }
    )
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)

    body = admin_discovery.AdminSourceUpdate(name="New name", enabled=False)
    row = asyncio.run(
        admin_discovery.update_admin_source(
            request=_mock_request(),
            source_id=source_id,
            body=body,
            current_user=actor,
        )
    )
    assert row["name"] == "New name"
    assert row["enabled"] is False

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 1
    audit = audit_rows[0]
    assert audit["before"]["name"] == "Old name"
    assert audit["after"]["name"] == "New name"
    assert audit["before"]["enabled"] is True
    assert audit["after"]["enabled"] is False


def test_update_missing_source_returns_404(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery_sources as admin_discovery

    actor = {"id": str(uuid.uuid4()), "email": "a@example.com", "role": "admin"}
    mock_sb = _MockSupabase({"discovery_sources_registry": []})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)

    body = admin_discovery.AdminSourceUpdate(enabled=False)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            admin_discovery.update_admin_source(
                request=_mock_request(),
                source_id=str(uuid.uuid4()),
                body=body,
                current_user=actor,
            )
        )
    assert exc_info.value.status_code == 404


def test_delete_source_removes_row_and_audits(monkeypatch):
    from app.routers import admin_discovery_sources as admin_discovery

    source_id = str(uuid.uuid4())
    actor = {"id": str(uuid.uuid4()), "email": "a@example.com", "role": "admin"}
    mock_sb = _MockSupabase(
        {
            "discovery_sources_registry": [
                {
                    "id": source_id,
                    "category": "rss",
                    "name": "To delete",
                    "url": "https://gone.example.com/feed",
                }
            ],
            "admin_audit_log": [],
        }
    )
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _disable_rate_limiter(monkeypatch)

    asyncio.run(
        admin_discovery.delete_admin_source(
            request=_mock_request(), source_id=source_id, current_user=actor
        )
    )

    rows = mock_sb._tables["discovery_sources_registry"]
    assert all(row["id"] != source_id for row in rows)

    audit_rows = mock_sb.sink.get("admin_audit_log", [])
    assert len(audit_rows) == 1
    assert audit_rows[0]["action"] == "admin.source.delete"
    assert audit_rows[0]["before"]["name"] == "To delete"
    assert audit_rows[0]["after"] is None


# ---------------------------------------------------------------------------
# load_active_source_urls — registry > defaults > [] fallback
# ---------------------------------------------------------------------------


def test_load_active_source_urls_reads_registry(monkeypatch):
    from app import deps
    from app import discovery_service

    rows = [
        {"url": "https://feed-a.example.com/rss", "category": "rss", "enabled": True},
        {"url": "https://feed-b.example.com/rss", "category": "rss", "enabled": True},
    ]
    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase({"discovery_sources_registry": rows}),
    )
    urls = discovery_service.load_active_source_urls("rss")
    assert urls == [
        "https://feed-a.example.com/rss",
        "https://feed-b.example.com/rss",
    ]


def test_load_active_source_urls_falls_back_to_defaults(monkeypatch):
    """Empty registry must not silently kill the RSS fetcher; cold-boot
    safety means we still return DEFAULT_RSS_FEEDS until the migration
    seeds rows."""
    from app import deps
    from app import discovery_service

    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase({"discovery_sources_registry": []}),
    )
    urls = discovery_service.load_active_source_urls("rss")
    assert urls == discovery_service.DEFAULT_RSS_FEEDS


def test_load_active_source_urls_returns_empty_when_all_disabled(monkeypatch):
    """If the operator has registered RSS rows but flipped every one off,
    honor that: do NOT silently revert to DEFAULT_RSS_FEEDS, because that
    would re-enable feeds the operator just disabled."""
    from app import deps
    from app import discovery_service

    rows = [
        {"url": "https://feed-a.example.com/rss", "category": "rss", "enabled": False},
        {"url": "https://feed-b.example.com/rss", "category": "rss", "enabled": False},
    ]
    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase({"discovery_sources_registry": rows}),
    )
    assert discovery_service.load_active_source_urls("rss") == []


def test_load_active_source_urls_other_category_returns_empty(monkeypatch):
    """Non-RSS categories have no in-code fallback yet; an empty registry
    just means the corresponding fetcher will skip its custom-URL list."""
    from app import deps
    from app import discovery_service

    monkeypatch.setattr(
        deps,
        "supabase",
        _MockSupabase({"discovery_sources_registry": []}),
    )
    assert discovery_service.load_active_source_urls("news") == []


def test_load_active_source_urls_swallows_supabase_errors(monkeypatch):
    """Discovery must not crash when supabase is unreachable — fall back
    to defaults for RSS, [] for everything else."""
    from app import deps
    from app import discovery_service

    class _Boom:
        def table(self, _name):
            raise RuntimeError("boom")

    monkeypatch.setattr(deps, "supabase", _Boom())
    assert discovery_service.load_active_source_urls("rss") == (
        discovery_service.DEFAULT_RSS_FEEDS
    )
    assert discovery_service.load_active_source_urls("news") == []


def test_build_discovery_config_overlays_registry_rss(monkeypatch):
    """``build_discovery_config`` must replace the seeded RSS list with
    whatever the registry says is enabled — that's the whole point of the
    catalog. Without this, toggling a feed off in the UI would have no
    effect on the next run."""
    # Patch on ``discovery_config`` — PR-D1 moved
    # ``load_discovery_admin_overrides`` / ``load_active_source_urls`` there,
    # and that's where ``build_discovery_config`` looks them up. Patching
    # the back-compat alias on ``discovery_service`` wouldn't intercept.
    from app import discovery_config, discovery_service

    monkeypatch.setattr(
        discovery_config, "load_discovery_admin_overrides", lambda: {}
    )
    monkeypatch.setattr(
        discovery_config,
        "load_active_source_urls",
        lambda category: ["https://only-this.example.com/feed"]
        if category == "rss"
        else [],
    )
    cfg = discovery_service.build_discovery_config()
    rss_cat = cfg.source_categories[discovery_service.SourceCategory.RSS.value]
    assert rss_cat.rss_feeds == ["https://only-this.example.com/feed"]


def test_build_discovery_config_honors_all_rss_disabled(monkeypatch):
    """When the registry is seeded but every RSS row is disabled,
    ``load_active_source_urls`` returns ``[]``. ``build_discovery_config``
    must honor that operator choice by emptying the feed list AND turning the
    RSS category off — otherwise ``DiscoveryConfig.__post_init__``'s
    ``DEFAULT_RSS_FEEDS`` keep the fetcher running against the very URLs the
    operator just turned off.
    """
    from app import discovery_config, discovery_service

    monkeypatch.setattr(
        discovery_config, "load_discovery_admin_overrides", lambda: {}
    )
    # Seeded-but-all-disabled returns []. ``load_active_source_urls`` will only
    # return [] for RSS in that exact case — the unseeded path falls back to
    # DEFAULT_RSS_FEEDS, so this signal is unambiguous.
    monkeypatch.setattr(
        discovery_config,
        "load_active_source_urls",
        lambda category: [],
    )
    cfg = discovery_service.build_discovery_config()
    rss_cat = cfg.source_categories[discovery_service.SourceCategory.RSS.value]
    assert rss_cat.rss_feeds == []
    assert rss_cat.enabled is False
