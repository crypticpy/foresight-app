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
view: a transient blip on an idempotent read. A single retry with a tiny
backoff converts the blip into a near-invisible recovery rather than
surfacing as a 500.

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
        except _H2_ERRORS as exc:
            if attempt >= retries:
                raise
            logger.info(
                "Supabase transient transport error on attempt %d/%d: %s — retrying",
                attempt + 1,
                retries + 1,
                exc.__class__.__name__,
            )
            await asyncio.sleep(backoff_seconds)
    # Unreachable: the loop body always returns or raises.
    raise RuntimeError("execute_with_h2_retry exited loop unexpectedly")
