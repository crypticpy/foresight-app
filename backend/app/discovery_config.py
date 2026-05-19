"""Configuration layer for the discovery pipeline.

Holds the dataclasses, enums, and config-time helpers used to build a
``DiscoveryConfig`` for a single run — independent of the runtime
``DiscoveryService`` class that consumes them. Splitting these out keeps
the runtime module focused on orchestration and makes the resolution
chain (explicit kwarg > admin_settings row > legacy env var > in-code
default) easy to read in one place.

What lives here
---------------
* :class:`SourceCategory` — enum of the five content categories the
  pipeline fetches from.
* ``DEFAULT_RSS_FEEDS`` / ``DEFAULT_SEARCH_TOPICS`` — in-code fallbacks
  used when the registry is unseeded or admin hasn't picked topics.
* :class:`SourceCategoryConfig` — per-category toggles + feed list.
* :class:`DiscoveryConfig` — all the run-time knobs (caps, thresholds,
  filters, category map).
* :data:`DISCOVERY_SETTING_MAP` — admin-settings key → (field, type,
  legacy env name) routing table for the live override path.
* :func:`load_discovery_admin_overrides` — reads
  ``admin_settings`` rows and returns the override dict.
* :func:`load_active_source_urls` — registry-aware URL lookup with a
  cold-boot fallback to in-code defaults for the RSS category.
* :func:`build_discovery_config` — the public factory. Most callers
  reach for this.
* :func:`apply_source_preferences` — overlay a card's stored
  ``source_preferences`` JSONB on top of a built config.

Supabase access notes
---------------------
The override / registry loaders read the sync Supabase client directly.
Async callers (the routers, the worker, the service class) must wrap
calls to ``build_discovery_config`` / ``load_*`` in
``asyncio.to_thread`` to keep the event loop unblocked.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from .query_generator import QueryConfig
from .supabase_in_guard import chunked_in_query

logger = logging.getLogger(__name__)


# ============================================================================
# Source Category Tracking (5 Categories)
# ============================================================================


class SourceCategory(Enum):
    """
    Content source categories for multi-source ingestion.

    The pipeline fetches from 5 diverse source categories to ensure
    comprehensive coverage of emerging trends and technologies.
    """

    RSS = "rss"  # RSS/Atom feeds from curated sources
    NEWS = "news"  # Major news outlets (Reuters, AP, GCN)
    ACADEMIC = "academic"  # Academic publications (arXiv)
    GOVERNMENT = "government"  # Government sources (.gov domains)
    TECH_BLOG = "tech_blog"  # Tech blogs (TechCrunch, Ars Technica)


# Default RSS feeds for curated content
DEFAULT_RSS_FEEDS = [
    "https://news.ycombinator.com/rss",
    "https://feeds.arstechnica.com/arstechnica/technology-lab",
    "https://www.govtech.com/rss/",
    "https://statescoop.com/feed/",
]

# Default search topics for multi-source content fetching
DEFAULT_SEARCH_TOPICS = [
    "smart city technology",
    "municipal innovation",
    "government AI",
    "public sector digital transformation",
    "civic technology",
]


# ============================================================================
# Environment-based defaults (can be overridden in .env)
# ============================================================================


def get_discovery_defaults():
    """Get discovery defaults from environment variables."""
    return {
        "max_queries": int(os.getenv("DISCOVERY_MAX_QUERIES", "100")),
        "max_sources_per_query": int(
            os.getenv("DISCOVERY_MAX_SOURCES_PER_QUERY", "10")
        ),
        "max_sources_total": int(os.getenv("DISCOVERY_MAX_SOURCES_TOTAL", "500")),
    }


# ============================================================================
# Configuration Classes
# ============================================================================


@dataclass
class SourceCategoryConfig:
    """Configuration for a specific source category."""

    enabled: bool = True
    max_sources: int = 50
    topics: List[str] = field(default_factory=list)
    # Category-specific settings
    rss_feeds: List[str] = field(default_factory=list)  # For RSS category


@dataclass
class DiscoveryConfig:
    """Configuration for a discovery run."""

    # Query limits - defaults come from environment
    max_queries_per_run: int = None
    max_sources_per_query: int = None
    max_sources_total: int = None

    # Thresholds - TUNED TO PREFER ENRICHMENT OVER CREATION
    auto_approve_threshold: float = 0.95  # Auto-approve confidence threshold
    similarity_threshold: float = (
        0.85  # Strong match - add to existing card (lowered from 0.92)
    )
    weak_match_threshold: float = (
        0.75  # Weak match - check with LLM (lowered from 0.82)
    )
    name_similarity_threshold: float = 0.80  # Name-based matching threshold

    # Card creation limits - PREVENT RUNAWAY CARD CREATION
    # PR #87 made ``max_new_cards_per_run`` a *per-pillar* cap and added the
    # global ``max_new_cards_total`` as a safety net so HH/late batches stop
    # getting starved by EW/MC/HG. Admins that previously set
    # ``FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN`` should also set
    # ``FORESIGHT_DISCOVERY_MAX_NEW_CARDS_TOTAL`` if they want to keep a hard
    # total-cards ceiling on each run.
    max_new_cards_per_run: int = 15  # Per-pillar cap (was global pre-PR #87)
    max_new_cards_total: int = 60  # Global ceiling across all pillars per run

    # Filtering
    pillars_filter: List[str] = field(default_factory=list)  # Empty = all pillars
    horizons_filter: List[str] = field(default_factory=list)  # Empty = all horizons

    # Options
    include_priorities: bool = True
    dry_run: bool = False  # If True, don't persist anything
    skip_blocked_topics: bool = True
    use_signal_agent: bool = (
        True  # Use AI agent for signal detection instead of deterministic clustering
    )

    # Multi-source category configuration
    source_categories: Dict[str, SourceCategoryConfig] = field(default_factory=dict)
    enable_multi_source: bool = True  # Enable fetching from all 5 source categories
    search_topics: List[str] = field(default_factory=list)  # Topics for source searches

    # Coverage-balancer override. When populated, ``_generate_queries`` returns
    # this list verbatim instead of going through the hardcoded pillar +
    # priority generator. Each entry is the same shape QueryGenerator emits.
    custom_queries: List[QueryConfig] = field(default_factory=list)

    def __post_init__(self):
        """Apply environment defaults and initialize source category configurations."""
        # Step 1: Apply environment defaults for any None values
        defaults = get_discovery_defaults()
        if self.max_queries_per_run is None:
            self.max_queries_per_run = defaults["max_queries"]
        if self.max_sources_per_query is None:
            self.max_sources_per_query = defaults["max_sources_per_query"]
        if self.max_sources_total is None:
            self.max_sources_total = defaults["max_sources_total"]

        # Step 2: Initialize default source category configurations
        if not self.source_categories:
            self.source_categories = {
                SourceCategory.RSS.value: SourceCategoryConfig(
                    enabled=True, max_sources=50, rss_feeds=DEFAULT_RSS_FEEDS.copy()
                ),
                SourceCategory.NEWS.value: SourceCategoryConfig(
                    enabled=True, max_sources=30
                ),
                SourceCategory.ACADEMIC.value: SourceCategoryConfig(
                    enabled=True, max_sources=30
                ),
                SourceCategory.GOVERNMENT.value: SourceCategoryConfig(
                    enabled=True, max_sources=30
                ),
                SourceCategory.TECH_BLOG.value: SourceCategoryConfig(
                    enabled=True, max_sources=30
                ),
            }
        if not self.search_topics:
            self.search_topics = DEFAULT_SEARCH_TOPICS.copy()


# ============================================================================
# Live admin-settings overrides for DiscoveryConfig
# ============================================================================
#
# Each entry: admin_settings.key -> (DiscoveryConfig field, type-coercer,
# legacy env name). The legacy env name preserves backward compat for the
# three knobs that already had env-var support before the admin console
# could write to them.

DISCOVERY_SETTING_MAP: Dict[str, Tuple[str, type, Optional[str]]] = {
    "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN": (
        "max_queries_per_run", int, "DISCOVERY_MAX_QUERIES",
    ),
    "FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY": (
        "max_sources_per_query", int, "DISCOVERY_MAX_SOURCES_PER_QUERY",
    ),
    "FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL": (
        "max_sources_total", int, "DISCOVERY_MAX_SOURCES_TOTAL",
    ),
    "FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN": (
        "max_new_cards_per_run", int, None,
    ),
    "FORESIGHT_DISCOVERY_MAX_NEW_CARDS_TOTAL": (
        "max_new_cards_total", int, None,
    ),
    "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD": (
        "auto_approve_threshold", float, None,
    ),
    "FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD": (
        "similarity_threshold", float, None,
    ),
    "FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD": (
        "weak_match_threshold", float, None,
    ),
    "FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD": (
        "name_similarity_threshold", float, None,
    ),
}


def load_discovery_admin_overrides() -> Dict[str, Any]:
    """Load live discovery overrides from ``admin_settings``.

    Resolution per knob: admin override row > legacy env var > skip
    (caller falls back to in-code default via ``DiscoveryConfig`` defaults).

    Reads supabase synchronously; async callers should wrap in
    ``asyncio.to_thread`` to avoid blocking the event loop.
    """
    # Local import keeps the module importable in test contexts that don't
    # want supabase initialized (tests can monkeypatch this function).
    from app.deps import supabase

    keys = list(DISCOVERY_SETTING_MAP.keys())
    try:
        rows = (
            supabase.table("admin_settings")
            .select("key,value")
            .in_("key", keys)
            .execute()
            .data
            or []
        )
    except Exception:
        logger.exception(
            "Failed to read admin_settings for discovery overrides; "
            "falling back to env-var defaults"
        )
        rows = []

    by_key = {row["key"]: row for row in rows}
    overrides: Dict[str, Any] = {}
    for setting_key, (field_name, coerce, legacy_env) in DISCOVERY_SETTING_MAP.items():
        row = by_key.get(setting_key)
        raw: Any = row.get("value") if row else None
        if raw is None and legacy_env:
            raw = os.getenv(legacy_env)
        if raw is None or raw == "":
            continue
        try:
            overrides[field_name] = coerce(raw)
        except (TypeError, ValueError):
            logger.warning(
                "Invalid discovery override for %s: %r (expected %s); "
                "falling back to default",
                setting_key,
                raw,
                coerce.__name__,
            )
    return overrides


def load_active_source_urls(category: str) -> List[str]:
    """Return the list of enabled source URLs for ``category`` from the registry.

    Resolution:
    - Registry query succeeds and category has at least one row (any enabled
      flag) → return only the ``enabled=TRUE`` URLs. Zero enabled rows here
      is an explicit operator choice ("RSS off") and we honor it.
    - Registry query succeeds but the category has zero rows total → treat
      the table as unseeded and fall back to in-code defaults (RSS only).
    - Registry query fails (network / RLS / missing table) → cold-boot
      fallback to in-code defaults (RSS only); other categories return [].

    Reads supabase synchronously; async callers should wrap in
    ``asyncio.to_thread``.
    """
    from app.deps import supabase

    seeded = True
    try:
        rows = (
            supabase.table("discovery_sources_registry")
            .select("url,enabled")
            .eq("category", category)
            .execute()
            .data
            or []
        )
        if not rows:
            seeded = False
    except Exception:
        logger.exception(
            "Failed to load discovery sources registry for category %s; "
            "falling back to in-code defaults",
            category,
        )
        rows = []
        seeded = False

    if seeded:
        # Operator has registered rows — honor the enabled flags exactly,
        # including the deliberate "all disabled" case.
        return [row["url"] for row in rows if row.get("enabled") and row.get("url")]

    # Unseeded category: cold-boot fallback so a fresh DB still ingests RSS.
    if category == SourceCategory.RSS.value:
        return DEFAULT_RSS_FEEDS.copy()
    return []


def _coerce_custom_query(item: Any) -> QueryConfig:
    """Convert a balancer custom-query payload into a ``QueryConfig`` dataclass.

    Accepts:
      * a ``QueryConfig`` already (passed through)
      * a Pydantic ``CustomQuerySpec`` (``.model_dump()``)
      * a plain dict deserialized from the persisted run config

    Anything else is a programmer error and we let Python raise.
    """
    if isinstance(item, QueryConfig):
        return item
    if hasattr(item, "model_dump"):
        data = item.model_dump()
    elif isinstance(item, dict):
        data = item
    else:
        raise TypeError(f"Unsupported custom_query payload: {type(item).__name__}")
    return QueryConfig(
        query_text=data["query_text"],
        pillar_code=data["pillar_code"],
        priority_id=data.get("priority_id"),
        horizon_target=data.get("horizon_target", "H2"),
        source_context=data.get("source_context", "balance"),
    )


def build_discovery_config(**explicit: Any) -> DiscoveryConfig:
    """Build a ``DiscoveryConfig`` with admin-settings overrides applied.

    Resolution per field: explicit (non-None kwarg) > admin_settings row >
    legacy env var > in-code default.

    Also overlays the discovery_sources_registry RSS feed list onto the
    RSS source category, so admin enable/disable from the catalog tab
    takes effect on the next config build with no extra plumbing.

    Two extra kwargs (``categories_to_scan`` and ``source_ids``) are
    swallowed before constructing the dataclass — they are PR-E schedule
    scope overrides, not config fields.

    Reads supabase synchronously; async callers should wrap in
    ``asyncio.to_thread``.
    """
    admin_overrides = load_discovery_admin_overrides()
    explicit_non_none = {
        key: value for key, value in explicit.items() if value is not None
    }
    # Pull schedule-scope overrides out before constructing DiscoveryConfig —
    # the dataclass doesn't know about them.
    categories_to_scan: Optional[List[str]] = explicit_non_none.pop(
        "categories_to_scan", None
    )
    source_ids: Optional[List[str]] = explicit_non_none.pop("source_ids", None)

    # PR-E balancer overrides — translate the request-shaped custom_queries
    # (Pydantic CustomQuerySpec or plain dict) into QueryConfig dataclasses
    # so the dataclass-typed field is happy.
    raw_customs = explicit_non_none.pop("custom_queries", None)
    if raw_customs:
        explicit_non_none["custom_queries"] = [
            _coerce_custom_query(item) for item in raw_customs
        ]

    merged = {**admin_overrides, **explicit_non_none}
    config = DiscoveryConfig(**merged)

    rss_cat = config.source_categories.get(SourceCategory.RSS.value)
    if rss_cat is not None:
        rss_feeds = load_active_source_urls(SourceCategory.RSS.value)
        if rss_feeds:
            rss_cat.rss_feeds = rss_feeds
        else:
            # ``load_active_source_urls`` returns ``[]`` for RSS only when the
            # registry is seeded but every row is disabled — the cold-boot
            # path falls back to ``DEFAULT_RSS_FEEDS`` and never returns ``[]``
            # for RSS. So an empty result here is an explicit operator choice
            # ("RSS off"); honor it by emptying the feed list AND disabling the
            # category, otherwise ``__post_init__``'s default feeds keep the
            # fetcher running against the very URLs the operator turned off.
            rss_cat.rss_feeds = []
            rss_cat.enabled = False

    # Schedule scope overrides apply *after* the registry overlay so they
    # see the post-registry feed list when filtering by source_ids.
    if categories_to_scan or source_ids:
        _apply_schedule_scope(config, categories_to_scan, source_ids)
    return config


def _apply_schedule_scope(
    config: DiscoveryConfig,
    categories_to_scan: Optional[List[str]],
    source_ids: Optional[List[str]],
) -> None:
    """Restrict ``config`` to a per-schedule scope (PR E).

    - ``categories_to_scan``: disable any source_category not in the list.
      An empty list is treated the same as None (no filter applied).
    - ``source_ids``: load the matching discovery_sources_registry rows and
      replace each affected category's URL list with just those URLs. RSS
      uses ``rss_feeds``; news/academic/government/tech_blog use the same
      mechanism via ``rss_feeds`` today (see SourceCategoryConfig). When
      no registry rows match, leave the category empty rather than falling
      back to defaults.
    """
    if categories_to_scan:
        wanted = set(categories_to_scan)
        for cat_key, cat_cfg in config.source_categories.items():
            if cat_key not in wanted:
                cat_cfg.enabled = False

    if not source_ids:
        return

    from app.deps import supabase

    try:
        def _fetch_sources(chunk):
            return (
                supabase.table("discovery_sources_registry")
                .select("id,category,url,enabled")
                .in_("id", chunk)
                .execute()
                .data
                or []
            )

        rows = chunked_in_query(_fetch_sources, list(source_ids))
    except Exception:
        logger.exception(
            "Failed to resolve schedule source_ids; ignoring source-id filter"
        )
        return

    by_category: Dict[str, List[str]] = {}
    for row in rows:
        if not row.get("enabled"):
            continue
        url = row.get("url")
        cat = row.get("category")
        if url and cat:
            by_category.setdefault(cat, []).append(url)

    for cat_key, cat_cfg in config.source_categories.items():
        if cat_key in by_category:
            cat_cfg.rss_feeds = by_category[cat_key]
            cat_cfg.enabled = True
        else:
            # Operator picked a scope that excludes this category — turn it
            # off so we don't fetch defaults instead.
            cat_cfg.enabled = False


def apply_source_preferences(
    config: DiscoveryConfig, source_prefs: dict
) -> DiscoveryConfig:
    """
    Apply card-level source_preferences to a DiscoveryConfig.

    Reads the source_preferences JSONB from a card and overrides
    the config's source category toggles, custom RSS feeds,
    search topics (keywords), and priority domains.

    Args:
        config: Base discovery configuration to modify
        source_prefs: Dict from cards.source_preferences column

    Returns:
        Modified DiscoveryConfig with preferences applied
    """
    if not source_prefs:
        return config

    # Map frontend category names to SourceCategory enum values
    category_map = {
        "news": SourceCategory.NEWS.value,
        "academic": SourceCategory.ACADEMIC.value,
        "government": SourceCategory.GOVERNMENT.value,
        "tech_blog": SourceCategory.TECH_BLOG.value,
        "rss": SourceCategory.RSS.value,
    }

    # Apply enabled_categories: disable any category not in the list.
    # An *explicit* empty list means "no categories enabled" — honor it.
    # Only a missing key (``None``) means "no preference; leave defaults alone."
    enabled = source_prefs.get("enabled_categories")
    if isinstance(enabled, list):
        enabled_values = {category_map.get(c) for c in enabled if c in category_map}
        for cat_key, cat_config in config.source_categories.items():
            cat_config.enabled = cat_key in enabled_values

    # Apply custom_rss_feeds: add to RSS category config
    custom_feeds = source_prefs.get("custom_rss_feeds")
    if custom_feeds and isinstance(custom_feeds, list):
        if rss_config := config.source_categories.get(SourceCategory.RSS.value):
            rss_config.rss_feeds = list(set(rss_config.rss_feeds + custom_feeds))
            rss_config.enabled = True

    # Apply keywords as search topics
    keywords = source_prefs.get("keywords")
    if keywords and isinstance(keywords, list):
        config.search_topics = list(set(config.search_topics + keywords))

    return config
