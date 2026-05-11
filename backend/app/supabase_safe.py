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
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

DEFAULT_TIMEOUT_S = 5.0


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
    """
    done = threading.Event()
    result_holder: dict[str, object] = {}

    def _runner() -> None:
        try:
            result_holder["value"] = op()
        except BaseException as exc:  # noqa: BLE001 — surface via holder
            result_holder["exc"] = exc
        finally:
            done.set()

    side = threading.Thread(
        target=_runner,
        name=f"supabase-safe-{label}",
        daemon=True,
    )
    side.start()
    if not done.wait(timeout_s):
        logger.warning(
            "supabase op %s exceeded %.1fs; abandoning", label, timeout_s
        )
        return None
    exc = result_holder.get("exc")
    if exc is not None:
        logger.debug("supabase op %s failed: %s", label, exc)
        return None
    return result_holder.get("value")  # type: ignore[return-value]
