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


def test_emitter_periodic_ticker_flushes(collected_rows, monkeypatch):
    """The background ticker flushes buffered progress events without
    waiting for close(). We shrink the interval so the test doesn't drag."""
    monkeypatch.setattr(job_events, "_FLUSH_INTERVAL_S", 0.05)

    emitter = job_events.JobEventEmitter("research_task", "task-4")
    try:
        emitter.progress(stage="loop")
        # Wait long enough for at least one ticker fire.
        time.sleep(0.2)
        ticked = [
            r
            for r in collected_rows
            if r["job_id"] == "task-4"
            and r["event_type"] == job_events.EVENT_PROGRESS
        ]
        assert ticked, "ticker did not flush progress event before close()"
    finally:
        emitter.close()


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
