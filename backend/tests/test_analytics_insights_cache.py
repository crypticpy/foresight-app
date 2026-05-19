"""Regression tests for the analytics_insights 24-hour cache key.

The endpoint computes a ``combined_score`` from four card score fields
(velocity, impact, relevance, novelty) and ranks the top-N cards by
that score. The cache invalidator ``_compute_card_data_hash`` is
supposed to detect changes to that scoring input — but it only hashed
``velocity_score`` and ``impact_score``, so re-scoring a card on
relevance or novelty alone left the cache stale and served the same
yesterday-insights for 24h.

This file pins that the hash is sensitive to all four score fields.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.analytics_insights import (  # noqa: E402
    ALL_PILLARS_SENTINEL,
    _compute_card_data_hash,
    _pillar_cache_key,
)


def _card(card_id: str, *, velocity=10, impact=20, relevance=30, novelty=40) -> dict:
    return {
        "id": card_id,
        "velocity_score": velocity,
        "impact_score": impact,
        "relevance_score": relevance,
        "novelty_score": novelty,
    }


def test_hash_changes_when_velocity_score_changes() -> None:
    base = [_card("a"), _card("b")]
    bumped = [_card("a", velocity=99), _card("b")]
    assert _compute_card_data_hash(base) != _compute_card_data_hash(bumped)


def test_hash_changes_when_impact_score_changes() -> None:
    base = [_card("a"), _card("b")]
    bumped = [_card("a", impact=99), _card("b")]
    assert _compute_card_data_hash(base) != _compute_card_data_hash(bumped)


def test_hash_changes_when_relevance_score_changes() -> None:
    """Pre-fix: relevance was excluded from the hash → stale cache hit."""
    base = [_card("a"), _card("b")]
    bumped = [_card("a", relevance=99), _card("b")]
    assert _compute_card_data_hash(base) != _compute_card_data_hash(bumped)


def test_hash_changes_when_novelty_score_changes() -> None:
    """Pre-fix: novelty was excluded from the hash → stale cache hit."""
    base = [_card("a"), _card("b")]
    bumped = [_card("a", novelty=99), _card("b")]
    assert _compute_card_data_hash(base) != _compute_card_data_hash(bumped)


def test_hash_stable_when_order_changes() -> None:
    """Cards are sorted by id before hashing — order independent."""
    same_data_diff_order_1 = [_card("a"), _card("b"), _card("c")]
    same_data_diff_order_2 = [_card("c"), _card("a"), _card("b")]
    assert _compute_card_data_hash(same_data_diff_order_1) == _compute_card_data_hash(
        same_data_diff_order_2
    )


# --------------------------------------------------------------------------- #
# Sentinel for the "all pillars" view.                                          #
#                                                                              #
# Migration 20260519000002_cached_insights_all_sentinel.sql replaces NULL      #
# ``pillar_filter`` rows with ``__all__`` so ON CONFLICT actually fires for    #
# the cross-pillar regeneration (PostgreSQL NULL ≠ NULL under uniqueness).     #
# These tests pin the sentinel value and the translation helper so a future   #
# rename surfaces here instead of silently re-introducing NULL writes.        #
# --------------------------------------------------------------------------- #


def test_all_pillars_sentinel_value() -> None:
    """Sentinel must match what the migration wrote into existing rows.

    A rename without a follow-up data migration would split the cache: old
    rows under one literal, new writes under another — back to duplicates.
    Pin the exact string so the schema and code can't drift.
    """
    assert ALL_PILLARS_SENTINEL == "__all__"


def test_pillar_cache_key_translates_none_to_sentinel() -> None:
    assert _pillar_cache_key(None) == ALL_PILLARS_SENTINEL


def test_pillar_cache_key_translates_empty_string_to_sentinel() -> None:
    """Defensive: empty string should never hit the table.

    FastAPI's regex Query validator rejects empty strings, but the helper
    is also called from cache code paths that could theoretically be
    reached from callers without that validation. Treat empty as None.
    """
    assert _pillar_cache_key("") == ALL_PILLARS_SENTINEL


def test_pillar_cache_key_passes_real_pillar_codes_through() -> None:
    for code in ("CH", "EW", "HG", "HH", "MC", "PS"):
        assert _pillar_cache_key(code) == code
