"""Response models for admin CSP-goal endpoints.

Covers:

- ``POST /admin/csp-goals/{goal_id}/refresh-queries``
  -> ``AdminCspGoalRefreshQueriesResponse``
"""

from __future__ import annotations

from typing import List

from pydantic import BaseModel


class AdminCspGoalRefreshQueriesResponse(BaseModel):
    """Envelope returned by ``POST /admin/csp-goals/{goal_id}/refresh-queries``.

    ``queries`` mirrors the freshly-derived ``query_aliases`` list returned
    by ``csp_goal_query_service.derive_queries`` — bounded to
    ``MIN_QUERIES..MAX_QUERIES`` short search strings.
    """

    goal_id: str
    queries: List[str]
    count: int
