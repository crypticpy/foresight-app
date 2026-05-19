"""Shared pagination helper for analytics sub-routers.

PostgREST applies a server-side row cap (typically 1000) to a single
``.execute()`` call. Org-wide analytics rollups that ``select()`` raw
rows (rather than ``count="exact"``) silently truncate at that cap and
produce undercounted distributions / averages.

``fetch_all_paginated`` walks a query in ``page_size`` chunks via
``.range(start, end)`` until a partial page comes back. Each page is
dispatched through ``execute_with_h2_retry`` so a transient HTTP/2
GOAWAY on Supabase's shared connection retries once rather than
bubbling as a 500.

Originally lived in ``routers.analytics_lens`` as ``_fetch_all_paginated``;
extracted here in PR-A3 when ``analytics_system_stats`` also needed it.
"""

from __future__ import annotations

from typing import Any, Callable

from .supabase_retry import execute_with_h2_retry


async def fetch_all_paginated(
    builder_factory: Callable[[], Any],
    order_by: str = "id",
    page_size: int = 1000,
) -> list:
    """Fetch every row for a Supabase query, paginating in ``page_size`` chunks.

    Args:
        builder_factory: A zero-arg callable that returns a *fresh* query
            builder (so filters/order are reapplied per page). Don't pass
            an already-built query — calling ``.range()`` twice on the
            same builder mutates it.
        order_by: Column name used as the deterministic ordering for
            pagination. Without a stable ORDER BY, PostgREST/PostgreSQL
            is free to return rows in any order between ``.range()``
            calls (especially while the discovery worker is inserting
            into the table), which silently duplicates or skips rows
            across page boundaries. Defaults to ``"id"`` — every
            paginated table in this codebase has an ``id`` UUID PK.
            Callers that already chain ``.order(...)`` in
            ``builder_factory`` (e.g. to drive sort order in the API
            response) still get this column appended as a tiebreaker
            via supabase-py's stacking ``.order()`` semantics, which is
            harmless when the upstream columns already make rows unique.
        page_size: Rows per page. Defaults to PostgREST's typical 1000-row
            server cap; smaller values raise round-trip count, larger
            values risk server-side truncation.

    Returns:
        Concatenated list of all rows. Empty list if the query returns no
        data.
    """
    rows: list = []
    start = 0
    while True:
        # Default arg binds ``start`` for the thread closure.
        resp = await execute_with_h2_retry(
            lambda s=start: builder_factory()
            .order(order_by)
            .range(s, s + page_size - 1)
            .execute()
        )
        page = resp.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        start += page_size
    return rows
