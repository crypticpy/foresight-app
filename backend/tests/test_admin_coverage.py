"""Unit tests for the admin coverage dashboard endpoints.

Covers:
- ``get_pillar_coverage`` aggregates ``cards.pillar_id`` over the requested
  window, attaches expected-share + drift, and validates the days arg.
- ``_aggregate_workstream_freshness`` joins workstream rows with scan and
  card-add timestamps, sorting NULL last_scanned_at first.
- ``get_workstream_coverage`` returns rows that the aggregator computed.
- ``admin_force_workstream_scan`` enqueues a scan row, writes an audit
  entry, and returns 404 for missing workstreams + 400 when there is
  nothing to scan.
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
    """Light supabase-table mock supporting select/insert + chain filters.

    Mirrors the subset used by the coverage endpoints: select with eq, gte,
    order and limit; insert returns the inserted row with a generated id.
    """

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
        self._order: List[tuple[str, bool]] = []

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def insert(self, payload: Dict[str, Any]):
        self._mode = "insert"
        self._payload = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def gte(self, key, value):
        self._gte[key] = value
        return self

    def in_(self, key, values):
        self._filters[key] = ("__in__", set(values))
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
            return _MockResponse([payload])

        # select
        def _filter_match(row: Dict[str, Any]) -> bool:
            for k, v in self._filters.items():
                if isinstance(v, tuple) and len(v) == 2 and v[0] == "__in__":
                    if row.get(k) not in v[1]:
                        return False
                elif row.get(k) != v:
                    return False
            return True

        out = []
        for row in self._rows:
            if _filter_match(row):
                if all(
                    (row.get(k) or "") >= v for k, v in self._gte.items()
                ):
                    out.append(row)
        for key, desc in reversed(self._order):
            out.sort(key=lambda r: (r.get(key) or ""), reverse=desc)
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


@pytest.fixture(autouse=True)
def _disable_rate_limiter(monkeypatch):
    """slowapi's ``@limiter.limit`` decorator wraps every limited endpoint
    in a wrapper that requires a real ``starlette.requests.Request``. Our
    ``_mock_request`` returns a ``SimpleNamespace`` and that rejects with
    "parameter `request` must be an instance of starlette.requests.Request".
    Disabling the limiter for tests skips the wrapper entirely — the
    handler body still receives the mock request, which is all it needs.
    """
    from app.deps import limiter

    monkeypatch.setattr(limiter, "enabled", False)


def _patch_supabase(monkeypatch, mock_sb):
    from app import audit_service
    from app.routers import (
        admin_discovery_balance,
        admin_discovery_coverage,
    )

    # Coverage / balance endpoints live in their own sub-routers, each with
    # its own module-level ``supabase`` binding. ``admin.py`` is a pure
    # aggregator and no longer imports ``supabase``, so we patch only the
    # sub-routers that actually own the binding plus audit_service.
    monkeypatch.setattr(admin_discovery_coverage, "supabase", mock_sb)
    monkeypatch.setattr(admin_discovery_balance, "supabase", mock_sb)
    # audit_service owns its own top-level ``supabase`` binding; patch it too
    # so audit-row inserts hit the same mock as the primary mutation.
    monkeypatch.setattr(audit_service, "supabase", mock_sb)


# ---------------------------------------------------------------------------
# Pillar coverage
# ---------------------------------------------------------------------------


def test_pillar_coverage_aggregates_by_pillar(monkeypatch):
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    cards = [
        {"pillar_id": "CH", "created_at": today, "status": "active"},
        {"pillar_id": "CH", "created_at": today, "status": "active"},
        {"pillar_id": "CH", "created_at": today, "status": "active"},
        {"pillar_id": "MC", "created_at": today, "status": "active"},
        {"pillar_id": "PS", "created_at": today, "status": "active"},
        # Cards with no pillar should land in the unassigned bucket.
        {"pillar_id": None, "created_at": today, "status": "active"},
        # Older-than-window cards must be filtered out by gte("created_at").
        {
            "pillar_id": "CH",
            "created_at": (
                datetime.now(timezone.utc) - timedelta(days=120)
            ).isoformat(),
            "status": "active",
        },
    ]
    tables = {"cards": cards}
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_pillar_coverage(days=7, current_user=actor)
    )

    # Six pillar buckets, six bars in the chart.
    assert set(result["by_pillar"].keys()) == {"CH", "EW", "HG", "HH", "MC", "PS"}
    # Window cuts off the 120-day-old card → 6 in-window total.
    assert result["total"] == 6
    assert result["unassigned"] == 1
    # mode_total excludes the unassigned card so share denominators reflect
    # cards that actually got pillared.
    assert result["mode_total"] == 5
    ch = result["by_pillar"]["CH"]
    assert ch["cards"] == 3
    # share = 3/5 = 0.6 (mode_total); expected = 1/6 ≈ 0.1667.
    assert ch["share"] == 0.6
    assert ch["expected_share"] == round(1 / 6, 4)
    assert ch["drift"] == round(0.6 - 1 / 6, 4)
    # Pillar with zero cards is still present (zero, not missing).
    assert result["by_pillar"]["EW"]["cards"] == 0
    assert result["by_pillar"]["EW"]["share"] == 0.0


def test_pillar_coverage_rejects_invalid_window(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _bypass_admin(monkeypatch)
    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.get_pillar_coverage(days=14, current_user=actor)
        )
    assert exc.value.status_code == 400


def test_pillar_coverage_handles_zero_cards(monkeypatch):
    from app.routers import admin_discovery

    mock_sb = _MockSupabase({"cards": []})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_pillar_coverage(days=30, current_user=actor)
    )
    assert result["total"] == 0
    # Each pillar's share is 0 — never NaN.
    for code in ("CH", "EW", "HG", "HH", "MC", "PS"):
        assert result["by_pillar"][code]["cards"] == 0
        assert result["by_pillar"][code]["share"] == 0.0


def test_pillar_coverage_primary_mode_preserves_legacy_shape(monkeypatch):
    """``mode=primary`` (the default) must keep the field layout that older
    UI clients depend on: ``cards`` reflects primary count, and the new
    channel counters are present but never collapse the primary semantics.
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    cards = [
        {
            "pillar_id": "CH",
            "secondary_pillars": ["PS"],
            "csp_goal_ids": [],
            "created_at": today,
            "status": "active",
        },
        {
            "pillar_id": "MC",
            "secondary_pillars": [],
            "csp_goal_ids": [],
            "created_at": today,
            "status": "active",
        },
    ]
    mock_sb = _MockSupabase({"cards": cards})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_pillar_coverage(days=7, current_user=actor)
    )
    assert result["mode"] == "primary"
    # CH card had a secondary PS — but primary mode must not credit PS for it.
    assert result["by_pillar"]["PS"]["cards"] == 0
    assert result["by_pillar"]["PS"]["secondary_cards"] == 1
    assert result["by_pillar"]["CH"]["cards"] == 1
    assert result["by_pillar"]["CH"]["primary_cards"] == 1


def test_pillar_coverage_primary_or_secondary_mode(monkeypatch):
    """``primary_or_secondary`` credits a pillar that only appears in
    ``secondary_pillars``. Same card may contribute to multiple buckets.
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    cards = [
        # CH primary, PS secondary → counts for both in this mode.
        {
            "pillar_id": "CH",
            "secondary_pillars": ["PS"],
            "csp_goal_ids": [],
            "created_at": today,
            "status": "active",
        },
        # HG primary, no secondaries.
        {
            "pillar_id": "HG",
            "secondary_pillars": [],
            "csp_goal_ids": [],
            "created_at": today,
            "status": "active",
        },
        # No primary, MC secondary only — still counted toward MC and not
        # toward unassigned because this mode considers secondaries.
        {
            "pillar_id": None,
            "secondary_pillars": ["MC"],
            "csp_goal_ids": [],
            "created_at": today,
            "status": "active",
        },
    ]
    mock_sb = _MockSupabase({"cards": cards})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_pillar_coverage(
            days=7, mode="primary_or_secondary", current_user=actor
        )
    )
    assert result["mode"] == "primary_or_secondary"
    assert result["unassigned"] == 0
    assert result["by_pillar"]["CH"]["cards"] == 1
    assert result["by_pillar"]["PS"]["cards"] == 1  # via secondary
    assert result["by_pillar"]["MC"]["cards"] == 1  # via secondary only
    assert result["by_pillar"]["HG"]["cards"] == 1
    # Per-channel counts are still exposed.
    assert result["by_pillar"]["PS"]["secondary_cards"] == 1
    assert result["by_pillar"]["PS"]["primary_cards"] == 0


def test_pillar_coverage_union_mode_uses_csp_goal_pillar(monkeypatch):
    """``union`` mode must additionally credit pillars reachable through
    ``csp_goal_ids``. This is the behavior that lets the pillar view agree
    with the lens-overview / CSP heatmap.
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    ps_goal_id = str(uuid.uuid4())
    cards = [
        # HG primary with a PS-pillar goal linked. union → both HG and PS.
        {
            "pillar_id": "HG",
            "secondary_pillars": [],
            "csp_goal_ids": [ps_goal_id],
            "created_at": today,
            "status": "active",
        },
    ]
    goals = [
        {"id": ps_goal_id, "pillar_code": "PS"},
    ]
    mock_sb = _MockSupabase({"cards": cards, "csp_goals": goals})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_pillar_coverage(
            days=7, mode="union", current_user=actor
        )
    )
    assert result["mode"] == "union"
    assert result["by_pillar"]["HG"]["cards"] == 1
    assert result["by_pillar"]["PS"]["cards"] == 1  # via csp_goal_ids
    assert result["by_pillar"]["PS"]["csp_linked_cards"] == 1
    assert result["by_pillar"]["PS"]["primary_cards"] == 0
    assert result["by_pillar"]["PS"]["secondary_cards"] == 0


def test_pillar_coverage_union_mode_share_denominator_keeps_drift_signal(monkeypatch):
    """In ``union`` mode a card can credit multiple pillars. Without a
    mode-aware ``share`` denominator, every pillar's drift could go
    positive at once (sum(share) > 1.0) and the UI's amber starvation
    signal would silently break. Verify ``share`` is normalized against
    ``mode_total`` so genuinely starved pillars still surface negative
    drift even when union credits inflate the touch counts.
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    ps_goal_id = str(uuid.uuid4())
    hg_goal_id = str(uuid.uuid4())
    # Four cards, all primary HG. Three also CSP-link to a PS goal, one
    # CSP-links only to an HG goal. No card primary-or-secondary on PS.
    cards = []
    for _ in range(3):
        cards.append({
            "pillar_id": "HG",
            "secondary_pillars": [],
            "csp_goal_ids": [ps_goal_id],
            "created_at": today,
            "status": "active",
        })
    cards.append({
        "pillar_id": "HG",
        "secondary_pillars": [],
        "csp_goal_ids": [hg_goal_id],
        "created_at": today,
        "status": "active",
    })
    goals = [
        {"id": ps_goal_id, "pillar_code": "PS"},
        {"id": hg_goal_id, "pillar_code": "HG"},
    ]
    mock_sb = _MockSupabase({"cards": cards, "csp_goals": goals})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_pillar_coverage(
            days=7, mode="union", current_user=actor
        )
    )
    # 4 HG touches + 3 PS touches = 7 mode_total over 4 raw cards.
    assert result["total"] == 4
    assert result["mode_total"] == 7
    # HG share = 4/7 ≈ 0.5714, drift ≈ +0.4047 (over-represented).
    hg = result["by_pillar"]["HG"]
    assert hg["cards"] == 4
    assert hg["share"] == round(4 / 7, 4)
    assert hg["drift"] > 0
    # PS share = 3/7 ≈ 0.4286, drift ≈ +0.262 (also over).
    ps = result["by_pillar"]["PS"]
    assert ps["cards"] == 3
    assert ps["share"] == round(3 / 7, 4)
    # The other four pillars have zero touches and must still show as
    # starved (negative drift) — that's the signal the bug would have
    # silenced if ``share`` were computed against raw card count.
    for code in ("CH", "EW", "HH", "MC"):
        bucket = result["by_pillar"][code]
        assert bucket["cards"] == 0
        assert bucket["share"] == 0.0
        assert bucket["drift"] < 0


def test_pillar_coverage_rejects_invalid_mode(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _bypass_admin(monkeypatch)
    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.get_pillar_coverage(
                days=7, mode="bogus", current_user=actor
            )
        )
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Coverage gap detector
# ---------------------------------------------------------------------------


def test_coverage_gaps_starved_goal_lands_high_priority(monkeypatch):
    """A goal with zero coverage while peers are populated must surface as
    ``priority='high'`` with ``drift_score == -1.0`` so the UI paints it red.
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    ps_goal_id = str(uuid.uuid4())
    hg_goal_id = str(uuid.uuid4())
    starved_id = str(uuid.uuid4())

    # 10 cards credit the populated goals; the starved goal gets 0 cards.
    cards: list[dict[str, Any]] = []
    for _ in range(5):
        cards.append({
            "csp_goal_ids": [ps_goal_id],
            "created_at": today,
            "status": "active",
        })
    for _ in range(5):
        cards.append({
            "csp_goal_ids": [hg_goal_id],
            "created_at": today,
            "status": "active",
        })
    goals = [
        {
            "id": ps_goal_id,
            "code": "PS.1",
            "name": "PS goal",
            "pillar_code": "PS",
            "display_order": 1,
        },
        {
            "id": hg_goal_id,
            "code": "HG.1",
            "name": "HG goal",
            "pillar_code": "HG",
            "display_order": 1,
        },
        {
            "id": starved_id,
            "code": "MC.1",
            "name": "Starved goal",
            "pillar_code": "MC",
            "display_order": 1,
        },
    ]
    mock_sb = _MockSupabase({"cards": cards, "csp_goals": goals})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_coverage_gaps(
            request=_mock_request(), days=30, current_user=actor
        )
    )

    assert result["window_days"] == 30
    assert result["totals"]["credits"] == 10
    assert result["totals"]["goals"] == 3
    # Uniform expected = 10 / 3 ≈ 3.33; starved cell drift = -3.33,
    # drift_score = -1.0 (clamped).
    cells_by_id = {c["goal_id"]: c for c in result["cells"]}
    starved = cells_by_id[starved_id]
    assert starved["cards_in_window"] == 0
    assert starved["drift_score"] == -1.0
    assert starved["priority"] == "high"
    # Starvation-first sort: the starved cell comes before any populated one.
    assert result["cells"][0]["goal_id"] == starved_id
    # The underrepresented counter should include the starved cell.
    assert result["totals"]["underrepresented_cells"] >= 1


def test_coverage_gaps_uniform_population_yields_no_priority(monkeypatch):
    """When every goal has exactly the expected share, all priorities are
    ``none`` and the underrepresented counter is zero.
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    g1, g2 = str(uuid.uuid4()), str(uuid.uuid4())
    cards = [
        {"csp_goal_ids": [g1], "created_at": today, "status": "active"},
        {"csp_goal_ids": [g1], "created_at": today, "status": "active"},
        {"csp_goal_ids": [g2], "created_at": today, "status": "active"},
        {"csp_goal_ids": [g2], "created_at": today, "status": "active"},
    ]
    goals = [
        {
            "id": g1,
            "code": "CH.1",
            "name": "CH goal",
            "pillar_code": "CH",
            "display_order": 1,
        },
        {
            "id": g2,
            "code": "MC.1",
            "name": "MC goal",
            "pillar_code": "MC",
            "display_order": 1,
        },
    ]
    mock_sb = _MockSupabase({"cards": cards, "csp_goals": goals})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_coverage_gaps(
            request=_mock_request(), days=30, current_user=actor
        )
    )
    # 4 credits / 2 goals = 2 expected per cell; every goal has exactly 2.
    assert result["totals"]["expected_per_cell"] == 2.0
    for cell in result["cells"]:
        assert cell["cards_in_window"] == 2
        assert cell["drift"] == 0
        assert cell["drift_score"] == 0
        assert cell["priority"] == "none"
    assert result["totals"]["underrepresented_cells"] == 0


def test_coverage_gaps_handles_empty_window(monkeypatch):
    """No cards in window → drift_score is 0 (not NaN) and nothing flags
    high priority. Otherwise a fresh install would scream coverage gaps at
    operators on day one before any discovery has run.
    """
    from app.routers import admin_discovery

    g_id = str(uuid.uuid4())
    goals = [
        {
            "id": g_id,
            "code": "CH.1",
            "name": "CH goal",
            "pillar_code": "CH",
            "display_order": 1,
        }
    ]
    mock_sb = _MockSupabase({"cards": [], "csp_goals": goals})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_coverage_gaps(
            request=_mock_request(), days=7, current_user=actor
        )
    )
    assert result["totals"]["credits"] == 0
    assert result["totals"]["expected_per_cell"] == 0.0
    assert result["totals"]["underrepresented_cells"] == 0
    cell = result["cells"][0]
    assert cell["cards_in_window"] == 0
    assert cell["drift_score"] == 0
    assert cell["priority"] == "none"


def test_coverage_gaps_ignores_null_and_unknown_goal_ids(monkeypatch):
    """Cards with ``None``/missing ``csp_goal_ids`` must not crash the
    aggregator, and a goal_id that doesn't resolve to a known goal must be
    silently dropped (stale references shouldn't blow up the admin view).
    """
    from app.routers import admin_discovery

    today = datetime.now(timezone.utc).isoformat()
    g_id = str(uuid.uuid4())
    cards = [
        {"csp_goal_ids": None, "created_at": today, "status": "active"},
        {"csp_goal_ids": [], "created_at": today, "status": "active"},
        # One known goal credit + one stale UUID that's no longer in csp_goals.
        {
            "csp_goal_ids": [g_id, str(uuid.uuid4())],
            "created_at": today,
            "status": "active",
        },
    ]
    goals = [
        {
            "id": g_id,
            "code": "HG.1",
            "name": "HG goal",
            "pillar_code": "HG",
            "display_order": 1,
        }
    ]
    mock_sb = _MockSupabase({"cards": cards, "csp_goals": goals})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_coverage_gaps(
            request=_mock_request(), days=30, current_user=actor
        )
    )
    # Only the one known goal credit is counted.
    assert result["totals"]["credits"] == 1
    assert result["cells"][0]["goal_id"] == g_id
    assert result["cells"][0]["cards_in_window"] == 1


def test_coverage_gaps_rejects_invalid_window(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _bypass_admin(monkeypatch)
    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.get_coverage_gaps(
                request=_mock_request(), days=14, current_user=actor
            )
        )
    assert exc.value.status_code == 400


def test_coverage_gaps_rejects_unknown_target_distribution(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _bypass_admin(monkeypatch)
    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.get_coverage_gaps(
                request=_mock_request(),
                days=30,
                target_distribution="weighted",
                current_user=actor,
            )
        )
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Workstream freshness
# ---------------------------------------------------------------------------


def test_freshness_aggregator_sorts_null_first():
    from app.routers.admin_discovery import _aggregate_workstream_freshness

    ws_a = {
        "id": "ws-a",
        "name": "A",
        "owner_type": "user",
        "auto_scan": True,
    }
    ws_b = {
        "id": "ws-b",
        "name": "B",
        "owner_type": "org",
        "auto_scan": False,
    }
    ws_c = {
        "id": "ws-c",
        "name": "C",
        "owner_type": "user",
        "auto_scan": False,
    }
    completed_scans = [
        {
            "workstream_id": "ws-a",
            "completed_at": "2026-04-15T00:00:00Z",
            "created_at": "2026-04-15T00:00:00Z",
        },
        {
            "workstream_id": "ws-b",
            "completed_at": "2026-05-01T00:00:00Z",
            "created_at": "2026-05-01T00:00:00Z",
        },
        # Older completed scan for ws-a — must NOT replace the newer one.
        {
            "workstream_id": "ws-a",
            "completed_at": "2026-01-01T00:00:00Z",
            "created_at": "2026-01-01T00:00:00Z",
        },
    ]
    recent_scans = [
        {"workstream_id": "ws-a", "created_at": "2026-04-15T00:00:00Z"},
        {"workstream_id": "ws-a", "created_at": "2026-04-20T00:00:00Z"},
        {"workstream_id": "ws-b", "created_at": "2026-05-01T00:00:00Z"},
    ]
    recent_cards = [
        {"workstream_id": "ws-b", "added_at": "2026-04-25T00:00:00Z"},
        {"workstream_id": "ws-b", "added_at": "2026-04-26T00:00:00Z"},
        {"workstream_id": "ws-b", "added_at": "2026-04-27T00:00:00Z"},
    ]

    rows = _aggregate_workstream_freshness(
        [ws_a, ws_b, ws_c], completed_scans, recent_scans, recent_cards
    )

    # ws-c (never scanned) sorts first; then the older last_scanned_at;
    # then the most-recent.
    assert [r["id"] for r in rows] == ["ws-c", "ws-a", "ws-b"]
    by_id = {r["id"]: r for r in rows}
    assert by_id["ws-a"]["last_scanned_at"] == "2026-04-15T00:00:00Z"
    assert by_id["ws-a"]["scans_30d"] == 2
    assert by_id["ws-a"]["cards_added_30d"] == 0
    assert by_id["ws-b"]["last_scanned_at"] == "2026-05-01T00:00:00Z"
    assert by_id["ws-b"]["scans_30d"] == 1
    assert by_id["ws-b"]["cards_added_30d"] == 3
    assert by_id["ws-b"]["owner_type"] == "org"
    assert by_id["ws-c"]["last_scanned_at"] is None
    assert by_id["ws-c"]["scans_30d"] == 0


def test_freshness_aggregator_falls_back_to_started_at():
    from app.routers.admin_discovery import _aggregate_workstream_freshness

    ws = {"id": "ws", "name": "X", "owner_type": "user", "auto_scan": False}
    # Completion timestamp missing — aggregator should fall back to
    # started_at and then created_at rather than returning None.
    completed_scans = [
        {
            "workstream_id": "ws",
            "completed_at": None,
            "started_at": "2026-04-30T00:00:00Z",
            "created_at": "2026-04-30T00:00:00Z",
        }
    ]
    rows = _aggregate_workstream_freshness([ws], completed_scans, [], [])
    assert rows[0]["last_scanned_at"] == "2026-04-30T00:00:00Z"


def test_get_workstream_coverage_full_chain(monkeypatch):
    from app.routers import admin_discovery

    ws_id = str(uuid.uuid4())
    cutoff_ok = datetime.now(timezone.utc).isoformat()
    tables = {
        "workstreams": [
            {
                "id": ws_id,
                "name": "Test WS",
                "owner_type": "user",
                "auto_scan": True,
                "user_id": str(uuid.uuid4()),
            }
        ],
        "workstream_scans": [
            {
                "workstream_id": ws_id,
                "status": "completed",
                "completed_at": cutoff_ok,
                "started_at": cutoff_ok,
                "created_at": cutoff_ok,
            },
        ],
        "workstream_cards": [
            {"workstream_id": ws_id, "added_at": cutoff_ok},
            {"workstream_id": ws_id, "added_at": cutoff_ok},
        ],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.get_workstream_coverage(current_user=actor)
    )
    assert result["total"] == 1
    item = result["items"][0]
    assert item["id"] == ws_id
    assert item["last_scanned_at"] == cutoff_ok
    assert item["scans_30d"] == 1
    assert item["cards_added_30d"] == 2


# ---------------------------------------------------------------------------
# Admin force-scan
# ---------------------------------------------------------------------------


def test_admin_force_scan_enqueues_and_audits(monkeypatch):
    from app.routers import admin_discovery

    ws_id = str(uuid.uuid4())
    owner_id = str(uuid.uuid4())
    tables = {
        "workstreams": [
            {
                "id": ws_id,
                "name": "Force-me",
                "user_id": owner_id,
                "owner_type": "user",
                "keywords": ["municipal AI"],
                "pillar_ids": ["MC"],
                "horizon": "H1",
            }
        ],
        "workstream_scans": [],
        "admin_audit_log": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {
        "id": str(uuid.uuid4()),
        "email": "admin@example.com",
        "role": "admin",
    }
    result = asyncio.run(
        admin_discovery.admin_force_workstream_scan(
            request=_mock_request(),
            workstream_id=ws_id,
            current_user=actor,
        )
    )
    assert result["status"] == "queued"
    assert result["workstream_id"] == ws_id
    assert tables["workstream_scans"], "expected a scan row to be inserted"
    queued = tables["workstream_scans"][0]
    # Owner identity stays attached to the scan row; admin identity travels
    # in config so audits/log lines can pick it up.
    assert queued["user_id"] == owner_id
    assert queued["config"]["triggered_by"] == "admin"
    assert queued["config"]["admin_user_id"] == actor["id"]
    audit_rows = tables.get("admin_audit_log", [])
    assert any(
        row.get("action") == "admin.workstream.force_scan" for row in audit_rows
    )


def test_admin_force_scan_returns_404_when_missing(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    tables = {"workstreams": [], "workstream_scans": []}
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_force_workstream_scan(
                request=_mock_request(),
                workstream_id=str(uuid.uuid4()),
                current_user=actor,
            )
        )
    assert exc.value.status_code == 404


def test_admin_force_scan_rejects_empty_workstream(monkeypatch):
    """Workstream with no keywords AND no pillars — refuse with 400."""
    from fastapi import HTTPException

    from app.routers import admin_discovery

    ws_id = str(uuid.uuid4())
    tables = {
        "workstreams": [
            {
                "id": ws_id,
                "name": "Empty",
                "user_id": str(uuid.uuid4()),
                "owner_type": "user",
                "keywords": [],
                "pillar_ids": [],
                "horizon": "ALL",
            }
        ],
        "workstream_scans": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_force_workstream_scan(
                request=_mock_request(),
                workstream_id=ws_id,
                current_user=actor,
            )
        )
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# Coverage-balance dispatcher (PR-E)
# ---------------------------------------------------------------------------


def _bypass_budget(monkeypatch):
    """Defang the cost guardrail so dispatcher tests don't touch real spend tables."""
    from app import cost_guardrail
    from app.routers import admin_discovery

    async def _ok():
        return SimpleNamespace(tripped=False, alerting=False)

    monkeypatch.setattr(cost_guardrail, "check_budget_or_raise", _ok)
    # admin_discovery imports the symbol lazily inside the handler, so
    # patching the module attribute alone isn't enough — patch the lookup
    # path too. The handler does ``from app.cost_guardrail import
    # check_budget_or_raise`` so the module-level binding above suffices.
    _ = admin_discovery


def _stub_derive(monkeypatch, *, per_goal=("alpha", "beta", "gamma", "delta")):
    """Stub csp_goal_query_service.derive_queries to return a fixed list."""
    from app import csp_goal_query_service

    async def _fake(goal_id, *, force=False, **_kw):
        return list(per_goal)

    monkeypatch.setattr(csp_goal_query_service, "derive_queries", _fake)


def test_balance_dispatch_with_explicit_goal_ids(monkeypatch):
    from app.routers import admin_discovery

    goal_id = str(uuid.uuid4())
    tables = {
        "csp_goals": [
            {
                "id": goal_id,
                "code": "PS.1",
                "name": "Reduce violent crime",
                "pillar_code": "PS",
            }
        ],
        "cards": [],
        "discovery_runs": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)
    _stub_derive(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    body = admin_discovery.BalanceDispatchRequest(
        goal_ids=[goal_id], max_queries_per_goal=3
    )
    result = asyncio.run(
        admin_discovery.admin_balance_dispatch(
            request=_mock_request(), body=body, current_user=actor
        )
    )

    assert result["run_id"]
    assert [g["id"] for g in result["goals_used"]] == [goal_id]
    assert result["goals_used"][0]["query_count"] == 3
    assert len(result["queued_queries"]) == 3
    assert all(q["pillar_code"] == "PS" for q in result["queued_queries"])
    # discovery_runs row landed and carries the balancer config.
    rows = tables["discovery_runs"]
    assert len(rows) == 1
    config = rows[0]["summary_report"]["config"]
    assert config["enable_multi_source"] is True
    assert config["max_sources_total"] == 200
    assert config["custom_queries"] and len(config["custom_queries"]) == 3
    assert config["pillars_filter"] == ["PS"]


def test_balance_dispatch_auto_picks_starved_goals(monkeypatch):
    """No goal_ids -> auto-pick goals with the lowest coverage."""
    from app.routers import admin_discovery

    starved = str(uuid.uuid4())
    healthy = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    tables = {
        "csp_goals": [
            {"id": starved, "code": "PS.1", "name": "Starved", "pillar_code": "PS"},
            {"id": healthy, "code": "HG.1", "name": "Healthy", "pillar_code": "HG"},
        ],
        "cards": [
            # 5 cards link to the healthy goal, 0 link to the starved goal.
            *[
                {
                    "csp_goal_ids": [healthy],
                    "created_at": (now - timedelta(days=2)).isoformat(),
                }
                for _ in range(5)
            ],
        ],
        "discovery_runs": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)
    _stub_derive(monkeypatch, per_goal=("q1", "q2"))

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.admin_balance_dispatch(
            request=_mock_request(),
            body=None,
            current_user=actor,
        )
    )
    # Starved goal must lead the goals_used list.
    assert result["goals_used"][0]["id"] == starved


def test_balance_dispatch_rejects_unknown_goal_ids(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    tables = {"csp_goals": [], "cards": [], "discovery_runs": []}
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    body = admin_discovery.BalanceDispatchRequest(goal_ids=[str(uuid.uuid4())])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_balance_dispatch(
                request=_mock_request(), body=body, current_user=actor
            )
        )
    assert exc.value.status_code == 404


def test_balance_dispatch_rejects_non_uuid_goal_ids(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    tables = {"csp_goals": [], "cards": [], "discovery_runs": []}
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    body = admin_discovery.BalanceDispatchRequest(goal_ids=["not-a-uuid"])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_balance_dispatch(
                request=_mock_request(), body=body, current_user=actor
            )
        )
    assert exc.value.status_code == 400


def test_balance_dispatch_caps_total_queries(monkeypatch):
    """20-query global cap holds even if many goals are requested with high per-goal limits."""
    from app.routers import admin_discovery

    goal_ids = [str(uuid.uuid4()) for _ in range(admin_discovery.BALANCE_MAX_GOALS)]
    tables = {
        "csp_goals": [
            {"id": gid, "code": f"PS.{i}", "name": f"g{i}", "pillar_code": "PS"}
            for i, gid in enumerate(goal_ids)
        ],
        "cards": [],
        "discovery_runs": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)
    # Each goal returns 6 queries. 5 * 6 = 30 — must be trimmed to 20.
    _stub_derive(monkeypatch, per_goal=tuple(f"q{i}" for i in range(6)))

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    body = admin_discovery.BalanceDispatchRequest(
        goal_ids=goal_ids, max_queries_per_goal=6
    )
    result = asyncio.run(
        admin_discovery.admin_balance_dispatch(
            request=_mock_request(), body=body, current_user=actor
        )
    )
    assert len(result["queued_queries"]) == admin_discovery.BALANCE_GLOBAL_QUERY_CAP
    # Sum of per-goal query_count should equal the global cap.
    total = sum(g["query_count"] for g in result["goals_used"])
    assert total == admin_discovery.BALANCE_GLOBAL_QUERY_CAP


def test_balance_dispatch_skips_derivation_failures(monkeypatch):
    """When derive_queries raises for one goal, the dispatcher records the
    error and continues with the others — never aborts the whole batch."""
    from app import csp_goal_query_service
    from app.routers import admin_discovery

    bad_goal = str(uuid.uuid4())
    good_goal = str(uuid.uuid4())
    tables = {
        "csp_goals": [
            {"id": bad_goal, "code": "BAD", "name": "broken", "pillar_code": "PS"},
            {"id": good_goal, "code": "OK", "name": "good", "pillar_code": "MC"},
        ],
        "cards": [],
        "discovery_runs": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)

    async def _selective(goal_id, *, force=False, **_kw):
        if str(goal_id) == bad_goal:
            raise csp_goal_query_service.QueryDerivationError("nope")
        return ["a", "b"]

    monkeypatch.setattr(csp_goal_query_service, "derive_queries", _selective)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    body = admin_discovery.BalanceDispatchRequest(
        goal_ids=[bad_goal, good_goal], max_queries_per_goal=2
    )
    result = asyncio.run(
        admin_discovery.admin_balance_dispatch(
            request=_mock_request(), body=body, current_user=actor
        )
    )
    assert [g["id"] for g in result["goals_used"]] == [good_goal]
    assert [e["goal_id"] for e in result["derivation_errors"]] == [bad_goal]


def test_balance_dispatch_returns_422_when_all_goals_fail(monkeypatch):
    from fastapi import HTTPException

    from app import csp_goal_query_service
    from app.routers import admin_discovery

    goal_id = str(uuid.uuid4())
    tables = {
        "csp_goals": [
            {"id": goal_id, "code": "PS.1", "name": "x", "pillar_code": "PS"},
        ],
        "cards": [],
        "discovery_runs": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)

    async def _always_fail(goal_id, *, force=False, **_kw):
        raise csp_goal_query_service.QueryDerivationError("nope")

    monkeypatch.setattr(csp_goal_query_service, "derive_queries", _always_fail)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    body = admin_discovery.BalanceDispatchRequest(goal_ids=[goal_id])
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_balance_dispatch(
                request=_mock_request(), body=body, current_user=actor
            )
        )
    assert exc.value.status_code == 422


def test_balance_dispatch_auto_pick_ignores_archived_cards(monkeypatch):
    """Archived cards must not mask a coverage gap.

    Regression: without ``.eq("status", "active")`` on the cards query, a
    goal whose recent cards have all been archived looks "covered" and the
    auto-picker drops it from the top-N starved slice — leaving the actual
    gap unscanned.

    Setup chosen to make the test *falsifiable*. We keep total goals at
    ``BALANCE_MAX_GOALS + 2`` so the slice boundary always matters even if
    the cap changes:

    - ``starved`` has 0 cards (active or archived) → drift = -1 either way.
    - ``masked`` has 10 ARCHIVED cards →
        - WITH the fix: counts as 0 active → tied with ``starved`` → IN top-N.
        - WITHOUT the fix: counts as 10 → highest count → OUT of top-N.
    - ``BALANCE_MAX_GOALS`` ``satisfied_*`` goals each have 2 active cards
      → middle of the pack.

    The assertion ``masked in used_ids`` flips with the production fix, so
    removing the ``.eq("status", "active")`` filter would fail this test.
    """
    from app.routers import admin_discovery

    starved = str(uuid.uuid4())
    masked = str(uuid.uuid4())
    satisfied = [
        str(uuid.uuid4()) for _ in range(admin_discovery.BALANCE_MAX_GOALS)
    ]
    now = datetime.now(timezone.utc)
    tables = {
        "csp_goals": [
            {"id": starved, "code": "PS.1", "name": "Starved", "pillar_code": "PS"},
            {"id": masked, "code": "HG.1", "name": "Masked", "pillar_code": "HG"},
            *[
                {"id": gid, "code": f"CH.{i}", "name": f"Sat{i}", "pillar_code": "CH"}
                for i, gid in enumerate(satisfied)
            ],
        ],
        "cards": [
            # Masked: 10 archived cards. Without the fix, these would inflate
            # masked's count above the others and push it out of the slice.
            *[
                {
                    "csp_goal_ids": [masked],
                    "created_at": (now - timedelta(days=2)).isoformat(),
                    "status": "archived",
                }
                for _ in range(10)
            ],
            # Each "satisfied" goal: 2 active cards. Middle-of-pack drift.
            *[
                {
                    "csp_goal_ids": [gid],
                    "created_at": (now - timedelta(days=2)).isoformat(),
                    "status": "active",
                }
                for gid in satisfied
                for _ in range(2)
            ],
        ],
        "discovery_runs": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)
    _bypass_budget(monkeypatch)
    _stub_derive(monkeypatch, per_goal=("q1", "q2"))

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    result = asyncio.run(
        admin_discovery.admin_balance_dispatch(
            request=_mock_request(), body=None, current_user=actor
        )
    )
    used_ids = [g["id"] for g in result["goals_used"]]
    # ``starved`` is always picked (true zero-card goal).
    assert starved in used_ids
    # ``masked`` is only picked when archived cards are filtered out;
    # otherwise its inflated count pushes it past the BALANCE_MAX_GOALS=5
    # slice. This is the falsifiable half of the regression.
    assert masked in used_ids, (
        "masked goal was excluded from the auto-pick — archived cards are "
        "inflating its score, which means the .eq('status', 'active') "
        "filter regressed."
    )


def test_admin_refresh_goal_queries_returns_404_for_missing_goal(monkeypatch):
    """A typo'd UUID surfaces as 404, not 422 — distinguishes 'no such row'
    from 'LLM couldn't produce a result'."""
    from fastapi import HTTPException

    from app import csp_goal_query_service
    from app.routers import admin_discovery

    async def _raise_not_found(goal_id, *, force=False, **_kw):
        raise csp_goal_query_service.GoalNotFoundError(f"goal {goal_id} not found")

    monkeypatch.setattr(
        csp_goal_query_service, "derive_queries", _raise_not_found
    )
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_refresh_goal_queries(
                request=_mock_request(),
                goal_id=str(uuid.uuid4()),
                current_user=actor,
            )
        )
    assert exc.value.status_code == 404


def test_admin_refresh_goal_queries_returns_422_for_parse_failure(monkeypatch):
    """LLM returned garbage → 422, since the goal exists but the result is unusable."""
    from fastapi import HTTPException

    from app import csp_goal_query_service
    from app.routers import admin_discovery

    async def _raise_parse(goal_id, *, force=False, **_kw):
        raise csp_goal_query_service.QueryDerivationError("unparseable response")

    monkeypatch.setattr(csp_goal_query_service, "derive_queries", _raise_parse)
    _bypass_admin(monkeypatch)

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_refresh_goal_queries(
                request=_mock_request(),
                goal_id=str(uuid.uuid4()),
                current_user=actor,
            )
        )
    assert exc.value.status_code == 422


def test_admin_refresh_goal_queries_rejects_non_uuid(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _bypass_admin(monkeypatch)
    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.admin_refresh_goal_queries(
                request=_mock_request(),
                goal_id="not-a-uuid",
                current_user=actor,
            )
        )
    assert exc.value.status_code == 400
