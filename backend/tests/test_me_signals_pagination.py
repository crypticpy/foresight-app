"""Tests for the paginated personal signals feed + stats split.

Covers the refactor of `/me/signals` from a single monolithic response into:
  - GET /me/signals          — paginated feed, pinned excluded from page body
  - GET /me/signals/stats    — counts-only, mirrors the same filters

Tests invoke the route handlers directly to avoid spinning up the full app,
following the pattern in test_lens_router.py.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import pytest

# Reset the artifacts cache between tests so fixture state can't leak via the
# global LRU.
from app.card_artifacts import _artifact_cache
from app.routers import card_subresources as cs


# ---------------------------------------------------------------------------
# Mock supabase chain
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: List[Dict[str, Any]], count: Optional[int] = None):
        self.data = data
        self.count = count


class _Query:
    """A toy query builder that records filters and returns canned rows.

    Only implements the subset of PostgREST chain calls the router uses.
    """

    def __init__(self, table_name: str, rows: List[Dict[str, Any]]):
        self.table_name = table_name
        self._rows = rows
        self._filters: Dict[str, Any] = {}
        self._in: Dict[str, set] = {}
        self._or: Optional[str] = None
        self._range: Optional[tuple] = None
        self._count_mode: Optional[str] = None
        self._order: List[tuple] = []
        self._gte: Dict[str, Any] = {}
        self._lt: Dict[str, Any] = {}

    def select(self, *_a, count: Optional[str] = None, **_kw):
        self._count_mode = count
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def in_(self, key, values):
        self._in[key] = set(values)
        return self

    def or_(self, expr):
        self._or = expr
        return self

    def order(self, key, desc=False):
        self._order.append((key, desc))
        return self

    def gte(self, key, value):
        self._gte[key] = value
        return self

    def lt(self, key, value):
        self._lt[key] = value
        return self

    def range(self, lo, hi):
        self._range = (lo, hi)
        return self

    def _apply_filters(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out = rows
        for k, v in self._filters.items():
            out = [r for r in out if r.get(k) == v]
        for k, allowed in self._in.items():
            out = [r for r in out if r.get(k) in allowed]
        for k, threshold in self._gte.items():
            out = [r for r in out if (r.get(k) or "") >= threshold]
        for k, threshold in self._lt.items():
            out = [r for r in out if (r.get(k) or 0) < threshold]
        return out

    def _apply_order(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        # Apply orders in reverse so the first .order() call dominates.
        for key, desc in reversed(self._order):
            rows = sorted(
                rows, key=lambda r: (r.get(key) is None, r.get(key)), reverse=desc
            )
        return rows

    def execute(self):
        filtered = self._apply_filters(list(self._rows))
        ordered = self._apply_order(filtered)
        total_count = len(ordered)
        if self._range is not None:
            lo, hi = self._range
            ordered = ordered[lo : hi + 1]
        return _Resp(ordered, count=total_count if self._count_mode else None)


class _Client:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]):
        self.tables = tables

    def table(self, name: str):
        return _Query(name, self.tables.get(name, []))

    def rpc(self, *_a, **_kw):
        # Trigger the non-RPC fallback path inside get_follower_counts.
        raise RuntimeError("rpc not available in tests")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

USER_ID = "user-1"


def _make_card(
    cid: str,
    *,
    name: str = "Card",
    pillar: str = "MC",
    horizon: str = "near",
    quality: int = 80,
    updated_at: str = "2026-05-15T00:00:00Z",
    status: str = "active",
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    return {
        "id": cid,
        "name": name,
        "pillar_id": pillar,
        "horizon": horizon,
        "signal_quality_score": quality,
        "updated_at": updated_at,
        "created_at": updated_at,
        "status": status,
        "created_by": created_by,
        "summary": f"summary for {cid}",
    }


@pytest.fixture(autouse=True)
def _clear_artifact_cache():
    _artifact_cache.clear()
    yield
    _artifact_cache.clear()


@pytest.fixture
def patch_supabase(monkeypatch):
    """Yield a function that swaps `cs.supabase` for a stub built from tables."""

    def install(tables: Dict[str, List[Dict[str, Any]]]):
        client = _Client(tables)
        monkeypatch.setattr(cs, "supabase", client)
        # The artifact + collab helpers reach for the module-level supabase
        # via their own imports; patch those too so they use the same stub.
        import app.card_artifacts as ca

        monkeypatch.setattr(ca, "_artifact_cache", _artifact_cache)
        return client

    return install


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


def _call_feed(**kwargs):
    """Invoke get_my_signals with sane defaults; mirrors the FastAPI Query
    defaults so we don't have to pass them in every test."""
    defaults = dict(
        sort_by="updated",
        search=None,
        pillar=None,
        horizon=None,
        source=None,
        quality_min=None,
        limit=cs.DEFAULT_SIGNALS_PAGE_LIMIT,
        offset=0,
        include_pinned=True,
        current_user={"id": USER_ID},
    )
    defaults.update(kwargs)
    return _run(cs.get_my_signals(**defaults))


def _call_stats(**kwargs):
    defaults = dict(
        search=None,
        pillar=None,
        horizon=None,
        source=None,
        quality_min=None,
        current_user={"id": USER_ID},
    )
    defaults.update(kwargs)
    return _run(cs.get_my_signals_stats(**defaults))


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_empty_state_returns_empty_lists(patch_supabase):
    patch_supabase({})
    result = _call_feed()
    assert result["signals"] == []
    assert result["pinned"] == []
    assert result["has_more"] is False
    assert result["next_offset"] == 0


def test_pinned_excluded_from_feed_and_returned_separately(patch_supabase):
    cards = [_make_card(f"c{i}", updated_at=f"2026-05-{20 - i:02d}T00:00:00Z") for i in range(5)]
    patch_supabase(
        {
            "cards": cards,
            "card_follows": [
                {"card_id": f"c{i}", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"}
                for i in range(5)
            ],
            "user_signal_preferences": [
                {"card_id": "c0", "is_pinned": True, "notes": None, "user_id": USER_ID},
                {"card_id": "c2", "is_pinned": True, "notes": "important", "user_id": USER_ID},
            ],
            "workstreams": [],
        }
    )
    result = _call_feed(limit=10)
    feed_ids = [s["id"] for s in result["signals"]]
    pinned_ids = [s["id"] for s in result["pinned"]]
    assert "c0" not in feed_ids and "c2" not in feed_ids, (
        "pinned signals must not appear in the paginated body"
    )
    assert set(pinned_ids) == {"c0", "c2"}
    # The "important" personal note must survive the personalize hop.
    pinned_by_id = {s["id"]: s for s in result["pinned"]}
    assert pinned_by_id["c2"]["personal_notes"] == "important"
    assert pinned_by_id["c2"]["is_pinned"] is True


def test_include_pinned_false_omits_pinned_payload(patch_supabase):
    patch_supabase(
        {
            "cards": [_make_card("c0")],
            "card_follows": [
                {"card_id": "c0", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
            ],
            "user_signal_preferences": [
                {"card_id": "c0", "is_pinned": True, "notes": None, "user_id": USER_ID},
            ],
            "workstreams": [],
        }
    )
    result = _call_feed(include_pinned=False)
    assert result["pinned"] is None, "load-more pages must not re-send pinned"


def test_pagination_has_more_flag(patch_supabase):
    # 5 followed cards, page size 2 → first page should report has_more.
    cards = [
        _make_card(f"c{i}", updated_at=f"2026-05-{20 - i:02d}T00:00:00Z")
        for i in range(5)
    ]
    patch_supabase(
        {
            "cards": cards,
            "card_follows": [
                {"card_id": f"c{i}", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"}
                for i in range(5)
            ],
            "workstreams": [],
        }
    )
    page1 = _call_feed(limit=2, offset=0)
    assert len(page1["signals"]) == 2
    assert page1["has_more"] is True
    assert page1["next_offset"] == 2

    page3 = _call_feed(limit=2, offset=4, include_pinned=False)
    assert len(page3["signals"]) == 1
    assert page3["has_more"] is False


def test_source_filter_followed(patch_supabase):
    patch_supabase(
        {
            "cards": [
                _make_card("c-follow"),
                _make_card("c-created", created_by=USER_ID),
            ],
            "card_follows": [
                {"card_id": "c-follow", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
            ],
            "workstreams": [],
        }
    )
    result = _call_feed(source="followed", limit=10)
    feed_ids = {s["id"] for s in result["signals"]}
    assert feed_ids == {"c-follow"}, (
        "source=followed must not surface user-created cards"
    )


def test_invalid_source_returns_400(patch_supabase):
    patch_supabase({})
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        _call_feed(source="not-a-thing")
    assert exc.value.status_code == 400


def test_stats_endpoint_counts_match_feed(patch_supabase):
    """stats.total must match the union of relationships, regardless of pagination."""
    patch_supabase(
        {
            "cards": [
                _make_card("c1", quality=10, updated_at="2026-05-15T00:00:00Z"),
                _make_card("c2", quality=50, updated_at="2026-05-15T00:00:00Z"),
                _make_card("c3", quality=80, updated_at="2026-01-01T00:00:00Z"),
            ],
            "card_follows": [
                {"card_id": "c1", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
                {"card_id": "c2", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
                {"card_id": "c3", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
            ],
            "workstreams": [],
        }
    )
    stats = _call_stats()
    assert stats["stats"]["total"] == 3
    assert stats["stats"]["followed_count"] == 3
    assert stats["stats"]["created_count"] == 0
    # quality<30 ⇒ c1 only
    assert stats["stats"]["needs_research"] == 1


def test_followed_sort_orders_by_follow_created_at(patch_supabase):
    patch_supabase(
        {
            "cards": [_make_card("c-old"), _make_card("c-new")],
            "card_follows": [
                {"card_id": "c-old", "user_id": USER_ID, "created_at": "2026-01-01T00:00:00Z"},
                {"card_id": "c-new", "user_id": USER_ID, "created_at": "2026-05-15T00:00:00Z"},
            ],
            "workstreams": [],
        }
    )
    result = _call_feed(sort_by="followed", limit=10)
    feed_ids = [s["id"] for s in result["signals"]]
    assert feed_ids == ["c-new", "c-old"], (
        "sort_by=followed must order by follow created_at desc"
    )
