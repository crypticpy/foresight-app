"""Tests for the Supabase ``.in_()`` URL-length guard + chunked helper.

The guard exists to make the Cloudflare URL-length bomb impossible to
reintroduce: any ``.in_(key, [<too_many>])`` call now raises immediately
instead of emitting a 14 KB URL that Cloudflare rejects with HTML 400 (the
``request_id 5d2a2767-...`` bug fixed by PR #213). ``chunked_in_query`` is
the escape hatch for callers that legitimately need >SAFE_IN_LIMIT IDs.
"""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from app.supabase_in_guard import (
    InClauseTooLargeError,
    SAFE_IN_LIMIT,
    chunked_in_query,
    install_in_guard,
    uninstall_in_guard,
)


# ---------------------------------------------------------------------------
# Guard tests
# ---------------------------------------------------------------------------


@pytest.fixture
def install_guard_for_real_builder():
    """Install the guard for real on postgrest's class, then tear down."""
    install_in_guard()
    yield
    uninstall_in_guard()


def _bare_builder():
    """Return a postgrest filter builder shell.

    The real ``SyncFilterRequestBuilder.__init__`` requires a live httpx
    session and a URL; we don't need either to test the guard, which only
    inspects the values argument before delegating. ``__new__`` gives us
    an instance whose attributes the guard never touches.
    """
    from postgrest._sync.request_builder import SyncFilterRequestBuilder

    return SyncFilterRequestBuilder.__new__(SyncFilterRequestBuilder)


def test_guard_allows_small_in_list(install_guard_for_real_builder):
    """Lists at or below the limit pass through (no ValueError raised).

    The downstream ``self.filter`` will explode on the empty shell — that's
    expected and not what we're testing. We assert only that the guard's
    own size check didn't fire.
    """
    builder = _bare_builder()
    values = [f"id-{i}" for i in range(SAFE_IN_LIMIT)]
    try:
        builder.in_("id", values)
    except InClauseTooLargeError:
        pytest.fail("guard fired below the limit")
    except (AttributeError, TypeError):
        # Bare builder has no session/path — postgrest's .filter() will
        # AttributeError after the guard passes. That's fine for this test.
        pass


def test_guard_rejects_oversize_in_list(install_guard_for_real_builder):
    """One value past the limit raises with the column name and the count."""
    builder = _bare_builder()
    values = [f"id-{i}" for i in range(SAFE_IN_LIMIT + 1)]
    with pytest.raises(InClauseTooLargeError) as exc:
        builder.in_("id", values)
    # Error message must name the column and the offending size so the
    # culprit is obvious in a stack trace.
    assert "'id'" in str(exc.value)
    assert str(SAFE_IN_LIMIT + 1) in str(exc.value)


def test_guard_is_idempotent():
    """Installing twice is a no-op (later .in_() still routes through guard)."""
    assert install_in_guard() is True
    assert install_in_guard() is True
    uninstall_in_guard()


def test_guard_install_returns_true_when_postgrest_present():
    """Caller can rely on the boolean to know the guard is live."""
    assert install_in_guard() is True
    uninstall_in_guard()


# ---------------------------------------------------------------------------
# chunked_in_query tests
# ---------------------------------------------------------------------------


def test_chunked_in_query_empty_input_returns_empty_list():
    """Empty input must not invoke the query at all."""
    calls: List[List[Any]] = []

    def build(chunk: List[Any]) -> List[Dict[str, Any]]:
        calls.append(chunk)
        return [{"id": "x"}]

    result = chunked_in_query(build, [])
    assert result == []
    assert calls == [], "build_query must not be called on empty input"


def test_chunked_in_query_runs_one_chunk_under_limit():
    """When values fit in one chunk, exactly one query runs."""
    calls: List[List[Any]] = []

    def build(chunk: List[Any]) -> List[Dict[str, Any]]:
        calls.append(chunk)
        return [{"id": v} for v in chunk]

    values = list(range(50))
    result = chunked_in_query(build, values)
    assert len(calls) == 1
    assert len(result) == 50


def test_chunked_in_query_splits_over_limit():
    """350 values with chunk_size=80 → 5 chunks (80+80+80+80+30), merged."""
    calls: List[List[Any]] = []

    def build(chunk: List[Any]) -> List[Dict[str, Any]]:
        calls.append(list(chunk))
        return [{"id": v} for v in chunk]

    values = list(range(350))
    result = chunked_in_query(build, values, chunk_size=80)
    assert len(calls) == 5
    assert [len(c) for c in calls] == [80, 80, 80, 80, 30]
    assert len(result) == 350
    # Order is preserved as chunks are processed sequentially.
    assert [r["id"] for r in result] == values


def test_chunked_in_query_none_rows_skipped():
    """A chunk that returns None contributes no rows but doesn't error."""

    def build(chunk: List[Any]) -> None:
        return None

    result = chunked_in_query(build, list(range(120)))
    assert result == []


def test_chunked_in_query_rejects_zero_chunk_size():
    with pytest.raises(ValueError, match="chunk_size must be positive"):
        chunked_in_query(lambda c: [], [1, 2, 3], chunk_size=0)


def test_chunked_in_query_does_not_dedupe_across_chunks():
    """Caller's contract: chunker preserves order and duplicates."""

    def build(chunk: List[Any]) -> List[Dict[str, Any]]:
        return [{"id": v, "label": "row"} for v in chunk]

    # The chunker shouldn't drop these duplicates — caller might rely on
    # them (e.g. for join semantics).
    result = chunked_in_query(build, ["a", "b", "a", "c"], chunk_size=2)
    assert [r["id"] for r in result] == ["a", "b", "a", "c"]


def test_chunked_in_query_compatible_with_guard(install_guard_for_real_builder):
    """The chunker must never feed > SAFE_IN_LIMIT values into one .in_() call.

    Regression check: if a caller passes a huge list to chunked_in_query and
    the helper accidentally passed the whole list to the builder in one
    shot, the guard would raise — but it shouldn't, because the helper
    chunks first.
    """
    from postgrest._sync.request_builder import SyncFilterRequestBuilder

    seen_sizes: List[int] = []

    def build(chunk: List[Any]) -> List[Dict[str, Any]]:
        # Simulate what a real builder does — call .in_() through the
        # guarded path. If the helper handed us > SAFE_IN_LIMIT items
        # this would raise InClauseTooLargeError. The bare builder has
        # no session/path so postgrest's downstream .filter() will
        # AttributeError after the guard passes — that's fine, the
        # guard's size check is what we're verifying here.
        builder = SyncFilterRequestBuilder.__new__(SyncFilterRequestBuilder)
        try:
            builder.in_("id", chunk)
        except (AttributeError, TypeError):
            pass
        seen_sizes.append(len(chunk))
        return [{"id": v} for v in chunk]

    values = list(range(SAFE_IN_LIMIT * 3 + 5))
    result = chunked_in_query(build, values)
    assert all(size <= SAFE_IN_LIMIT for size in seen_sizes)
    assert len(result) == len(values)
