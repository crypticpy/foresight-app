"""Regression tests for the non-RSS ``source_ids`` scoping behavior.

``_apply_schedule_scope`` writes per-schedule URL lists into the
``SourceCategoryConfig.rss_feeds`` field for *every* category (the field
is reused as a generic URL slot — see the docstring on
``_apply_schedule_scope``). For non-RSS categories the registry rows are
*source-level* URLs (homepages, feed roots, search endpoints) rather
than article URLs, so the downstream news/gov/tech_blog fetchers can't
fetch them directly without retrieving useless homepage HTML.

Until the fetchers grow a "scope topic search to these source URLs"
path, the dispatcher logs a warning and falls back to broad topic
search. These tests pin that observable behavior so a future scoping
implementation doesn't accidentally regress to silent no-op fetches.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_fetch  # noqa: E402
from app.discovery_config import (  # noqa: E402
    DiscoveryConfig,
    SourceCategory,
    SourceCategoryConfig,
)


def _run(coro):
    return asyncio.run(coro)


async def _empty_fetcher(*args, **kwargs):
    return []


class _StubAcademicResult:
    papers: list = []


async def _empty_academic(*args, **kwargs):
    return _StubAcademicResult()


def _config_with_scoped_urls(category: SourceCategory, urls: list[str]) -> DiscoveryConfig:
    """Build a DiscoveryConfig where only ``category`` is enabled and has
    a non-empty ``rss_feeds`` slot — mimicking what
    ``_apply_schedule_scope`` produces for a non-RSS scoped schedule.
    """
    cfg = DiscoveryConfig()
    cfg.source_categories = {
        cat.value: SourceCategoryConfig(enabled=False) for cat in SourceCategory
    }
    cfg.source_categories[category.value] = SourceCategoryConfig(
        enabled=True, rss_feeds=urls, max_sources=5
    )
    return cfg


def _warning_messages(caplog_records, needle: str) -> list[str]:
    return [
        r.getMessage()
        for r in caplog_records
        if r.levelno == logging.WARNING and needle in r.getMessage()
    ]


def test_news_scoped_source_ids_logs_warning_and_falls_back(caplog) -> None:
    """News with scoped URLs warns + still runs broad topic search."""
    cfg = _config_with_scoped_urls(
        SourceCategory.NEWS, ["https://reuters.example/", "https://ap.example/"]
    )

    with caplog.at_level(logging.WARNING), patch.object(
        discovery_fetch, "fetch_news_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=_empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_rss_sources", new=_empty_fetcher
    ):
        result = _run(discovery_fetch.fetch_from_all_source_categories(cfg))

    warnings = _warning_messages(caplog.records, "News category got 2 scoped URLs")
    assert warnings, f"expected news scope warning, got records: {caplog.records}"
    # Topic-search fallback still ran (no crash, returns a result).
    assert result.total_sources == 0  # stubbed fetcher returns []


def test_government_scoped_source_ids_logs_warning_and_falls_back(caplog) -> None:
    cfg = _config_with_scoped_urls(
        SourceCategory.GOVERNMENT, ["https://austintexas.gov/policy/a"]
    )

    with caplog.at_level(logging.WARNING), patch.object(
        discovery_fetch, "fetch_news_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=_empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_rss_sources", new=_empty_fetcher
    ):
        _run(discovery_fetch.fetch_from_all_source_categories(cfg))

    warnings = _warning_messages(
        caplog.records, "Government category got 1 scoped URLs"
    )
    assert warnings, f"expected gov scope warning, got records: {caplog.records}"


def test_tech_blog_scoped_source_ids_logs_warning_and_falls_back(caplog) -> None:
    cfg = _config_with_scoped_urls(
        SourceCategory.TECH_BLOG,
        ["https://arstechnica.test/", "https://techcrunch.test/"],
    )

    with caplog.at_level(logging.WARNING), patch.object(
        discovery_fetch, "fetch_news_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=_empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_rss_sources", new=_empty_fetcher
    ):
        _run(discovery_fetch.fetch_from_all_source_categories(cfg))

    warnings = _warning_messages(
        caplog.records, "Tech blog category got 2 scoped URLs"
    )
    assert warnings, f"expected tech_blog scope warning, got records: {caplog.records}"


def test_no_warning_when_no_scoped_urls(caplog) -> None:
    """Default config (no source_ids) ⇒ no scope warnings."""
    cfg = DiscoveryConfig()
    cfg.source_categories = {
        cat.value: SourceCategoryConfig(enabled=True, max_sources=5)
        for cat in SourceCategory
    }
    # Leave rss_feeds empty on every category to simulate no schedule scope.

    with caplog.at_level(logging.WARNING), patch.object(
        discovery_fetch, "fetch_news_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_academic_papers", new=_empty_academic
    ), patch.object(
        discovery_fetch, "fetch_government_sources", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=_empty_fetcher
    ), patch.object(
        discovery_fetch, "fetch_rss_sources", new=_empty_fetcher
    ):
        _run(discovery_fetch.fetch_from_all_source_categories(cfg))

    for needle in (
        "News category got",
        "Government category got",
        "Tech blog category got",
        "Academic category got",
    ):
        assert not _warning_messages(caplog.records, needle), (
            f"unexpected warning for '{needle}'"
        )
