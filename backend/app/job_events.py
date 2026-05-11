"""Structured event log for long-running worker jobs.

Every meaningful step in a research_task / executive_brief / discovery_run /
workstream_scan / signal_agent run is recorded as a row in
``public.job_events``. The watchdog uses this table to detect stalled jobs
(no event for N seconds = dead), and the frontend reads recent rows to
render progress.

Writes go through ``supabase_safe.safe_write`` so a wedged supabase never
blocks the calling task. Events are batched in memory and flushed on
stage boundaries, periodic ticks during long inner loops, and on
emitter ``.close()``.

This module replaces the threaded heartbeat pattern that lived in
``routers/research.py`` and kept dying after ~2 ticks (see PR #61
post-mortem).
"""

from __future__ import annotations

import logging
import os
import queue
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from supabase import Client, create_client

from app.supabase_safe import safe_write

logger = logging.getLogger(__name__)

JOB_RESEARCH = "research_task"
JOB_BRIEF = "executive_brief"
JOB_DISCOVERY = "discovery_run"
JOB_SCAN = "workstream_scan"
JOB_SIGNAL_AGENT = "signal_agent"

EVENT_STAGE = "stage"
EVENT_PROGRESS = "progress"
EVENT_LLM_CALL = "llm_call"
EVENT_EXTERNAL_CALL = "external_call"
EVENT_ERROR = "error"
EVENT_STATUS_CHANGED = "status_changed"
EVENT_SUMMARY = "summary"
EVENT_WATCHDOG_KILLED = "watchdog_killed"

_FLUSH_INTERVAL_S = float(os.getenv("FORESIGHT_JOB_EVENTS_FLUSH_S", "5"))
_INSERT_TIMEOUT_S = float(os.getenv("FORESIGHT_JOB_EVENTS_INSERT_TIMEOUT_S", "5"))

_supabase_client: Client | None = None
_client_lock = threading.Lock()


def _get_client() -> Client | None:
    global _supabase_client
    if _supabase_client is not None:
        return _supabase_client
    with _client_lock:
        if _supabase_client is not None:
            return _supabase_client
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY")
        if not url or not key:
            return None
        _supabase_client = create_client(url, key)
        return _supabase_client


def _make_row(
    job_type: str,
    job_id: str,
    event_type: str,
    stage: str | None,
    message: str | None,
    payload: dict[str, Any] | None,
) -> dict[str, Any]:
    return {
        "job_type": job_type,
        "job_id": str(job_id),
        "event_type": event_type,
        "stage": stage,
        "message": message,
        "payload": payload,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _insert_rows(rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    client = _get_client()
    if client is None:
        return

    def _op() -> Any:
        return client.table("job_events").insert(rows).execute()

    safe_write(_op, timeout_s=_INSERT_TIMEOUT_S, label="job_events.insert")


def record_event(
    job_type: str,
    job_id: str,
    event_type: str,
    *,
    stage: str | None = None,
    message: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """One-shot event write.

    Use for callers without a long-running context (status transitions,
    watchdog kills). Most consumers should use ``JobEventEmitter``.
    """
    _insert_rows([_make_row(job_type, job_id, event_type, stage, message, payload)])


class JobEventEmitter:
    """Per-job buffered event emitter.

    Buffers events in memory and flushes:
    - On every ``.stage()`` / ``.error()`` / ``.summary()`` call (crash-
      resilient checkpoints).
    - Periodically (every ``_FLUSH_INTERVAL_S``) via a background ticker
      so long inner loops emitting ``.progress()`` still surface liveness.
    - On ``.close()`` / context-manager exit.

    All writes go through ``safe_write``: a wedged supabase produces a
    logged warning, never a deadlock.
    """

    def __init__(self, job_type: str, job_id: str):
        self.job_type = job_type
        self.job_id = str(job_id)
        self._buffer: queue.SimpleQueue[dict[str, Any]] = queue.SimpleQueue()
        self._closed = threading.Event()
        self._ticker = threading.Thread(
            target=self._tick_loop,
            name=f"job-events-{self.job_id[:8]}",
            daemon=True,
        )
        self._ticker.start()

    def _tick_loop(self) -> None:
        while not self._closed.wait(_FLUSH_INTERVAL_S):
            self._flush()

    def _drain(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        while True:
            try:
                rows.append(self._buffer.get_nowait())
            except queue.Empty:
                return rows

    def _flush(self) -> None:
        rows = self._drain()
        if rows:
            _insert_rows(rows)

    def _enqueue(
        self,
        event_type: str,
        *,
        stage: str | None,
        message: str | None,
        payload: dict[str, Any] | None,
    ) -> None:
        self._buffer.put(
            _make_row(
                self.job_type, self.job_id, event_type, stage, message, payload
            )
        )

    def stage(
        self,
        name: str,
        *,
        message: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self._enqueue(EVENT_STAGE, stage=name, message=message, payload=payload)
        self._flush()

    def progress(
        self,
        stage: str | None = None,
        message: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self._enqueue(EVENT_PROGRESS, stage=stage, message=message, payload=payload)

    def llm_call(
        self,
        *,
        model: str,
        input_tokens: int | None = None,
        output_tokens: int | None = None,
        duration_ms: int | None = None,
        stage: str | None = None,
    ) -> None:
        payload = {
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "duration_ms": duration_ms,
        }
        self._enqueue(EVENT_LLM_CALL, stage=stage, message=None, payload=payload)

    def external_call(
        self,
        *,
        provider: str,
        stage: str | None = None,
        message: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        body = {"provider": provider, **(payload or {})}
        self._enqueue(
            EVENT_EXTERNAL_CALL, stage=stage, message=message, payload=body
        )

    def error(
        self,
        message: str,
        *,
        stage: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self._enqueue(EVENT_ERROR, stage=stage, message=message, payload=payload)
        self._flush()

    def summary(
        self,
        message: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        self._enqueue(EVENT_SUMMARY, stage=None, message=message, payload=payload)
        self._flush()

    def close(self) -> None:
        if self._closed.is_set():
            return
        self._closed.set()
        self._ticker.join(timeout=1)
        self._flush()

    def __enter__(self) -> "JobEventEmitter":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if exc is not None:
            self.error(
                f"{exc_type.__name__ if exc_type else 'Error'}: {exc}",
                payload={
                    "exception_type": exc_type.__name__ if exc_type else None
                },
            )
        self.close()


@contextmanager
def emit(job_type: str, job_id: str) -> Iterator[JobEventEmitter]:
    """Context-manager convenience for callers that don't want to manage
    the emitter lifecycle by hand.

    Records an EVENT_ERROR if the wrapped block raises so failures are
    always visible in the timeline (same as ``with JobEventEmitter() as
    events:``).
    """
    emitter = JobEventEmitter(job_type, job_id)
    try:
        yield emitter
    except BaseException as exc:
        emitter.error(
            f"{type(exc).__name__}: {exc}",
            payload={"exception_type": type(exc).__name__},
        )
        raise
    finally:
        emitter.close()
