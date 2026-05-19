"""Tests for the admin tags router (PR 7).

Three endpoints: merge, rename, delete. All require admin role; the tests
exercise the role gate plus the happy path + collision/conflict edges of
each handler.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from typing import Any, Callable, Dict, List, Optional

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock supabase — minimal chain that supports the calls the router uses
# (select/eq/limit/update/delete + rpc), reusing the shape pattern from
# test_tags_router.py but stripped down to what admin endpoints touch.
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data=None, count: Optional[int] = None):
        self.data = data
        self.count = count


class _Chain:
    def __init__(self, store: Dict[str, List[dict]], table: str):
        self._store = store
        self._table = table
        self._filters: Dict[str, Any] = {}
        self._pending_update: Optional[dict] = None
        self._pending_delete = False

    def select(self, *_a, **_kw):
        return self

    def update(self, payload, **_kw):
        self._pending_update = dict(payload)
        return self

    def delete(self):
        self._pending_delete = True
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def limit(self, *_a, **_kw):
        return self

    def order(self, *_a, **_kw):
        return self

    def execute(self):
        rows = self._store.setdefault(self._table, [])

        if self._pending_update is not None:
            payload = self._pending_update
            updated: List[dict] = []
            for row in rows:
                if _matches(row, self._filters):
                    row.update(payload)
                    updated.append(row)
            self._pending_update = None
            return _Resp(updated, count=len(updated))

        if self._pending_delete:
            kept = [r for r in rows if not _matches(r, self._filters)]
            deleted = [r for r in rows if _matches(r, self._filters)]
            self._store[self._table] = kept
            self._pending_delete = False
            return _Resp(deleted, count=len(deleted))

        matched = [r for r in rows if _matches(r, self._filters)]
        return _Resp(matched, count=len(matched))


def _matches(row: dict, filters: Dict[str, Any]) -> bool:
    return all(row.get(k) == v for k, v in filters.items())


class _MockSupabase:
    def __init__(
        self,
        tables: Optional[Dict[str, List[dict]]] = None,
        rpcs: Optional[Dict[str, Callable[[dict], Any]]] = None,
    ):
        self._tables = tables or {}
        self._rpcs = rpcs or {}
        self.rpc_calls: List[Dict[str, Any]] = []

    def table(self, name: str) -> _Chain:
        return _Chain(self._tables, name)

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append({"name": name, "params": dict(params)})
        impl = self._rpcs.get(name)
        if impl is None:
            raise AssertionError(f"unmocked rpc: {name}")

        class _RpcChain:
            def execute(_self):
                return _Resp(impl(params))

        return _RpcChain()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


def _ts() -> str:
    return "2026-05-19T18:00:00+00:00"


def _tag(slug: str, label: str | None = None) -> dict:
    return {
        "id": _uuid(),
        "slug": slug,
        "label": label or slug.title(),
        "created_by": None,
        "created_at": _ts(),
    }


def _admin() -> dict:
    return {"id": _uuid(), "role": "admin"}


def _viewer() -> dict:
    return {"id": _uuid(), "role": "viewer"}


def _patch(monkeypatch, mock_sb):
    from app.routers import admin_tags as admin_tags_module

    monkeypatch.setattr(admin_tags_module, "supabase", mock_sb)
    return admin_tags_module


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# POST /admin/tags/{source_slug}/merge
# ---------------------------------------------------------------------------


def test_merge_403_for_non_admin(monkeypatch):
    from app.models.tag import AdminTagMergeRequest

    mock_sb = _MockSupabase()
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.merge_tag(
                source_slug="climate",
                body=AdminTagMergeRequest(target_slug="climate-resilience"),
                user=_viewer(),
            )
        )
    assert exc.value.status_code == 403


def test_merge_400_when_source_equals_target(monkeypatch):
    from app.models.tag import AdminTagMergeRequest

    mock_sb = _MockSupabase()
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.merge_tag(
                source_slug="climate",
                body=AdminTagMergeRequest(target_slug="climate"),
                user=_admin(),
            )
        )
    assert exc.value.status_code == 400


def test_merge_404_when_source_missing(monkeypatch):
    from app.models.tag import AdminTagMergeRequest

    target = _tag("climate-resilience")
    mock_sb = _MockSupabase(tables={"tags": [target]})
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.merge_tag(
                source_slug="climate",
                body=AdminTagMergeRequest(target_slug="climate-resilience"),
                user=_admin(),
            )
        )
    assert exc.value.status_code == 404
    assert "Source" in exc.value.detail


def test_merge_404_when_target_missing(monkeypatch):
    from app.models.tag import AdminTagMergeRequest

    source = _tag("climate")
    mock_sb = _MockSupabase(tables={"tags": [source]})
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.merge_tag(
                source_slug="climate",
                body=AdminTagMergeRequest(target_slug="climate-resilience"),
                user=_admin(),
            )
        )
    assert exc.value.status_code == 404
    assert "Target" in exc.value.detail


def test_merge_happy_path_invokes_rpc_and_returns_counts(monkeypatch):
    from app.models.tag import AdminTagMergeRequest

    source = _tag("climate")
    target = _tag("climate-resilience")
    mock_sb = _MockSupabase(
        tables={"tags": [source, target]},
        rpcs={
            "admin_merge_tags": lambda _params: [
                {"moved_count": 5, "deduped_count": 2}
            ]
        },
    )
    mod = _patch(monkeypatch, mock_sb)

    response = _run(
        mod.merge_tag(
            source_slug="climate",
            body=AdminTagMergeRequest(target_slug="climate-resilience"),
            user=_admin(),
        )
    )

    assert mock_sb.rpc_calls == [
        {
            "name": "admin_merge_tags",
            "params": {
                "p_source_tag_id": source["id"],
                "p_target_tag_id": target["id"],
            },
        }
    ]
    assert response.moved_count == 5
    assert response.deduped_count == 2
    assert response.target.slug == "climate-resilience"


# ---------------------------------------------------------------------------
# PATCH /admin/tags/{slug}
# ---------------------------------------------------------------------------


def test_rename_403_for_non_admin(monkeypatch):
    from app.models.tag import AdminTagRenameRequest

    mock_sb = _MockSupabase()
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.rename_tag(
                slug="climate",
                body=AdminTagRenameRequest(label="Climate Resilience"),
                user=_viewer(),
            )
        )
    assert exc.value.status_code == 403


def test_rename_404_when_tag_missing(monkeypatch):
    from app.models.tag import AdminTagRenameRequest

    mock_sb = _MockSupabase(tables={"tags": []})
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.rename_tag(
                slug="climate",
                body=AdminTagRenameRequest(label="Climate Resilience"),
                user=_admin(),
            )
        )
    assert exc.value.status_code == 404


def test_rename_409_on_slug_collision(monkeypatch):
    from app.models.tag import AdminTagRenameRequest

    source = _tag("climate", "Climate")
    other = _tag("climate-resilience", "Climate Resilience")
    mock_sb = _MockSupabase(
        tables={"tags": [source, other]},
        rpcs={
            "normalize_tag_slug": lambda params: "climate-resilience",
        },
    )
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            mod.rename_tag(
                slug="climate",
                body=AdminTagRenameRequest(label="Climate Resilience"),
                user=_admin(),
            )
        )
    assert exc.value.status_code == 409
    assert "merge" in exc.value.detail.lower()


def test_rename_happy_path_updates_label_and_slug(monkeypatch):
    from app.models.tag import AdminTagRenameRequest

    source = _tag("climate", "Climate")
    mock_sb = _MockSupabase(
        tables={"tags": [source]},
        rpcs={
            "normalize_tag_slug": lambda params: "climate-resilience",
        },
    )
    mod = _patch(monkeypatch, mock_sb)

    result = _run(
        mod.rename_tag(
            slug="climate",
            body=AdminTagRenameRequest(label="Climate Resilience"),
            user=_admin(),
        )
    )

    assert result.slug == "climate-resilience"
    assert result.label == "Climate Resilience"
    assert mock_sb._tables["tags"][0]["slug"] == "climate-resilience"
    assert mock_sb._tables["tags"][0]["label"] == "Climate Resilience"


def test_rename_label_only_keeps_slug_when_normalized_match(monkeypatch):
    from app.models.tag import AdminTagRenameRequest

    source = _tag("climate", "climate")
    mock_sb = _MockSupabase(
        tables={"tags": [source]},
        rpcs={"normalize_tag_slug": lambda params: "climate"},
    )
    mod = _patch(monkeypatch, mock_sb)

    result = _run(
        mod.rename_tag(
            slug="climate",
            body=AdminTagRenameRequest(label="Climate"),
            user=_admin(),
        )
    )

    assert result.slug == "climate"
    assert result.label == "Climate"


# ---------------------------------------------------------------------------
# DELETE /admin/tags/{slug}
# ---------------------------------------------------------------------------


def test_delete_403_for_non_admin(monkeypatch):
    mock_sb = _MockSupabase()
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(mod.delete_tag(slug="climate", user=_viewer()))
    assert exc.value.status_code == 403


def test_delete_404_when_tag_missing(monkeypatch):
    mock_sb = _MockSupabase(tables={"tags": []})
    mod = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(mod.delete_tag(slug="climate", user=_admin()))
    assert exc.value.status_code == 404


def test_delete_happy_path_removes_tag_row(monkeypatch):
    source = _tag("climate")
    mock_sb = _MockSupabase(tables={"tags": [source]})
    mod = _patch(monkeypatch, mock_sb)

    result = _run(mod.delete_tag(slug="climate", user=_admin()))
    assert result is None
    assert mock_sb._tables["tags"] == []
