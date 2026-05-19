"""Regression tests for ``discovery_progress`` event-loop discipline.

The Supabase Python client is synchronous. Every helper in
``discovery_progress.py`` is declared ``async`` and is called from the
asyncio-driven discovery pipeline, which means a bare
``supabase.table(...).execute()`` would block the event loop and
serialize every other concurrent task — heartbeats, fetcher coroutines,
job-event writers — until the round-trip returned.

These tests pin the off-loop wrapping. We record the thread identifier
inside the Supabase mock's ``.execute()`` and assert it differs from the
event-loop thread. If a future edit drops ``asyncio.to_thread`` the
identifier will match and the test fails.

We also assert ``await``-correctness: the helpers must accept the mock's
synchronous return value (no implicit coroutine result), which catches
the easy mistake of wrapping the wrong layer.
"""

from __future__ import annotations

import asyncio
import os
import sys
import threading
from typing import Any, List, Optional
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_progress  # noqa: E402


# --------------------------------------------------------------------------- #
# Supabase mock that records the calling thread of every ``.execute()`` call.  #
# --------------------------------------------------------------------------- #


class _ExecuteResult:
    """Stand-in for ``APIResponse``; only ``.data`` is read."""

    def __init__(self, data: Any) -> None:
        self.data = data


class _QueryBuilder:
    """Chainable mock that mirrors supabase-py's fluent surface.

    Every chained method returns ``self`` so callers can compose
    ``.table().update().eq().execute()``. ``.execute()`` records the
    calling thread id into the shared log so the test can assert it ran
    off the event-loop thread.
    """

    def __init__(self, log: List[int], result_data: Any) -> None:
        self._log = log
        self._result_data = result_data

    def select(self, *_args: Any, **_kwargs: Any) -> "_QueryBuilder":
        return self

    def insert(self, *_args: Any, **_kwargs: Any) -> "_QueryBuilder":
        return self

    def update(self, *_args: Any, **_kwargs: Any) -> "_QueryBuilder":
        return self

    def eq(self, *_args: Any, **_kwargs: Any) -> "_QueryBuilder":
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


def _loop_thread_id() -> int:
    """Thread id that ``asyncio.run`` will use as the loop thread.

    ``asyncio.run`` reuses the calling thread, so the loop thread id is
    just ``threading.get_ident()`` at call time.
    """
    return threading.get_ident()


class _TriageStub:
    is_relevant = True
    confidence = 0.8
    primary_pillar = "EW"
    reason = "ok"


class _AnalysisStub:
    summary = "s"
    key_excerpts: list = []
    pillars: list = []
    goals: list = []
    steep_categories: list = []
    anchors: list = []
    horizon = "near"
    suggested_stage = "Exploring"
    triage_score = 0.5
    credibility = 0.5
    novelty = 0.5
    likelihood = 0.5
    impact = 0.5
    relevance = 0.5
    time_to_awareness_months = 6
    time_to_prepare_months = 12
    suggested_card_name = "x"
    is_new_concept = False
    reasoning = "r"
    entities: list = []


class _RawSourceStub:
    url = "https://example.test/article"
    title = "t"
    content = "c"
    published_at: Optional[str] = None
    source_type = "web"


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


def test_update_progress_runs_supabase_off_event_loop() -> None:
    """``update_progress`` must execute Supabase calls off-loop."""
    log: List[int] = []
    stub = _SupabaseStub(log, result_data={"summary_report": {}})
    loop_tid = _loop_thread_id()

    _run(
        discovery_progress.update_progress(
            stub,  # type: ignore[arg-type]
            run_id="run-1",
            stage="search",
            message="m",
            stages_status={"search": "in_progress"},
        )
    )

    # Two execute() calls: the select + the update.
    assert len(log) == 2
    for tid in log:
        assert tid != loop_tid, (
            "Supabase .execute() ran on the event-loop thread — "
            "asyncio.to_thread wrapping is missing."
        )


def test_persist_discovered_source_runs_supabase_off_event_loop() -> None:
    """The insert + reputation-lookup must both go off-loop."""
    log: List[int] = []
    stub = _SupabaseStub(log, result_data=[{"id": "src-1"}])
    loop_tid = _loop_thread_id()

    # Reputation lookup also hits Supabase synchronously — we don't care
    # what it returns, just that it's called off-loop. Have it record the
    # thread id and return None.
    def fake_get_reputation(supabase: Any, url: str) -> None:
        log.append(threading.get_ident())
        return None

    with patch.object(
        discovery_progress.domain_reputation_service,
        "get_reputation",
        new=fake_get_reputation,
    ):
        result_id = _run(
            discovery_progress.persist_discovered_source(
                stub,  # type: ignore[arg-type]
                run_id="run-1",
                source=_RawSourceStub(),  # type: ignore[arg-type]
            )
        )

    assert result_id == "src-1"
    # One reputation lookup + one insert.
    assert len(log) == 2
    for tid in log:
        assert tid != loop_tid


def test_update_source_triage_runs_supabase_off_event_loop() -> None:
    log: List[int] = []
    stub = _SupabaseStub(log)
    loop_tid = _loop_thread_id()

    _run(
        discovery_progress.update_source_triage(
            stub,  # type: ignore[arg-type]
            source_id="src-1",
            triage=_TriageStub(),  # type: ignore[arg-type]
            passed=True,
        )
    )

    assert len(log) == 1
    assert log[0] != loop_tid


def test_update_source_analysis_runs_supabase_off_event_loop() -> None:
    log: List[int] = []
    stub = _SupabaseStub(log)
    loop_tid = _loop_thread_id()

    _run(
        discovery_progress.update_source_analysis(
            stub,  # type: ignore[arg-type]
            source_id="src-1",
            analysis=_AnalysisStub(),  # type: ignore[arg-type]
        )
    )

    assert len(log) == 1
    assert log[0] != loop_tid


def test_update_source_dedup_runs_supabase_off_event_loop() -> None:
    log: List[int] = []
    stub = _SupabaseStub(log)
    loop_tid = _loop_thread_id()

    _run(
        discovery_progress.update_source_dedup(
            stub,  # type: ignore[arg-type]
            source_id="src-1",
            status="unique",
        )
    )

    assert len(log) == 1
    assert log[0] != loop_tid


def test_update_source_outcome_runs_supabase_off_event_loop() -> None:
    log: List[int] = []
    stub = _SupabaseStub(log)
    loop_tid = _loop_thread_id()

    _run(
        discovery_progress.update_source_outcome(
            stub,  # type: ignore[arg-type]
            source_id="src-1",
            status="card_created",
            card_id="card-1",
        )
    )

    assert len(log) == 1
    assert log[0] != loop_tid


def test_update_progress_does_not_starve_concurrent_tasks() -> None:
    """A blocking Supabase call must not starve other asyncio tasks.

    We make ``.execute()`` sleep on a real OS-level ``time.sleep`` (the
    moral equivalent of a blocking HTTP round-trip). If the call ran on
    the event-loop thread, the concurrent ``ticker`` coroutine would not
    get to run until the sleep returned. Off-loop, the ticker should
    accumulate ticks during the sleep window.
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
            return _ExecuteResult({"summary_report": {}})

    stub = _SlowSupabase(log, result_data={"summary_report": {}})

    async def driver() -> int:
        ticks = 0

        async def ticker() -> None:
            nonlocal ticks
            for _ in range(40):
                await asyncio.sleep(0.01)
                ticks += 1

        ticker_task = asyncio.create_task(ticker())
        await discovery_progress.update_progress(
            stub,  # type: ignore[arg-type]
            run_id="run-1",
            stage="search",
            message="m",
            stages_status={"search": "in_progress"},
        )
        ticker_task.cancel()
        try:
            await ticker_task
        except asyncio.CancelledError:
            pass
        return ticks

    ticks = _run(driver())
    # Two slow execute() calls = 0.30s of off-loop work. The ticker fires
    # every 10ms, so we should see well more than zero ticks during that
    # window. If the loop was blocked, ticks would be ~0.
    assert ticks > 5, (
        f"Concurrent ticker only ran {ticks} times during the Supabase "
        "round-trip — the event loop appears to have been blocked."
    )
