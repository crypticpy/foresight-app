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


class _RpcResult:
    """Mimics supabase-py's RPC builder: `.execute().data` returns the payload."""

    def __init__(self, data: Any):
        self._data = data

    def execute(self):
        return _Resp(self._data)


class _Client:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]):
        self.tables = tables
        # Capture every RPC call so tests can assert that the URL-bypassing
        # RPC path was taken instead of `.in_("id", [...])`.
        self.rpc_calls: List[tuple[str, Dict[str, Any]]] = []

    def table(self, name: str):
        return _Query(name, self.tables.get(name, []))

    def rpc(self, name: str = "", params: Optional[Dict[str, Any]] = None):
        self.rpc_calls.append((name, params or {}))
        if name == "me_signals_counts":
            return _RpcResult(self._compute_counts(params or {}))
        if name == "me_signals_feed_page":
            return _RpcResult(self._compute_feed_page(params or {}))
        if name == "me_signals_filter_ids":
            return _RpcResult(self._compute_filter_ids(params or {}))
        # Trigger the non-RPC fallback path inside get_follower_counts (and
        # any other helper that gracefully degrades when its RPC is absent).
        raise RuntimeError(f"rpc '{name}' not available in tests")

    def _apply_card_filters(
        self,
        card_ids: List[str],
        search: Optional[str],
        pillar: Optional[str],
        horizon: Optional[str],
        quality_min: Optional[int],
    ) -> List[Dict[str, Any]]:
        cards = self.tables.get("cards", [])
        card_set = set(card_ids or [])
        out = [c for c in cards if c.get("id") in card_set and c.get("status") == "active"]
        if search:
            s = search.lower()
            out = [
                c for c in out
                if s in (c.get("name") or "").lower()
                or s in (c.get("summary") or "").lower()
            ]
        if pillar:
            out = [c for c in out if c.get("pillar_id") == pillar]
        if horizon:
            out = [c for c in out if c.get("horizon") == horizon]
        if quality_min is not None and quality_min > 0:
            out = [c for c in out if (c.get("signal_quality_score") or 0) >= quality_min]
        return out

    def _compute_counts(self, p: Dict[str, Any]) -> Dict[str, int]:
        rows = self._apply_card_filters(
            p.get("p_card_ids") or [],
            p.get("p_search"),
            p.get("p_pillar"),
            p.get("p_horizon"),
            p.get("p_quality_min"),
        )
        followed_set = set(p.get("p_followed_ids") or [])
        created_set = set(p.get("p_created_ids") or [])
        threshold = p.get("p_needs_research_threshold") or 0
        one_week_ago = p.get("p_one_week_ago") or ""
        return {
            "total": len(rows),
            "updates_this_week": sum(
                1 for r in rows if (r.get("updated_at") or "") >= one_week_ago
            ),
            "needs_research": sum(
                1 for r in rows if (r.get("signal_quality_score") or 0) < threshold
            ),
            "followed_count": sum(1 for r in rows if r.get("id") in followed_set),
            "created_count": sum(1 for r in rows if r.get("id") in created_set),
        }

    def _compute_feed_page(self, p: Dict[str, Any]) -> List[Dict[str, Any]]:
        rows = self._apply_card_filters(
            p.get("p_card_ids") or [],
            p.get("p_search"),
            p.get("p_pillar"),
            p.get("p_horizon"),
            p.get("p_quality_min"),
        )
        sort_by = p.get("p_sort_by") or "updated"
        # Apply tiebreaker first (stable sort = primary key applied last wins).
        rows = sorted(rows, key=lambda r: r.get("id") or "", reverse=True)
        if sort_by == "quality":
            rows = sorted(
                rows,
                key=lambda r: (
                    r.get("signal_quality_score") is None,
                    -(r.get("signal_quality_score") or 0),
                ),
            )
        elif sort_by == "name":
            rows = sorted(rows, key=lambda r: r.get("id") or "")
            rows = sorted(rows, key=lambda r: r.get("name") or "")
        else:  # updated (default)
            rows = sorted(rows, key=lambda r: r.get("updated_at") or "", reverse=True)
        offset = p.get("p_offset") or 0
        limit = p.get("p_limit") or 0
        return rows[offset : offset + limit]

    def _compute_filter_ids(self, p: Dict[str, Any]) -> List[Dict[str, str]]:
        rows = self._apply_card_filters(
            p.get("p_card_ids") or [],
            p.get("p_search"),
            p.get("p_pillar"),
            p.get("p_horizon"),
            p.get("p_quality_min"),
        )
        return [{"id": r.get("id")} for r in rows if r.get("id")]


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
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


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


def test_followed_sort_filters_before_slice(patch_supabase):
    """Regression for the "filter before slice" fix on the followed-sort path.

    The first two followed cards (by recency) are pillar=CH and should NOT
    appear when the caller filters to pillar=MC. If filtering happened AFTER
    the slice, page-1 (limit=2) of the followed order would be ['c-ch-new',
    'c-ch-old'], both get dropped, the page comes back empty, and `has_more`
    is wrongly False. The fix slices the FILTERED followed order, so page-1
    should return ['c-mc-new', 'c-mc-old'] with `has_more=False`.
    """
    patch_supabase(
        {
            "cards": [
                _make_card("c-ch-new", pillar="CH"),
                _make_card("c-ch-old", pillar="CH"),
                _make_card("c-mc-new", pillar="MC"),
                _make_card("c-mc-old", pillar="MC"),
            ],
            "card_follows": [
                # Order by followed_at desc: ch-new, mc-new, ch-old, mc-old.
                # An unfiltered page-1 of size 2 would be [ch-new, ch-old]
                # (after re-sorting the slice), both of which would be
                # filtered out by pillar=MC if filters ran after the slice.
                {"card_id": "c-ch-new", "user_id": USER_ID, "created_at": "2026-05-15T00:00:00Z"},
                {"card_id": "c-mc-new", "user_id": USER_ID, "created_at": "2026-05-14T00:00:00Z"},
                {"card_id": "c-ch-old", "user_id": USER_ID, "created_at": "2026-05-13T00:00:00Z"},
                {"card_id": "c-mc-old", "user_id": USER_ID, "created_at": "2026-05-12T00:00:00Z"},
            ],
            "workstreams": [],
        }
    )

    page1 = _call_feed(sort_by="followed", pillar="MC", limit=2, offset=0)
    feed_ids = [s["id"] for s in page1["signals"]]
    assert feed_ids == ["c-mc-new", "c-mc-old"], (
        "filtering must be applied before slicing on the followed-sort path"
    )
    # Only two MC follows total ⇒ has_more must be False, not "more on next page".
    assert page1["has_more"] is False
    assert page1["next_offset"] == 2


def test_stats_followed_and_created_counts_are_filter_aware(patch_supabase):
    """followed_count + created_count must honor the active filter set.

    Otherwise /me/signals/stats can report `total < followed_count` (or
    `created_count`), which breaks the StatsRow's "matches the feed body"
    contract and confuses the user when a pillar filter is active.
    """
    patch_supabase(
        {
            "cards": [
                _make_card("c-ch-1", pillar="CH"),
                _make_card("c-mc-1", pillar="MC"),
                _make_card("c-mc-2", pillar="MC", created_by=USER_ID),
                # Archived card: must not be counted even when followed.
                _make_card("c-archived", pillar="MC", status="archived"),
            ],
            "card_follows": [
                {"card_id": "c-ch-1", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
                {"card_id": "c-mc-1", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
                {"card_id": "c-mc-2", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
                {"card_id": "c-archived", "user_id": USER_ID, "created_at": "2026-05-10T00:00:00Z"},
            ],
            "workstreams": [],
        }
    )
    # No filter: all 3 active cards count.
    unfiltered = _call_stats()
    assert unfiltered["stats"]["total"] == 3
    assert unfiltered["stats"]["followed_count"] == 3
    assert unfiltered["stats"]["created_count"] == 1

    # pillar=MC: only c-mc-1 + c-mc-2 are active+MC; c-archived is excluded.
    filtered = _call_stats(pillar="MC")
    assert filtered["stats"]["total"] == 2
    assert filtered["stats"]["followed_count"] == 2, (
        "followed_count must exclude cards filtered out by pillar"
    )
    assert filtered["stats"]["created_count"] == 1, (
        "created_count must exclude cards filtered out by pillar"
    )


def test_stats_uses_rpc_not_url_in_filter(patch_supabase):
    """Regression: stats must call me_signals_counts (POST body) instead of
    `.in_("id", filtered_ids)` (GET URL). With ~300 followed cards the URL
    encoding of `id=in.(<UUIDs>)` exceeds Cloudflare's ~8KB limit and returns
    HTML 400 that postgrest can't parse — see request_id 5d2a2767-... in prod.
    """
    cards = [_make_card(f"c{i}", quality=80) for i in range(300)]
    follows = [
        {
            "card_id": f"c{i}",
            "user_id": USER_ID,
            "created_at": "2026-05-10T00:00:00Z",
        }
        for i in range(300)
    ]
    client = patch_supabase(
        {"cards": cards, "card_follows": follows, "workstreams": []}
    )

    stats = _call_stats()

    assert stats["stats"]["total"] == 300
    assert stats["stats"]["followed_count"] == 300
    counts_calls = [c for c in client.rpc_calls if c[0] == "me_signals_counts"]
    assert counts_calls, "stats handler must hit the me_signals_counts RPC"
    # The ID array travels in the JSON body — never URL-encoded as id=in.(...).
    assert len(counts_calls[0][1].get("p_card_ids", [])) == 300


def test_feed_updated_sort_uses_rpc(patch_supabase):
    """Regression: feed updated/quality/name sorts must call
    me_signals_feed_page instead of `.in_("id", ids)` for the same URL-limit
    reason as stats. Without this, /me/signals?sort_by=updated 500s for users
    with ~300 cards.
    """
    cards = [
        _make_card(f"c{i}", updated_at=f"2026-05-{(i % 28) + 1:02d}T00:00:00Z")
        for i in range(120)
    ]
    follows = [
        {
            "card_id": f"c{i}",
            "user_id": USER_ID,
            "created_at": "2026-05-10T00:00:00Z",
        }
        for i in range(120)
    ]
    client = patch_supabase(
        {"cards": cards, "card_follows": follows, "workstreams": []}
    )

    result = _call_feed(sort_by="updated", limit=10)

    assert len(result["signals"]) == 10
    page_calls = [c for c in client.rpc_calls if c[0] == "me_signals_feed_page"]
    assert page_calls, "feed handler must hit the me_signals_feed_page RPC"
    rpc_params = page_calls[0][1]
    assert rpc_params.get("p_sort_by") == "updated"
    # Feed asks for limit+1 to detect has_more; just confirm it's bounded.
    assert rpc_params.get("p_limit") <= 12
    assert len(rpc_params.get("p_card_ids", [])) == 120
