"""Regression tests for ``execute_with_h2_retry``.

Verifies that:
- A successful call passes the result through unchanged.
- A single ``httpx.RemoteProtocolError`` is retried and the second attempt's
  result is returned (the prod failure mode: HTTP/2 GOAWAY mid-stream).
- An ``httpcore.RemoteProtocolError`` is also caught (errors sometimes leak
  through without httpx wrapping them).
- A ``httpx.WriteError`` (broken pipe writing request body to Supabase) is
  retried — observed in prod on ``/me/signals/stats`` when Cloudflare drops
  the shared keep-alive connection between requests.
- An ``httpx.ReadError`` (connection drops mid-response) is retried — same
  class of transient blip as WriteError, just on the response side.
- The httpcore-leaked equivalents of WriteError / ReadError are caught too.
- A non-H2 exception is NOT retried — it bubbles immediately so callers
  don't silently mask real bugs.
- The default config is 3 total attempts (2 retries) — sized so the
  httpcore pool has time to evict a connection that just received GOAWAY.
- Exhausting all retries re-raises the final exception.
- Backoff grows exponentially between retries (0.5 s → 1.0 s by default).
"""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import httpcore
import httpx
import pytest

from app.supabase_retry import execute_with_h2_retry


def test_returns_value_on_first_success():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        return "ok"

    result = asyncio.run(execute_with_h2_retry(builder))
    assert result == "ok"
    assert calls == 1


def test_retries_on_httpx_remote_protocol_error():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.RemoteProtocolError("connection terminated")
        return {"data": [1, 2, 3]}

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == {"data": [1, 2, 3]}
    assert calls == 2


def test_retries_on_httpcore_remote_protocol_error():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpcore.RemoteProtocolError("GOAWAY")
        return "recovered"

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == "recovered"
    assert calls == 2


def test_retries_on_httpx_write_error():
    """Broken pipe while writing request body — observed in prod on /me/signals/stats."""
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.WriteError("[Errno 32] Broken pipe")
        return "recovered"

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == "recovered"
    assert calls == 2


def test_retries_on_httpx_read_error():
    """Connection dropped mid-response — same transient-blip class as WriteError."""
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ReadError("server disconnected before response complete")
        return "recovered"

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == "recovered"
    assert calls == 2


def test_retries_on_httpcore_write_error():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpcore.WriteError("[Errno 32] Broken pipe")
        return "recovered"

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == "recovered"
    assert calls == 2


def test_retries_on_httpcore_read_error():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpcore.ReadError("connection closed")
        return "recovered"

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == "recovered"
    assert calls == 2


def test_non_h2_exception_is_not_retried():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        raise ValueError("real bug")

    with pytest.raises(ValueError, match="real bug"):
        asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert calls == 1


def test_default_runs_three_attempts_before_giving_up():
    """Prod failure pin: 5 parallel callers each saw the SAME GOAWAY-doomed
    connection on attempts 1 *and* 2 because the pool hadn't recycled it
    yet. With 3 default attempts the third one has time to land on a fresh
    connection. If a future change drops this back to 2 attempts the test
    fails and we know we regressed the prod fix.
    """
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError(f"attempt {calls}")

    with pytest.raises(httpx.RemoteProtocolError, match="attempt 3"):
        asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert calls == 3


def test_recovers_on_third_attempt():
    """Two failures then success — the prod-observed pattern where the dead
    connection finally evicts after the first retry's backoff.
    """
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise httpx.RemoteProtocolError(f"attempt {calls}")
        return "recovered"

    result = asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert result == "recovered"
    assert calls == 3


def test_backoff_is_exponential():
    """Pin the backoff schedule: first retry sleeps base, second sleeps 2x.

    A flat backoff was the original config and proved insufficient — five
    parallel callers retrying after the same 250 ms all hit the still-dead
    connection. Exponential backoff (0.5 → 1.0) guarantees the second
    retry happens long enough after the first that the httpcore pool has
    closed the broken connection.
    """
    calls = 0
    sleeps: list[float] = []

    def builder():
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError("dead")

    async def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)

    with patch("app.supabase_retry.asyncio.sleep", new=fake_sleep):
        with pytest.raises(httpx.RemoteProtocolError):
            asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0.5))

    assert calls == 3
    assert sleeps == [0.5, 1.0]


def test_retries_param_is_honored():
    """``retries=1`` still works for callers that opted into the old shape."""
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError(f"attempt {calls}")

    with pytest.raises(httpx.RemoteProtocolError, match="attempt 2"):
        asyncio.run(
            execute_with_h2_retry(builder, retries=1, backoff_seconds=0)
        )
    assert calls == 2
