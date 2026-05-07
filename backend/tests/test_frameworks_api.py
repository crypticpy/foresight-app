"""Unit tests for the strategic frameworks router.

Tests the ``GET /api/v1/frameworks`` and ``GET /api/v1/frameworks/{code}``
endpoints by directly invoking the route handlers with a mocked supabase
client.  Avoids spinning up the full FastAPI app (which has env-var and
network-side-effect requirements not appropriate for unit tests).

See ``docs/11_PRD_Scoped_Workstreams_and_Frameworks.md`` for the data model.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Tiny chain-builder for supabase().table().select().eq()....execute() mocks
# ---------------------------------------------------------------------------


class _MockResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None) -> None:
        self.data = data or []


class _MockTable:
    """Mimics the supabase-py fluent chain used by the router code."""

    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self) -> _MockResponse:
        return _MockResponse(self._rows)


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _MockTable:
        return _MockTable(self._tables.get(name, []))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


@pytest.fixture
def ppp_seed():
    """Realistic PPP seed used to assert nesting and ordering."""
    framework = {
        "id": _uuid(),
        "code": "PPP",
        "name": "People · Place · Partnerships",
        "description": "FY26 PPP framing for Foresight workstreams.",
        "owner_type": "org",
        "display_order": 1,
        "created_at": None,
        "updated_at": None,
    }
    cat_people = {
        "id": _uuid(),
        "framework_code": "PPP",
        "code": "people",
        "name": "People",
        "description": "People-focused drivers.",
        "display_order": 1,
        "created_at": None,
        "updated_at": None,
    }
    cat_place = {
        "id": _uuid(),
        "framework_code": "PPP",
        "code": "place",
        "name": "Place",
        "description": "Place-focused drivers.",
        "display_order": 2,
        "created_at": None,
        "updated_at": None,
    }
    drivers = [
        {
            "id": _uuid(),
            "framework_category_id": cat_people["id"],
            "code": "workforce",
            "name": "Workforce Readiness",
            "description": None,
            "keywords": ["workforce", "skills"],
            "display_order": 1,
            "created_at": None,
            "updated_at": None,
        },
        {
            "id": _uuid(),
            "framework_category_id": cat_place["id"],
            "code": "infrastructure",
            "name": "Resilient Infrastructure",
            "description": None,
            "keywords": ["infrastructure"],
            "display_order": 1,
            "created_at": None,
            "updated_at": None,
        },
    ]
    return {
        "strategic_frameworks": [framework],
        "framework_categories": [cat_people, cat_place],
        "drivers": drivers,
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_list_frameworks_returns_summaries(monkeypatch, ppp_seed):
    """list_frameworks returns lightweight rows without nested categories."""
    from app.routers import frameworks as frameworks_module

    mock_sb = _MockSupabase(ppp_seed)
    monkeypatch.setattr(frameworks_module, "supabase", mock_sb)

    result = asyncio.run(frameworks_module.list_frameworks(_={}))

    assert len(result) == 1
    summary = result[0]
    assert summary.code == "PPP"
    assert summary.owner_type == "org"
    # Summary model has no `categories` attribute — confirms no nesting leak.
    assert not hasattr(summary, "categories")


def test_get_framework_nests_categories_and_drivers(monkeypatch, ppp_seed):
    """get_framework returns categories with drivers grouped by category."""
    from app.routers import frameworks as frameworks_module

    mock_sb = _MockSupabase(ppp_seed)
    monkeypatch.setattr(frameworks_module, "supabase", mock_sb)

    framework = asyncio.run(frameworks_module.get_framework("PPP", _={}))

    assert framework.code == "PPP"
    assert len(framework.categories) == 2

    by_code = {cat.code: cat for cat in framework.categories}
    assert "people" in by_code and "place" in by_code

    people = by_code["people"]
    place = by_code["place"]
    assert [d.code for d in people.drivers] == ["workforce"]
    assert [d.code for d in place.drivers] == ["infrastructure"]


def test_get_framework_404_when_code_missing(monkeypatch):
    """Unknown framework code raises HTTPException 404."""
    from fastapi import HTTPException

    from app.routers import frameworks as frameworks_module

    mock_sb = _MockSupabase({"strategic_frameworks": []})
    monkeypatch.setattr(frameworks_module, "supabase", mock_sb)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(frameworks_module.get_framework("NOPE", _={}))
    assert exc.value.status_code == 404


def test_get_framework_handles_no_categories(monkeypatch, ppp_seed):
    """A framework with zero categories returns an empty categories list."""
    from app.routers import frameworks as frameworks_module

    seed = {
        "strategic_frameworks": ppp_seed["strategic_frameworks"],
        "framework_categories": [],
        "drivers": [],
    }
    mock_sb = _MockSupabase(seed)
    monkeypatch.setattr(frameworks_module, "supabase", mock_sb)

    framework = asyncio.run(frameworks_module.get_framework("PPP", _={}))
    assert framework.categories == []


def test_workstream_create_model_accepts_new_fields():
    """WorkstreamCreate model serializes the FY26 framework fields."""
    from app.models.workstream import WorkstreamCreate

    payload = WorkstreamCreate(
        name="Workforce Readiness",
        description="People pillar workstream",
        framework_code="PPP",
        framework_category_id=_uuid(),
        driver_ids=[_uuid(), _uuid()],
        top25_priority_ids=[_uuid()],
        budget_relevance=["FY26 Budget Line: Workforce Development"],
        purpose_statement="Track signals on workforce readiness for Austin.",
    )
    data = payload.dict()
    assert data["framework_code"] == "PPP"
    assert len(data["driver_ids"]) == 2
    assert data["budget_relevance"] == [
        "FY26 Budget Line: Workforce Development"
    ]


def test_workstream_create_model_defaults_empty_framework():
    """Workstream creation works without framework fields (backward-compatible)."""
    from app.models.workstream import WorkstreamCreate

    payload = WorkstreamCreate(name="Legacy workstream")
    data = payload.dict()
    assert data["framework_code"] is None
    assert data["driver_ids"] == []
    assert data["budget_relevance"] == []
