"""Unit tests for the dashboard v2 ``/analytics/lens-overview`` endpoint.

Covers the aggregation logic over the lens metadata introduced in PR #26
without requiring a live Supabase instance:

- Empty corpus produces zero-filled sparklines and stable signal-type buckets
- Anchor means + high-score counts respect ``user_metadata.overrides``
- Issue-tag chips respect ``user_metadata.added`` / ``removed`` overlays
- CSP goal coverage is keyed by goal id (not code) and preserves seed order
- Budget / climate flags only count cards above the relevance gate
- Sparklines are exactly ``days`` long with missing days zero-filled
- 24h delta only counts rows newer than 24h ago
- Pre-PR-#26 cards (no anchor data) are tolerated and ignored
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.analytics_lens import (  # noqa: E402  (after sys.path tweak)
    _fetch_all_paginated as _real_fetch_all_paginated,
)


# ---------------------------------------------------------------------------
# Mock supabase chain — supports the calls the endpoint makes.
# Equality filters apply to row sets; gte filters apply to ISO timestamp cols.
# ---------------------------------------------------------------------------


class _MockResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None) -> None:
        self.data = data or []
        self.count = len(self.data)


class _MockTable:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows
        self._eq: Dict[str, Any] = {}
        self._gte: Dict[str, str] = {}
        # PostgREST `.range(start, end)` is inclusive on both ends.
        self._range: Optional[tuple] = None

    def select(self, *_a, **_kw):
        return self

    def eq(self, key, value):
        self._eq[key] = value
        return self

    def gte(self, key, value):
        self._gte[key] = value
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, *_a, **_kw):
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def execute(self) -> _MockResponse:
        out = []
        for row in self._rows:
            keep = True
            for k, v in self._eq.items():
                # Support the postgrest `workstreams.user_id` foreign-table filter
                # by reaching into the joined dict.
                if "." in k:
                    table, col = k.split(".", 1)
                    joined = row.get(table) or {}
                    if isinstance(joined, list):
                        if not any(j.get(col) == v for j in joined):
                            keep = False
                            break
                    elif joined.get(col) != v:
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
        if self._range is not None:
            start, end = self._range
            out = out[start : end + 1]
        return _MockResponse(out)


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _MockTable:
        return _MockTable(self._tables.get(name, []))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


def _card(**fields) -> Dict[str, Any]:
    """Card fixture with sensible defaults for the lens-overview endpoint.

    Always status='active' (the endpoint filters on it) and tolerant of
    callers that don't care about every lens column.
    """
    base = {
        "id": _uuid(),
        "status": "active",
        "classifier_version": None,
        "signal_type": None,
        "anchor_scores": None,
        "csp_goal_ids": [],
        "issue_tags": [],
        "budget_assessment": None,
        "climate_assessment": None,
        "user_metadata": {},
    }
    base.update(fields)
    return base


def _patch(monkeypatch, mock_sb):
    from app.routers import analytics_lens as analytics_module

    monkeypatch.setattr(analytics_module, "supabase", mock_sb)


def _call(handler, **kwargs):
    return asyncio.run(handler(**kwargs))


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_empty_corpus_returns_stable_shape(monkeypatch):
    """No cards → zero anchor means, four signal-type buckets, zero-filled
    sparklines of the requested length."""
    from app.routers.analytics import get_lens_overview

    _patch(monkeypatch, _MockSupabase({}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    assert result.total_active_cards == 0
    assert result.classified_card_count == 0
    assert len(result.anchor_means) == 6
    assert all(a.mean_score == 0.0 and a.scored_card_count == 0 for a in result.anchor_means)
    # Stable bucket order so the donut renders consistently when empty.
    assert [s.signal_type for s in result.signal_type_counts] == [
        "trend",
        "driver",
        "signal",
        "unclassified",
    ]
    assert all(s.count == 0 for s in result.signal_type_counts)
    assert result.top_issue_tags == []
    assert result.budget_flag_count == 0
    assert result.climate_flag_count == 0
    # Five sparklines, each exactly 14 points, all zero.
    assert len(result.sparklines) == 5
    for series in result.sparklines:
        assert len(series.points) == 14
        assert all(p.value == 0 for p in series.points)
    assert result.delta_24h.new_cards == 0
    assert result.delta_24h.new_follows == 0


def test_anchor_means_respect_user_overrides(monkeypatch):
    """User overrides on user_metadata replace LLM scores in the mean."""
    from app.routers.analytics import get_lens_overview

    # Two cards: LLM scores equity=20 each. User overrides one to equity=80.
    # Expected mean: (80+20)/2 = 50.
    base_anchors = {
        "equity": 20,
        "affordability": 0,
        "innovation": 0,
        "sustainability_resiliency": 0,
        "proactive_prevention": 0,
        "community_trust": 0,
    }
    cards = [
        _card(
            classifier_version="v1",
            signal_type="trend",
            anchor_scores=base_anchors,
            user_metadata={"overrides": {"anchor_scores": {"equity": 80}}},
        ),
        _card(
            classifier_version="v1",
            signal_type="trend",
            anchor_scores=base_anchors,
        ),
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    equity = next(a for a in result.anchor_means if a.code == "equity")
    assert equity.mean_score == 50.0
    assert equity.scored_card_count == 2
    assert equity.high_score_count == 1  # only the 80 clears the >=70 gate


def test_issue_tags_respect_added_and_removed(monkeypatch):
    """`added` adds to the count; `removed` subtracts from it."""
    from app.routers.analytics import get_lens_overview

    cards = [
        # Card 1: LLM tagged climate_change, user removed it.
        _card(
            classifier_version="v1",
            signal_type="trend",
            issue_tags=["climate_change"],
            user_metadata={"removed": {"issue_tags": ["climate_change"]}},
        ),
        # Card 2: LLM had no tags, user added cost_of_living.
        _card(
            classifier_version="v1",
            signal_type="driver",
            user_metadata={"added": {"issue_tags": ["cost_of_living"]}},
        ),
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    tags = {t.tag: t.count for t in result.top_issue_tags}
    # climate_change was removed by the user → 0 effective; should not appear.
    assert "climate_change" not in tags
    assert tags.get("cost_of_living") == 1


def test_csp_coverage_matches_goal_ids(monkeypatch):
    """Goal coverage is keyed by goal id and preserves goal seed order."""
    from app.routers.analytics import get_lens_overview

    goal_a = _uuid()
    goal_b = _uuid()
    cards = [
        _card(classifier_version="v1", signal_type="trend", csp_goal_ids=[goal_a, goal_b]),
        _card(classifier_version="v1", signal_type="trend", csp_goal_ids=[goal_a]),
    ]
    goals = [
        {
            "id": goal_a,
            "code": "CH.1",
            "name": "Climate goal",
            "pillar_code": "CH",
            "display_order": 1,
        },
        {
            "id": goal_b,
            "code": "EW.1",
            "name": "Workforce goal",
            "pillar_code": "EW",
            "display_order": 1,
        },
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards, "csp_goals": goals}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    coverage = {c.code: c.card_count for c in result.csp_coverage}
    assert coverage == {"CH.1": 2, "EW.1": 1}


def test_budget_and_climate_flag_thresholds(monkeypatch):
    """Only cards with relevance >= 60 count as flagged."""
    from app.routers.analytics import get_lens_overview

    cards = [
        # Above gate on budget only.
        _card(
            classifier_version="v1",
            signal_type="trend",
            budget_assessment={"relevance": 75, "dimensions": []},
            climate_assessment={"relevance": 10, "drivers": []},
        ),
        # Above gate on climate only.
        _card(
            classifier_version="v1",
            signal_type="trend",
            budget_assessment={"relevance": 30, "dimensions": []},
            climate_assessment={"relevance": 80, "drivers": []},
        ),
        # Below gate on both — must not count.
        _card(
            classifier_version="v1",
            signal_type="trend",
            budget_assessment={"relevance": 10},
            climate_assessment={"relevance": 10},
        ),
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)
    assert result.budget_flag_count == 1
    assert result.climate_flag_count == 1


def test_sparklines_zero_fill_and_count_within_window(monkeypatch):
    """Sparklines are exactly ``days`` long, with zero-filled missing days."""
    from app.routers.analytics import get_lens_overview

    now = datetime.now(timezone.utc)
    in_window = (now - timedelta(days=2)).isoformat()
    out_of_window = (now - timedelta(days=40)).isoformat()

    timestamps = [in_window, in_window, out_of_window]  # third filtered by gte
    _patch(
        monkeypatch,
        _MockSupabase(
            {
                "cards": [
                    _card(
                        created_at=ts,
                        updated_at=ts,
                        classified_at=ts,
                    )
                    for ts in timestamps
                ],
            }
        ),
    )

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    new_cards_series = next(s for s in result.sparklines if s.metric == "new_cards")
    assert len(new_cards_series.points) == 14
    # The out-of-window row was dropped by `gte`; sum should be 2 in-window.
    assert sum(p.value for p in new_cards_series.points) == 2


def test_delta_24h_only_counts_recent(monkeypatch):
    """Delta 24h is bound to *now-24h*, not the full sparkline window."""
    from app.routers.analytics import get_lens_overview

    now = datetime.now(timezone.utc)
    just_now = (now - timedelta(hours=2)).isoformat()
    days_ago = (now - timedelta(days=5)).isoformat()

    rows = [
        _card(created_at=just_now, updated_at=just_now, classified_at=just_now),
        _card(created_at=days_ago, updated_at=days_ago, classified_at=days_ago),
    ]
    _patch(monkeypatch, _MockSupabase({"cards": rows}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    # Only `just_now` is within 24h.
    assert result.delta_24h.new_cards == 1
    assert result.delta_24h.new_classifications == 1


def test_pre_pr26_cards_are_tolerated(monkeypatch):
    """Cards with no anchor_scores / no user_metadata don't crash and don't
    contribute to anchor means."""
    from app.routers.analytics import get_lens_overview

    cards = [
        # No populated lens columns — simulates a row that pre-dates PR #26.
        _card(csp_goal_ids=None, issue_tags=None, user_metadata=None),
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    assert result.total_active_cards == 1
    assert result.classified_card_count == 0
    # No anchor data means no contributions to the mean.
    for a in result.anchor_means:
        assert a.scored_card_count == 0
        assert a.mean_score == 0.0
    # The single uncategorised card lands in the unclassified bucket.
    by_type = {s.signal_type: s.count for s in result.signal_type_counts}
    assert by_type["unclassified"] == 1


def test_user_workstream_cards_are_filtered_by_user(monkeypatch):
    """`new_workstream_cards` sparkline only counts the requesting user's
    workstream additions — adds against another user's workstream are dropped."""
    from app.routers.analytics import get_lens_overview

    user_id = _uuid()
    other_user_id = _uuid()
    now = datetime.now(timezone.utc)
    # Two hours ago is comfortably inside the 24h delta window even after the
    # endpoint computes its own `one_day_ago` a few microseconds later.
    recent = (now - timedelta(hours=2)).isoformat()

    ws_cards = [
        {
            "card_id": _uuid(),
            "added_at": recent,
            "workstreams": {"user_id": user_id},
        },
        {
            "card_id": _uuid(),
            "added_at": recent,
            "workstreams": {"user_id": other_user_id},
        },
    ]
    _patch(
        monkeypatch,
        _MockSupabase({"workstream_cards": ws_cards}),
    )

    user = {"id": user_id, "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    series = next(
        s for s in result.sparklines if s.metric == "new_workstream_cards"
    )
    # Exactly one row should have made it through the user filter.
    assert sum(p.value for p in series.points) == 1
    assert result.delta_24h.new_workstream_cards == 1


def test_pagination_aggregates_past_postgrest_page_cap(monkeypatch):
    """Active corpus larger than the PostgREST page cap is fully aggregated.

    Regression for the silent undercount that happened when the endpoint
    used a single `.execute()` against an unbounded query.
    """
    from app.routers import analytics_lens as analytics_module
    from app.routers.analytics import get_lens_overview

    # Force a tiny page so the test stays cheap but the loop still has to
    # paginate multiple times to reach the full corpus.
    monkeypatch.setattr(analytics_module, "_fetch_all_paginated", _fetch_all_paginated_small)

    cards = [
        _card(classifier_version="v1", signal_type="trend", csp_goal_ids=[])
        for _ in range(7)
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    # All 7 cards must be reflected in the aggregate, not just the first page.
    assert result.total_active_cards == 7
    trend_bucket = next(
        b for b in result.signal_type_counts if b.signal_type == "trend"
    )
    assert trend_bucket.count == 7


def test_delta_24h_handles_mixed_timestamp_formats(monkeypatch):
    """Rows whose timestamp uses the trailing 'Z' or omits microseconds still
    bucket into the 24h delta (regression for lexicographic comparison)."""
    from app.routers.analytics import get_lens_overview

    now = datetime.now(timezone.utc)
    # Same instant, three different ISO renderings the DB might return.
    just_now_z = (now - timedelta(hours=2)).isoformat().replace("+00:00", "Z")
    just_now_offset = (now - timedelta(hours=3)).isoformat()  # "+00:00"
    just_now_no_micro = (now - timedelta(hours=4)).replace(microsecond=0).isoformat()

    cards = [
        _card(created_at=just_now_z, updated_at=just_now_z, classified_at=just_now_z),
        _card(
            created_at=just_now_offset,
            updated_at=just_now_offset,
            classified_at=just_now_offset,
        ),
        _card(
            created_at=just_now_no_micro,
            updated_at=just_now_no_micro,
            classified_at=just_now_no_micro,
        ),
    ]
    _patch(monkeypatch, _MockSupabase({"cards": cards}))

    user = {"id": _uuid(), "account_type": "paid"}
    result = _call(get_lens_overview, days=14, current_user=user)

    # All three rows are within the last 24h regardless of their ISO format.
    assert result.delta_24h.new_cards == 3
    assert result.delta_24h.new_classifications == 3


async def _fetch_all_paginated_small(builder_factory, page_size: int = 1000):
    """Override of `_fetch_all_paginated` that uses a 2-row page so tests
    actually exercise the paginate-then-stop branch on small fixtures.

    ``_real_fetch_all_paginated`` is imported at the top of the module
    (after the ``sys.path`` tweak) so this helper can call into it.
    """
    return await _real_fetch_all_paginated(builder_factory, page_size=2)
