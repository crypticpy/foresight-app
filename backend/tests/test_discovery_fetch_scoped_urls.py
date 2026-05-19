"""Regression tests for the non-RSS ``source_ids`` scoping plumbing.

``_apply_schedule_scope`` writes per-schedule URL lists into the
``SourceCategoryConfig.rss_feeds`` field for *every* category (the field
is reused as a generic URL slot — see the docstring on
``_apply_schedule_scope``). Before this patch the discovery_fetch
helpers ignored those lists for non-RSS categories: a schedule that
selected three specific .gov URLs ended up running a broadcast topic
search across the whole government catalog instead. These tests pin the
plumbing so a schedule's ``source_ids`` actually constrain the fetch.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import List, Optional
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_fetch  # noqa: E402
from app.discovery_config import SourceCategory  # noqa: E402
from app.discovery_fetch import (  # noqa: E402
    _fetch_government_sources,
    _fetch_news_sources,
    _fetch_tech_blog_sources,
)


def _run(coro):
    return asyncio.run(coro)


class _StubArticle:
    """Minimal stand-in for a fetcher result.

    News / tech-blog / gov-doc all share the same ``url/title/content/
    source_name/relevance`` shape on the conversion path we test against.
    """

    def __init__(self, idx: int) -> None:
        self.url = f"https://example.test/article/{idx}"
        self.title = f"Article {idx}"
        self.content = f"body {idx}"
        self.source_name = f"src-{idx}"
        self.relevance = 0.5


# ---------------------------------------------------------------------------
# News
# ---------------------------------------------------------------------------


def test_news_scoped_urls_skip_topic_search() -> None:
    """Scoped URLs ⇒ ``urls`` kwarg gets the list, ``topics`` is None."""
    captured: dict = {}

    async def fake_fetch_news_articles(
        *,
        topics: Optional[List[str]] = None,
        urls: Optional[List[str]] = None,
        max_articles: int = 20,
    ):
        captured["topics"] = topics
        captured["urls"] = urls
        captured["max_articles"] = max_articles
        return [_StubArticle(i) for i in range(len(urls or []))]

    scoped = ["https://gov.example/a", "https://gov.example/b"]
    with patch.object(discovery_fetch, "fetch_news_articles", new=fake_fetch_news_articles):
        sources, category = _run(
            _fetch_news_sources(
                topics=["smart cities", "civic tech"],
                max_sources=5,
                scoped_urls=scoped,
            )
        )

    assert captured["topics"] is None  # explicitly suppressed
    assert captured["urls"] == scoped
    assert captured["max_articles"] == 5
    assert category == SourceCategory.NEWS.value
    assert len(sources) == 2


def test_news_no_scoped_urls_falls_back_to_topics() -> None:
    """No scoped URLs ⇒ topics drive the search (back-compat path)."""
    captured: dict = {}

    async def fake_fetch_news_articles(
        *,
        topics: Optional[List[str]] = None,
        urls: Optional[List[str]] = None,
        max_articles: int = 20,
    ):
        captured["topics"] = topics
        captured["urls"] = urls
        return [_StubArticle(0)]

    with patch.object(discovery_fetch, "fetch_news_articles", new=fake_fetch_news_articles):
        _run(
            _fetch_news_sources(
                topics=["a", "b", "c", "d"],
                max_sources=10,
                scoped_urls=None,
            )
        )

    assert captured["urls"] is None
    # Original limiter (first 3 topics) preserved.
    assert captured["topics"] == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# Government
# ---------------------------------------------------------------------------


def test_government_scoped_urls_skip_topic_search() -> None:
    captured: dict = {}

    async def fake_fetch_government_sources(
        *,
        topics: Optional[List[str]] = None,
        urls: Optional[List[str]] = None,
        max_results: int = 30,
    ):
        captured["topics"] = topics
        captured["urls"] = urls
        # Return objects that convert_government_to_raw_source can handle —
        # use stubs because we also patch the converter.
        return [_StubArticle(i) for i in range(len(urls or []))]

    def fake_convert(doc):
        return {
            "url": doc.url,
            "title": doc.title,
            "content": doc.content,
            "source_name": doc.source_name,
            "relevance": doc.relevance,
        }

    scoped = ["https://austintexas.gov/policy/a", "https://austintexas.gov/policy/b"]
    with patch.object(
        discovery_fetch, "fetch_government_sources", new=fake_fetch_government_sources
    ), patch.object(
        discovery_fetch, "convert_government_to_raw_source", new=fake_convert
    ):
        sources, category = _run(
            _fetch_government_sources(
                topics=["budget"], max_sources=5, scoped_urls=scoped
            )
        )

    assert captured["topics"] is None
    assert captured["urls"] == scoped
    assert category == SourceCategory.GOVERNMENT.value
    assert len(sources) == 2


# ---------------------------------------------------------------------------
# Tech blog
# ---------------------------------------------------------------------------


def test_tech_blog_scoped_urls_skip_topic_search() -> None:
    captured: dict = {}

    async def fake_fetch_tech_blog_articles(
        *,
        topics: Optional[List[str]] = None,
        urls: Optional[List[str]] = None,
        max_articles: int = 20,
    ):
        captured["topics"] = topics
        captured["urls"] = urls
        return [_StubArticle(i) for i in range(len(urls or []))]

    scoped = ["https://arstechnica.test/a", "https://techcrunch.test/b"]
    with patch.object(
        discovery_fetch, "fetch_tech_blog_articles", new=fake_fetch_tech_blog_articles
    ):
        sources, category = _run(
            _fetch_tech_blog_sources(
                topics=["smart cities"], max_sources=5, scoped_urls=scoped
            )
        )

    assert captured["topics"] is None
    assert captured["urls"] == scoped
    assert category == SourceCategory.TECH_BLOG.value
    assert len(sources) == 2
