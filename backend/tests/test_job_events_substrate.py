"""Unit tests for the job_events observability substrate.

Covers:
- ``supabase_safe.safe_write``: timeout abandons gracefully, success path
  forwards the value, exceptions become None without raising.
- ``job_events.JobEventEmitter``: buffered progress events flush periodically
  and on close; ``stage()``/``error()``/``summary()`` flush immediately;
  context-manager records an error event on exception.

The tests stub the supabase write path with an in-memory collector — no
network/DB calls happen.
"""

from __future__ import annotations

import threading
import time

import pytest

from app import job_events
from app.supabase_safe import safe_write


def test_safe_write_success_returns_value():
    def op():
        return {"ok": True}

    assert safe_write(op) == {"ok": True}


def test_safe_write_exception_returns_none(caplog):
    def op():
        raise RuntimeError("boom")

    assert safe_write(op) is None


def test_safe_write_timeout_returns_none(caplog):
    started = threading.Event()
    release = threading.Event()

    def op():
        started.set()
        # Sit on the lock past the timeout — safe_write should abandon us.
        release.wait(timeout=2)
        return "late"

    with caplog.at_level("WARNING"):
        result = safe_write(op, timeout_s=0.1, label="test_timeout")

    assert result is None
    assert started.wait(timeout=1), "op never ran"
    # Cleanly release the side thread so the test process can exit.
    release.set()
    assert any("exceeded" in rec.message for rec in caplog.records)


def test_safe_write_saturation_drops_new_writes(caplog):
    """Once _MAX_IN_FLIGHT_PER_LABEL threads are stuck on a label, further
    safe_write calls for that label must drop immediately rather than
    spawning more daemon threads on a wedged endpoint."""
    from app import supabase_safe

    release = threading.Event()
    label = "test_saturation"

    def blocking_op():
        release.wait(timeout=2)
        return "late"

    # Fill the in-flight slots with wedged calls.
    for _ in range(supabase_safe._MAX_IN_FLIGHT_PER_LABEL):
        result = safe_write(blocking_op, timeout_s=0.05, label=label)
        assert result is None  # timed out, but thread still in flight

    with caplog.at_level("WARNING"):
        # This one should be dropped without spawning a new thread.
        dropped = safe_write(lambda: "shouldn't run", timeout_s=1.0, label=label)

    assert dropped is None
    assert any("saturated" in rec.message for rec in caplog.records), (
        "saturation guard did not log a drop"
    )
    # Release the side threads so they decrement the counter and the
    # process can exit cleanly.
    release.set()


@pytest.fixture
def collected_rows(monkeypatch):
    """Replace ``_insert_rows`` with an in-memory collector.

    Returns the list that accumulates every row passed to insert.
    """
    rows: list[dict] = []

    def fake_insert(batch):
        rows.extend(batch)

    monkeypatch.setattr(job_events, "_insert_rows", fake_insert)
    return rows


def test_emitter_stage_flushes_immediately(collected_rows):
    emitter = job_events.JobEventEmitter("research_task", "task-1")
    try:
        emitter.stage("discover", message="starting", payload={"k": "v"})
    finally:
        emitter.close()

    assert any(
        r["event_type"] == job_events.EVENT_STAGE
        and r["stage"] == "discover"
        and r["payload"] == {"k": "v"}
        for r in collected_rows
    )


def test_emitter_progress_buffers_until_close(collected_rows):
    emitter = job_events.JobEventEmitter("research_task", "task-2")
    try:
        emitter.progress(stage="analyze")
        # Progress alone should not have flushed yet.
        assert all(r["job_id"] != "task-2" for r in collected_rows)
    finally:
        emitter.close()

    progress_rows = [
        r
        for r in collected_rows
        if r["job_id"] == "task-2"
        and r["event_type"] == job_events.EVENT_PROGRESS
    ]
    assert len(progress_rows) == 1
    assert progress_rows[0]["stage"] == "analyze"


def test_emitter_context_manager_records_error_on_exception(collected_rows):
    with pytest.raises(ValueError):
        with job_events.emit("research_task", "task-3") as events:
            events.stage("discover")
            raise ValueError("kaboom")

    error_rows = [
        r
        for r in collected_rows
        if r["job_id"] == "task-3"
        and r["event_type"] == job_events.EVENT_ERROR
    ]
    assert len(error_rows) == 1
    assert "ValueError" in error_rows[0]["message"]
    assert error_rows[0]["payload"]["exception_type"] == "ValueError"


def _wait_for(predicate, *, timeout: float = 2.0, interval: float = 0.02):
    """Poll until predicate is truthy or timeout elapses.

    Avoids hard-coded sleeps that get flaky on slow CI runners.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return False


def test_emitter_periodic_ticker_flushes(collected_rows, monkeypatch):
    """The background ticker flushes buffered progress events without
    waiting for close(). Polls instead of using a fixed sleep so the test
    isn't flaky on slow CI runners."""
    monkeypatch.setattr(job_events, "_FLUSH_INTERVAL_S", 0.05)

    emitter = job_events.JobEventEmitter("research_task", "task-4")
    try:
        emitter.progress(stage="loop")
        appeared = _wait_for(
            lambda: any(
                r["job_id"] == "task-4"
                and r["event_type"] == job_events.EVENT_PROGRESS
                for r in collected_rows
            )
        )
        assert appeared, "ticker did not flush progress event before close()"
    finally:
        emitter.close()


def test_ticker_emits_heartbeat_during_long_silence(collected_rows, monkeypatch):
    """During a long blocking inner call (no stage events for >heartbeat
    interval), the ticker should emit a synthetic 'tick' progress event
    tagged with the last stage so the watchdog still sees liveness.

    This is the Codex P1 case: ``_discover_sources()`` can hold for 300s+,
    longer than the watchdog's 180s stale threshold, with no stage events
    firing. Without ticker-emitted heartbeats, the watchdog kills a
    still-running task.
    """
    monkeypatch.setattr(job_events, "_FLUSH_INTERVAL_S", 0.02)
    monkeypatch.setattr(job_events, "_HEARTBEAT_INTERVAL_S", 0.05)

    emitter = job_events.JobEventEmitter("research_task", "task-heartbeat")
    try:
        # Emit one stage so the emitter has a "current stage" to tag the
        # heartbeat with. After this, simulate a long blocking inner call
        # by simply not emitting anything; the ticker should fire ticks.
        emitter.stage("discover", message="long inner call starting")

        def has_tick():
            return any(
                r["job_id"] == "task-heartbeat"
                and r["event_type"] == job_events.EVENT_PROGRESS
                and r.get("message") == "tick"
                and r.get("stage") == "discover"
                for r in collected_rows
            )

        assert _wait_for(has_tick, timeout=1.0), (
            "ticker never fired a heartbeat tick during silent stage"
        )
    finally:
        emitter.close()


def test_ticker_does_not_heartbeat_before_first_stage(collected_rows, monkeypatch):
    """Until the caller has emitted a stage, the ticker has nothing useful
    to tag a heartbeat with — it should stay quiet rather than write rows
    with stage=None."""
    monkeypatch.setattr(job_events, "_FLUSH_INTERVAL_S", 0.02)
    monkeypatch.setattr(job_events, "_HEARTBEAT_INTERVAL_S", 0.05)

    emitter = job_events.JobEventEmitter("research_task", "task-quiet")
    try:
        # Let several heartbeat intervals pass with no stage emitted.
        time.sleep(0.2)
        ticks = [
            r
            for r in collected_rows
            if r["job_id"] == "task-quiet"
            and r.get("message") == "tick"
        ]
        assert not ticks, "ticker fired a heartbeat before any stage was emitted"
    finally:
        emitter.close()


def test_external_call_strips_provider_from_payload(collected_rows):
    emitter = job_events.JobEventEmitter("research_task", "task-provider")
    try:
        emitter.external_call(
            provider="gpt-researcher",
            stage="discover",
            payload={"provider": "imposter", "count": 5},
        )
    finally:
        emitter.close()

    rows = [r for r in collected_rows if r["job_id"] == "task-provider"]
    assert len(rows) == 1
    assert rows[0]["payload"]["provider"] == "gpt-researcher"
    assert rows[0]["payload"]["count"] == 5


def test_record_event_one_shot(collected_rows):
    job_events.record_event(
        "research_task",
        "task-5",
        job_events.EVENT_STATUS_CHANGED,
        stage="claim",
        message="queued -> processing",
    )
    rows = [r for r in collected_rows if r["job_id"] == "task-5"]
    assert len(rows) == 1
    assert rows[0]["event_type"] == job_events.EVENT_STATUS_CHANGED
    assert rows[0]["stage"] == "claim"
