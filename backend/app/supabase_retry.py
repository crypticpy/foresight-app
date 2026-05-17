"""Retry helper for Supabase reads that get tripped by HTTP/2 connection drops.

The Supabase Python client multiplexes every request over a single shared
HTTP/2 connection. Under fan-out (``asyncio.gather`` over 5+ paginated reads,
or several stats endpoints racing on the same event loop) the upstream
sometimes sends a GOAWAY frame and the next ``.execute()`` raises::

    httpx.RemoteProtocolError: <ConnectionTerminated error_code:1, ...>

The underlying query is read-only and idempotent, so a single retry with a
tiny backoff converts a transient blip into a near-invisible recovery rather
than surfacing as a 500.

USE THIS ONLY FOR READS — write paths must surface failures so the caller can
decide whether the retry is safe.
"""

from __future__ import annotations

import asyncio
from typing import Callable, TypeVar

import httpx

T = TypeVar("T")

# httpcore is httpx's transport layer; in some configurations its errors leak
# through without httpx wrapping them, so catch both.
try:
    import httpcore as _httpcore

    _H2_ERRORS: tuple[type[BaseException], ...] = (
        httpx.RemoteProtocolError,
        _httpcore.RemoteProtocolError,
    )
except ImportError:  # pragma: no cover - httpx always ships httpcore
    _H2_ERRORS = (httpx.RemoteProtocolError,)


async def execute_with_h2_retry(
    builder: Callable[[], T],
    *,
    retries: int = 1,
    backoff_seconds: float = 0.25,
) -> T:
    """Run a Supabase query in a worker thread with one retry on H2 drop.

    Args:
        builder: zero-arg sync callable that builds AND executes the query
            (e.g. ``lambda: supabase.table("foo").select("*").execute()``).
            Invoked via ``asyncio.to_thread`` so it must not touch the loop.
        retries: number of *additional* attempts after the first try (default 1).
        backoff_seconds: sleep between attempts.

    Returns whatever ``builder`` returns.
    """
    for attempt in range(retries + 1):
        try:
            return await asyncio.to_thread(builder)
        except _H2_ERRORS:
            if attempt >= retries:
                raise
            await asyncio.sleep(backoff_seconds)
    # Unreachable: the loop body always returns or raises.
    raise RuntimeError("execute_with_h2_retry exited loop unexpectedly")
