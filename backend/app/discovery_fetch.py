"""Multi-source content fetching for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D4. Owns the "fetch" stage:
gather raw sources from all 5 source categories (RSS, news, academic,
government, tech blogs) concurrently and return a ``MultiSourceFetchResult``
with diversity metrics.

These functions are stateless — they take a ``DiscoveryConfig`` and call
into ``source_fetchers/`` directly. They do not touch the database,
OpenAI, or any ``DiscoveryService`` instance state, so future stages
can be tested without instantiating the orchestrator class.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, List, Tuple

from .discovery_config import (
    DEFAULT_RSS_FEEDS,
    DEFAULT_SEARCH_TOPICS,
    DiscoveryConfig,
    SourceCategory,
    SourceCategoryConfig,
)
from .discovery_result_types import (
    MultiSourceFetchResult,
    SourceDiversityMetrics,
)
from .research_service import RawSource
from .source_fetchers import (
    convert_to_raw_source as convert_academic_to_raw,
    convert_government_to_raw_source,
    fetch_academic_papers,
    fetch_government_sources,
    fetch_news_articles,
    fetch_rss_sources,
    fetch_tech_blog_articles,
)

logger = logging.getLogger(__name__)


async def fetch_from_all_source_categories(
    config: DiscoveryConfig,
) -> MultiSourceFetchResult:
    """
    Fetch content from all 5 source categories concurrently.

    Categories:
    1. RSS/Atom feeds - Curated feeds from various sources
    2. News outlets - Major news sites (Reuters, AP News, GCN)
    3. Academic publications - arXiv research papers
    4. Government sources - .gov domains, policy documents
    5. Tech blogs - TechCrunch, Ars Technica, company blogs

    Args:
        config: Discovery configuration with source category settings

    Returns:
        MultiSourceFetchResult with sources from all categories
    """
    start_time = datetime.now(timezone.utc)
    all_sources: List[RawSource] = []
    sources_by_category: Dict[str, int] = {cat.value: 0 for cat in SourceCategory}
    errors_by_category: Dict[str, List[str]] = {
        cat.value: [] for cat in SourceCategory
    }
    seen_urls: set = set()

    topics = config.search_topics or DEFAULT_SEARCH_TOPICS

    logger.info(
        f"Starting multi-source fetch from 5 categories with topics: {topics[:3]}..."
    )

    # Create tasks for each source category
    tasks = []

    # 1. RSS/Atom feeds
    rss_config = config.source_categories.get(
        SourceCategory.RSS.value, SourceCategoryConfig()
    )
    if rss_config.enabled:
        feeds = rss_config.rss_feeds or DEFAULT_RSS_FEEDS
        tasks.append(_fetch_rss_sources(feeds, rss_config.max_sources))

    # 2. News outlets
    news_config = config.source_categories.get(
        SourceCategory.NEWS.value, SourceCategoryConfig()
    )
    if news_config.enabled:
        # ``_apply_schedule_scope`` writes per-schedule URL lists into the
        # ``rss_feeds`` field for every category (the field is reused as a
        # generic URL slot — see SourceCategoryConfig). For non-RSS
        # categories the registry rows are *source-level* URLs (feed roots,
        # homepages, search endpoints) rather than article URLs, so the
        # downstream fetcher can't simply fetch them as articles. Until the
        # fetchers grow a "scope topic search to these source URLs" path,
        # we warn and fall back to broad topic search rather than silently
        # downgrading scheduled runs to homepage fetches.
        if news_config.rss_feeds:
            logger.warning(
                "News category got %d scoped URLs from source_ids, but the "
                "news fetcher doesn't yet scope topic search to a URL list; "
                "ignoring source_ids scope for news.",
                len(news_config.rss_feeds),
            )
        tasks.append(_fetch_news_sources(topics, news_config.max_sources))

    # 3. Academic publications
    academic_config = config.source_categories.get(
        SourceCategory.ACADEMIC.value, SourceCategoryConfig()
    )
    if academic_config.enabled:
        # Academic uses arXiv's search API rather than URL fetches, so
        # source_ids scoping isn't meaningful. Warn if the operator
        # configured URLs for the academic category — they'd be silently
        # ignored otherwise.
        if academic_config.rss_feeds:
            logger.warning(
                "Academic category got %d scoped URLs but arXiv search "
                "doesn't take URL inputs; ignoring source_ids scope for "
                "academic.",
                len(academic_config.rss_feeds),
            )
        tasks.append(_fetch_academic_sources(topics, academic_config.max_sources))

    # 4. Government sources
    gov_config = config.source_categories.get(
        SourceCategory.GOVERNMENT.value, SourceCategoryConfig()
    )
    if gov_config.enabled:
        # Same as news above — gov registry rows are source-level URLs.
        if gov_config.rss_feeds:
            logger.warning(
                "Government category got %d scoped URLs from source_ids, "
                "but the government fetcher doesn't yet scope topic search "
                "to a URL list; ignoring source_ids scope for government.",
                len(gov_config.rss_feeds),
            )
        tasks.append(_fetch_government_sources(topics, gov_config.max_sources))

    # 5. Tech blogs
    tech_config = config.source_categories.get(
        SourceCategory.TECH_BLOG.value, SourceCategoryConfig()
    )
    if tech_config.enabled:
        # Same as news above — tech blog registry rows are source-level URLs.
        if tech_config.rss_feeds:
            logger.warning(
                "Tech blog category got %d scoped URLs from source_ids, but "
                "the tech blog fetcher doesn't yet scope topic search to a "
                "URL list; ignoring source_ids scope for tech_blog.",
                len(tech_config.rss_feeds),
            )
        tasks.append(_fetch_tech_blog_sources(topics, tech_config.max_sources))

    # Execute all fetches concurrently
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Process results
    category_order = [
        SourceCategory.RSS.value,
        SourceCategory.NEWS.value,
        SourceCategory.ACADEMIC.value,
        SourceCategory.GOVERNMENT.value,
        SourceCategory.TECH_BLOG.value,
    ]

    result_idx = 0
    for category in category_order:
        cat_config = config.source_categories.get(category, SourceCategoryConfig())
        if not cat_config.enabled:
            continue

        if result_idx >= len(results):
            break

        result = results[result_idx]
        result_idx += 1

        if isinstance(result, Exception):
            error_msg = f"Category {category} fetch failed: {str(result)}"
            logger.warning(error_msg)
            errors_by_category[category].append(error_msg)
            continue

        sources, category_name = result
        for source in sources:
            if source.url and source.url not in seen_urls:
                seen_urls.add(source.url)
                # Tag source with category
                source.source_category = category  # type: ignore
                all_sources.append(source)
                sources_by_category[category] += 1

    # Calculate metrics
    fetch_time = (datetime.now(timezone.utc) - start_time).total_seconds()
    categories_fetched = sum(
        bool(count > 0) for count in sources_by_category.values()
    )

    logger.info(
        f"Multi-source fetch complete: {len(all_sources)} sources from "
        f"{categories_fetched}/5 categories in {fetch_time:.1f}s"
    )
    for cat, count in sources_by_category.items():
        if count > 0:
            logger.info(f"  - {cat}: {count} sources")

    # Compute diversity metrics for observability
    diversity_metrics = SourceDiversityMetrics.compute(sources_by_category)
    diversity_metrics.log_metrics(logger)

    return MultiSourceFetchResult(
        sources=all_sources,
        sources_by_category=sources_by_category,
        total_sources=len(all_sources),
        categories_fetched=categories_fetched,
        fetch_time_seconds=fetch_time,
        errors_by_category=errors_by_category,
        diversity_metrics=diversity_metrics,
    )


async def _fetch_rss_sources(
    feed_urls: List[str], max_sources: int
) -> Tuple[List[RawSource], str]:
    """Fetch sources from RSS/Atom feeds.

    Uses ceiling division for the per-feed article cap so we never
    request 0 articles per feed when ``max_sources < len(feed_urls)``
    (a common case with small per-category budgets and 10–20 default
    RSS feeds). Caller already clamps the total to ``max_sources``
    with ``articles[:max_sources]`` below.
    """
    if max_sources <= 0 or not feed_urls:
        return [], SourceCategory.RSS.value
    try:
        articles = await fetch_rss_sources(
            feed_urls=feed_urls,
            max_articles_per_feed=max(
                1, (max_sources + len(feed_urls) - 1) // len(feed_urls)
            ),
        )

        sources = []
        for article in articles[:max_sources]:
            source = RawSource(
                url=article.url,
                title=article.title,
                content=article.content,
                source_name=article.source_name,
                relevance=article.relevance,
            )
            sources.append(source)

        return sources, SourceCategory.RSS.value

    except Exception as e:
        logger.warning(f"RSS fetch failed: {e}")
        return [], SourceCategory.RSS.value


async def _fetch_news_sources(
    topics: List[str], max_sources: int
) -> Tuple[List[RawSource], str]:
    """Fetch sources from news outlets via topic search."""
    try:
        articles = await fetch_news_articles(
            topics=topics[:3],  # Limit topics to avoid rate limiting
            max_articles=max_sources,
        )

        sources = []
        for article in articles[:max_sources]:
            source = RawSource(
                url=article.url,
                title=article.title,
                content=article.content,
                source_name=article.source_name,
                relevance=article.relevance,
            )
            sources.append(source)

        return sources, SourceCategory.NEWS.value

    except Exception as e:
        logger.warning(f"News fetch failed: {e}")
        return [], SourceCategory.NEWS.value


async def _fetch_academic_sources(
    topics: List[str], max_sources: int
) -> Tuple[List[RawSource], str]:
    """Fetch sources from academic publications (arXiv)."""
    try:
        # Combine topics into search query
        query = " OR ".join([f'"{topic}"' for topic in topics[:3]])

        result = await fetch_academic_papers(query=query, max_results=max_sources)

        sources = []
        for paper in result.papers[:max_sources]:
            raw_source_dict = convert_academic_to_raw(paper)
            source = RawSource(
                url=raw_source_dict["url"],
                title=raw_source_dict["title"],
                content=raw_source_dict["content"],
                source_name=raw_source_dict["source_name"],
                relevance=raw_source_dict.get("relevance", 0.8),
            )
            sources.append(source)

        return sources, SourceCategory.ACADEMIC.value

    except Exception as e:
        logger.warning(f"Academic fetch failed: {e}")
        return [], SourceCategory.ACADEMIC.value


async def _fetch_government_sources(
    topics: List[str], max_sources: int
) -> Tuple[List[RawSource], str]:
    """Fetch sources from government websites (.gov domains)."""
    try:
        documents = await fetch_government_sources(
            topics=topics[:3], max_results=max_sources  # Limit topics
        )

        sources = []
        for doc in documents[:max_sources]:
            raw_source_dict = convert_government_to_raw_source(doc)
            source = RawSource(
                url=raw_source_dict["url"],
                title=raw_source_dict["title"],
                content=raw_source_dict["content"],
                source_name=raw_source_dict["source_name"],
                relevance=raw_source_dict.get("relevance", 0.75),
            )
            sources.append(source)

        return sources, SourceCategory.GOVERNMENT.value

    except Exception as e:
        logger.warning(f"Government fetch failed: {e}")
        return [], SourceCategory.GOVERNMENT.value


async def _fetch_tech_blog_sources(
    topics: List[str], max_sources: int
) -> Tuple[List[RawSource], str]:
    """Fetch sources from tech blogs."""
    try:
        articles = await fetch_tech_blog_articles(
            topics=topics[:3], max_articles=max_sources  # Limit topics
        )

        sources = []
        for article in articles[:max_sources]:
            source = RawSource(
                url=article.url,
                title=article.title,
                content=article.content,
                source_name=article.source_name,
                relevance=article.relevance,
            )
            sources.append(source)

        return sources, SourceCategory.TECH_BLOG.value

    except Exception as e:
        logger.warning(f"Tech blog fetch failed: {e}")
        return [], SourceCategory.TECH_BLOG.value
