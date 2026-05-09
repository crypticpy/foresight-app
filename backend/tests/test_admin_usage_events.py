"""Unit tests for the admin LLM usage event read API.

Covers list filtering, pagination, ISO 8601 validation, RBAC, and detail
fetch + 404 path. Mocks the supabase chain so we can exercise the endpoint
without a real DB.
"""

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
# Minimal supabase mock — supports the chain used by routers/usage.py:
# .select / .order / .range / .eq / .gte / .lt / .in_ / .limit / .execute
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: list[dict[str, Any]]):
        self.data = data


class _Query:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows
        self._eq: dict[str, Any] = {}
        self._gte: dict[str, Any] = {}
        self._lt: dict[str, Any] = {}
        self._in: dict[str, list[Any]] = {}
        self._or: list[list[tuple[str, str, list[Any]]]] = []
        self._order_keys: list[tuple[str, bool]] = []
        self._range: tuple[int, int] | None = None
        self._limit: int | None = None

    # Builder methods ------------------------------------------------------
    def select(self, *_a, **_kw):
        return self

    def order(self, key, desc=True):
        self._order_keys.append((key, desc))
        return self

    def eq(self, key, value):
        self._eq[key] = value
        return self

    def gte(self, key, value):
        self._gte[key] = value
        return self

    def lt(self, key, value):
        self._lt[key] = value
        return self

    def in_(self, key, values):
        self._in[key] = list(values)
        return self

    def or_(self, expr: str):
        # Split on top-level commas — values inside ``in.(...)`` parens are kept.
        parts: list[str] = []
        depth = 0
        buf = ""
        for ch in expr:
            if ch == "(":
                depth += 1
                buf += ch
            elif ch == ")":
                depth -= 1
                buf += ch
            elif ch == "," and depth == 0:
                parts.append(buf)
                buf = ""
            else:
                buf += ch
        if buf:
            parts.append(buf)
        clauses: list[tuple[str, str, list[Any]]] = []
        for part in parts:
            col, op, rest = part.split(".", 2)
            if op == "in":
                values = [v for v in rest.strip("()").split(",") if v]
            else:
                values = [rest]
            clauses.append((col, op, values))
        self._or.append(clauses)
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def limit(self, n):
        self._limit = n
        return self

    # Executor -------------------------------------------------------------
    @staticmethod
    def _or_clause_matches(
        row: dict[str, Any], clause: tuple[str, str, list[Any]]
    ) -> bool:
        col, op, values = clause
        v = row.get(col)
        if op == "in":
            return v in values
        if op == "eq":
            return str(v) == values[0]
        return False

    def _matches(self, row: dict[str, Any]) -> bool:
        for k, v in self._eq.items():
            if row.get(k) != v:
                return False
        for k, v in self._gte.items():
            if row.get(k) is None or row[k] < v:
                return False
        for k, v in self._lt.items():
            if row.get(k) is None or row[k] >= v:
                return False
        for k, vs in self._in.items():
            if row.get(k) not in vs:
                return False
        for clauses in self._or:
            if not any(self._or_clause_matches(row, c) for c in clauses):
                return False
        return True

    def execute(self) -> _Resp:
        filtered = [r for r in self._rows if self._matches(r)]
        # Stable sort applied in reverse so the first .order() call dominates.
        order_keys = self._order_keys or [("created_at", True)]
        for key, desc in reversed(order_keys):
            filtered.sort(key=lambda r, k=key: r.get(k, ""), reverse=desc)
        if self._range is not None:
            start, end = self._range
            # Supabase range is inclusive on both ends
            filtered = filtered[start : end + 1]
        if self._limit is not None:
            filtered = filtered[: self._limit]
        return _Resp(filtered)


class _Supabase:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def table(self, _name):
        return _Query(self._rows)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bypass_admin(monkeypatch):
    from app import authz

    monkeypatch.setattr(authz, "require_admin", lambda user: None)


def _patch_supabase(monkeypatch, rows: list[dict[str, Any]]):
    from app.routers import usage as usage_router

    monkeypatch.setattr(usage_router, "supabase", _Supabase(rows))


def _make_event(**overrides) -> dict[str, Any]:
    base = {
        "id": str(uuid.uuid4()),
        "created_at": "2026-05-09T12:00:00+00:00",
        "user_id": str(uuid.uuid4()),
        "provider": "openai",
        "model": "gpt-5.4",
        "operation": "openai.chat.completions",
        "request_kind": "chat.completions",
        "status": "success",
        "input_tokens": 10,
        "output_tokens": 20,
        "total_tokens": 30,
        "estimated_cost_usd": 0.001,
        "latency_ms": 250,
        "redaction_flags": [],
    }
    base.update(overrides)
    return base


_LIST_DEFAULTS: dict[str, Any] = {
    "operation": None,
    "request_kind": None,
    "user_id": None,
    "model": None,
    "status_filter": None,
    "from_ts": None,
    "to_ts": None,
    "min_cost": None,
    "audited_only": False,
    "limit": 50,
    "offset": 0,
}


def _call_list(monkeypatch, **kwargs) -> dict[str, Any]:
    from app.routers import usage as usage_router

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    request = type("R", (), {})()  # rate limiter is bypassed; any object suffices
    monkeypatch.setattr(usage_router.limiter, "enabled", False)
    params = {**_LIST_DEFAULTS, **kwargs}
    return asyncio.run(
        usage_router.list_usage_events(request=request, current_user=actor, **params)
    )


def _call_detail(monkeypatch, event_id: str) -> dict[str, Any]:
    from app.routers import usage as usage_router

    actor = {"id": str(uuid.uuid4()), "email": "admin@example.com", "role": "admin"}
    request = type("R", (), {})()
    monkeypatch.setattr(usage_router.limiter, "enabled", False)
    return asyncio.run(
        usage_router.get_usage_event(
            request=request, event_id=event_id, current_user=actor
        )
    )


# ---------------------------------------------------------------------------
# Tests — list endpoint
# ---------------------------------------------------------------------------


def test_list_returns_items_with_pagination_metadata(monkeypatch):
    rows = [_make_event(id=str(i), created_at=f"2026-05-09T12:00:{i:02d}") for i in range(3)]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, limit=10, offset=0)
    assert len(result["items"]) == 3
    assert result["limit"] == 10
    assert result["offset"] == 0
    assert result["next_offset"] is None  # fewer than limit returned


def test_list_signals_more_pages_when_limit_reached(monkeypatch):
    rows = [_make_event(id=str(i), created_at=f"2026-05-09T12:00:{i:02d}") for i in range(5)]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, limit=2, offset=0)
    assert len(result["items"]) == 2
    assert result["next_offset"] == 2


def test_list_filters_by_operation(monkeypatch):
    rows = [
        _make_event(id="a", operation="openai.chat.completions"),
        _make_event(id="b", operation="openai.embeddings"),
    ]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, operation="openai.chat.completions")
    ids = [item["id"] for item in result["items"]]
    assert ids == ["a"]


def test_list_filters_by_user_id_and_model(monkeypatch):
    target_user = str(uuid.uuid4())
    rows = [
        _make_event(id="a", user_id=target_user, model="gpt-5.4"),
        _make_event(id="b", user_id=target_user, model="gpt-5.4-mini"),
        _make_event(id="c", user_id=str(uuid.uuid4()), model="gpt-5.4"),
    ]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, user_id=target_user, model="gpt-5.4")
    assert [i["id"] for i in result["items"]] == ["a"]


def test_list_filters_by_date_range_inclusive_lower_exclusive_upper(monkeypatch):
    rows = [
        _make_event(id="a", created_at="2026-05-08T12:00:00+00:00"),
        _make_event(id="b", created_at="2026-05-09T12:00:00+00:00"),
        _make_event(id="c", created_at="2026-05-10T12:00:00+00:00"),
    ]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(
        monkeypatch,
        from_ts="2026-05-09T00:00:00+00:00",
        to_ts="2026-05-10T00:00:00+00:00",
    )
    assert [i["id"] for i in result["items"]] == ["b"]


def test_list_min_cost_filter(monkeypatch):
    rows = [
        _make_event(id="cheap", estimated_cost_usd=0.0001),
        _make_event(id="pricey", estimated_cost_usd=0.5),
    ]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, min_cost=0.01)
    assert [i["id"] for i in result["items"]] == ["pricey"]


def test_list_audited_only_restricts_to_chat_and_responses(monkeypatch):
    rows = [
        _make_event(id="chat", operation="openai.chat.completions"),
        _make_event(id="resp", operation="openai.responses", request_kind="responses"),
        _make_event(id="emb", operation="openai.embeddings", request_kind="embeddings"),
    ]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, audited_only=True)
    assert sorted(i["id"] for i in result["items"]) == ["chat", "resp"]


def test_list_audited_only_includes_rows_with_business_operation(monkeypatch):
    """Research and other contexts override `operation` while keeping
    `request_kind` set to chat.completions/responses. Those rows must still
    surface under audited_only=True.
    """
    rows = [
        _make_event(
            id="research",
            operation="research.deep_research",
            request_kind="chat.completions",
        ),
        _make_event(
            id="raw",
            operation="openai.chat.completions",
            request_kind="chat.completions",
        ),
        _make_event(
            id="embed",
            operation="openai.embeddings",
            request_kind="embeddings",
        ),
    ]
    _patch_supabase(monkeypatch, rows)
    _bypass_admin(monkeypatch)

    result = _call_list(monkeypatch, audited_only=True)
    assert sorted(i["id"] for i in result["items"]) == ["raw", "research"]


def test_list_rejects_invalid_iso_timestamp(monkeypatch):
    _patch_supabase(monkeypatch, [])
    _bypass_admin(monkeypatch)

    with pytest.raises(HTTPException) as excinfo:
        _call_list(monkeypatch, from_ts="not-a-date")
    assert excinfo.value.status_code == 400
    assert "from" in excinfo.value.detail


def test_list_requires_admin(monkeypatch):
    from app import authz
    from app.routers import usage as usage_router

    # Force require_admin to raise — simulate non-admin caller.
    def _deny(_user):
        raise HTTPException(status_code=403, detail="Admin only")

    monkeypatch.setattr(authz, "require_admin", _deny)
    monkeypatch.setattr(usage_router, "supabase", _Supabase([]))
    monkeypatch.setattr(usage_router.limiter, "enabled", False)

    actor = {"id": str(uuid.uuid4()), "role": "user"}
    request = type("R", (), {})()
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(
            usage_router.list_usage_events(
                request=request, current_user=actor, **_LIST_DEFAULTS
            )
        )
    assert excinfo.value.status_code == 403


# ---------------------------------------------------------------------------
# Tests — detail endpoint
# ---------------------------------------------------------------------------


def test_detail_returns_full_row_with_excerpts(monkeypatch):
    target = _make_event(
        id="det-1",
        prompt_excerpt="hi [REDACTED:EMAIL]",
        response_excerpt="ok",
        redaction_flags=["EMAIL"],
    )
    _patch_supabase(monkeypatch, [target, _make_event(id="other")])
    _bypass_admin(monkeypatch)

    row = _call_detail(monkeypatch, "det-1")
    assert row["id"] == "det-1"
    assert row["prompt_excerpt"] == "hi [REDACTED:EMAIL]"
    assert row["redaction_flags"] == ["EMAIL"]


def test_detail_returns_404_when_missing(monkeypatch):
    _patch_supabase(monkeypatch, [_make_event(id="exists")])
    _bypass_admin(monkeypatch)

    with pytest.raises(HTTPException) as excinfo:
        _call_detail(monkeypatch, "missing-id")
    assert excinfo.value.status_code == 404
