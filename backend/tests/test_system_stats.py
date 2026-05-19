"""Unit tests for the ``GET /analytics/system-stats`` endpoint.

Pins the two PR-A3 fixes:
1. Distribution queries that select raw rows now route through
   ``fetch_all_paginated`` so the rollup doesn't silently undercount past
   PostgREST's ~1000-row page cap.
2. The per-pillar velocity average uses ``is not None`` (not truthy) so a
   card with ``velocity_score == 0`` is included as a legitimate data
   point rather than excluded — the old truthy gate biased every
   pillar average upward whenever a real zero-velocity row existed.

The mock supabase chain mirrors the one in ``test_lens_overview.py``.
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.analytics_pagination import (  # noqa: E402
    fetch_all_paginated as _real_fetch_all_paginated,
)


# ---------------------------------------------------------------------------
# Mock supabase chain — same shape as test_lens_overview's mock.
# ---------------------------------------------------------------------------


class _MockResponse:
    def __init__(
        self,
        data: Optional[List[Dict[str, Any]]] = None,
        total: Optional[int] = None,
    ) -> None:
        self.data = data or []
        # When the caller used ``count="exact"``, ``count`` reflects the
        # unpaginated total; otherwise it's just len(data).
        self.count = total if total is not None else len(self.data)


class _MockTable:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows
        self._eq: Dict[str, Any] = {}
        self._gte: Dict[str, Any] = {}
        self._range: Optional[tuple] = None
        self._limit: Optional[int] = None
        self._count_exact = False

    def select(self, *_a, **kw):
        if kw.get("count") == "exact":
            self._count_exact = True
        return self

    def eq(self, key, value):
        self._eq[key] = value
        return self

    def gte(self, key, value):
        self._gte[key] = value
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def in_(self, key, values):
        self._eq[key] = ("__in__", set(values))
        return self

    def execute(self) -> _MockResponse:
        out = []
        for row in self._rows:
            keep = True
            for k, v in self._eq.items():
                if isinstance(v, tuple) and v[0] == "__in__":
                    if row.get(k) not in v[1]:
                        keep = False
                        break
                elif row.get(k) != v:
                    keep = False
                    break
            if not keep:
                continue
            for k, v in self._gte.items():
                row_val = row.get(k)
                if row_val is None or row_val < v:
                    keep = False
                    break
            if keep:
                out.append(row)
        total_after_filter = len(out)
        if self._range is not None:
            start, end = self._range
            out = out[start : end + 1]
        elif self._limit is not None:
            out = out[: self._limit]
        return _MockResponse(
            out, total=total_after_filter if self._count_exact else None
        )


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _MockTable:
        return _MockTable(self._tables.get(name, []))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run(coro):
    return asyncio.run(coro)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _make_active_card(
    pillar: str,
    velocity: Optional[float],
    *,
    created_at: datetime,
    stage_id: str = "3",
    horizon: str = "H2",
) -> Dict[str, Any]:
    return {
        "id": f"card-{pillar}-{velocity}",
        "status": "active",
        "pillar_id": pillar,
        "stage_id": stage_id,
        "horizon": horizon,
        "velocity_score": velocity,
        "created_at": _iso(created_at),
        "name": f"Card {pillar} v={velocity}",
    }


async def _call_system_stats(monkeypatch, tables):
    """Patch supabase + pagination, then invoke ``get_system_wide_stats``."""
    from app.routers import analytics_system_stats as mod

    mock_sb = _MockSupabase(tables)
    monkeypatch.setattr(mod, "supabase", mock_sb)

    # Tiny page size so the paginate loop runs more than once on small
    # fixtures (exercises the "paged past the cap" branch). Forward
    # ``order_by`` so the deterministic-ordering kwarg added in the helper
    # still threads through the wrapper.
    async def _small(builder_factory, order_by="id", page_size=1000):
        return await _real_fetch_all_paginated(
            builder_factory, order_by=order_by, page_size=3
        )

    monkeypatch.setattr(mod, "fetch_all_paginated", _small)
    current_user = {"id": "user-1"}
    return await mod.get_system_wide_stats(current_user=current_user)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_zero_velocity_cards_count_toward_pillar_average(monkeypatch):
    """A card with ``velocity_score == 0`` must be averaged in, not dropped.

    The pre-fix code used ``if card.get("velocity_score"):`` which is
    falsy for ``0``. With three cards under pillar ``CH`` scored ``[0, 50,
    100]``, the correct average is ``50.0``; the buggy gate dropped the
    zero and reported ``75.0``.
    """
    now = datetime.now(timezone.utc)
    cards = [
        _make_active_card("CH", 0.0, created_at=now - timedelta(days=2)),
        _make_active_card("CH", 50.0, created_at=now - timedelta(days=2)),
        _make_active_card("CH", 100.0, created_at=now - timedelta(days=2)),
    ]
    tables = {
        "cards": cards,
        "sources": [],
        "discovery_runs": [],
        "search_history": [],
        "workstreams": [],
        "workstream_cards": [],
        "card_follows": [],
    }
    result = _run(_call_system_stats(monkeypatch, tables))

    ch_row = next(
        item for item in result.cards_by_pillar if item.pillar_code == "CH"
    )
    assert ch_row.count == 3
    assert ch_row.avg_velocity == 50.0, (
        f"Expected average 50.0 (incl. zero-velocity card), got "
        f"{ch_row.avg_velocity}. The truthy-check bug would report 75.0."
    )


def test_none_velocity_cards_excluded_from_pillar_average(monkeypatch):
    """A card with ``velocity_score IS NULL`` is *not* a data point and
    should still be excluded from the average (only zero is the bugfix).
    """
    now = datetime.now(timezone.utc)
    cards = [
        _make_active_card("EW", None, created_at=now - timedelta(days=2)),
        _make_active_card("EW", 80.0, created_at=now - timedelta(days=2)),
    ]
    tables = {
        "cards": cards,
        "sources": [],
        "discovery_runs": [],
        "search_history": [],
        "workstreams": [],
        "workstream_cards": [],
        "card_follows": [],
    }
    result = _run(_call_system_stats(monkeypatch, tables))

    ew_row = next(
        item for item in result.cards_by_pillar if item.pillar_code == "EW"
    )
    assert ew_row.count == 2  # both rows still count toward the size
    assert ew_row.avg_velocity == 80.0  # only the non-null row contributes


def test_distribution_queries_paginate_past_page_cap(monkeypatch):
    """The pagination helper is wired into the distribution queries — a
    corpus larger than the per-page cap must surface every row, not just
    the first page.

    Page size is overridden to 3 in ``_call_system_stats``; we seed 7
    cards spread across two pillars so the helper has to make three calls
    (3 + 3 + 1) before terminating.
    """
    now = datetime.now(timezone.utc)
    cards = [
        _make_active_card("PS", 10.0, created_at=now - timedelta(days=2)),
        _make_active_card("PS", 20.0, created_at=now - timedelta(days=2)),
        _make_active_card("PS", 30.0, created_at=now - timedelta(days=2)),
        _make_active_card("PS", 40.0, created_at=now - timedelta(days=2)),
        _make_active_card("HG", 50.0, created_at=now - timedelta(days=2)),
        _make_active_card("HG", 60.0, created_at=now - timedelta(days=2)),
        _make_active_card("HG", 70.0, created_at=now - timedelta(days=2)),
    ]
    tables = {
        "cards": cards,
        "sources": [],
        "discovery_runs": [],
        "search_history": [],
        "workstreams": [],
        "workstream_cards": [],
        "card_follows": [],
    }
    result = _run(_call_system_stats(monkeypatch, tables))

    ps_row = next(item for item in result.cards_by_pillar if item.pillar_code == "PS")
    hg_row = next(item for item in result.cards_by_pillar if item.pillar_code == "HG")
    # If pagination were broken (only first page returned), we'd see
    # PS=3, HG=0 or similar — instead we see the full 4+3 split.
    assert ps_row.count == 4
    assert hg_row.count == 3


def test_workstream_cards_and_follows_paginate(monkeypatch):
    """``workstream_cards`` and ``card_follows`` both feed unique-count
    rollups — they must paginate past 1000 rows or the dashboard
    silently undercounts engagement.
    """
    now = datetime.now(timezone.utc)
    cards = [_make_active_card("MC", 50.0, created_at=now - timedelta(days=2))]
    # Seed 7 workstream_cards (> our test page size of 3) across 5 unique
    # card ids.
    ws_cards = [
        {"card_id": f"c-{i}"} for i in (1, 2, 3, 4, 5, 1, 2)  # noqa: E501
    ]
    # Seed 5 follows across 3 unique cards and 2 unique users.
    follows = [
        {"card_id": "c-1", "user_id": "u-a"},
        {"card_id": "c-2", "user_id": "u-a"},
        {"card_id": "c-3", "user_id": "u-b"},
        {"card_id": "c-1", "user_id": "u-b"},
        {"card_id": "c-1", "user_id": "u-c"},
    ]
    tables = {
        "cards": cards,
        "sources": [],
        "discovery_runs": [],
        "search_history": [],
        "workstreams": [{"id": "w-1", "updated_at": _iso(now)}],
        "workstream_cards": ws_cards,
        "card_follows": follows,
    }
    result = _run(_call_system_stats(monkeypatch, tables))

    # 5 unique card_ids despite 7 rows + 3-row page size.
    assert result.workstream_engagement.unique_cards_in_workstreams == 5
    # 3 unique followed cards across 5 rows.
    assert result.follow_stats.unique_cards_followed == 3
    # Most-followed: c-1 has 3 follows (top), c-2 has 1, c-3 has 1.
    top = result.follow_stats.most_followed_cards[0]
    assert top["card_id"] == "c-1"
    assert top["follower_count"] == 3
