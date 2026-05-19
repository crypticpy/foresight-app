"""Cloudflare URL-length guard for Supabase ``.in_(key, values)`` calls.

Background
----------
Cloudflare rejects HTTP request lines longer than ~8 KB with a static HTML
400 page. ``.in_(key, [<300+ UUIDs>])`` URL-encodes to ~14 KB and trips that
limit; postgrest then fails to parse the HTML as JSON and the endpoint
500s. Repro request_id ``5d2a2767-...`` in prod; PR #213 fixed two specific
``/me/signals`` endpoints by routing the predicate through Postgres RPCs.

This module installs a runtime guard so the bug class can't reappear: any
``.in_()`` call with more than ``SAFE_IN_LIMIT`` values raises
``InClauseTooLargeError`` immediately, naming the column and the size. The
guard is installed at ``deps.py`` import time, so every call site is
covered without per-caller opt-in.

For legitimate cases where the caller does have a large list (typically
hydrating rows by their IDs), use :func:`chunked_in_query`, which fans the
query out over ``SAFE_IN_LIMIT``-sized chunks and merges the results.

Threshold rationale
-------------------
UUIDs URL-encode to ~42 chars each (36 hex chars + 6 ``%2C`` separators per
two values). 80 IDs → ~3.4 KB just for the ``id=in.(...)`` parameter, which
leaves ~4.5 KB headroom for the path, auth header, and any other query
parameters before Cloudflare's limit. Raising the limit is a single
constant change here; the right answer is almost always chunking or an RPC.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Iterable, List, Optional, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# 80 UUIDs URL-encoded with %2C separators ≈ 3.4 KB. Cloudflare's request-
# line limit is ~8 KB; we want substantial headroom for path/auth/other
# params, so cap well below that.
SAFE_IN_LIMIT = 80

_guard_installed = False
_original_in: Optional[Callable] = None


class InClauseTooLargeError(ValueError):
    """Raised when a ``.in_()`` call would push the URL past Cloudflare's limit.

    The fix is either :func:`chunked_in_query` (for simple row hydration) or
    a Postgres RPC that takes the ID array in the JSON request body (for
    queries that need server-side aggregation, sort, or pagination).
    """


def install_in_guard(limit: int = SAFE_IN_LIMIT) -> bool:
    """Monkey-patch postgrest's ``.in_()`` to refuse oversize lists.

    Returns True if the guard is now in place (including if it was already
    installed). Returns False — with a warning logged — if postgrest's
    internals have moved and the patch site can't be located.

    Idempotent. The ``limit`` from the first call wins; subsequent calls
    with a different limit are silently ignored to avoid surprise resets
    in test harnesses.
    """
    global _guard_installed, _original_in
    if _guard_installed:
        return True

    try:
        from postgrest._sync.request_builder import SyncFilterRequestBuilder
    except ImportError:
        logger.warning(
            "postgrest internals moved; .in_() URL-length guard not installed"
        )
        return False

    _original_in = SyncFilterRequestBuilder.in_

    def guarded_in_(self, column, values):
        values_list = list(values)
        if len(values_list) > limit:
            raise InClauseTooLargeError(
                f".in_({column!r}, [{len(values_list)} values]) would exceed "
                f"Cloudflare's ~8KB URL limit (max={limit}). Use "
                "chunked_in_query() from app.supabase_in_guard, or move the "
                "predicate into a Postgres RPC that takes the array in the "
                "JSON body."
            )
        return _original_in(self, column, values_list)

    SyncFilterRequestBuilder.in_ = guarded_in_
    _guard_installed = True
    logger.info(
        "Installed Supabase .in_() URL-length guard (limit=%d)", limit
    )
    return True


def uninstall_in_guard() -> None:
    """Reverse :func:`install_in_guard`. Only used by tests."""
    global _guard_installed, _original_in
    if not _guard_installed or _original_in is None:
        return
    try:
        from postgrest._sync.request_builder import SyncFilterRequestBuilder
    except ImportError:
        return
    SyncFilterRequestBuilder.in_ = _original_in
    _original_in = None
    _guard_installed = False


def chunked_in_query(
    build_query: Callable[[List[Any]], Optional[Iterable[T]]],
    values: Iterable[Any],
    *,
    chunk_size: int = SAFE_IN_LIMIT,
) -> List[T]:
    """Run ``build_query(chunk)`` for each chunk of ``values``, merge the rows.

    ``build_query`` is invoked with a list of at most ``chunk_size`` values
    and must execute its Supabase query, returning the resulting rows
    (typically ``.execute().data``). The helper does **not** dedupe rows
    across chunks — callers that need that should post-process the merged
    list with a key set.

    Empty input returns an empty list. ``chunk_size`` must be positive.

    Use this when the query is a simple "match rows by ID" that doesn't
    need server-side ordering across the whole result set. For queries
    that need server-side sort + pagination + count across the full ID
    set, use a Postgres RPC instead (see migration 20260519000003 for an
    example).
    """
    values_list = list(values)
    if not values_list:
        return []
    if chunk_size <= 0:
        raise ValueError(
            f"chunked_in_query: chunk_size must be positive, got {chunk_size}"
        )

    out: List[T] = []
    for start in range(0, len(values_list), chunk_size):
        chunk = values_list[start : start + chunk_size]
        rows = build_query(chunk)
        if rows:
            out.extend(rows)
    return out
