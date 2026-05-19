"""Regression test for the PR-D1 multi-source fetch error propagation fix.

Pre-fix: each ``_fetch_*_sources`` wrapped its own ``try/except`` and
returned ``([], category_value)`` on failure, swallowing the exception
before it could reach ``asyncio.gather``. The outer orchestrator only
recorded ``errors_by_category`` from the ``isinstance(result, Exception)``
branch — which never fired because the inner ``except`` had already
turned every failure into a benign empty result. The net effect:
``errors_by_category`` was always empty, ``discovery_service`` had
nothing to feed into ``run.errors``, and a category that *crashed*
looked indistinguishable from a category that *legitimately returned
zero rows*. Operators lost the failure reason at the storage tier.

Fix: ``FetchOutcome`` is now a 3-tuple ``(sources, category, error)``.
Per-fetcher ``except`` clauses set ``error`` to a short string instead
of dropping it. The orchestrator threads that string into
``errors_by_category[category]`` so the run summary surfaces *why* a
category came back empty. Truly-unhandled exceptions (the ones that
escape the inner ``try``) still flow through ``return_exceptions=True``
as defense in depth.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import Any
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_fetch  # noqa: E402
from app.discovery_config import (  # noqa: E402
    DiscoveryConfig,
    SourceCategory,
    SourceCategoryConfig,
)
from app.discovery_fetch import (  # noqa: E402
    _fetch_news_sources,
    _fetch_rss_sources,
    fetch_from_all_source_categories,
)


def _run(coro):
    return asyncio.run(coro)


def _all_categories_enabled_config(max_sources: int = 5) -> DiscoveryConfig:
    """Build a config where every category is enabled with a small budget.

    Smaller per-category budgets keep the fake fetchers' work bounded so
    the test doesn't accidentally exercise upstream rate limits if the
    real fetcher path is ever entered.
    """
    return DiscoveryConfig(
        search_topics=["municipal AI", "smart cities"],
        source_categories={
            SourceCategory.RSS.value: SourceCategoryConfig(
                enabled=True, max_sources=max_sources, rss_feeds=["https://x.test/f"]
            ),
            SourceCategory.NEWS.value: SourceCategoryConfig(
                enabled=True, max_sources=max_sources
            ),
            SourceCategory.ACADEMIC.value: SourceCategoryConfig(
                enabled=True, max_sources=max_sources
            ),
            SourceCategory.GOVERNMENT.value: SourceCategoryConfig(
                enabled=True, max_sources=max_sources
            ),
            SourceCategory.TECH_BLOG.value: SourceCategoryConfig(
                enabled=True, max_sources=max_sources
            ),
        },
    )


# ---------------------------------------------------------------------------
# Per-fetcher: error string is set on the new third tuple slot
# ---------------------------------------------------------------------------


def test_rss_fetcher_surfaces_error_reason_on_failure() -> None:
    """A failing RSS fetch must return ``error != None`` so the
    orchestrator can copy the reason into ``errors_by_category``.
    """

    async def boom(*, feed_urls, max_articles_per_feed):
        raise RuntimeError("simulated upstream 503")

    with patch.object(discovery_fetch, "fetch_rss_sources", new=boom):
        sources, category, error = _run(
            _fetch_rss_sources(["https://a.test/f"], max_sources=5)
        )

    assert sources == []
    assert category == SourceCategory.RSS.value
    assert error is not None
    assert "simulated upstream 503" in error
    assert "RSS" in error  # the category prefix gives operators a hint


def test_news_fetcher_surfaces_error_reason_on_failure() -> None:
    """A failing news fetch must surface the reason, not silently return []."""

    async def boom(*, topics, max_articles):
        raise ValueError("malformed search response")

    with patch.object(discovery_fetch, "fetch_news_articles", new=boom):
        sources, category, error = _run(
            _fetch_news_sources(["AI", "smart cities"], max_sources=5)
        )

    assert sources == []
    assert category == SourceCategory.NEWS.value
    assert error is not None
    assert "malformed search response" in error


# ---------------------------------------------------------------------------
# Orchestrator: errors_by_category is populated and run-level visible
# ---------------------------------------------------------------------------


class _StubArticle:
    """Minimal stand-in for source_fetchers.FetchedArticle.

    The fetcher path only reads url / title / content / source_name /
    relevance, so the surface stays small.
    """

    def __init__(self, idx: int, category: str) -> None:
        self.url = f"https://{category}.test/{idx}"
        self.title = f"{category} article {idx}"
        self.content = "body"
        self.source_name = category
        self.relevance = 0.5


def test_orchestrator_records_failed_category_into_errors_by_category() -> None:
    """When one category's fetcher fails, the failure reason must land
    in ``MultiSourceFetchResult.errors_by_category[<category>]``.

    Pre-fix: the dict was always empty regardless of failures.
    """

    async def working_rss(*, feed_urls, max_articles_per_feed):
        return [_StubArticle(0, "rss")]

    async def boom_news(*, topics, max_articles):
        raise RuntimeError("news upstream down")

    async def empty(*args: Any, **kwargs: Any):
        return []

    class _EmptyAcademicResult:
        papers: list = []

    async def empty_academic(*, query, max_results):
        return _EmptyAcademicResult()

    with patch.object(discovery_fetch, "fetch_rss_sources", new=working_rss), patch.object(
        discovery_fetch, "fetch_news_articles", new=boom_news
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=empty
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=empty
    ):
        result = _run(fetch_from_all_source_categories(_all_categories_enabled_config()))

    # The successful RSS fetch contributed one source.
    assert result.sources_by_category[SourceCategory.RSS.value] == 1
    # The news fetcher crashed → category count is zero AND the reason
    # is recorded against the news bucket.
    assert result.sources_by_category[SourceCategory.NEWS.value] == 0
    news_errors = result.errors_by_category[SourceCategory.NEWS.value]
    assert len(news_errors) == 1
    assert "news upstream down" in news_errors[0]
    # Healthy-but-empty categories must NOT be marked as errors — that's
    # the whole point of the fix. Empty results and crashes are now
    # distinguishable.
    assert result.errors_by_category[SourceCategory.RSS.value] == []
    assert result.errors_by_category[SourceCategory.ACADEMIC.value] == []
    assert result.errors_by_category[SourceCategory.GOVERNMENT.value] == []
    assert result.errors_by_category[SourceCategory.TECH_BLOG.value] == []


def test_orchestrator_catches_unhandled_exceptions_from_gather() -> None:
    """Defense in depth: if a fetcher ever raises *outside* its own
    try/except (e.g. an import or signature bug), the ``BaseException``
    branch in the orchestrator must still record the failure rather
    than letting one bad fetcher poison the gather.
    """

    async def working(*, feed_urls, max_articles_per_feed):
        return [_StubArticle(0, "rss")]

    async def empty(*args: Any, **kwargs: Any):
        return []

    class _EmptyResult:
        papers: list = []

    async def empty_academic(*, query, max_results):
        return _EmptyResult()

    # Replace the *inner wrapper* with a coroutine that raises before
    # any try/except. This simulates a fetcher whose try block never
    # got entered (signature bug, import-time failure on first call,
    # etc.) and verifies the orchestrator's outer safety net.
    async def raising_inner(topics, max_sources):
        raise RuntimeError("inner wrapper crashed before try block")

    with patch.object(discovery_fetch, "fetch_rss_sources", new=working), patch.object(
        discovery_fetch, "_fetch_news_sources", new=raising_inner
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=empty
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=empty
    ):
        result = _run(fetch_from_all_source_categories(_all_categories_enabled_config()))

    # The exception didn't kill the gather — other categories still ran.
    assert result.sources_by_category[SourceCategory.RSS.value] == 1
    # And the orchestrator recorded the raised exception against news.
    news_errors = result.errors_by_category[SourceCategory.NEWS.value]
    assert len(news_errors) == 1
    assert "raised" in news_errors[0]
    assert "inner wrapper crashed" in news_errors[0]


def test_orchestrator_empty_but_healthy_categories_have_no_errors() -> None:
    """A category that legitimately returned zero rows must not be
    flagged as errored. This pins the pre-fix observability gap that
    conflated "fetcher crashed" with "no matching content found".
    """

    async def empty(*args: Any, **kwargs: Any):
        return []

    class _EmptyAcademicResult:
        papers: list = []

    async def empty_academic(*, query, max_results):
        return _EmptyAcademicResult()

    with patch.object(discovery_fetch, "fetch_rss_sources", new=empty), patch.object(
        discovery_fetch, "fetch_news_articles", new=empty
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=empty
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=empty
    ):
        result = _run(fetch_from_all_source_categories(_all_categories_enabled_config()))

    assert result.total_sources == 0
    # No category should report an error string — they all just had
    # nothing to return.
    for category, errors in result.errors_by_category.items():
        assert errors == [], f"category {category} unexpectedly errored: {errors}"
