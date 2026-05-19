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


class _RpcBuilder:
    """Stand-in for ``supabase.rpc(...)``.

    The atomic-summary RPC (``set_discovery_run_summary_key``) is the
    only RPC ``discovery_progress`` calls. Record the calling thread
    inside ``.execute()`` and capture the JSON payload so tests can
    assert the RPC name + arguments.
    """

    def __init__(
        self,
        log: List[int],
        result_data: Any,
        captured_calls: List[Any],
        name: str,
        params: Any,
    ) -> None:
        self._log = log
        self._result_data = result_data
        self._captured_calls = captured_calls
        self._name = name
        self._params = params

    def execute(self) -> _ExecuteResult:
        self._log.append(threading.get_ident())
        self._captured_calls.append((self._name, self._params))
        return _ExecuteResult(self._result_data)


class _SupabaseStub:
    def __init__(
        self,
        log: List[int],
        result_data: Any = None,
        *,
        rpc_result_data: Any = True,
    ) -> None:
        self._log = log
        self._result_data = result_data
        self._rpc_result_data = rpc_result_data
        # Tests can read this after the call to assert RPC name + args.
        self.rpc_calls: List[Any] = []

    def table(self, _name: str) -> _QueryBuilder:
        return _QueryBuilder(self._log, self._result_data)

    def rpc(self, name: str, params: Any) -> _RpcBuilder:
        return _RpcBuilder(
            self._log,
            self._rpc_result_data,
            self.rpc_calls,
            name,
            params,
        )


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
    """``update_progress`` must execute the RPC off-loop.

    After PR-E3 the helper is a single ``set_discovery_run_summary_key``
    RPC — no SELECT, no UPDATE, no client-side merge. Pin that the one
    remaining ``.execute()`` is still wrapped in ``asyncio.to_thread``
    so the round-trip can't block the loop.
    """
    log: List[int] = []
    stub = _SupabaseStub(log, rpc_result_data=True)
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

    # One execute() call: the atomic RPC.
    assert len(log) == 1
    assert log[0] != loop_tid, (
        "RPC .execute() ran on the event-loop thread — "
        "asyncio.to_thread wrapping is missing."
    )
    # Pin the RPC name + payload shape so a future rename or arg swap
    # surfaces here instead of silently writing the wrong key.
    assert len(stub.rpc_calls) == 1
    name, params = stub.rpc_calls[0]
    assert name == "set_discovery_run_summary_key"
    assert params["p_run_id"] == "run-1"
    assert params["p_key"] == "progress"
    progress = params["p_value"]
    assert progress["current_stage"] == "search"
    assert progress["message"] == "m"
    assert progress["stages"] == {"search": "in_progress"}


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


def test_update_progress_handles_missing_run_row() -> None:
    """The RPC returns ``false`` when no ``discovery_runs`` row matched.

    Pre-PR-E3 this case did a SELECT, found nothing, and issued a no-op
    UPDATE on a missing row — wasting a round-trip and masking the bogus
    run_id from the caller. Now the RPC reports ``false`` and the
    helper logs + returns without further work.
    """
    log: List[int] = []
    stub = _SupabaseStub(log, rpc_result_data=False)

    _run(
        discovery_progress.update_progress(
            stub,  # type: ignore[arg-type]
            run_id="missing-run",
            stage="search",
            message="m",
            stages_status={"search": "in_progress"},
        )
    )

    # Exactly one RPC call — the helper did not retry or fall back.
    assert len(log) == 1


# The JSONB-null-column and non-dict-column edge cases that used to
# live in this file moved into the RPC itself: the SQL function uses
# ``COALESCE(summary_report, '{}'::jsonb)`` so the merge always sees a
# valid jsonb object. Verifying that safety belongs at the SQL layer
# (covered by inspection of the migration file); there is no Python
# branch left to exercise.


def test_update_progress_does_not_starve_concurrent_tasks() -> None:
    """A blocking Supabase call must not starve other asyncio tasks.

    We make ``.execute()`` sleep on a real OS-level ``time.sleep`` (the
    moral equivalent of a blocking HTTP round-trip). If the call ran on
    the event-loop thread, the concurrent ``ticker`` coroutine would not
    get to run until the sleep returned. Off-loop, the ticker should
    accumulate ticks during the sleep window.

    After PR-E3 the helper makes a single RPC instead of SELECT+UPDATE,
    so we now exercise the slow path on ``rpc().execute()``.
    """
    import time as _time

    log: List[int] = []

    class _SlowRpc(_RpcBuilder):
        def execute(self) -> _ExecuteResult:
            _time.sleep(0.15)
            self._log.append(threading.get_ident())
            self._captured_calls.append((self._name, self._params))
            return _ExecuteResult(True)

    class _SlowSupabase(_SupabaseStub):
        def rpc(self, name: str, params: Any) -> _RpcBuilder:
            return _SlowRpc(
                self._log,
                self._rpc_result_data,
                self.rpc_calls,
                name,
                params,
            )

    stub = _SlowSupabase(log, rpc_result_data=True)

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
    # 0.15s of off-loop RPC work. The ticker fires every 10ms, so we
    # should see well more than zero ticks during that window. If the
    # loop was blocked, ticks would be ~0.
    assert ticks > 5, (
        f"Concurrent ticker only ran {ticks} times during the Supabase "
        "round-trip — the event loop appears to have been blocked."
    )
