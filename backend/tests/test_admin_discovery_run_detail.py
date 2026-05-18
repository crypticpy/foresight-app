"""Unit tests for the admin discovery run-detail endpoint.

Covers:
- ``_aggregate_run_counts`` correctly groups rows by ``processing_status``,
  triage outcome, and error stage.
- ``get_discovery_run_detail`` returns the run row, aggregate counts, and a
  paginated slice of ``discovered_sources``.
- 404 when the run does not exist.
- ``limit`` / ``offset`` argument validation.
- The detail-page select list excludes ``full_content`` and
  ``content_embedding`` (the heavy columns).
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock supabase chain — extended with .range() for paginated reads.
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
        self._select_arg: str = "*"
        self._payload: Optional[Dict[str, Any]] = None
        self._filters: Dict[str, Any] = {}
        self._gte: Dict[str, Any] = {}
        self._order: List[tuple[str, bool]] = []
        self._range: Optional[tuple[int, int]] = None

    def select(self, columns: str = "*", *_a, **_kw):
        self._mode = "select"
        self._select_arg = columns
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

    def range(self, start: int, end: int):
        # Supabase .range() is inclusive on both ends.
        self._range = (start, end)
        return self

    def execute(self) -> _MockResponse:
        if self._mode == "insert":
            payload = dict(self._payload or {})
            payload.setdefault("id", str(uuid.uuid4()))
            self._rows.append(payload)
            self._sink.setdefault(self._table_name, []).append(payload)
            return _MockResponse([payload])

        out: List[Dict[str, Any]] = []
        for row in self._rows:
            if all(row.get(k) == v for k, v in self._filters.items()):
                if all(
                    (row.get(k) or "") >= v for k, v in self._gte.items()
                ):
                    out.append(row)
        for key, desc in reversed(self._order):
            out.sort(key=lambda r: (r.get(key) or ""), reverse=desc)
        if self._range is not None:
            start, end = self._range
            out = out[start : end + 1]
        return _MockResponse(out, count=len(out))


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables
        self.sink: Dict[str, List[Dict[str, Any]]] = {}
        self.last_select: Dict[str, str] = {}

    def table(self, name: str) -> _MockTable:
        rows = self._tables.setdefault(name, [])
        mock = _MockTable(rows, self.sink, name)
        # Capture the most recent select() arg per table so tests can assert
        # on the column-list without re-running the call.
        original_select = mock.select

        def capture_select(columns: str = "*", *a, **kw):
            self.last_select[name] = columns
            return original_select(columns, *a, **kw)

        mock.select = capture_select  # type: ignore[assignment]
        return mock


def _bypass_admin(monkeypatch):
    from app import authz

    monkeypatch.setattr(authz, "require_admin", lambda user: None)


def _patch_supabase(monkeypatch, mock_sb):
    from app.routers import admin_discovery_runs

    # The run-detail endpoint lives in its own sub-router; the parent
    # ``admin_discovery`` aggregator is now a pure include-router shell
    # that no longer imports ``supabase`` directly. Patch the sub-router
    # binding the handler actually reads.
    monkeypatch.setattr(admin_discovery_runs, "supabase", mock_sb)


def _admin_actor() -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "email": "admin@example.com",
        "role": "admin",
    }


# ---------------------------------------------------------------------------
# _aggregate_run_counts
# ---------------------------------------------------------------------------


def test_aggregate_run_counts_groups_status_triage_and_errors():
    from app.routers.admin_discovery import _aggregate_run_counts

    rows = [
        {"processing_status": "card_created", "triage_is_relevant": True},
        {"processing_status": "card_created", "triage_is_relevant": True},
        {"processing_status": "card_enriched", "triage_is_relevant": True},
        {"processing_status": "filtered_triage", "triage_is_relevant": False},
        {"processing_status": "filtered_triage", "triage_is_relevant": False},
        {
            "processing_status": "error",
            "triage_is_relevant": None,
            "error_stage": "analyze",
        },
        {
            "processing_status": "error",
            "triage_is_relevant": None,
            "error_stage": "embed",
        },
        # Row with no processing_status — should fall into "unknown".
        {"processing_status": None, "triage_is_relevant": None},
    ]
    out = _aggregate_run_counts(rows)
    assert out["by_processing_status"] == {
        "card_created": 2,
        "card_enriched": 1,
        "filtered_triage": 2,
        "error": 2,
        "unknown": 1,
    }
    assert out["by_triage"] == {"passed": 3, "failed": 2, "pending": 3}
    assert out["by_error_stage"] == {"analyze": 1, "embed": 1}
    assert out["card_outcomes"] == {"card_created": 2, "card_enriched": 1}


def test_aggregate_run_counts_handles_empty_input():
    from app.routers.admin_discovery import _aggregate_run_counts

    out = _aggregate_run_counts([])
    assert out == {
        "by_processing_status": {},
        "by_triage": {"passed": 0, "failed": 0, "pending": 0},
        "by_error_stage": {},
        "card_outcomes": {"card_created": 0, "card_enriched": 0},
    }


# ---------------------------------------------------------------------------
# get_discovery_run_detail
# ---------------------------------------------------------------------------


def _seed_run_and_sources(
    run_id: str, source_count: int = 4
) -> Dict[str, List[Dict[str, Any]]]:
    """Create a run row + ``source_count`` discovered_sources rows.

    Statuses cycle through card_created / filtered_triage / error / card_enriched
    so the aggregator has something to count. Timestamps step backwards so
    sort-by-created_at-desc has a deterministic order.
    """
    base = datetime(2026, 5, 1, tzinfo=timezone.utc)
    cycle = ["card_created", "filtered_triage", "error", "card_enriched"]
    triage_cycle = [True, False, None, True]
    sources = []
    for i in range(source_count):
        sources.append(
            {
                "id": str(uuid.uuid4()),
                "discovery_run_id": run_id,
                "url": f"https://example.com/{i}",
                "title": f"Source {i}",
                "domain": "example.com",
                "processing_status": cycle[i % len(cycle)],
                "triage_is_relevant": triage_cycle[i % len(triage_cycle)],
                "error_stage": "analyze" if cycle[i % len(cycle)] == "error" else None,
                "created_at": (
                    base.replace(second=source_count - i)
                ).isoformat(),
                "full_content": "x" * 1000,  # heavy column — must NOT leak
                "content_embedding": [0.0] * 1536,  # heavy column — must NOT leak
            }
        )
    return {
        "discovery_runs": [
            {
                "id": run_id,
                "started_at": base.isoformat(),
                "completed_at": base.isoformat(),
                "status": "completed",
                "pillars_scanned": ["MC"],
                "queries_generated": 5,
                "sources_found": source_count,
                "sources_relevant": 2,
                "cards_created": 1,
                "cards_enriched": 1,
                "cards_deduplicated": 0,
                "estimated_cost": 0.42,
                "summary_report": {"by_pillar": {"MC": {"found": source_count}}},
                "triggered_by": "manual",
                "created_at": base.isoformat(),
            }
        ],
        "discovered_sources": sources,
    }


def test_run_detail_returns_run_aggregates_and_first_page(monkeypatch):
    from app.routers import admin_discovery

    run_id = str(uuid.uuid4())
    tables = _seed_run_and_sources(run_id, source_count=4)
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    result = asyncio.run(
        admin_discovery.get_discovery_run_detail(
            run_id=run_id, limit=10, offset=0, current_user=_admin_actor()
        )
    )

    assert result["run"]["id"] == run_id
    assert result["run"]["status"] == "completed"
    assert result["totals"]["sources_total"] == 4
    assert result["totals"]["aggregate_truncated"] is False
    assert result["totals"]["by_processing_status"] == {
        "card_created": 1,
        "filtered_triage": 1,
        "error": 1,
        "card_enriched": 1,
    }
    assert result["totals"]["by_triage"] == {"passed": 2, "failed": 1, "pending": 1}
    assert result["totals"]["card_outcomes"] == {
        "card_created": 1,
        "card_enriched": 1,
    }
    assert result["sources"]["limit"] == 10
    assert result["sources"]["offset"] == 0
    assert result["sources"]["has_more"] is False
    assert len(result["sources"]["items"]) == 4


def test_run_detail_excludes_heavy_columns(monkeypatch):
    """``full_content`` and ``content_embedding`` must never appear in the
    detail-page select list — they would dominate the payload size."""
    from app.routers.admin_discovery import (
        DISCOVERED_SOURCE_DETAIL_SELECT,
        get_discovery_run_detail,
    )

    assert "full_content" not in DISCOVERED_SOURCE_DETAIL_SELECT
    assert "content_embedding" not in DISCOVERED_SOURCE_DETAIL_SELECT

    run_id = str(uuid.uuid4())
    tables = _seed_run_and_sources(run_id, source_count=2)
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    asyncio.run(
        get_discovery_run_detail(
            run_id=run_id, limit=10, offset=0, current_user=_admin_actor()
        )
    )
    captured = mock_sb.last_select.get("discovered_sources", "")
    assert "full_content" not in captured
    assert "content_embedding" not in captured
    # And — sanity check — the columns we actually want ARE selected.
    assert "processing_status" in captured
    assert "triage_is_relevant" in captured


def test_run_detail_pagination(monkeypatch):
    from app.routers import admin_discovery

    run_id = str(uuid.uuid4())
    tables = _seed_run_and_sources(run_id, source_count=12)
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    page1 = asyncio.run(
        admin_discovery.get_discovery_run_detail(
            run_id=run_id, limit=5, offset=0, current_user=_admin_actor()
        )
    )
    assert len(page1["sources"]["items"]) == 5
    assert page1["sources"]["has_more"] is True
    assert page1["totals"]["sources_total"] == 12

    page3 = asyncio.run(
        admin_discovery.get_discovery_run_detail(
            run_id=run_id, limit=5, offset=10, current_user=_admin_actor()
        )
    )
    # Only 2 left after offset=10 (12 total).
    assert len(page3["sources"]["items"]) == 2
    assert page3["sources"]["has_more"] is False
    assert page3["sources"]["offset"] == 10

    # No overlap between page1 ids and page3 ids.
    page1_ids = {item["id"] for item in page1["sources"]["items"]}
    page3_ids = {item["id"] for item in page3["sources"]["items"]}
    assert page1_ids.isdisjoint(page3_ids)


def test_run_detail_returns_404_for_missing_run(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    mock_sb = _MockSupabase({"discovery_runs": [], "discovered_sources": []})
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.get_discovery_run_detail(
                run_id=str(uuid.uuid4()),
                limit=10,
                offset=0,
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 404


@pytest.mark.parametrize(
    "limit,offset",
    [(0, 0), (-1, 0), (201, 0), (10, -5)],
)
def test_run_detail_validates_pagination_args(monkeypatch, limit, offset):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _bypass_admin(monkeypatch)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.get_discovery_run_detail(
                run_id=str(uuid.uuid4()),
                limit=limit,
                offset=offset,
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 400
