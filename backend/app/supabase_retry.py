"""Retry helper for Supabase reads that get tripped by HTTP/2 connection drops.

The Supabase Python client multiplexes every request over a single shared
HTTP/2 connection. Under fan-out (``asyncio.gather`` over 5+ paginated reads,
or several stats endpoints racing on the same event loop) the upstream
sometimes drops the connection mid-flight. The next ``.execute()`` then
surfaces one of a small family of transient transport errors:

* ``httpx.RemoteProtocolError`` — server sent an HTTP/2 GOAWAY frame.
* ``httpx.WriteError`` — broken pipe while we were writing the request
  body (Cloudflare / Supabase closed the socket between requests on the
  shared keep-alive connection).
* ``httpx.ReadError`` — connection dropped after we sent the request but
  before the response finished streaming back.

All three are the same class of problem from the application's point of
view: a transient blip on an idempotent read.

The retry strategy needs to allow time for httpcore's pool to evict the
dead connection. Observed in prod (request_id 8b96d03a on /me/signals/stats):
five parallel ``execute_with_h2_retry`` calls all hit
``RemoteProtocolError: ConnectionTerminated`` simultaneously, retried 250 ms
later, and all five retries hit the same dead connection because the pool
hadn't finished tearing it down. We now use **two retries with exponential
backoff** (500 ms → 1000 ms = ~1.5 s of total wait) so httpcore has time
to recycle the connection before the last attempt.

USE THIS ONLY FOR READS — write paths must surface failures so the caller can
decide whether the retry is safe.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Callable, TypeVar

import httpx

logger = logging.getLogger(__name__)

T = TypeVar("T")

# httpcore is httpx's transport layer; in some configurations its errors leak
# through without httpx wrapping them, so catch both flavors.
#
# The set is intentionally narrow: only transport-layer connection drops, never
# HTTP-level failures (4xx/5xx come back through postgrest's APIError, which
# this helper never retries because those usually indicate a real client bug).
_HTTPX_TRANSIENT = (
    httpx.RemoteProtocolError,
    httpx.WriteError,
    httpx.ReadError,
)
try:
    import httpcore as _httpcore

    _H2_ERRORS: tuple[type[BaseException], ...] = (
        *_HTTPX_TRANSIENT,
        _httpcore.RemoteProtocolError,
        _httpcore.WriteError,
        _httpcore.ReadError,
    )
except ImportError:  # pragma: no cover - httpx always ships httpcore
    _H2_ERRORS = _HTTPX_TRANSIENT


async def execute_with_h2_retry(
    builder: Callable[[], T],
    *,
    retries: int = 2,
    backoff_seconds: float = 0.5,
) -> T:
    """Run a Supabase query in a worker thread with retries on H2 drops.

    Args:
        builder: zero-arg sync callable that builds AND executes the query
            (e.g. ``lambda: supabase.table("foo").select("*").execute()``).
            Invoked via ``asyncio.to_thread`` so it must not touch the loop.
        retries: number of *additional* attempts after the first try
            (default 2 → 3 total attempts). Sized so the httpcore pool has
            time to evict a connection that just received GOAWAY.
        backoff_seconds: base sleep between attempts; doubled each retry
            (default 0.5 → 0.5 s, then 1.0 s).

    Returns whatever ``builder`` returns.
    """
    for attempt in range(retries + 1):
        try:
            return await asyncio.to_thread(builder)
        except _H2_ERRORS as exc:
            if attempt >= retries:
                logger.warning(
                    "Supabase transient transport error exhausted %d attempts: %s",
                    retries + 1,
                    exc.__class__.__name__,
                )
                raise
            # Exponential backoff lets httpcore tear down the dead H2
            # connection before the next attempt picks one up.
            sleep_seconds = backoff_seconds * (2**attempt)
            logger.info(
                "Supabase transient transport error on attempt %d/%d: %s — "
                "retrying in %.2fs",
                attempt + 1,
                retries + 1,
                exc.__class__.__name__,
                sleep_seconds,
            )
            await asyncio.sleep(sleep_seconds)
    # Unreachable: the loop body always returns or raises.
    raise RuntimeError("execute_with_h2_retry exited loop unexpectedly")
