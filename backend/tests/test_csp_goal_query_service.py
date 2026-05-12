"""Unit tests for the goal-to-query translator.

Covers the parser (the highest-failure surface) plus the cache-hit /
cache-miss control flow with the LLM and Supabase fully mocked.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import csp_goal_query_service as svc  # noqa: E402


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def test_parser_accepts_bare_json_array():
    out = svc._parse_query_list('["alpha", "beta", "gamma"]')
    assert out == ["alpha", "beta", "gamma"]


def test_parser_strips_markdown_fences():
    raw = "```json\n[\"a\", \"b\"]\n```"
    assert svc._parse_query_list(raw) == ["a", "b"]


def test_parser_extracts_array_from_prose_prefix():
    raw = 'Sure! Here are some queries: ["one", "two"] hope this helps'
    assert svc._parse_query_list(raw) == ["one", "two"]


def test_parser_dedupes_case_insensitively():
    out = svc._parse_query_list('["Public Safety", "public safety", "Fire"]')
    assert out == ["Public Safety", "Fire"]


def test_parser_trims_oversized_queries():
    long_a = "a" * (svc.MAX_QUERY_LENGTH + 50)
    long_b = "b" * (svc.MAX_QUERY_LENGTH + 50)
    out = svc._parse_query_list(f'["{long_a}", "{long_b}"]')
    assert len(out) == 2
    for q in out:
        assert len(q) <= svc.MAX_QUERY_LENGTH


def test_parser_caps_at_max_queries():
    raw = "[" + ", ".join(f'"q{i}"' for i in range(20)) + "]"
    out = svc._parse_query_list(raw)
    assert len(out) == svc.MAX_QUERIES


def test_parser_rejects_empty_array():
    with pytest.raises(svc.QueryDerivationError):
        svc._parse_query_list("[]")


def test_parser_rejects_non_array_response():
    with pytest.raises(svc.QueryDerivationError):
        svc._parse_query_list('{"queries": ["a"]}')


def test_parser_rejects_unparseable_garbage():
    with pytest.raises(svc.QueryDerivationError):
        svc._parse_query_list("totally not json")


def test_parser_rejects_empty_input():
    with pytest.raises(svc.QueryDerivationError):
        svc._parse_query_list("")


# ---------------------------------------------------------------------------
# Cache hit / miss
# ---------------------------------------------------------------------------


class _FakeTable:
    """Records the last update payload so the test can assert what was written."""

    def __init__(self, store: dict[str, dict[str, Any]]):
        self._store = store
        self._mode = "select"
        self._filters: dict[str, Any] = {}
        self._update_payload: dict[str, Any] | None = None

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def update(self, payload: dict[str, Any]):
        self._mode = "update"
        self._update_payload = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def limit(self, *_a, **_kw):
        return self

    def execute(self):
        if self._mode == "select":
            gid = self._filters.get("id")
            row = self._store.get(gid)
            return SimpleNamespace(data=[row] if row else [])
        if self._mode == "update":
            gid = self._filters.get("id")
            if gid in self._store and self._update_payload:
                self._store[gid].update(self._update_payload)
            return SimpleNamespace(data=[self._store.get(gid)])
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, goals: list[dict[str, Any]]):
        self._store = {g["id"]: dict(g) for g in goals}

    def table(self, name: str):
        assert name == "csp_goals"
        return _FakeTable(self._store)

    @property
    def store(self) -> dict[str, dict[str, Any]]:
        return self._store


def _make_llm_response(content: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def _make_oc(response: SimpleNamespace | Exception):
    create = AsyncMock()
    if isinstance(response, Exception):
        create.side_effect = response
    else:
        create.return_value = response
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )


def test_cache_hit_short_circuits_when_version_matches():
    """A goal with a populated cache and matching version must NOT call the LLM."""
    gid = str(uuid.uuid4())
    cached_version = svc._cache_version()
    sb = _FakeSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate across the city.",
            "query_aliases": ["cached one", "cached two"],
            "query_aliases_version": cached_version,
        }
    ])
    oc = _make_oc(_make_llm_response("[\"should never see this\"]"))

    out = asyncio.run(
        svc.derive_queries(uuid.UUID(gid), supabase=sb, openai_client=oc)
    )
    assert out == ["cached one", "cached two"]
    oc.chat.completions.create.assert_not_awaited()


def test_cache_miss_invokes_llm_and_persists():
    gid = str(uuid.uuid4())
    sb = _FakeSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate across the city.",
            "query_aliases": [],
            "query_aliases_version": None,
        }
    ])
    oc = _make_oc(_make_llm_response('["violent crime trends", "policing reform"]'))

    out = asyncio.run(
        svc.derive_queries(uuid.UUID(gid), supabase=sb, openai_client=oc)
    )
    assert out == ["violent crime trends", "policing reform"]
    oc.chat.completions.create.assert_awaited_once()
    # Persistence: the stored row now reflects the new cache.
    stored = sb.store[gid]
    assert stored["query_aliases"] == out
    assert stored["query_aliases_version"] == svc._cache_version()


def test_stale_version_invalidates_cache():
    gid = str(uuid.uuid4())
    sb = _FakeSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate.",
            "query_aliases": ["old one"],
            "query_aliases_version": "lens-v0|prompt:v0",
        }
    ])
    oc = _make_oc(_make_llm_response('["fresh one", "fresh two"]'))

    out = asyncio.run(
        svc.derive_queries(uuid.UUID(gid), supabase=sb, openai_client=oc)
    )
    assert out == ["fresh one", "fresh two"]


def test_force_bypasses_matching_cache():
    gid = str(uuid.uuid4())
    sb = _FakeSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate.",
            "query_aliases": ["cached"],
            "query_aliases_version": svc._cache_version(),
        }
    ])
    oc = _make_oc(_make_llm_response('["new one", "new two"]'))

    out = asyncio.run(
        svc.derive_queries(
            uuid.UUID(gid), force=True, supabase=sb, openai_client=oc
        )
    )
    assert out == ["new one", "new two"]
    oc.chat.completions.create.assert_awaited_once()


def test_missing_goal_raises():
    sb = _FakeSupabase([])
    oc = _make_oc(_make_llm_response('["never called"]'))
    # GoalNotFoundError is the specific subclass; both should match.
    with pytest.raises(svc.GoalNotFoundError):
        asyncio.run(
            svc.derive_queries(uuid.uuid4(), supabase=sb, openai_client=oc)
        )
    # And the parent class still catches it — existing callers still work.
    with pytest.raises(svc.QueryDerivationError):
        asyncio.run(
            svc.derive_queries(uuid.uuid4(), supabase=sb, openai_client=oc)
        )


def test_parser_rejects_below_min_queries():
    """A single-element response is too few — must raise so dispatcher falls back."""
    with pytest.raises(svc.QueryDerivationError):
        svc._parse_query_list('["only one"]')


def test_under_minimum_cached_aliases_are_treated_as_miss():
    """An old cache row with only one query (written before MIN_QUERIES
    landed) must not bypass the parser guard via the cache-hit short
    circuit. Regression for the Codex P2 on PR #81: PROMPT_VERSION didn't
    change, so an existing one-query alias at the current version stamp
    would slip through and underfeed the dispatcher's per-goal budget.
    """
    gid = str(uuid.uuid4())
    sb = _FakeSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate.",
            # One-query cache at the CURRENT version stamp — should be
            # treated as a miss, not returned.
            "query_aliases": ["legacy single"],
            "query_aliases_version": svc._cache_version(),
        }
    ])
    oc = _make_oc(_make_llm_response('["fresh one", "fresh two"]'))

    out = asyncio.run(
        svc.derive_queries(uuid.UUID(gid), supabase=sb, openai_client=oc)
    )
    assert out == ["fresh one", "fresh two"]
    oc.chat.completions.create.assert_awaited_once()
    # Cache was overwritten with the fresh (compliant) list.
    assert sb.store[gid]["query_aliases"] == out


def test_llm_returns_garbage_surfaces_derivation_error():
    gid = str(uuid.uuid4())
    sb = _FakeSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate.",
            "query_aliases": [],
            "query_aliases_version": None,
        }
    ])
    oc = _make_oc(_make_llm_response("I'm sorry, I can't comply."))

    with pytest.raises(svc.QueryDerivationError):
        asyncio.run(
            svc.derive_queries(uuid.UUID(gid), supabase=sb, openai_client=oc)
        )


def test_persist_failure_does_not_block_return():
    """If the Supabase write fails the caller still gets the queries."""

    class _ExplodingTable(_FakeTable):
        def execute(self):
            if self._mode == "update":
                raise RuntimeError("supabase exploded")
            return super().execute()

    gid = str(uuid.uuid4())

    class _ExplodingSupabase(_FakeSupabase):
        def table(self, name):
            return _ExplodingTable(self._store)

    sb = _ExplodingSupabase([
        {
            "id": gid,
            "code": "PS.1",
            "name": "Reduce violent crime",
            "description": "Lower the violent crime rate.",
            "query_aliases": [],
            "query_aliases_version": None,
        }
    ])
    oc = _make_oc(_make_llm_response('["a", "b"]'))

    out = asyncio.run(
        svc.derive_queries(uuid.UUID(gid), supabase=sb, openai_client=oc)
    )
    assert out == ["a", "b"]
