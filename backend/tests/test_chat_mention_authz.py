"""Regression tests for the @mention workstream-enumeration leak.

Sentinel P0 #4: `RAGEngine._lookup_workstream` (used by chat mention
resolution) and `/chat/mentions/search` (mention autocomplete) both queried
the entire `workstreams` table by title/id with no per-user scoping. Any
authenticated user could probe for another user's private workstream names
through an @mention or autocomplete query and have the matched workstream's
metadata streamed back.

The fix routes both surfaces through `accessible_workstream_ids` so non-admin
callers only see workstreams they own or are members of. Admins keep the
unrestricted view. Cards remain globally visible per product design.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import pytest

from app import rag_engine as rag_engine_module
from app.rag_engine import RAGEngine
from app.routers import chat as chat_router


# ---------------------------------------------------------------------------
# Supabase stub — supports the subset of query builder methods exercised by
# `_lookup_workstream`, `accessible_workstream_ids`, and `search_mentions`.
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _Query:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._eq: Dict[str, Any] = {}
        self._in: Dict[str, set] = {}
        self._ilike: Optional[tuple[str, str]] = None
        self._limit: Optional[int] = None

    def select(self, *_a, **_kw):
        return self

    def eq(self, key, value):
        self._eq[key] = value
        return self

    def in_(self, key, values):
        self._in[key] = set(values)
        return self

    def ilike(self, key, pattern):
        self._ilike = (key, pattern)
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def _matches(self, row: Dict[str, Any]) -> bool:
        for k, v in self._eq.items():
            if row.get(k) != v:
                return False
        for k, vs in self._in.items():
            if row.get(k) not in vs:
                return False
        if self._ilike is not None:
            key, pattern = self._ilike
            needle = pattern.strip("%").lower()
            value = (row.get(key) or "").lower()
            if needle not in value:
                return False
        return True

    def execute(self):
        rows = [r for r in self._rows if self._matches(r)]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Resp(rows)


class _SupabaseStub:
    def __init__(
        self,
        workstreams: List[Dict[str, Any]],
        members: Optional[List[Dict[str, Any]]] = None,
        cards: Optional[List[Dict[str, Any]]] = None,
    ):
        self._tables = {
            "workstreams": workstreams,
            "workstream_members": members or [],
            "cards": cards or [],
        }

    def table(self, name):
        if name not in self._tables:
            raise AssertionError(f"unexpected table lookup: {name}")
        return _Query(self._tables[name])


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


OWNER_ID = "11111111-1111-1111-1111-111111111111"
ATTACKER_ID = "22222222-2222-2222-2222-222222222222"
MEMBER_ID = "33333333-3333-3333-3333-333333333333"
OWNER_WS_ID = "ws-owner"
VICTIM_WS_ID = "ws-victim"
SHARED_WS_ID = "ws-shared"


@pytest.fixture
def stub():
    return _SupabaseStub(
        workstreams=[
            {
                "id": OWNER_WS_ID,
                "user_id": OWNER_ID,
                "owner_type": "user",
                "name": "owner public name",
                "description": "owner description",
            },
            {
                "id": VICTIM_WS_ID,
                "user_id": ATTACKER_ID,  # the attacker owns this one
                "owner_type": "user",
                "name": "secret confidential workstream",
                "description": "victim confidential",
            },
            {
                "id": SHARED_WS_ID,
                "user_id": ATTACKER_ID,
                "owner_type": "user",
                "name": "shared collab workstream",
                "description": "shared",
            },
        ],
        members=[
            # OWNER_ID is a member of the SHARED workstream owned by ATTACKER_ID.
            {"workstream_id": SHARED_WS_ID, "user_id": OWNER_ID, "role": "viewer"},
        ],
        cards=[
            {"id": "card-1", "name": "Global Card", "slug": "global-card"},
        ],
    )


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# RAGEngine._lookup_workstream — direct unit tests
# ---------------------------------------------------------------------------


def test_lookup_workstream_by_id_returns_owned(stub):
    engine = RAGEngine(stub)
    ws = _run(
        engine._lookup_workstream(OWNER_WS_ID, "", user_id=OWNER_ID, is_admin=False)
    )
    assert ws is not None
    assert ws["id"] == OWNER_WS_ID


def test_lookup_workstream_by_id_blocks_cross_user(stub):
    engine = RAGEngine(stub)
    ws = _run(
        engine._lookup_workstream(VICTIM_WS_ID, "", user_id=OWNER_ID, is_admin=False)
    )
    # Owner of OWNER_WS_ID has no access to ATTACKER's private workstream.
    assert ws is None


def test_lookup_workstream_by_title_blocks_cross_user(stub):
    engine = RAGEngine(stub)
    # Owner probes the attacker's private workstream by name fragment.
    ws = _run(
        engine._lookup_workstream(
            None, "secret confidential", user_id=OWNER_ID, is_admin=False
        )
    )
    assert ws is None


def test_lookup_workstream_by_title_returns_member_shared(stub):
    engine = RAGEngine(stub)
    # OWNER_ID is a member of SHARED_WS_ID. Title lookup should resolve it.
    ws = _run(
        engine._lookup_workstream(
            None, "shared collab", user_id=OWNER_ID, is_admin=False
        )
    )
    assert ws is not None
    assert ws["id"] == SHARED_WS_ID


def test_lookup_workstream_admin_sees_any_by_id(stub):
    engine = RAGEngine(stub)
    ws = _run(engine._lookup_workstream(VICTIM_WS_ID, "", user_id=None, is_admin=True))
    assert ws is not None
    assert ws["id"] == VICTIM_WS_ID


def test_lookup_workstream_admin_sees_any_by_title(stub):
    engine = RAGEngine(stub)
    ws = _run(
        engine._lookup_workstream(
            None, "secret confidential", user_id=None, is_admin=True
        )
    )
    assert ws is not None
    assert ws["id"] == VICTIM_WS_ID


def test_lookup_workstream_no_user_misses_silently(stub):
    engine = RAGEngine(stub)
    # No user identity + not admin → no access. Must miss rather than leak.
    ws = _run(
        engine._lookup_workstream(VICTIM_WS_ID, "secret confidential", user_id=None)
    )
    assert ws is None


# ---------------------------------------------------------------------------
# /chat/mentions/search — autocomplete must not leak other users' titles
# ---------------------------------------------------------------------------


def test_mentions_search_hides_other_users_workstream_titles(stub, monkeypatch):
    monkeypatch.setattr(chat_router, "supabase", stub)
    # Also point the authz helper at the same stub since rag_engine and
    # chat_router both import `supabase` from app.deps.
    monkeypatch.setattr(rag_engine_module, "azure_openai_async_client", None)

    owner_user = {"id": OWNER_ID, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_mentions(
            q="secret confidential",
            limit=8,
            current_user=owner_user,
        )
    )
    titles = [r["title"] for r in result["results"] if r["type"] == "workstream"]
    assert "secret confidential workstream" not in titles


def test_mentions_search_returns_callers_own_workstream(stub, monkeypatch):
    monkeypatch.setattr(chat_router, "supabase", stub)

    owner_user = {"id": OWNER_ID, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_mentions(
            q="owner public",
            limit=8,
            current_user=owner_user,
        )
    )
    titles = [r["title"] for r in result["results"] if r["type"] == "workstream"]
    assert "owner public name" in titles


def test_mentions_search_admin_sees_everyones_workstreams(stub, monkeypatch):
    monkeypatch.setattr(chat_router, "supabase", stub)

    admin_user = {"id": "admin-1", "role": "admin", "account_type": "paid"}
    result = _run(
        chat_router.search_mentions(
            q="secret confidential",
            limit=8,
            current_user=admin_user,
        )
    )
    titles = [r["title"] for r in result["results"] if r["type"] == "workstream"]
    assert "secret confidential workstream" in titles


def test_mentions_search_still_returns_cards_globally(stub, monkeypatch):
    """Cards are a shared global library per product design — workstream ACL
    scoping must not accidentally suppress card mention autocomplete."""
    monkeypatch.setattr(chat_router, "supabase", stub)

    owner_user = {"id": OWNER_ID, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_mentions(
            q="Global",
            limit=8,
            current_user=owner_user,
        )
    )
    card_titles = [r["title"] for r in result["results"] if r["type"] == "signal"]
    assert "Global Card" in card_titles
