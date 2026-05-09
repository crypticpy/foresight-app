"""Unit tests for the admin safety incidents router (list / detail / patch)."""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException


# ---------------------------------------------------------------------------
# Supabase mock — supports the chain used by routers/safety.py
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data, count: int | None = None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, store: dict[str, list[dict[str, Any]]], table: str):
        self._store = store
        self._table = table
        self._eq: dict[str, Any] = {}
        self._gte: dict[str, Any] = {}
        self._lt: dict[str, Any] = {}
        self._is_null: list[str] = []
        self._order_keys: list[tuple[str, bool]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None
        self._head = False
        self._count_mode: str | None = None
        self._update_payload: dict[str, Any] | None = None

    def select(self, *_a, count: str | None = None, head: bool = False, **_kw):
        self._count_mode = count
        self._head = head
        return self

    def order(self, key, desc=True):
        self._order_keys.append((key, desc))
        return self

    def eq(self, k, v):
        self._eq[k] = v
        return self

    def gte(self, k, v):
        self._gte[k] = v
        return self

    def lt(self, k, v):
        self._lt[k] = v
        return self

    def is_(self, k, v):
        if v == "null":
            self._is_null.append(k)
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, payload):
        self._update_payload = payload
        return self

    def insert(self, row):
        self._store.setdefault(self._table, []).append(row)
        return _ExecOnly([row])

    def _matches(self, row):
        for k, v in self._eq.items():
            if row.get(k) != v:
                return False
        for k, v in self._gte.items():
            rv = row.get(k)
            if rv is None or rv < v:
                return False
        for k, v in self._lt.items():
            rv = row.get(k)
            if rv is None or rv >= v:
                return False
        for k in self._is_null:
            if row.get(k) is not None:
                return False
        return True

    def execute(self):
        rows = list(self._store.get(self._table, []))
        if self._update_payload is not None:
            updated = []
            for r in rows:
                if self._matches(r):
                    r.update(self._update_payload)
                    updated.append(r)
            return _Resp(updated)

        filtered = [r for r in rows if self._matches(r)]

        # Order: last .order() call dominates first.
        for key, desc in reversed(self._order_keys or []):
            filtered.sort(key=lambda r, k=key: r.get(k, ""), reverse=desc)

        if self._head and self._count_mode == "exact":
            return _Resp([], count=len(filtered))

        if self._range is not None:
            start, end = self._range
            filtered = filtered[start : end + 1]
        if self._limit is not None:
            filtered = filtered[: self._limit]
        return _Resp(filtered)


class _ExecOnly:
    def __init__(self, data):
        self._data = data

    def execute(self):
        return _Resp(self._data)


class _Supabase:
    def __init__(self, store: dict[str, list[dict[str, Any]]] | None = None):
        self._store = store or {"safety_incidents": []}

    def table(self, name):
        return _Query(self._store, name)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bypass_admin(monkeypatch):
    from app import authz
    from app.routers import safety as safety_router

    monkeypatch.setattr(authz, "require_admin", lambda user: None)
    monkeypatch.setattr(safety_router, "require_admin", lambda user: None)


def _bypass_rate_limit(monkeypatch):
    from app.routers import safety as safety_router

    monkeypatch.setattr(safety_router.limiter, "enabled", False)


def _patch_supabase(monkeypatch, rows):
    from app.routers import safety as safety_router

    sb = _Supabase({"safety_incidents": rows})
    monkeypatch.setattr(safety_router, "supabase", sb)
    return sb


def _admin():
    return {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}


def _request():
    return type("R", (), {})()


def _make_incident(**overrides):
    base = {
        "id": str(uuid.uuid4()),
        "created_at": "2026-05-09T12:00:00+00:00",
        "kind": "injection",
        "severity": "high",
        "source": "chat",
        "user_id": str(uuid.uuid4()),
        "pattern_id": "injection.instruction_override.ignore",
        "category": "instruction_override",
        "excerpt": "ignore previous instructions",
        "metadata": {},
        "disposition": None,
    }
    base.update(overrides)
    return base


_LIST_DEFAULTS = {
    "kind": None,
    "severity": None,
    "source": None,
    "user_id": None,
    "pattern_id": None,
    "disposition": None,
    "from_ts": None,
    "to_ts": None,
    "limit": 50,
    "offset": 0,
}


def _call_list(monkeypatch, **kwargs):
    from app.routers import safety as safety_router

    _bypass_admin(monkeypatch)
    _bypass_rate_limit(monkeypatch)
    params = {**_LIST_DEFAULTS, **kwargs}
    return asyncio.run(
        safety_router.list_safety_incidents(
            request=_request(), current_user=_admin(), **params
        )
    )


def _call_detail(monkeypatch, incident_id):
    from app.routers import safety as safety_router

    _bypass_admin(monkeypatch)
    _bypass_rate_limit(monkeypatch)
    return asyncio.run(
        safety_router.get_safety_incident(
            request=_request(),
            incident_id=incident_id,
            current_user=_admin(),
        )
    )


def _call_patch(monkeypatch, incident_id, disposition, note=None):
    from app.routers import safety as safety_router

    _bypass_admin(monkeypatch)
    _bypass_rate_limit(monkeypatch)
    payload = safety_router.SafetyDispositionUpdate(
        disposition=disposition, note=note
    )
    return asyncio.run(
        safety_router.update_safety_incident(
            request=_request(),
            incident_id=incident_id,
            payload=payload,
            current_user=_admin(),
        )
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_list_returns_open_counts(monkeypatch):
    rows = [
        _make_incident(severity="high", disposition=None),
        _make_incident(severity="medium", disposition=None),
        _make_incident(severity="high", disposition="false_positive"),
    ]
    _patch_supabase(monkeypatch, rows)

    result = _call_list(monkeypatch)
    assert result["open_counts"]["high"] == 1
    assert result["open_counts"]["medium"] == 1
    assert result["open_counts"]["low"] == 0


def test_list_filters_by_disposition_open(monkeypatch):
    rows = [
        _make_incident(id="open", disposition=None),
        _make_incident(id="reviewed", disposition="false_positive"),
    ]
    _patch_supabase(monkeypatch, rows)

    result = _call_list(monkeypatch, disposition="open")
    ids = [r["id"] for r in result["items"]]
    assert ids == ["open"]


def test_list_validates_kind(monkeypatch):
    _patch_supabase(monkeypatch, [])
    with pytest.raises(HTTPException) as exc:
        _call_list(monkeypatch, kind="invalid")
    assert exc.value.status_code == 400


def test_list_validates_iso8601(monkeypatch):
    _patch_supabase(monkeypatch, [])
    with pytest.raises(HTTPException) as exc:
        _call_list(monkeypatch, from_ts="not-a-date")
    assert exc.value.status_code == 400


def test_detail_404_when_missing(monkeypatch):
    _patch_supabase(monkeypatch, [])
    with pytest.raises(HTTPException) as exc:
        _call_detail(monkeypatch, str(uuid.uuid4()))
    assert exc.value.status_code == 404


def test_detail_returns_row(monkeypatch):
    inc = _make_incident()
    _patch_supabase(monkeypatch, [inc])
    out = _call_detail(monkeypatch, inc["id"])
    assert out["id"] == inc["id"]


def test_patch_sets_disposition_and_reviewed_fields(monkeypatch):
    inc = _make_incident(disposition=None)
    _patch_supabase(monkeypatch, [inc])
    out = _call_patch(monkeypatch, inc["id"], "true_positive", note="confirmed")
    assert out["disposition"] == "true_positive"
    assert out["reviewed_by"] is not None
    assert out["reviewed_at"] is not None
    assert out["metadata"]["review_note"] == "confirmed"


def test_patch_validates_disposition(monkeypatch):
    inc = _make_incident()
    _patch_supabase(monkeypatch, [inc])
    from app.routers import safety as safety_router

    # Construct payload bypassing the pydantic field constraint isn't needed —
    # we test the router-level validation against arbitrary string.
    _bypass_admin(monkeypatch)
    _bypass_rate_limit(monkeypatch)
    payload = safety_router.SafetyDispositionUpdate(disposition="bogus")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            safety_router.update_safety_incident(
                request=_request(),
                incident_id=inc["id"],
                payload=payload,
                current_user=_admin(),
            )
        )
    assert exc.value.status_code == 400


def test_patch_404_when_missing(monkeypatch):
    _patch_supabase(monkeypatch, [])
    with pytest.raises(HTTPException) as exc:
        _call_patch(monkeypatch, str(uuid.uuid4()), "true_positive")
    assert exc.value.status_code == 404


def test_rbac_rejects_non_admin(monkeypatch):
    """When require_admin raises, the endpoint must propagate the 403."""
    from app.routers import safety as safety_router

    def _deny(user):
        raise HTTPException(status_code=403, detail="forbidden")

    monkeypatch.setattr(safety_router, "require_admin", _deny)
    _bypass_rate_limit(monkeypatch)
    _patch_supabase(monkeypatch, [_make_incident()])

    params = {**_LIST_DEFAULTS}
    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            safety_router.list_safety_incidents(
                request=_request(),
                current_user={"id": "u", "role": "user"},
                **params,
            )
        )
    assert exc.value.status_code == 403
