"""Unit tests for the lens router — PATCH /cards/{id}/user-metadata.

Covers the authorization fix from PR #26 review B1:
- non-paid user → 403
- paid user, card does not exist → 404
- paid user, card exists but user has no access → 404 (not 403,
  to avoid leaking card existence)
- paid user who created the card → 200, merge applied
- admin → 200, merge applied
- merge semantics: only the buckets in the patch body are replaced

Avoids spinning up the full FastAPI app — invokes the route handler
directly with monkeypatched supabase + UserMetadata-shaped fixtures.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from typing import Any, Dict, List, Optional

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock supabase chain — supports .select/.update/.eq/.in_/.limit/.execute
# ---------------------------------------------------------------------------


class _MockResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None) -> None:
        self.data = data or []


class _MockTable:
    def __init__(
        self,
        rows: List[Dict[str, Any]],
        update_sink: Optional[List[Dict[str, Any]]] = None,
        table_name: str = "",
    ) -> None:
        self._rows = rows
        self._update_sink = update_sink
        self._table_name = table_name
        self._pending_update: Optional[Dict[str, Any]] = None
        self._filters: Dict[str, Any] = {}

    def select(self, *_a, **_kw):
        return self

    def update(self, payload: Dict[str, Any]):
        self._pending_update = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def in_(self, key, values):
        self._filters[key] = list(values)
        return self

    def limit(self, *_a, **_kw):
        return self

    def order(self, *_a, **_kw):
        return self

    def execute(self) -> _MockResponse:
        if self._pending_update is not None and self._update_sink is not None:
            self._update_sink.append(
                {
                    "table": self._table_name,
                    "payload": self._pending_update,
                    "filters": dict(self._filters),
                }
            )
            return _MockResponse([])
        # Apply equality filters to row set (good enough for these tests).
        out = []
        for row in self._rows:
            keep = True
            for key, val in self._filters.items():
                if isinstance(val, list):
                    if row.get(key) not in val:
                        keep = False
                        break
                else:
                    if row.get(key) != val:
                        keep = False
                        break
            if keep:
                out.append(row)
        return _MockResponse(out)


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables
        self.updates: List[Dict[str, Any]] = []

    def table(self, name: str) -> _MockTable:
        return _MockTable(
            self._tables.get(name, []),
            update_sink=self.updates,
            table_name=name,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


def _patch_module(monkeypatch, mock_sb):
    """Point both the lens router and authz at the same mock supabase."""
    from app.routers import lens as lens_module
    from app import authz as authz_module

    monkeypatch.setattr(lens_module, "supabase", mock_sb)
    # require_card_research_access takes supabase as a positional arg, but
    # the lens router passes the module-level `supabase` at call time, so
    # the monkeypatch above is what flows through.
    return lens_module, authz_module


def _call_patch(handler, **kwargs):
    """Invoke an async route handler under asyncio.run."""
    return asyncio.run(handler(**kwargs))


# ---------------------------------------------------------------------------
# Tests — authorization
# ---------------------------------------------------------------------------


def test_patch_user_metadata_403_for_non_paid_user(monkeypatch):
    """Browse-only / guest accounts cannot edit any card."""
    from app.routers.lens import UserMetadataPatch, patch_card_user_metadata

    card_id = _uuid()
    user_id = _uuid()
    mock_sb = _MockSupabase(
        {
            "cards": [
                {
                    "id": card_id,
                    "created_by": user_id,
                    "user_metadata": {},
                }
            ]
        }
    )
    _patch_module(monkeypatch, mock_sb)

    user = {"id": user_id, "account_type": "guest"}
    body = UserMetadataPatch(added={"issue_tags": ["climate_change"]})

    with pytest.raises(HTTPException) as exc:
        _call_patch(
            patch_card_user_metadata,
            card_id=card_id,
            body=body,
            current_user=user,
        )
    assert exc.value.status_code == 403


def test_patch_user_metadata_404_when_card_missing(monkeypatch):
    """Non-existent card returns 404, regardless of user permissions."""
    from app.routers.lens import UserMetadataPatch, patch_card_user_metadata

    mock_sb = _MockSupabase({"cards": []})
    _patch_module(monkeypatch, mock_sb)

    user = {"id": _uuid(), "account_type": "paid"}
    body = UserMetadataPatch(added={"issue_tags": ["climate_change"]})

    with pytest.raises(HTTPException) as exc:
        _call_patch(
            patch_card_user_metadata,
            card_id=_uuid(),
            body=body,
            current_user=user,
        )
    assert exc.value.status_code == 404


def test_patch_user_metadata_404_when_paid_user_has_no_access(monkeypatch):
    """Paid users without per-card access get 404, not 403.

    This is the core authz fix: card existence must not leak to users who
    aren't owners, creators, or workstream editors.
    """
    from app.routers.lens import UserMetadataPatch, patch_card_user_metadata

    card_id = _uuid()
    creator_id = _uuid()
    other_user_id = _uuid()

    mock_sb = _MockSupabase(
        {
            "cards": [
                {
                    "id": card_id,
                    "created_by": creator_id,
                    "user_metadata": {},
                }
            ],
            # No workstream_cards entries — card belongs to nobody else.
            "workstream_cards": [],
            "workstreams": [],
            "workstream_members": [],
        }
    )
    _patch_module(monkeypatch, mock_sb)

    user = {"id": other_user_id, "account_type": "paid"}
    body = UserMetadataPatch(added={"issue_tags": ["climate_change"]})

    with pytest.raises(HTTPException) as exc:
        _call_patch(
            patch_card_user_metadata,
            card_id=card_id,
            body=body,
            current_user=user,
        )
    # 404, NOT 403 — even though the card exists.
    assert exc.value.status_code == 404


def test_patch_user_metadata_succeeds_for_card_creator(monkeypatch):
    """The user who created the card can patch user_metadata."""
    from app.routers.lens import UserMetadataPatch, patch_card_user_metadata

    card_id = _uuid()
    user_id = _uuid()
    mock_sb = _MockSupabase(
        {
            "cards": [
                {
                    "id": card_id,
                    "created_by": user_id,
                    "user_metadata": {},
                }
            ],
            "workstream_cards": [],
        }
    )
    _patch_module(monkeypatch, mock_sb)

    user = {"id": user_id, "account_type": "paid"}
    body = UserMetadataPatch(added={"issue_tags": ["climate_change"]})

    result = _call_patch(
        patch_card_user_metadata,
        card_id=card_id,
        body=body,
        current_user=user,
    )
    assert result.added == {"issue_tags": ["climate_change"]}
    assert mock_sb.updates, "supabase update should have been called"
    assert mock_sb.updates[0]["table"] == "cards"
    assert "user_metadata" in mock_sb.updates[0]["payload"]
    # Critically, ONLY user_metadata is written — never overwrite
    # LLM-derived columns from this endpoint.
    assert set(mock_sb.updates[0]["payload"].keys()) == {"user_metadata"}


def test_patch_user_metadata_succeeds_for_admin(monkeypatch):
    """Admins can patch any card."""
    from app.routers.lens import UserMetadataPatch, patch_card_user_metadata

    card_id = _uuid()
    creator_id = _uuid()
    admin_id = _uuid()
    mock_sb = _MockSupabase(
        {
            "cards": [
                {
                    "id": card_id,
                    "created_by": creator_id,
                    "user_metadata": {},
                }
            ],
            "workstream_cards": [],
        }
    )
    _patch_module(monkeypatch, mock_sb)

    user = {"id": admin_id, "account_type": "guest", "role": "admin"}
    body = UserMetadataPatch(added={"issue_tags": ["climate_change"]})

    result = _call_patch(
        patch_card_user_metadata,
        card_id=card_id,
        body=body,
        current_user=user,
    )
    assert result.added == {"issue_tags": ["climate_change"]}


def test_patch_user_metadata_merge_semantics(monkeypatch):
    """Buckets not present in the patch body are not modified."""
    from app.routers.lens import UserMetadataPatch, patch_card_user_metadata

    card_id = _uuid()
    user_id = _uuid()
    mock_sb = _MockSupabase(
        {
            "cards": [
                {
                    "id": card_id,
                    "created_by": user_id,
                    "user_metadata": {
                        "overrides": {"signal_type": "trend"},
                        "added": {"issue_tags": ["existing_tag"]},
                        "removed": {"secondary_pillars": ["MC"]},
                    },
                }
            ],
            "workstream_cards": [],
        }
    )
    _patch_module(monkeypatch, mock_sb)

    user = {"id": user_id, "account_type": "paid"}
    # Only patch `added`. `overrides` and `removed` should survive untouched.
    body = UserMetadataPatch(added={"issue_tags": ["new_tag"]})

    result = _call_patch(
        patch_card_user_metadata,
        card_id=card_id,
        body=body,
        current_user=user,
    )
    assert result.overrides == {"signal_type": "trend"}
    assert result.added == {"issue_tags": ["new_tag"]}
    assert result.removed == {"secondary_pillars": ["MC"]}
