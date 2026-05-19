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
- Two consecutive H2 failures re-raise the second exception.
"""

from __future__ import annotations

import asyncio

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


def test_two_consecutive_h2_failures_raise():
    calls = 0

    def builder():
        nonlocal calls
        calls += 1
        raise httpx.RemoteProtocolError(f"attempt {calls}")

    with pytest.raises(httpx.RemoteProtocolError, match="attempt 2"):
        asyncio.run(execute_with_h2_retry(builder, backoff_seconds=0))
    assert calls == 2
