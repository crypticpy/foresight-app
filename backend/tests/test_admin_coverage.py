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
        out = []
        for row in self._rows:
            if all(row.get(k) == v for k, v in self._filters.items()):
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


def _patch_supabase(monkeypatch, mock_sb):
    from app.routers import admin as admin_router
    from app.routers import admin_discovery

    monkeypatch.setattr(admin_discovery, "supabase", mock_sb)
    monkeypatch.setattr(admin_router, "supabase", mock_sb)


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
    ch = result["by_pillar"]["CH"]
    assert ch["cards"] == 3
    # share = 3/6 = 0.5; expected = 1/6 ≈ 0.1667; drift ≈ +0.3333.
    assert ch["share"] == 0.5
    assert ch["expected_share"] == round(1 / 6, 4)
    assert ch["drift"] == round(0.5 - 1 / 6, 4)
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
