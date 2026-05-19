"""Regression tests for the chat-conversation search cross-user leak.

Sentinel P1 #6: ``GET /api/v1/chat/conversations/search`` queried the global
``chat_messages`` table with an ILIKE on ``content`` and **no** ownership
scoping. The downstream filter narrowed the *displayed* conversations to the
caller, but the intermediate query payload pulled up to 50 matching message
bodies from *any* user's conversations into memory, error logs, and telemetry
— a side-channel leak plus a full-table scan.

The fix pre-fetches the caller's ``conversation_ids`` and constrains the
messages query with ``.in_("conversation_id", user_conv_ids)``. When the user
has no conversations the messages query is skipped entirely — never call
``.in_("conversation_id", [])`` because PostgREST treats that as "match
everything", re-opening the leak.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

import pytest

from app.routers import chat as chat_router


# ---------------------------------------------------------------------------
# Supabase stub — supports the subset of query builder methods exercised by
# ``search_chat_conversations``.  Each ``execute()`` records its filter shape
# on the parent stub so tests can assert that the messages query was scoped.
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _Query:
    def __init__(self, stub: "_SupabaseStub", table_name: str, rows: List[Dict[str, Any]]):
        self._stub = stub
        self._table_name = table_name
        self._rows = rows
        # Capture the projection list. The router asks for a deliberately
        # narrow set of columns on the chat_messages query (conversation_id
        # only — never `content`) to avoid pulling other users' message
        # bodies into worker memory if scoping ever regresses. Tests assert
        # against this exact tuple so a future change that re-adds `content`
        # to the projection trips the suite.
        self._select: tuple[Any, ...] = ()
        self._eq: Dict[str, Any] = {}
        self._in: Dict[str, List[Any]] = {}
        self._ilike: Optional[tuple[str, str]] = None
        self._limit: Optional[int] = None
        self._range: Optional[tuple[int, int]] = None

    def select(self, *columns, **_kw):
        self._select = columns
        return self

    def eq(self, key, value):
        self._eq[key] = value
        return self

    def in_(self, key, values):
        # Preserve the original list (incl. order / duplicates) so tests can
        # assert exactly what was passed to PostgREST.
        self._in[key] = list(values)
        return self

    def ilike(self, key, pattern):
        self._ilike = (key, pattern)
        return self

    def order(self, *_a, **_kw):
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def _matches(self, row: Dict[str, Any]) -> bool:
        for k, v in self._eq.items():
            if row.get(k) != v:
                return False
        for k, vs in self._in.items():
            if row.get(k) not in set(vs):
                return False
        if self._ilike is not None:
            key, pattern = self._ilike
            needle = pattern.strip("%").lower()
            value = (row.get(key) or "").lower()
            if needle not in value:
                return False
        return True

    def execute(self):
        # Record the call shape for later assertion.
        self._stub.calls.append(
            {
                "table": self._table_name,
                "select": self._select,
                "eq": dict(self._eq),
                "in": {k: list(v) for k, v in self._in.items()},
                "ilike": self._ilike,
                "limit": self._limit,
                "range": self._range,
            }
        )
        rows = [r for r in self._rows if self._matches(r)]
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Resp(rows)


class _SupabaseStub:
    def __init__(
        self,
        conversations: List[Dict[str, Any]],
        messages: List[Dict[str, Any]],
    ):
        self._tables = {
            "chat_conversations": conversations,
            "chat_messages": messages,
        }
        self.calls: List[Dict[str, Any]] = []

    def table(self, name):
        if name not in self._tables:
            raise AssertionError(f"unexpected table lookup: {name}")
        return _Query(self, name, self._tables[name])


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


USER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
USER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
CONV_A = "conv-a"
CONV_B = "conv-b"

# A search needle that appears in BOTH users' message bodies.  If the router
# leaks, user A's response will include user B's conversation; if scoping
# works, user A only sees their own conversation.
NEEDLE = "quantum"


@pytest.fixture
def stub() -> _SupabaseStub:
    return _SupabaseStub(
        conversations=[
            {
                "id": CONV_A,
                "user_id": USER_A,
                "scope": "global",
                "scope_id": None,
                "title": "User A talking shop",
                "created_at": "2026-05-01T00:00:00Z",
                "updated_at": "2026-05-01T00:00:00Z",
            },
            {
                "id": CONV_B,
                "user_id": USER_B,
                "scope": "global",
                "scope_id": None,
                "title": "User B secret thread",
                "created_at": "2026-05-02T00:00:00Z",
                "updated_at": "2026-05-02T00:00:00Z",
            },
        ],
        messages=[
            {
                "id": "msg-a-1",
                "conversation_id": CONV_A,
                "role": "user",
                "content": f"What about {NEEDLE} computing in Austin?",
            },
            {
                "id": "msg-b-1",
                "conversation_id": CONV_B,
                "role": "user",
                # Must match the same needle to prove the scoping (not the
                # ILIKE) is what filters user B's row out.
                "content": f"Confidential plan for {NEEDLE} initiative",
            },
        ],
    )


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_search_only_returns_callers_conversation(stub, monkeypatch):
    """User A searches for a term that matches both users' messages. The
    response must only contain user A's conversation, and the underlying
    chat_messages query must be scoped via ``.in_("conversation_id", [...])``
    to user A's conversation ids."""
    monkeypatch.setattr(chat_router, "supabase", stub)

    user_a = {"id": USER_A, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_chat_conversations(
            q=NEEDLE,
            limit=20,
            current_user=user_a,
        )
    )

    # Only USER_A's conversation should appear in the response.
    returned_ids = [c["id"] for c in result]
    assert CONV_A in returned_ids
    assert CONV_B not in returned_ids

    # The chat_messages query must have been scoped to USER_A's conversation
    # ids — closing the side-channel leak.
    msg_calls = [c for c in stub.calls if c["table"] == "chat_messages"]
    assert len(msg_calls) == 1, "expected exactly one chat_messages query"
    msg_call = msg_calls[0]
    assert "conversation_id" in msg_call["in"], (
        "chat_messages query must use .in_('conversation_id', [...]) "
        "to scope to the caller's conversations"
    )
    assert set(msg_call["in"]["conversation_id"]) == {CONV_A}
    # The chat_messages projection MUST be conversation_id-only. Re-adding
    # `content` (or `*`) would re-open the side-channel: even though scoping
    # narrows the rows to the caller's own conversations, ILIKE matches over
    # message bodies would pull those bodies back into worker memory, error
    # logs, and telemetry — exactly what Sentinel P1 #6 closed.
    assert msg_call["select"] == ("conversation_id",), (
        "chat_messages search must request conversation_id ONLY — never "
        "`content` or `*` — to keep message bodies out of memory/logs."
    )


def test_search_does_not_load_other_users_message_bodies(stub, monkeypatch):
    """Defensive check: user B's confidential message content must never
    surface in any record the router returns, regardless of how the response
    is shaped."""
    monkeypatch.setattr(chat_router, "supabase", stub)

    user_a = {"id": USER_A, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_chat_conversations(
            q=NEEDLE,
            limit=20,
            current_user=user_a,
        )
    )

    leaked = "Confidential plan for"
    for conv in result:
        for value in conv.values():
            assert leaked not in str(value), (
                f"Other user's content leaked into response field: {value!r}"
            )


def test_search_skips_messages_query_when_user_has_no_conversations(stub, monkeypatch):
    """If the caller has no conversations, the router must NOT issue a
    ``.in_("conversation_id", [])`` query — PostgREST treats an empty IN list
    as "match everything", which would re-open the leak this fix exists to
    close. Instead, the messages query should be skipped entirely."""
    # Replace the conversations table with an entry that does NOT belong to
    # USER_A so their conversation list is empty.
    stub = _SupabaseStub(
        conversations=[
            {
                "id": CONV_B,
                "user_id": USER_B,
                "scope": "global",
                "scope_id": None,
                "title": "User B only thread",
                "created_at": "2026-05-02T00:00:00Z",
                "updated_at": "2026-05-02T00:00:00Z",
            },
        ],
        messages=[
            {
                "id": "msg-b-1",
                "conversation_id": CONV_B,
                "role": "user",
                "content": f"Plan for {NEEDLE}",
            },
        ],
    )
    monkeypatch.setattr(chat_router, "supabase", stub)

    user_a = {"id": USER_A, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_chat_conversations(
            q=NEEDLE,
            limit=20,
            current_user=user_a,
        )
    )

    # No conversations should be returned.
    assert result == []

    # And critically, no chat_messages query should have been issued at all.
    msg_calls = [c for c in stub.calls if c["table"] == "chat_messages"]
    assert msg_calls == [], (
        "Router must skip the chat_messages query when the caller has no "
        "conversations — otherwise an empty .in_() would match every row."
    )


def test_search_returns_title_match_even_without_message_matches(stub, monkeypatch):
    """Title matches must still work — the messages-query scoping fix must
    not regress the title-search path."""
    monkeypatch.setattr(chat_router, "supabase", stub)

    user_a = {"id": USER_A, "role": "user", "account_type": "paid"}
    # USER_A's title is "User A talking shop" — search for "talking".
    result = _run(
        chat_router.search_chat_conversations(
            q="talking",
            limit=20,
            current_user=user_a,
        )
    )
    returned_ids = [c["id"] for c in result]
    assert CONV_A in returned_ids
    assert CONV_B not in returned_ids


def test_search_paginates_prefetch_for_power_user(monkeypatch):
    """Power-user regression: when the caller owns >1000 conversations, the
    prefetch loop must page until exhausted so the .in_() scope on
    chat_messages sees every owned id. Asserts (a) multiple range() calls
    were issued on chat_conversations, (b) the second page's range starts at
    1000, (c) the messages query's scoped id set contains a conversation
    that only exists on page 2 — proving the loop actually progressed past
    page 1 instead of stopping at the first 1000-row chunk."""
    # Build 1001 conversations for USER_A so the prefetch needs exactly two
    # pages (page 1 = rows 0..999, page 2 = row 1000). The needle-matching
    # message lives on the row that lands on page 2, so a single-page
    # prefetch would silently exclude it from the scoped .in_() filter.
    page_size = 1000
    total = page_size + 1  # forces a second iteration
    overflow_conv_id = f"conv-a-{total - 1:04d}"  # last id, lands on page 2
    conversations = [
        {
            "id": f"conv-a-{i:04d}",
            "user_id": USER_A,
            "scope": "global",
            "scope_id": None,
            "title": f"User A thread {i}",
            "created_at": "2026-05-01T00:00:00Z",
            "updated_at": "2026-05-01T00:00:00Z",
        }
        for i in range(total)
    ]
    messages = [
        {
            "id": "msg-overflow",
            "conversation_id": overflow_conv_id,
            "role": "user",
            "content": f"Discussion of {NEEDLE} on the overflow page",
        },
    ]
    big_stub = _SupabaseStub(conversations=conversations, messages=messages)
    monkeypatch.setattr(chat_router, "supabase", big_stub)

    user_a = {"id": USER_A, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.search_chat_conversations(
            q=NEEDLE,
            limit=20,
            current_user=user_a,
        )
    )

    # The overflow conversation must surface — proves the prefetch loop ran
    # at least twice and the page-2 id reached the messages .in_() scope.
    returned_ids = {c["id"] for c in result}
    assert overflow_conv_id in returned_ids, (
        "Power-user regression: search missed the overflow-page conversation, "
        "meaning the prefetch loop stopped at page 1 and silently dropped "
        f"{overflow_conv_id} from the .in_('conversation_id', ...) scope."
    )

    # The chat_conversations table must have been paged at least twice with
    # the page-2 range starting at page_size — without this, an off-by-one
    # in the range arithmetic would also pass the previous assertion.
    conv_range_calls = [
        c for c in big_stub.calls
        if c["table"] == "chat_conversations" and c["range"] is not None
    ]
    assert len(conv_range_calls) >= 2, (
        f"Expected at least 2 paginated range calls on chat_conversations, "
        f"got {len(conv_range_calls)}. Loop did not advance past page 1."
    )
    assert conv_range_calls[1]["range"] == (page_size, 2 * page_size - 1), (
        f"Page-2 range must start at {page_size} (exclusive of page 1), got "
        f"{conv_range_calls[1]['range']}"
    )

    # The messages query must have been scoped via .in_() and the union of
    # all chunks must contain every owned conversation id — proving the
    # loop concatenated both pages and the chunked .in_() helper fanned out
    # over every id (rather than truncating to a single SAFE_IN_LIMIT-sized
    # chunk).
    msg_calls = [c for c in big_stub.calls if c["table"] == "chat_messages"]
    assert len(msg_calls) >= 1, "chat_messages query was never issued"
    scoped_ids = {
        cid
        for call in msg_calls
        for cid in call["in"]["conversation_id"]
    }
    assert len(scoped_ids) == total, (
        f"chat_messages scope union covered {len(scoped_ids)} ids, "
        f"expected {total} (both pages concatenated). chunked_in_query "
        f"may have stopped short of the full id set."
    )
