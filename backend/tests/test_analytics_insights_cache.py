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

from app.routers.analytics_insights import _compute_card_data_hash  # noqa: E402


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
