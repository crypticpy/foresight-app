"""Event-loop discipline tests for ``discovery_dedup``.

``deduplicate_sources_with_metrics`` fires three Supabase round-trips
per source: a URL dup check, a ``find_similar_cards`` pgvector RPC, and
(only on weak matches) a card lookup for the LLM tiebreak. supabase-py
is synchronous, so any of these calling ``.execute()`` directly blocks
the asyncio event loop — once per source, multiplied by however many
sources came out of triage. Over the lifetime of a run that's a lot of
blocked time.

These tests pin the off-loop wrapping. Each test records the thread
id inside the mock's ``.execute()`` and asserts it differs from the
loop thread.
"""

from __future__ import annotations

import asyncio
import os
import sys
import threading
from typing import Any, List
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_dedup  # noqa: E402
from app.discovery_config import DiscoveryConfig  # noqa: E402


# --------------------------------------------------------------------------- #
# Stubs                                                                        #
# --------------------------------------------------------------------------- #


class _ExecuteResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _QueryBuilder:
    """Chainable supabase-py mock; ``.execute()`` records the thread id."""

    def __init__(self, log: List[int], result_data: Any) -> None:
        self._log = log
        self._result_data = result_data

    def select(self, *_a: Any, **_kw: Any) -> "_QueryBuilder":
        return self

    def eq(self, *_a: Any, **_kw: Any) -> "_QueryBuilder":
        return self

    def single(self) -> "_QueryBuilder":
        return self

    def execute(self) -> _ExecuteResult:
        self._log.append(threading.get_ident())
        return _ExecuteResult(self._result_data)


class _RpcBuilder:
    def __init__(self, log: List[int], result_data: Any) -> None:
        self._log = log
        self._result_data = result_data

    def execute(self) -> _ExecuteResult:
        self._log.append(threading.get_ident())
        return _ExecuteResult(self._result_data)


class _SupabaseStub:
    """Returns per-table / per-rpc data via a routing dict.

    ``table_data[name]`` and ``rpc_data[name]`` map name → result.data.
    """

    def __init__(
        self,
        log: List[int],
        *,
        table_data: dict[str, Any] | None = None,
        rpc_data: dict[str, Any] | None = None,
    ) -> None:
        self._log = log
        self._table_data = table_data or {}
        self._rpc_data = rpc_data or {}

    def table(self, name: str) -> _QueryBuilder:
        return _QueryBuilder(self._log, self._table_data.get(name))

    def rpc(self, name: str, _params: Any) -> _RpcBuilder:
        return _RpcBuilder(self._log, self._rpc_data.get(name))


def _make_source(url: str = "https://example.test/x", embedding=None):
    src = MagicMock()
    src.raw.url = url
    src.embedding = embedding or [0.1] * 1536
    src.analysis.summary = "s"
    src.analysis.suggested_card_name = "X"
    return src


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


def _loop_tid() -> int:
    return threading.get_ident()


# --------------------------------------------------------------------------- #
# Tests                                                                        #
# --------------------------------------------------------------------------- #


def test_url_dup_check_runs_off_event_loop() -> None:
    """A pre-existing URL match must hit Supabase off-loop, then short-
    circuit (the RPC + card lookup never run for known-duplicate URLs).
    """
    log: List[int] = []
    stub = _SupabaseStub(
        log,
        # ``data`` truthy → treated as duplicate, loop continues.
        table_data={"sources": [{"id": "existing-source"}]},
    )
    loop_tid = _loop_tid()

    config = DiscoveryConfig()
    ai = MagicMock()

    async def driver() -> None:
        await discovery_dedup.deduplicate_sources_with_metrics(
            stub,  # type: ignore[arg-type]
            ai,
            [_make_source()],
            config,
        )

    _run(driver())
    assert len(log) == 1, "Only the URL dup check should have fired"
    assert log[0] != loop_tid


def test_vector_rpc_runs_off_event_loop() -> None:
    """The find_similar_cards RPC must execute off-loop.

    No URL dup → RPC returns no matches → source is a new concept. We
    pin: two Supabase calls (URL check + RPC), both off-loop.
    """
    log: List[int] = []
    stub = _SupabaseStub(
        log,
        table_data={"sources": []},  # no URL dup
        rpc_data={"find_similar_cards": []},  # no vector matches
    )
    loop_tid = _loop_tid()

    config = DiscoveryConfig()
    ai = MagicMock()

    async def driver() -> None:
        await discovery_dedup.deduplicate_sources_with_metrics(
            stub,  # type: ignore[arg-type]
            ai,
            [_make_source()],
            config,
        )

    _run(driver())
    assert len(log) == 2  # URL select + RPC
    for tid in log:
        assert tid != loop_tid


def test_weak_match_card_lookup_runs_off_event_loop() -> None:
    """The card lookup on a weak match must run off-loop.

    Set the RPC to return a similarity between weak_match_threshold and
    similarity_threshold so the LLM-tiebreak branch fires the
    ``supabase.table("cards").select(...).single()`` call.
    """
    log: List[int] = []
    config = DiscoveryConfig()
    weak_sim = (config.weak_match_threshold + config.similarity_threshold) / 2

    stub = _SupabaseStub(
        log,
        table_data={
            "sources": [],  # no URL dup
            "cards": {"name": "Existing", "summary": "s"},  # card lookup
        },
        rpc_data={
            "find_similar_cards": [
                {"id": "card-1", "similarity": weak_sim},
            ],
        },
    )
    loop_tid = _loop_tid()

    # AI service returns "not a match" so the LLM-tiebreak branch
    # completes and we exit through new-concept path. The point is just
    # to verify the card lookup happened off-loop.
    ai = MagicMock()

    async def fake_check_card_match(**_kw: Any) -> dict:
        return {"is_match": False, "confidence": 0.0}

    ai.check_card_match = fake_check_card_match

    async def driver() -> None:
        await discovery_dedup.deduplicate_sources_with_metrics(
            stub,  # type: ignore[arg-type]
            ai,
            [_make_source()],
            config,
        )

    _run(driver())
    # URL select + RPC + card lookup = 3 Supabase calls.
    assert len(log) == 3
    for tid in log:
        assert tid != loop_tid


def test_dedup_does_not_starve_concurrent_tasks() -> None:
    """A slow URL dup check must not block the worker heartbeat.

    150ms blocking Supabase call concurrent with a 10ms ticker — we
    should see >5 ticks if the call ran off-loop. Identical pattern to
    the discovery_progress + lifecycle starvation tests.
    """
    import time as _time

    log: List[int] = []

    class _SlowBuilder(_QueryBuilder):
        def execute(self) -> _ExecuteResult:
            _time.sleep(0.15)
            self._log.append(threading.get_ident())
            # Return ``data`` truthy so the loop short-circuits after the
            # URL check (avoids needing rpc_data here).
            return _ExecuteResult([{"id": "x"}])

    class _SlowSupabase(_SupabaseStub):
        def table(self, _name: str) -> _SlowBuilder:
            return _SlowBuilder(self._log, [{"id": "x"}])

    stub = _SlowSupabase(log)
    config = DiscoveryConfig()
    ai = MagicMock()

    async def driver() -> int:
        ticks = 0

        async def ticker() -> None:
            nonlocal ticks
            for _ in range(40):
                await asyncio.sleep(0.01)
                ticks += 1

        ticker_task = asyncio.create_task(ticker())
        await discovery_dedup.deduplicate_sources_with_metrics(
            stub,  # type: ignore[arg-type]
            ai,
            [_make_source()],
            config,
        )
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
