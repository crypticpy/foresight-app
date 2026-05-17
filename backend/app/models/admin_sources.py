"""Response models for the admin discovery-sources catalog.

Mirrors the shape of ``discovery_sources_registry`` rows plus the
per-source health metrics that ``GET /admin/sources`` decorates onto each
row from the last 7 days of ``discovered_sources``. Used by
``routers/admin_discovery.py`` to type the CRUD responses.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, List, Literal, Optional

from pydantic import BaseModel


CategoryLiteral = Literal[
    "rss", "news", "academic", "government", "tech_blog", "web_search"
]


class AdminSourceRow(BaseModel):
    """A single ``discovery_sources_registry`` row.

    Health fields (``items_7d``, ``passed_7d``, ``accept_rate_7d``,
    ``last_discovered_at``) are populated only by the GET-list endpoint
    from the 7d ``discovered_sources`` aggregate; create/update responses
    return the bare registry row and leave them ``None``.
    """

    id: str
    category: CategoryLiteral
    name: str
    url: Optional[str] = None
    config: dict[str, Any] = {}
    enabled: bool = True
    weight: float = 1.0
    notes: Optional[str] = None
    last_success_at: Optional[datetime] = None
    last_failure_at: Optional[datetime] = None
    last_failure_reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Health metrics decorated by GET /admin/sources only.
    items_7d: Optional[int] = None
    passed_7d: Optional[int] = None
    accept_rate_7d: Optional[float] = None
    last_discovered_at: Optional[str] = None

    model_config = {"extra": "allow"}


class AdminSourcesListResponse(BaseModel):
    """Envelope returned by ``GET /admin/sources``."""

    items: List[AdminSourceRow]
    total: int


class AdminSourceCategory(BaseModel):
    """Static metadata about one source category."""

    key: CategoryLiteral
    label: str
    live: bool
    description: str


class AdminSourceCategoriesResponse(BaseModel):
    """Envelope returned by ``GET /admin/sources/categories``."""

    items: List[AdminSourceCategory]
