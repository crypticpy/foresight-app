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
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Iterator

from supabase import Client

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
# How long the emitter may be silent before the ticker fires a synthetic
# heartbeat event. Must stay well below the watchdog's stale threshold
# (default 180s) so a long blocking inner call — e.g. gpt-researcher's
# discovery, which can hold for 300s+ — doesn't get killed.
_HEARTBEAT_INTERVAL_S = float(os.getenv("FORESIGHT_JOB_EVENTS_HEARTBEAT_S", "60"))


def _get_client() -> Client | None:
    """Return the shared service-role supabase client.

    Imported lazily so importing ``job_events`` from contexts that don't
    have supabase env vars (tests, doc builds) won't crash. ``safe_write``
    provides the wedge isolation, so a shared client is fine here.
    """
    try:
        from app.deps import supabase as _service_client
    except Exception as exc:  # noqa: BLE001 — best-effort observability path
        logger.debug("job_events: deps.supabase unavailable: %s", exc)
        return None
    return _service_client


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
        # Track the last stage we emitted + the last time anything was
        # written, so the ticker can fire a synthetic heartbeat during long
        # blocking inner calls (gpt-researcher discovery, large LLM calls)
        # where the main flow is silent for minutes at a time.
        self._last_stage: str | None = None
        self._last_emit_at = time.monotonic()
        self._state_lock = threading.Lock()
        self._ticker = threading.Thread(
            target=self._tick_loop,
            name=f"job-events-{self.job_id[:8]}",
            daemon=True,
        )
        self._ticker.start()

    def _tick_loop(self) -> None:
        while not self._closed.wait(_FLUSH_INTERVAL_S):
            with self._state_lock:
                idle_for = time.monotonic() - self._last_emit_at
                last_stage = self._last_stage
            # Once the emitter has been silent for longer than the
            # heartbeat interval, drop a tick row so the watchdog sees
            # liveness even if the inner call is still blocking. Skipped
            # when no stage has been emitted yet so we don't write a row
            # before the caller has signaled what work is in flight.
            if last_stage is not None and idle_for >= _HEARTBEAT_INTERVAL_S:
                self._enqueue(
                    EVENT_PROGRESS,
                    stage=last_stage,
                    message="tick",
                    payload={"idle_seconds": int(idle_for)},
                )
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
        with self._state_lock:
            self._last_emit_at = time.monotonic()
            if stage is not None:
                self._last_stage = stage

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
        # Strip any 'provider' key from caller payload so it can't override
        # the argument silently — provider identifies the row, not metadata.
        clean = dict(payload or {})
        clean.pop("provider", None)
        body = {"provider": provider, **clean}
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
