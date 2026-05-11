"""Tests for the embedding backfill service.

Covers two correctness properties:
- Internal hard caps on ``limit`` / ``concurrency`` apply even when callers
  (CLI, future jobs) bypass the admin router's caps.
- Pagination via ``offsets`` walks the corpus forward instead of always
  re-embedding the same prefix — what `_process_table` returns as
  ``next_offset`` matches the slice it actually pulled, and `run_embedding_backfill`
  threads per-table cursors into the query.

We drive the async service via ``asyncio.run`` rather than pytest-asyncio
because CI's dev requirements don't include the latter (matching the rest
of the repo's test style).
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List
from unittest.mock import AsyncMock, patch

from app import embedding_backfill_service as svc


class _FakeQuery:
    """Records the chain of ``.order(...).range(...)`` calls so the test
    can assert which slice the service asked for."""

    def __init__(self, table: str, recorded: Dict[str, Dict[str, Any]]):
        self.table = table
        self.recorded = recorded
        self.recorded.setdefault(table, {})

    def select(self, *_a, **_kw):
        return self

    def is_(self, *_a, **_kw):
        self.recorded[self.table]["is_called"] = True
        return self

    def order(self, col):
        self.recorded[self.table]["order"] = col
        return self

    def range(self, start, end):
        self.recorded[self.table]["range"] = (start, end)
        return self

    def limit(self, _n):
        return self

    def update(self, *_a, **_kw):
        return self

    def eq(self, *_a, **_kw):
        return self

    def execute(self):
        return type("R", (), {"data": []})()


class _FakeSupabase:
    def __init__(self):
        self.recorded: Dict[str, Dict[str, Any]] = {}

    def table(self, name: str):
        q = _FakeQuery(name, self.recorded)
        # Inline the `.not_.is_(...)` two-step accessor used by the service.
        q.not_ = q  # type: ignore[assignment]
        return q


def test_run_embedding_backfill_caps_limit_and_concurrency():
    """A caller passing absurd values must be clamped, not honored.

    Asserts both:
    - `limit` clamping by inspecting the actual `.range(...)` slice the
      service queries (visible even with zero rows returned).
    - `concurrency` clamping by mocking `_process_table` and checking the
      value handed to it, since the semaphore itself is only exercised
      when there are rows to process.
    """

    fake = _FakeSupabase()
    mocked_process = AsyncMock(
        return_value={
            "total": 0,
            "succeeded": 0,
            "skipped": 0,
            "failed": 0,
            "offset": 0,
            "next_offset": 0,
            "done": True,
        }
    )
    with patch.object(svc, "_process_table", mocked_process), patch.object(
        svc, "get_embedding_deployment", return_value="test-model"
    ):
        result = asyncio.run(
            svc.run_embedding_backfill(
                fake,
                target="cards",
                limit=10_000_000,
                concurrency=10_000,
            )
        )

    # `_process_table` receives the clamped values, not the absurd ones.
    process_kwargs = mocked_process.await_args.kwargs
    assert process_kwargs["limit"] == svc._LIMIT_HARD_CAP
    assert process_kwargs["concurrency"] == svc._CONCURRENCY_HARD_CAP
    assert result["cards"]["done"] is True


def test_run_embedding_backfill_queries_clamped_range_without_mock():
    """End-to-end variant: with the real `_process_table`, the Supabase
    query slice reflects the clamped limit so a regression that bypassed
    the cap would show up in the recorded `.range(...)` call."""

    fake = _FakeSupabase()
    with patch.object(svc, "get_embedding_deployment", return_value="test-model"):
        asyncio.run(
            svc.run_embedding_backfill(
                fake,
                target="cards",
                limit=10_000_000,
                concurrency=3,
            )
        )

    assert fake.recorded["cards"]["range"] == (0, svc._LIMIT_HARD_CAP - 1)


def test_run_embedding_backfill_advances_offsets_per_table():
    """`offsets` must be threaded into the per-table query so re-runs page forward."""

    fake = _FakeSupabase()
    with patch.object(svc, "get_embedding_deployment", return_value="test-model"):
        asyncio.run(
            svc.run_embedding_backfill(
                fake,
                target="both",
                limit=500,
                concurrency=2,
                offsets={"cards": 1000, "sources": 250},
            )
        )

    assert fake.recorded["cards"]["range"] == (1000, 1499)
    assert fake.recorded["sources"]["range"] == (250, 749)
    assert fake.recorded["cards"]["order"] == "id"
    assert fake.recorded["sources"]["order"] == "id"


def test_include_null_default_skips_not_null_filter():
    """Default `include_null=True` must omit the `.not_.is_(...)` filter so
    first-time embedding picks up NULL rows. Regressing this re-introduces
    the bug where sources (100% NULL) silently skipped the entire corpus.
    """

    fake = _FakeSupabase()
    with patch.object(svc, "get_embedding_deployment", return_value="test-model"):
        asyncio.run(
            svc.run_embedding_backfill(
                fake,
                target="both",
                limit=10,
                concurrency=1,
            )
        )

    assert "is_called" not in fake.recorded.get("cards", {})
    assert "is_called" not in fake.recorded.get("sources", {})


def test_include_null_false_applies_not_null_filter():
    """Model-rotation variant: `include_null=False` keeps the existing
    `.not_.is_(embedding, null)` filter so only rows with vectors get
    refreshed."""

    fake = _FakeSupabase()
    with patch.object(svc, "get_embedding_deployment", return_value="test-model"):
        asyncio.run(
            svc.run_embedding_backfill(
                fake,
                target="cards",
                limit=10,
                concurrency=1,
                include_null=False,
            )
        )

    assert fake.recorded["cards"].get("is_called") is True


def test_process_table_marks_done_when_slice_short():
    """A partial slice (rows < limit) marks the table done so the caller
    can reset the cursor on the next run."""

    short_rows: List[Dict[str, Any]] = [
        {"id": "a", "name": "x", "summary": "y", "description": "z"},
    ]

    class _ShortQuery(_FakeQuery):
        def execute(self):
            return type("R", (), {"data": short_rows})()

    class _ShortSupabase:
        def __init__(self):
            self.recorded: Dict[str, Dict[str, Any]] = {}

        def table(self, name):
            q = _ShortQuery(name, self.recorded)
            q.not_ = q  # type: ignore[assignment]
            return q

    fake = _ShortSupabase()
    # Avoid hitting the real embedding API.
    async def _none(_text):
        return None

    with patch.object(svc, "_embed_one", side_effect=_none), patch.object(
        svc, "get_embedding_deployment", return_value="test-model"
    ):
        counters = asyncio.run(
            svc._process_table(
                fake,
                table="cards",
                select_cols="id, name, summary, description",
                text_builder=svc._build_card_text,
                limit=100,
                concurrency=1,
                offset=0,
            )
        )

    assert counters["total"] == 1
    assert counters["next_offset"] == 1
    assert counters["done"] is True
