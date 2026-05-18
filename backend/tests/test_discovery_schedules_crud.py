"""Unit tests for the admin discovery-schedule CRUD endpoints (PR E).

Covers:
- ``list_admin_schedules`` returns serialized rows.
- ``create_admin_schedule`` inserts, sets a default ``next_run_at``, and
  writes an audit row tagged with ``target_type="schedule"``.
- ``update_admin_schedule`` writes only present fields, audits before/after,
  and rejects empty bodies + unknown ids.
- ``delete_admin_schedule`` removes the row, preserves no past
  ``discovery_runs`` (i.e. doesn't touch them), and audits the deletion.
- Pillar / category whitelists are enforced.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock supabase chain — supports select/insert/update/delete with eq filters.
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
        self._order: List[tuple[str, bool]] = []

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

    def order(self, key, desc=False):
        self._order.append((key, desc))
        return self

    def limit(self, *_a, **_kw):
        return self

    def execute(self) -> _MockResponse:
        if self._mode == "insert":
            payload = dict(self._payload or {})
            payload.setdefault("id", str(uuid.uuid4()))
            payload.setdefault("created_at", "2026-05-09T00:00:00+00:00")
            self._rows.append(payload)
            self._sink.setdefault(self._table_name, []).append(payload)
            return _MockResponse([payload])

        matched = [
            row
            for row in self._rows
            if all(row.get(k) == v for k, v in self._filters.items())
        ]

        if self._mode == "update":
            updated_rows: List[Dict[str, Any]] = []
            for row in matched:
                row.update(self._payload or {})
                updated_rows.append(row)
            return _MockResponse(updated_rows)

        if self._mode == "delete":
            for row in list(matched):
                self._rows.remove(row)
            return _MockResponse(matched)

        # select
        out = list(matched)
        for key, desc in reversed(self._order):
            out.sort(key=lambda r: (r.get(key) or ""), reverse=desc)
        return _MockResponse(out, count=len(out))


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables
        self.sink: Dict[str, List[Dict[str, Any]]] = {}

    def table(self, name: str) -> _MockTable:
        return _MockTable(
            self._tables.setdefault(name, []), self.sink, name
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
    from app import audit_service
    from app.routers import admin as admin_router
    from app.routers import admin_discovery_schedules

    # Schedule CRUD endpoints live in their own sub-router; the parent
    # ``admin_discovery`` aggregator is now a pure include-router shell
    # that no longer imports ``supabase`` directly.
    monkeypatch.setattr(admin_discovery_schedules, "supabase", mock_sb)
    monkeypatch.setattr(admin_router, "supabase", mock_sb)
    # audit_service owns its own top-level ``supabase`` binding; patch it
    # too so audit-row inserts hit the same mock as the primary mutation.
    monkeypatch.setattr(audit_service, "supabase", mock_sb)


def _admin_actor() -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "email": "admin@example.com",
        "role": "admin",
    }


# ---------------------------------------------------------------------------
# list
# ---------------------------------------------------------------------------


def test_list_schedules_returns_serialized_rows(monkeypatch):
    from app.routers import admin_discovery

    sched_id = str(uuid.uuid4())
    tables = {
        "discovery_schedule": [
            {
                "id": sched_id,
                "name": "default",
                "enabled": True,
                "interval_hours": 24,
                "max_search_queries_per_run": 20,
                "pillars_to_scan": ["CH", "MC"],
                "process_rss_first": True,
                "categories_to_scan": ["rss", "news"],
                "source_ids": None,
                "notes": "Primary nightly scan",
                "created_at": "2026-05-01T00:00:00+00:00",
            }
        ],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    out = asyncio.run(
        admin_discovery.list_admin_schedules(current_user=_admin_actor())
    )
    assert out["total"] == 1
    item = out["items"][0]
    assert item["id"] == sched_id
    assert item["categories_to_scan"] == ["rss", "news"]
    assert item["source_ids"] == []
    assert item["notes"] == "Primary nightly scan"
    # Pre-extension rows that don't have categories_to_scan still serialize
    # cleanly with empty list defaults — checked indirectly above.


# ---------------------------------------------------------------------------
# create
# ---------------------------------------------------------------------------


def test_create_schedule_inserts_and_audits(monkeypatch):
    from app.routers import admin_discovery

    tables: Dict[str, List[Dict[str, Any]]] = {
        "discovery_schedule": [],
        "admin_audit_log": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    body = admin_discovery.AdminScheduleCreate(
        name="Mobility weekly",
        enabled=True,
        interval_hours=168,
        pillars_to_scan=["MC"],
        categories_to_scan=["rss", "news"],
        process_rss_first=False,
        notes="Weekly deep dive on mobility",
    )
    actor = _admin_actor()
    result = asyncio.run(
        admin_discovery.create_admin_schedule(
            request=_mock_request(), body=body, current_user=actor
        )
    )
    assert result["name"] == "Mobility weekly"
    assert result["pillars_to_scan"] == ["MC"]
    assert result["categories_to_scan"] == ["rss", "news"]
    # The route auto-fills next_run_at when the caller doesn't provide one,
    # so an enabled schedule will eventually fire.
    assert result["next_run_at"] is not None

    audits = tables["admin_audit_log"]
    assert any(
        row.get("action") == "admin.schedule.create"
        and row.get("target_type") == "schedule"
        for row in audits
    )


def test_create_schedule_rejects_unknown_pillar(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _patch_supabase(monkeypatch, _MockSupabase({"discovery_schedule": []}))
    _bypass_admin(monkeypatch)

    body = admin_discovery.AdminScheduleCreate(
        name="Bogus",
        pillars_to_scan=["XX"],  # not in the whitelist
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.create_admin_schedule(
                request=_mock_request(),
                body=body,
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 400
    assert "pillar" in exc.value.detail.lower()


def test_create_schedule_rejects_unknown_category(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _patch_supabase(monkeypatch, _MockSupabase({"discovery_schedule": []}))
    _bypass_admin(monkeypatch)

    body = admin_discovery.AdminScheduleCreate(
        name="Bogus", categories_to_scan=["nope"]
    )
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.create_admin_schedule(
                request=_mock_request(),
                body=body,
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 400
    assert "categor" in exc.value.detail.lower()


# ---------------------------------------------------------------------------
# update
# ---------------------------------------------------------------------------


def test_update_schedule_patches_only_present_fields(monkeypatch):
    from app.routers import admin_discovery

    sched_id = str(uuid.uuid4())
    tables: Dict[str, List[Dict[str, Any]]] = {
        "discovery_schedule": [
            {
                "id": sched_id,
                "name": "default",
                "enabled": True,
                "interval_hours": 24,
                "pillars_to_scan": ["CH"],
                "process_rss_first": True,
                "created_at": "2026-05-01T00:00:00+00:00",
            }
        ],
        "admin_audit_log": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    body = admin_discovery.AdminScheduleUpdate(enabled=False, notes="paused")
    actor = _admin_actor()
    result = asyncio.run(
        admin_discovery.update_admin_schedule(
            request=_mock_request(),
            schedule_id=sched_id,
            body=body,
            current_user=actor,
        )
    )
    assert result["enabled"] is False
    assert result["notes"] == "paused"
    # Untouched fields stay the same.
    assert result["interval_hours"] == 24
    assert result["pillars_to_scan"] == ["CH"]

    audit_rows = tables["admin_audit_log"]
    assert any(
        row.get("action") == "admin.schedule.update" for row in audit_rows
    )


def test_update_schedule_rejects_empty_body(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    sched_id = str(uuid.uuid4())
    tables = {
        "discovery_schedule": [
            {"id": sched_id, "name": "default", "enabled": True}
        ],
    }
    _patch_supabase(monkeypatch, _MockSupabase(tables))
    _bypass_admin(monkeypatch)

    body = admin_discovery.AdminScheduleUpdate()
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.update_admin_schedule(
                request=_mock_request(),
                schedule_id=sched_id,
                body=body,
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 400


def test_update_schedule_returns_404_for_missing_id(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _patch_supabase(monkeypatch, _MockSupabase({"discovery_schedule": []}))
    _bypass_admin(monkeypatch)

    body = admin_discovery.AdminScheduleUpdate(enabled=False)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.update_admin_schedule(
                request=_mock_request(),
                schedule_id=str(uuid.uuid4()),
                body=body,
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 404


def test_update_schedule_serializes_next_run_at(monkeypatch):
    """``next_run_at`` arrives as a datetime; supabase wants an ISO string."""
    from app.routers import admin_discovery

    sched_id = str(uuid.uuid4())
    tables: Dict[str, List[Dict[str, Any]]] = {
        "discovery_schedule": [
            {"id": sched_id, "name": "default", "enabled": True}
        ],
        "admin_audit_log": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    when = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    body = admin_discovery.AdminScheduleUpdate(next_run_at=when)
    asyncio.run(
        admin_discovery.update_admin_schedule(
            request=_mock_request(),
            schedule_id=sched_id,
            body=body,
            current_user=_admin_actor(),
        )
    )
    persisted = tables["discovery_schedule"][0]["next_run_at"]
    assert isinstance(persisted, str)
    assert persisted.startswith("2026-06-01")


# ---------------------------------------------------------------------------
# delete
# ---------------------------------------------------------------------------


def test_delete_schedule_removes_row_and_preserves_runs(monkeypatch):
    from app.routers import admin_discovery

    sched_id = str(uuid.uuid4())
    tables: Dict[str, List[Dict[str, Any]]] = {
        "discovery_schedule": [
            {"id": sched_id, "name": "to-delete", "enabled": False}
        ],
        # discovery_runs rows must NOT be touched by the delete.
        "discovery_runs": [
            {
                "id": str(uuid.uuid4()),
                "summary_report": {"scheduled_by": sched_id},
                "status": "completed",
            }
        ],
        "admin_audit_log": [],
    }
    mock_sb = _MockSupabase(tables)
    _patch_supabase(monkeypatch, mock_sb)
    _bypass_admin(monkeypatch)

    result = asyncio.run(
        admin_discovery.delete_admin_schedule(
            request=_mock_request(),
            schedule_id=sched_id,
            current_user=_admin_actor(),
        )
    )
    assert result is None
    assert tables["discovery_schedule"] == []
    # Past runs still around — deleting a schedule must not cascade.
    assert len(tables["discovery_runs"]) == 1
    audit_rows = tables["admin_audit_log"]
    assert any(
        row.get("action") == "admin.schedule.delete" for row in audit_rows
    )
    # The "before" snapshot in the audit row is what operators use to recover
    # accidentally-deleted schedules.
    deletion_audit = next(
        row
        for row in audit_rows
        if row.get("action") == "admin.schedule.delete"
    )
    assert deletion_audit["before"]["id"] == sched_id


def test_delete_schedule_returns_404_for_missing_id(monkeypatch):
    from fastapi import HTTPException

    from app.routers import admin_discovery

    _patch_supabase(monkeypatch, _MockSupabase({"discovery_schedule": []}))
    _bypass_admin(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            admin_discovery.delete_admin_schedule(
                request=_mock_request(),
                schedule_id=str(uuid.uuid4()),
                current_user=_admin_actor(),
            )
        )
    assert exc.value.status_code == 404
