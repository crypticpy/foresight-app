"""Unit tests for ``apply_source_preferences`` (discovery_config).

Pins the behavior that distinguishes a *missing* ``enabled_categories`` key
("no preference; leave defaults alone") from an *explicit empty list* ("no
categories enabled"). The original guard used a truthy check (``if enabled
and isinstance(enabled, list)``) which silently treated an empty list as
"no preference" and left every category running with defaults — directly
contradicting the user's explicit choice to disable everything.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.discovery_config import (  # noqa: E402  (after sys.path tweak)
    DiscoveryConfig,
    SourceCategory,
    apply_source_preferences,
)


def _fresh_config() -> DiscoveryConfig:
    """Build a config with the default category map (all enabled) so each
    test starts from a known baseline. ``DiscoveryConfig()`` runs
    ``__post_init__`` which seeds the five-category map.
    """
    return DiscoveryConfig()


def test_missing_enabled_categories_leaves_defaults_alone():
    """A source_preferences blob with no ``enabled_categories`` key must
    not touch the existing category toggles — the user has expressed no
    preference."""
    cfg = _fresh_config()
    # Sanity: defaults are all enabled.
    assert all(c.enabled for c in cfg.source_categories.values())

    apply_source_preferences(cfg, {"keywords": ["smart cities"]})

    # Every category still enabled — the keywords-only blob touches nothing
    # category-related.
    assert all(c.enabled for c in cfg.source_categories.values())


def test_explicit_empty_enabled_categories_disables_all():
    """An *explicit* empty ``enabled_categories: []`` must disable every
    category. The old truthy check let the empty list fall through and
    silently kept every category enabled — opposite of the user's choice.
    """
    cfg = _fresh_config()
    apply_source_preferences(cfg, {"enabled_categories": []})

    # All categories must be off — the user explicitly turned them all off.
    assert all(not c.enabled for c in cfg.source_categories.values())


def test_partial_enabled_categories_disables_others():
    """An ``enabled_categories: ["news"]`` blob enables news and disables
    everything else."""
    cfg = _fresh_config()
    apply_source_preferences(cfg, {"enabled_categories": ["news"]})

    by_key = cfg.source_categories
    assert by_key[SourceCategory.NEWS.value].enabled is True
    assert by_key[SourceCategory.RSS.value].enabled is False
    assert by_key[SourceCategory.ACADEMIC.value].enabled is False
    assert by_key[SourceCategory.GOVERNMENT.value].enabled is False
    assert by_key[SourceCategory.TECH_BLOG.value].enabled is False


def test_unknown_category_in_enabled_list_is_dropped():
    """Unknown labels in ``enabled_categories`` are filtered out by the
    category map, so they can't sneak any category on. A blob containing
    only unknown labels behaves identically to an explicit empty list:
    every known category disabled."""
    cfg = _fresh_config()
    apply_source_preferences(
        cfg, {"enabled_categories": ["not_a_real_category", "bogus"]}
    )

    assert all(not c.enabled for c in cfg.source_categories.values())


def test_custom_rss_feeds_re_enable_rss_after_explicit_disable():
    """If the user explicitly disables every category via ``enabled_categories:
    []`` but *also* passes ``custom_rss_feeds``, the custom feeds branch
    re-enables RSS. This pins the existing precedence: ``custom_rss_feeds``
    wins over the explicit empty list for the RSS category specifically.
    """
    cfg = _fresh_config()
    apply_source_preferences(
        cfg,
        {
            "enabled_categories": [],
            "custom_rss_feeds": ["https://example.com/feed.xml"],
        },
    )
    rss_cat = cfg.source_categories[SourceCategory.RSS.value]
    assert rss_cat.enabled is True
    assert "https://example.com/feed.xml" in rss_cat.rss_feeds
    # Other categories stay off — only RSS was re-enabled by the custom feed branch.
    for key, cat in cfg.source_categories.items():
        if key != SourceCategory.RSS.value:
            assert cat.enabled is False
