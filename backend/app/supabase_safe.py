"""Safe-write primitive for supabase calls in long-running code paths.

supabase-py uses httpx with no per-call timeout by default, so a stalled
connection can block a thread indefinitely. This module wraps any
callable that performs a supabase op in a side thread with a hard
timeout — a wedge becomes a logged warning instead of a deadlock.

Pattern was first inlined in ``app.usage_telemetry._insert_event`` after
the foresight-worker telemetry queue silently wedged in prod
(see PR #61). Extracted here so the job-events writer and any future
observability path can share the same primitive.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

DEFAULT_TIMEOUT_S = 5.0

# If supabase wedges, every abandoned call leaves a daemon thread sitting on
# the same blocked socket. Without a cap, a 5s-flush ticker plus a wedged
# endpoint would leak one thread per tick per emitter — over an hour that's
# thousands of zombies. This counter shed new work for a label once we
# already have ``_MAX_IN_FLIGHT_PER_LABEL`` threads stuck on it. The threads
# still drain naturally when (or if) the wedge clears.
_MAX_IN_FLIGHT_PER_LABEL = 4
_in_flight: dict[str, int] = defaultdict(int)
_in_flight_lock = threading.Lock()


def safe_write(
    op: Callable[[], T],
    *,
    timeout_s: float = DEFAULT_TIMEOUT_S,
    label: str = "supabase_op",
) -> T | None:
    """Run a supabase op on a side thread; abandon and return None on timeout.

    Returns the op's result on success, None on timeout or exception. The
    return value is best-effort — callers should treat None as "we don't
    know, keep going" rather than fatal. This module is meant for paths
    where blocking would be worse than missing one write.

    If too many calls for ``label`` are already blocked on side threads,
    new work is dropped immediately (with a warning) rather than spawning
    more threads on a wedged endpoint.
    """
    with _in_flight_lock:
        current = _in_flight[label]
        if current >= _MAX_IN_FLIGHT_PER_LABEL:
            logger.warning(
                "supabase op %s saturated (%d in-flight); dropping write",
                label,
                current,
            )
            return None
        _in_flight[label] = current + 1

    done = threading.Event()
    result_holder: dict[str, object] = {}

    def _runner() -> None:
        try:
            result_holder["value"] = op()
        except BaseException as exc:  # noqa: BLE001 — surface via holder
            result_holder["exc"] = exc
        finally:
            with _in_flight_lock:
                _in_flight[label] -= 1
            done.set()

    try:
        side = threading.Thread(
            target=_runner,
            name=f"supabase-safe-{label}",
            daemon=True,
        )
        side.start()
    except BaseException:
        # Thread.start() failing leaves _runner unrun, so decrement here
        # so the saturation guard doesn't lock the label out forever.
        with _in_flight_lock:
            _in_flight[label] -= 1
        raise
    if not done.wait(timeout_s):
        logger.warning(
            "supabase op %s exceeded %.1fs; abandoning", label, timeout_s
        )
        return None
    exc = result_holder.get("exc")
    if exc is not None:
        # exc_info preserves the traceback so a logging handler that's
        # configured for it can show *where* the supabase op blew up.
        # Kept at debug so a noisy failing path doesn't swamp prod logs.
        logger.debug(
            "supabase op %s failed: %s", label, exc, exc_info=exc
        )
        return None
    return result_holder.get("value")  # type: ignore[return-value]
