"""Event-loop discipline tests for ``discovery_run_lifecycle``.

The lifecycle helpers run on the asyncio loop right alongside the
heartbeat coroutine that the worker starts at run-begin. Any sync
Supabase call here blocks the loop for the duration of the network
round-trip, which means the heartbeat misses ticks and the worker
health probe sees stale state — exactly the failure mode PR #58 was
written to prevent.

These tests pin the off-loop wrapping for ``create_run_record`` and
``update_run_record``. The third helper (``finalize_run``) is a pure
orchestrator over those two plus ``asyncio.gather`` on pending lens
tasks; it has no Supabase calls of its own.
"""

from __future__ import annotations

import asyncio
import os
import sys
import threading
from typing import Any, List
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_run_lifecycle  # noqa: E402
from app.discovery_config import DiscoveryConfig  # noqa: E402
from app.discovery_result_types import (  # noqa: E402
    DiscoveryResult,
    DiscoveryStatus,
)


# --------------------------------------------------------------------------- #
# Supabase mock                                                                #
# --------------------------------------------------------------------------- #


class _ExecuteResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _QueryBuilder:
    def __init__(self, log: List[int], result_data: Any) -> None:
        self._log = log
        self._result_data = result_data

    def select(self, *_a: Any, **_kw: Any) -> "_QueryBuilder":
        return self

    def insert(self, *_a: Any, **_kw: Any) -> "_QueryBuilder":
        return self

    def update(self, *_a: Any, **_kw: Any) -> "_QueryBuilder":
        return self

    def eq(self, *_a: Any, **_kw: Any) -> "_QueryBuilder":
        return self

    def single(self) -> "_QueryBuilder":
        return self

    def execute(self) -> _ExecuteResult:
        self._log.append(threading.get_ident())
        return _ExecuteResult(self._result_data)


class _SupabaseStub:
    def __init__(self, log: List[int], result_data: Any = None) -> None:
        self._log = log
        self._result_data = result_data

    def table(self, _name: str) -> _QueryBuilder:
        return _QueryBuilder(self._log, self._result_data)


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def _loop_tid() -> int:
    return threading.get_ident()


def _make_result() -> DiscoveryResult:
    """Minimal DiscoveryResult — only the fields update_run_record reads."""
    # DiscoveryResult is a dataclass with many fields; build via MagicMock
    # with the right attribute shapes so we don't get coupled to schema
    # churn in this regression test.
    result = MagicMock(spec=DiscoveryResult)
    result.status = DiscoveryStatus.COMPLETED
    result.summary_report = "# markdown"
    result.queries_executed = 0
    result.sources_blocked = 0
    result.sources_added = 0
    result.auto_approved = 0
    result.pending_review = 0
    result.execution_time_seconds = 1.0
    result.cards_created = []
    result.cards_enriched = []
    result.completed_at = None
    result.queries_generated = 0
    result.sources_discovered = 0
    result.sources_triaged = 0
    result.sources_duplicate = 0
    result.estimated_cost = 0.0
    result.errors = []
    return result


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


def test_create_run_record_runs_supabase_off_event_loop() -> None:
    """The initial insert must not block the loop.

    The worker starts a heartbeat coroutine immediately after this call
    returns; if the insert blocked the loop, the first heartbeat would
    slip and the watchdog could mark the run stuck before it even
    started.
    """
    log: List[int] = []
    stub = _SupabaseStub(log)
    loop_tid = _loop_tid()
    config = DiscoveryConfig()

    run_id = _run(discovery_run_lifecycle.create_run_record(stub, config))  # type: ignore[arg-type]

    assert isinstance(run_id, str) and len(run_id) > 0
    assert len(log) == 1
    assert log[0] != loop_tid, (
        "create_run_record .execute() ran on the event-loop thread"
    )


def test_update_run_record_runs_both_supabase_calls_off_event_loop() -> None:
    """``update_run_record`` does select + update; both must go off-loop.

    Without the wrap on the select, the conditional terminal write
    becomes a 2-roundtrip blocker — over the lifetime of a run, that's
    where the heartbeat thread used to miss its window.
    """
    log: List[int] = []
    # Return a row with an empty summary_report so the merge path runs.
    stub = _SupabaseStub(
        log, result_data={"summary_report": {}, "data": [{"id": "ok"}]}
    )
    # The terminal .execute() reads .data for the empty-result check.
    # The stub returns the same _result_data for every call. The branch
    # we exercise is the success branch, which doesn't care if
    # terminal_update.data is truthy or not (just logs differently).
    loop_tid = _loop_tid()

    _run(
        discovery_run_lifecycle.update_run_record(
            stub,  # type: ignore[arg-type]
            run_id="run-1",
            result=_make_result(),
        )
    )

    # One select (merge existing report) + one update (terminal payload).
    assert len(log) == 2
    for tid in log:
        assert tid != loop_tid, (
            "update_run_record .execute() ran on the event-loop thread"
        )


def test_create_run_record_does_not_starve_concurrent_tasks() -> None:
    """A slow Supabase insert must let other coroutines progress.

    Simulates the real production scenario: heartbeat ticks every 10ms
    while ``create_run_record`` waits ~150ms on a slow DB write. If the
    insert ran on the loop thread, the ticker would not progress.
    """
    import time as _time

    log: List[int] = []

    class _SlowSupabase(_SupabaseStub):
        def table(self, _name: str) -> _QueryBuilder:
            return _SlowBuilder(self._log, self._result_data)

    class _SlowBuilder(_QueryBuilder):
        def execute(self) -> _ExecuteResult:
            _time.sleep(0.15)
            self._log.append(threading.get_ident())
            return _ExecuteResult(None)

    stub = _SlowSupabase(log)
    config = DiscoveryConfig()

    async def driver() -> int:
        ticks = 0

        async def ticker() -> None:
            nonlocal ticks
            for _ in range(40):
                await asyncio.sleep(0.01)
                ticks += 1

        ticker_task = asyncio.create_task(ticker())
        await discovery_run_lifecycle.create_run_record(stub, config)  # type: ignore[arg-type]
        ticker_task.cancel()
        try:
            await ticker_task
        except asyncio.CancelledError:
            pass
        return ticks

    ticks = _run(driver())
    assert ticks > 5, (
        f"Concurrent ticker only ran {ticks} times during a 150ms "
        "Supabase round-trip — event loop appears blocked."
    )


def test_update_run_record_swallows_missing_row_select(
    monkeypatch: Any,
) -> None:
    """If the select crashes, update_run_record must still attempt the write.

    The existing-report read is wrapped in its own try/except for
    exactly this reason. We pin the contract: a thrown select doesn't
    kill the helper.
    """
    log: List[int] = []

    class _RaisingSelectSupabase:
        def __init__(self, log: List[int]) -> None:
            self._log = log
            self._first = True

        def table(self, _name: str) -> Any:
            return _RaisingSelectBuilder(self._log, self)

    class _RaisingSelectBuilder(_QueryBuilder):
        def __init__(self, log: List[int], parent: Any) -> None:
            super().__init__(log, None)
            self._parent = parent
            self._is_select = False

        def select(self, *_a: Any, **_kw: Any) -> "_RaisingSelectBuilder":
            self._is_select = True
            return self

        def execute(self) -> _ExecuteResult:
            if self._is_select:
                self._log.append(threading.get_ident())
                raise RuntimeError("select boom")
            self._log.append(threading.get_ident())
            return _ExecuteResult(None)

    stub = _RaisingSelectSupabase(log)
    _run(
        discovery_run_lifecycle.update_run_record(
            stub,  # type: ignore[arg-type]
            run_id="run-1",
            result=_make_result(),
        )
    )
    # select threw, update still attempted — 2 execute calls total.
    assert len(log) == 2
