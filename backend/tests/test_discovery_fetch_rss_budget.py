"""Regression test for the RSS per-feed budget bug.

``_fetch_rss_sources`` used to compute ``max_articles_per_feed`` with
floor division: ``max_sources // len(feed_urls)``. Whenever the per-
category budget was smaller than the number of seeded feeds (10–20
items in ``DEFAULT_RSS_FEEDS``), the per-feed cap became 0 and the
fetcher returned an empty list — silently.

The fix uses ceiling division and clamps the per-feed cap to ``>= 1``,
trusting the caller's ``articles[:max_sources]`` slice to enforce the
total budget. This file pins that behavior.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import List
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import discovery_fetch  # noqa: E402
from app.discovery_config import SourceCategory  # noqa: E402
from app.discovery_fetch import _fetch_rss_sources  # noqa: E402


class _StubArticle:
    """Minimal stand-in for source_fetchers.FetchedArticle.

    ``_fetch_rss_sources`` only reads url / title / content / source_name /
    relevance, so we keep the surface tiny.
    """

    def __init__(self, idx: int) -> None:
        self.url = f"https://example.test/feed/{idx}"
        self.title = f"Article {idx}"
        self.content = f"body {idx}"
        self.source_name = f"feed-{idx % 3}"
        self.relevance = 0.5


def _run(coro):
    return asyncio.run(coro)


def test_rss_per_feed_cap_clamped_to_one_when_budget_smaller_than_feeds() -> None:
    """``max_sources=3`` with 10 feeds must still request 1 article per feed.

    Pre-fix: ``3 // 10 == 0`` → ``fetch_rss_sources`` was asked for 0
    articles per feed and returned []. Post-fix: ceiling division
    yields 1, the caller slices to ``max_sources``.
    """
    feed_urls: List[str] = [f"https://example.test/feed-{i}.xml" for i in range(10)]

    captured: dict = {}

    async def fake_fetch_rss_sources(*, feed_urls, max_articles_per_feed):
        captured["feed_urls"] = list(feed_urls)
        captured["max_articles_per_feed"] = max_articles_per_feed
        # Return one article per feed so we can verify the caller-side cap.
        return [_StubArticle(i) for i in range(len(feed_urls))]

    with patch.object(discovery_fetch, "fetch_rss_sources", new=fake_fetch_rss_sources):
        sources, category, error = _run(_fetch_rss_sources(feed_urls, max_sources=3))

    assert captured["max_articles_per_feed"] == 1
    assert category == SourceCategory.RSS.value
    # Caller slice still honors the total budget.
    assert len(sources) == 3
    # Successful fetch surfaces no error reason.
    assert error is None


def test_rss_per_feed_cap_uses_ceiling_division() -> None:
    """Non-even split: 7 budget / 3 feeds → 3 per feed (ceil), not 2 (floor)."""
    feed_urls = ["https://a.test/f.xml", "https://b.test/f.xml", "https://c.test/f.xml"]

    captured: dict = {}

    async def fake_fetch_rss_sources(*, feed_urls, max_articles_per_feed):
        captured["max_articles_per_feed"] = max_articles_per_feed
        return [_StubArticle(i) for i in range(max_articles_per_feed * len(feed_urls))]

    with patch.object(discovery_fetch, "fetch_rss_sources", new=fake_fetch_rss_sources):
        sources, _, _ = _run(_fetch_rss_sources(feed_urls, max_sources=7))

    assert captured["max_articles_per_feed"] == 3  # ceil(7/3) == 3, not floor=2
    assert len(sources) == 7  # caller slices to budget


def test_rss_zero_budget_short_circuits_without_fetching() -> None:
    """``max_sources=0`` must not invoke the underlying RSS fetcher at all."""
    feed_urls = ["https://a.test/f.xml"]

    called = {"count": 0}

    async def fake_fetch_rss_sources(*, feed_urls, max_articles_per_feed):
        called["count"] += 1
        return []

    with patch.object(discovery_fetch, "fetch_rss_sources", new=fake_fetch_rss_sources):
        sources, category, error = _run(_fetch_rss_sources(feed_urls, max_sources=0))

    assert called["count"] == 0
    assert sources == []
    assert category == SourceCategory.RSS.value
    # Short-circuit on zero budget is not a fetch error.
    assert error is None


def test_rss_empty_feed_list_short_circuits() -> None:
    """Empty ``feed_urls`` must not invoke the underlying fetcher."""
    called = {"count": 0}

    async def fake_fetch_rss_sources(*, feed_urls, max_articles_per_feed):
        called["count"] += 1
        return []

    with patch.object(discovery_fetch, "fetch_rss_sources", new=fake_fetch_rss_sources):
        sources, category, error = _run(_fetch_rss_sources([], max_sources=10))

    assert called["count"] == 0
    assert sources == []
    assert category == SourceCategory.RSS.value
    # Empty-feed short-circuit is not a fetch error.
    assert error is None
