"""Regression tests for per-column pagination on the kanban router.

PR `perf/page-load-improvements` capped the initial grouped fetch at
``limit`` cards per status and added
``GET /me/workstreams/{id}/cards/by-status/{status}?offset=N&limit=M`` for
load-more. This suite locks two invariants that the page-load perf work
depends on:

  1. The grouped endpoint never returns more than ``limit`` cards per
     column and sets ``has_more=True`` on any column whose underlying
     pool exceeded the cap.
  2. The by-status endpoint cursor-paginates with the same has_more /
     next_offset contract; the offset returned by page N is the correct
     argument for page N+1.

The supabase stub mirrors PostgREST's inclusive ``.range(a, b)`` semantics
— we over-fetch by 1 row to derive has_more, so the test must hand back
``limit + 1`` rows when more remain.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional, Tuple

import pytest

from app.routers import workstream_kanban as kanban_router


# ---------------------------------------------------------------------------
# Supabase stub — only the chain shape used by the kanban router's read
# helpers (``_fetch_status_page``).
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _Query:
    def __init__(self, table: "_Table"):
        self._table = table
        self._eq: Dict[str, Any] = {}
        self._range: Optional[Tuple[int, int]] = None

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, start: int, end: int):
        # PostgREST .range() is inclusive on BOTH ends — request rows
        # [start, end], so passing `offset + limit` returns at most
        # `limit + 1` rows (one extra so the router can derive has_more).
        self._range = (start, end)
        return self

    def execute(self) -> _Resp:
        rows = [
            r for r in self._table.rows
            if all(r.get(k) == v for k, v in self._eq.items())
        ]
        if self._range is not None:
            start, end = self._range
            rows = rows[start : end + 1]
        return _Resp(rows)


class _Table:
    def __init__(self, rows: List[Dict[str, Any]]):
        self.rows = rows


class _SupabaseStub:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._table = _Table(rows)

    def table(self, _name: str):
        return _Query(self._table)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_card_row(
    status: str, position: int, workstream_id: str
) -> Dict[str, Any]:
    """Build a workstream_cards row matching the columns the router selects.

    The joined `cards(*)` payload is mocked with the minimum fields the
    response model needs (id, name, status). enrich_cards_with_collab is
    patched to a no-op so we don't need follower/artifact tables.
    """
    card_id = f"card-{status}-{position:03d}"
    return {
        "id": f"wsc-{status}-{position:03d}",
        "workstream_id": workstream_id,
        "card_id": card_id,
        "added_by": "user-1",
        "added_at": "2026-05-01T00:00:00Z",
        "status": status,
        "position": position,
        "notes": None,
        "reminder_at": None,
        "added_from": "manual",
        "updated_at": None,
        "is_watching": False,
        "brief_status": "none",
        "last_research_depth": "none",
        "last_research_at": None,
        "previous_status": None,
        "cards": {
            "id": card_id,
            "name": f"Card {position}",
            "status": "active",
        },
    }


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture
def patched(monkeypatch):
    """Patch the router's external dependencies so each test focuses on the
    pagination contract:
      - access guard always passes
      - enrich_cards_with_collab is a no-op (drops the followers/artifacts
        roundtrip; the response model accepts the bare joined card)
    """
    monkeypatch.setattr(
        kanban_router, "_require_workstream_read", lambda *_a, **_kw: None
    )
    monkeypatch.setattr(
        kanban_router,
        "enrich_cards_with_collab",
        lambda _client, cards, _user_id=None: cards,
    )
    return monkeypatch


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_grouped_fetch_caps_columns_at_limit_and_flags_has_more(patched):
    """A column with more rows than ``limit`` returns exactly ``limit`` cards
    and signals ``has_more=True``; a column that fits inside the cap returns
    every card and signals ``has_more=False``."""
    workstream_id = "ws-1"
    inbox_rows = [
        _make_card_row("inbox", i, workstream_id) for i in range(75)
    ]
    working_rows = [
        _make_card_row("working", i, workstream_id) for i in range(10)
    ]
    stub = _SupabaseStub(inbox_rows + working_rows)
    patched.setattr(kanban_router, "supabase", stub)

    response = _run(
        kanban_router.get_workstream_cards(
            workstream_id=workstream_id,
            limit=50,
            current_user={"id": "user-1"},
        )
    )

    assert len(response.inbox) == 50, "inbox must be capped at limit"
    assert response.has_more["inbox"] is True
    assert len(response.working) == 10, (
        "working has only 10 rows — must return all of them"
    )
    assert response.has_more["working"] is False
    assert response.has_more["ready"] is False
    assert response.has_more["archived"] is False


def test_by_status_pagination_walks_full_set_with_cursor(patched):
    """``next_offset`` returned by page N is the correct offset for page N+1,
    and ``has_more`` flips to False on the final page."""
    workstream_id = "ws-1"
    # 120 inbox rows across three pages of 50 (50 + 50 + 20).
    rows = [_make_card_row("inbox", i, workstream_id) for i in range(120)]
    stub = _SupabaseStub(rows)
    patched.setattr(kanban_router, "supabase", stub)

    page1 = _run(
        kanban_router.get_workstream_cards_by_status(
            workstream_id=workstream_id,
            status="inbox",
            offset=0,
            limit=50,
            current_user={"id": "user-1"},
        )
    )
    assert len(page1.cards) == 50
    assert page1.has_more is True
    assert page1.next_offset == 50

    page2 = _run(
        kanban_router.get_workstream_cards_by_status(
            workstream_id=workstream_id,
            status="inbox",
            offset=page1.next_offset,
            limit=50,
            current_user={"id": "user-1"},
        )
    )
    assert len(page2.cards) == 50
    assert page2.has_more is True
    assert page2.next_offset == 100

    page3 = _run(
        kanban_router.get_workstream_cards_by_status(
            workstream_id=workstream_id,
            status="inbox",
            offset=page2.next_offset,
            limit=50,
            current_user={"id": "user-1"},
        )
    )
    assert len(page3.cards) == 20
    assert page3.has_more is False, (
        "final page must signal has_more=False so the client stops paginating"
    )
    assert page3.next_offset == 120

    # No row ids repeat across the three pages — the cursor is monotonic.
    ids = [c.id for c in page1.cards + page2.cards + page3.cards]
    assert len(set(ids)) == len(ids) == 120


def test_grouped_fetch_empty_board_returns_all_columns_with_has_more_false(patched):
    """A workstream with zero cards in every status still returns the full
    four-column shape (``inbox`` / ``working`` / ``ready`` / ``archived``)
    with empty arrays and ``has_more=False`` for every column.

    Locks the empty-board response contract the frontend relies on — without
    it the kanban page would have to special-case "missing column" alongside
    "empty column"."""
    workstream_id = "ws-empty"
    stub = _SupabaseStub([])
    patched.setattr(kanban_router, "supabase", stub)

    response = _run(
        kanban_router.get_workstream_cards(
            workstream_id=workstream_id,
            limit=50,
            current_user={"id": "user-1"},
        )
    )

    assert response.inbox == []
    assert response.working == []
    assert response.ready == []
    assert response.archived == []
    assert response.has_more == {
        "inbox": False,
        "working": False,
        "ready": False,
        "archived": False,
    }


def test_by_status_rejects_unknown_status(patched):
    """Status strings outside KANBAN_STATUSES return 400 so we never run an
    unrestricted scan against ``workstream_cards``."""
    from fastapi import HTTPException

    stub = _SupabaseStub([])
    patched.setattr(kanban_router, "supabase", stub)

    with pytest.raises(HTTPException) as exc:
        _run(
            kanban_router.get_workstream_cards_by_status(
                workstream_id="ws-1",
                status="not-a-real-status",
                offset=0,
                limit=50,
                current_user={"id": "user-1"},
            )
        )
    assert exc.value.status_code == 400
