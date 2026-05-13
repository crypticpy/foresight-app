"""Unit tests for entity_reconciliation_service.

These tests focus on the gating logic — the cosine-then-alias-overlap merge
decision — and the basic "miss → create entity + alias + link mentions"
flow. A ``_FakeSupabase`` carries an in-memory entities/aliases/mentions
trio so we can assert the post-state without a real DB round-trip.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import entity_reconciliation_service as svc  # noqa: E402


# ---------------------------------------------------------------------------
# Alias overlap gate (pure-function tests)
# ---------------------------------------------------------------------------


def test_alias_overlap_exact_canonical_match():
    assert svc._alias_overlap("agentic ai", "agentic ai", set())


def test_alias_overlap_substring_either_direction():
    assert svc._alias_overlap("ai agents", "ai", set())
    assert svc._alias_overlap("ai", "ai agents", set())


def test_alias_overlap_via_alias_exact():
    assert svc._alias_overlap("ai agents", "agentic ai", {"ai agents"})


def test_alias_overlap_via_alias_substring():
    assert svc._alias_overlap(
        "autonomous ai agents", "agentic ai", {"autonomous"}
    )


def test_alias_overlap_rejects_near_cosine_but_no_string_overlap():
    """The whole point of the gate: ada-002 may think 'ambient AI' and
    'agentic AI' are 0.86 cosine, but no substring overlap → reject."""
    assert not svc._alias_overlap("ambient ai", "agentic ai", {"ai agents"})


def test_alias_overlap_handles_empty_alias_set():
    assert not svc._alias_overlap("foo", "bar", set())


# ---------------------------------------------------------------------------
# Fake Supabase with RPC + table support
# ---------------------------------------------------------------------------


class _Store:
    def __init__(self):
        self.entities: dict[str, dict[str, Any]] = {}
        self.aliases: list[dict[str, Any]] = []
        self.mentions: dict[str, dict[str, Any]] = {}
        # Probe responses for match_entities RPC, keyed by canonical_name lower.
        self.match_results: dict[str, list[dict[str, Any]]] = {}
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []


class _FakeTable:
    def __init__(self, store: _Store, name: str):
        self._store = store
        self._name = name
        self._mode = "select"
        self._filters: dict[str, Any] = {}
        self._or: list[tuple[str, Any]] = []
        self._in: tuple[str, list[Any]] | None = None
        self._is: tuple[str, Any] | None = None
        self._payload: Any = None
        self._order: tuple[str, bool] | None = None
        self._limit: int | None = None
        self._select_cols: str = "*"
        self._ilike: tuple[str, str] | None = None

    def select(self, cols="*", *a, **kw):
        self._mode = "select"
        self._select_cols = cols
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._mode = "update"
        self._payload = payload
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def is_(self, key, value):
        self._is = (key, value)
        return self

    def in_(self, key, values):
        self._in = (key, values)
        return self

    def order(self, col, desc=False):
        self._order = (col, desc)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def ilike(self, key, value):
        self._ilike = (key, value)
        return self

    # ------------------------------------------------------------------
    def _select_mentions(self):
        out = []
        for row in self._store.mentions.values():
            ok = True
            for k, v in self._filters.items():
                if row.get(k) != v:
                    ok = False
                    break
            if self._is and self._is[1] == "null" and row.get(self._is[0]) is not None:
                ok = False
            if ok:
                out.append(row)
        if self._order:
            out.sort(key=lambda r: r.get(self._order[0]) or "", reverse=self._order[1])
        if self._limit:
            out = out[: self._limit]
        return out

    def _select_entities(self):
        out = []
        for row in self._store.entities.values():
            ok = True
            for k, v in self._filters.items():
                if row.get(k) != v:
                    ok = False
                    break
            if self._ilike:
                cmp_key, pattern = self._ilike
                if (row.get(cmp_key) or "").lower() != (pattern or "").lower():
                    ok = False
            if ok:
                out.append(row)
        if self._limit:
            out = out[: self._limit]
        return out

    def _select_aliases(self):
        out = []
        for row in self._store.aliases:
            ok = True
            for k, v in self._filters.items():
                if row.get(k) != v:
                    ok = False
                    break
            if ok:
                out.append(row)
        return out

    def execute(self):
        if self._mode == "select":
            if self._name == "entity_mentions":
                return SimpleNamespace(data=self._select_mentions())
            if self._name == "entities":
                return SimpleNamespace(data=self._select_entities())
            if self._name == "entity_aliases":
                return SimpleNamespace(data=self._select_aliases())
            return SimpleNamespace(data=[])

        if self._mode == "insert":
            if self._name == "entities":
                rows = self._payload if isinstance(self._payload, list) else [self._payload]
                inserted = []
                for r in rows:
                    # Duplicate check on (lower(canonical), type, version).
                    key = (
                        (r.get("canonical_name") or "").lower(),
                        r.get("entity_type"),
                        r.get("prompt_version"),
                    )
                    if any(
                        (e.get("canonical_name") or "").lower() == key[0]
                        and e.get("entity_type") == key[1]
                        and e.get("prompt_version") == key[2]
                        for e in self._store.entities.values()
                    ):
                        raise RuntimeError("duplicate key")
                    new_id = str(uuid.uuid4())
                    saved = {"id": new_id, **r}
                    self._store.entities[new_id] = saved
                    inserted.append({"id": new_id})
                return SimpleNamespace(data=inserted)
            if self._name == "entity_aliases":
                rows = self._payload if isinstance(self._payload, list) else [self._payload]
                for r in rows:
                    if any(
                        a.get("entity_id") == r.get("entity_id")
                        and (a.get("alias") or "").lower() == (r.get("alias") or "").lower()
                        for a in self._store.aliases
                    ):
                        raise RuntimeError("duplicate alias")
                    self._store.aliases.append({"id": str(uuid.uuid4()), **r})
                return SimpleNamespace(data=[{"ok": True}])

        if self._mode == "update":
            if self._name == "entity_mentions":
                touched = []
                ids = []
                if self._in and self._in[0] == "id":
                    ids = self._in[1]
                for mid in ids:
                    row = self._store.mentions.get(mid)
                    if row:
                        row.update(self._payload)
                        touched.append(row)
                return SimpleNamespace(data=touched)

        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self, store: _Store):
        self._store = store

    def table(self, name: str):
        return _FakeTable(self._store, name)

    def rpc(self, fn, args):
        self._store.rpc_calls.append((fn, args))

        class _Exec:
            def __init__(self, data):
                self.data = data

            def execute(self):
                return self

        if fn == "match_entities":
            # Look up by the embedding (we use a string lookup key in tests).
            key = args.get("query_embedding")
            if isinstance(key, list) and key:
                # Tests stash the lookup tag as a stringified first element.
                tag = key[0] if isinstance(key[0], str) else None
            else:
                tag = None
            results = self._store.match_results.get(tag or "", [])
            return _Exec(results)

        return _Exec([])


def _make_embedding_response(label: str):
    """Return a fake embedding response where the first element is the
    lookup label our _FakeSupabase.rpc keys on."""
    return SimpleNamespace(data=[SimpleNamespace(embedding=[label])])


def _make_oc(label_to_response: dict[str, Any]):
    async def _create(**kwargs):
        text = kwargs.get("input") or ""
        if text in label_to_response:
            return label_to_response[text]
        return _make_embedding_response(text.lower())

    return SimpleNamespace(embeddings=SimpleNamespace(create=AsyncMock(side_effect=_create)))


# ---------------------------------------------------------------------------
# End-to-end control flow
# ---------------------------------------------------------------------------


def _seed_pending(store: _Store, canonical: str, entity_type: str, n: int = 2):
    """Drop ``n`` pending mention rows with the same (canonical, type)."""
    ids = []
    for i in range(n):
        mid = str(uuid.uuid4())
        store.mentions[mid] = {
            "id": mid,
            "canonical_name": canonical,
            "entity_type": entity_type,
            "entity_id": None,
            "item_id": str(uuid.uuid4()),
            "item_type": "card",
            "pillar_id": "HG",
            "stance": "neutral",
            "salience": 0.5,
            "item_created_at": "2026-05-13T12:00:00Z",
            "prompt_version": "v1",
            "created_at": f"2026-05-13T12:00:0{i}Z",
        }
        ids.append(mid)
    return ids


def test_reconcile_creates_new_entity_on_miss():
    store = _Store()
    _seed_pending(store, "agentic AI", "tech", n=3)
    sb = _FakeSupabase(store)
    oc = _make_oc({})  # no overrides; embedding label = lowercased canonical

    summary = asyncio.run(
        svc.reconcile_pending("v1", supabase=sb, openai_client=oc)
    )

    assert summary.pending_tuples == 1
    assert summary.created_new == 1
    assert summary.merged_existing == 0
    assert summary.mentions_updated == 3

    # The new entity row exists with prompt_version scope.
    assert len(store.entities) == 1
    ent = next(iter(store.entities.values()))
    assert ent["canonical_name"] == "agentic AI"
    assert ent["entity_type"] == "tech"
    assert ent["prompt_version"] == "v1"

    # An alias was inserted.
    aliases = [
        a for a in store.aliases if a["entity_id"] == ent["id"]
    ]
    assert any(a["alias"] == "agentic AI" for a in aliases)

    # All pending mentions for that tuple now point at the new entity.
    linked = [
        m for m in store.mentions.values() if m["entity_id"] == ent["id"]
    ]
    assert len(linked) == 3


def test_reconcile_merges_into_existing_entity_when_overlap_holds():
    store = _Store()
    _seed_pending(store, "AI agents", "tech", n=2)

    # Pre-seed an existing entity that the RPC will return as a candidate.
    existing_id = str(uuid.uuid4())
    store.entities[existing_id] = {
        "id": existing_id,
        "canonical_name": "agentic AI",
        "entity_type": "tech",
        "prompt_version": "v1",
    }
    store.aliases.append(
        {"id": str(uuid.uuid4()), "entity_id": existing_id, "alias": "AI agents", "prompt_version": "v1"}
    )

    # The fake RPC keys off the first element of the embedding list — our
    # fake oc stashes the lowercased canonical there.
    store.match_results["ai agents"] = [
        {
            "id": existing_id,
            "canonical_name": "agentic AI",
            "entity_type": "tech",
            "similarity": 0.91,
        }
    ]

    sb = _FakeSupabase(store)
    oc = _make_oc({})

    summary = asyncio.run(
        svc.reconcile_pending("v1", supabase=sb, openai_client=oc)
    )

    assert summary.merged_existing == 1
    assert summary.created_new == 0
    assert summary.mentions_updated == 2

    # No new entity created.
    assert len(store.entities) == 1

    # All pending mentions now point to the existing entity.
    assert all(
        m["entity_id"] == existing_id for m in store.mentions.values()
    )


def test_reconcile_rejects_candidate_when_no_alias_overlap():
    """Cosine match returned but alias overlap fails → must NOT merge."""
    store = _Store()
    _seed_pending(store, "ambient AI", "tech", n=2)

    existing_id = str(uuid.uuid4())
    store.entities[existing_id] = {
        "id": existing_id,
        "canonical_name": "agentic AI",
        "entity_type": "tech",
        "prompt_version": "v1",
    }
    # No aliases on the existing entity → overlap can only come from the
    # canonical itself, and 'ambient AI' / 'agentic AI' share no substring.
    store.match_results["ambient ai"] = [
        {
            "id": existing_id,
            "canonical_name": "agentic AI",
            "entity_type": "tech",
            "similarity": 0.87,
        }
    ]

    sb = _FakeSupabase(store)
    oc = _make_oc({})

    summary = asyncio.run(
        svc.reconcile_pending("v1", supabase=sb, openai_client=oc)
    )

    # Cosine matched but overlap gated it → we created a NEW entity instead.
    assert summary.merged_existing == 0
    assert summary.created_new == 1
    assert len(store.entities) == 2


def test_reconcile_returns_empty_summary_when_nothing_pending():
    store = _Store()
    sb = _FakeSupabase(store)
    oc = _make_oc({})

    summary = asyncio.run(
        svc.reconcile_pending("v1", supabase=sb, openai_client=oc)
    )
    assert summary.pending_tuples == 0
    assert summary.created_new == 0
    assert summary.merged_existing == 0
    assert summary.mentions_updated == 0


def test_reconcile_skips_tuple_on_embedding_failure():
    store = _Store()
    _seed_pending(store, "broken concept", "tech", n=1)

    sb = _FakeSupabase(store)
    # Embedding API returns an empty data list — our helper coerces that to None.
    oc = SimpleNamespace(
        embeddings=SimpleNamespace(
            create=AsyncMock(return_value=SimpleNamespace(data=[]))
        )
    )

    summary = asyncio.run(
        svc.reconcile_pending("v1", supabase=sb, openai_client=oc)
    )

    assert summary.pending_tuples == 1
    assert summary.skipped == 1
    assert summary.created_new == 0
    # Pending mentions still have NULL entity_id (untouched).
    assert all(m["entity_id"] is None for m in store.mentions.values())


def test_reconcile_collapses_multiple_mentions_into_one_tuple():
    """Two pending mention rows with the same (canonical, type) must share
    one embedding call and one entity write."""
    store = _Store()
    _seed_pending(store, "agentic AI", "tech", n=5)

    sb = _FakeSupabase(store)
    oc = _make_oc({})

    summary = asyncio.run(
        svc.reconcile_pending("v1", supabase=sb, openai_client=oc)
    )

    assert summary.pending_tuples == 1
    assert summary.created_new == 1
    assert summary.mentions_updated == 5
    # One embedding call, not five.
    assert oc.embeddings.create.await_count == 1
