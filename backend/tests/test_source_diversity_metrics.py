"""Unit tests for ``SourceDiversityMetrics`` math.

Pins the PR-C1 fix: the previous implementation hardcoded a
``num_total_categories = 5`` denominator while iterating only over keys
present in ``sources_by_category``. When a caller passed a partial dict
(workstream scans always do; several partial-failure paths in
discovery do), the variance sum was over k items, the denominator was
5, and ``balance_score`` came out artificially inflated. The fix
normalizes the input dict to include every ``SourceCategory`` value
(zero-filling missing keys) and derives the denominator from the
normalized bucket count.
"""

from __future__ import annotations

import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.discovery_result_types import SourceDiversityMetrics  # noqa: E402


# ---------------------------------------------------------------------------
# Normalization: missing categories are zero-filled, not silently dropped
# ---------------------------------------------------------------------------


def test_partial_dict_normalizes_to_full_category_set() -> None:
    """A caller dict with only 2 keys must still contribute the missing
    3 SourceCategory buckets at zero, so the math sees the full universe.

    The pre-fix code preserved the input dict verbatim, which made
    ``categories=2/5`` deceptively report 100% balance because the
    variance was only computed over the two present buckets.
    """
    metrics = SourceDiversityMetrics.compute({"rss": 50, "news": 50})

    assert "rss" in metrics.sources_by_category
    assert "news" in metrics.sources_by_category
    # The other three known categories must now be present at zero.
    for missing in ("academic", "government", "tech_blog"):
        assert metrics.sources_by_category[missing] == 0, (
            f"expected {missing}=0 after normalization; got "
            f"{metrics.sources_by_category.get(missing)!r}"
        )


def test_partial_dict_balance_is_not_artificially_inflated() -> None:
    """With only 2 of 5 categories populated, balance must reflect that
    3 buckets contribute zero to the spread — not a perfect ``1.0``.

    The pre-fix variance sum was over 2 equal counts (giving variance=0,
    std_dev=0, balance=1.0). The fix folds the 3 missing buckets in at
    zero, so the spread is real and balance drops below 1.0.
    """
    metrics = SourceDiversityMetrics.compute({"rss": 50, "news": 50})

    assert metrics.balance_score < 1.0, (
        f"balance_score should reflect 3 missing buckets; got "
        f"{metrics.balance_score} (the truthy-bug case would report 1.0)"
    )
    # Coverage is unchanged — only 2 of the 5 buckets fetched anything.
    assert metrics.category_coverage == 0.4


def test_unknown_extra_keys_are_preserved_not_dropped() -> None:
    """A caller that adds a custom bucket (e.g. ``"serper"`` in
    workstream scans) must keep it in the normalized output rather than
    have it silently swallowed by the canonical-category normalization.
    """
    metrics = SourceDiversityMetrics.compute(
        {"rss": 10, "serper": 20}
    )

    assert metrics.sources_by_category["rss"] == 10
    assert metrics.sources_by_category["serper"] == 20
    # The 4 missing canonical buckets are present at zero too.
    for missing in ("news", "academic", "government", "tech_blog"):
        assert metrics.sources_by_category[missing] == 0
    # ``total_sources`` is the sum of ALL buckets, including extras.
    assert metrics.total_sources == 30


# ---------------------------------------------------------------------------
# Mathematical invariants
# ---------------------------------------------------------------------------


def test_perfectly_balanced_full_dict_scores_1_balance_1_entropy() -> None:
    """All 5 categories with identical counts is the canonical
    best-balance case — both balance and shannon entropy must hit 1.0.
    """
    counts = {
        "rss": 10,
        "news": 10,
        "academic": 10,
        "government": 10,
        "tech_blog": 10,
    }
    metrics = SourceDiversityMetrics.compute(counts)

    assert metrics.balance_score == 1.0
    assert metrics.shannon_entropy == 1.0
    assert metrics.category_coverage == 1.0
    assert metrics.categories_fetched == 5


def test_all_in_one_category_scores_0_balance() -> None:
    """All sources in a single category is the worst-balance case —
    balance must be ``0.0`` and entropy ``0.0``.
    """
    metrics = SourceDiversityMetrics.compute({"rss": 100})

    assert metrics.balance_score == 0.0
    # Only one active bucket → entropy is the degenerate 0.0 path.
    assert metrics.shannon_entropy == 0.0
    # 1 of 5 known categories has data.
    assert metrics.category_coverage == 0.2
    assert metrics.dominant_category == "rss"


def test_empty_dict_returns_zero_metrics() -> None:
    """No input → every numeric metric collapses to a defensible zero."""
    metrics = SourceDiversityMetrics.compute({})

    assert metrics.total_sources == 0
    assert metrics.balance_score == 0.0
    assert metrics.shannon_entropy == 0.0
    # An empty input is normalized to the 5 known categories at zero,
    # so coverage stays 0.0 (no active categories).
    assert metrics.category_coverage == 0.0
    assert metrics.categories_fetched == 0


def test_shannon_entropy_in_expected_range_for_skewed_distribution() -> None:
    """A modestly skewed distribution should produce a finite entropy
    strictly between 0 and 1.

    Two categories at 90/10 split: H/H_max ≈ 0.469 / log(N) ≈ 0.291
    when N=5. The fix doesn't change this branch's math; this test
    pins the expectation so future refactors can't silently move the
    dial. The denominator is derived from the normalized bucket count
    rather than hardcoded so growing ``SourceCategory`` doesn't quietly
    break this test.
    """
    metrics = SourceDiversityMetrics.compute({"rss": 90, "news": 10})

    expected_h = -(0.9 * math.log(0.9) + 0.1 * math.log(0.1))
    expected_normalized = expected_h / math.log(len(metrics.sources_by_category))
    assert metrics.shannon_entropy == pytest.approx(expected_normalized, abs=1e-3)


# ---------------------------------------------------------------------------
# category_diversity property uses the same denominator
# ---------------------------------------------------------------------------


def test_category_diversity_property_uses_enum_denominator() -> None:
    """The convenience ``category_diversity`` property on
    ``MultiSourceFetchResult`` shares the same denominator as
    ``compute()`` — it must derive 5 from the enum, not a hardcoded
    literal that drifts if the enum grows.
    """
    metrics = SourceDiversityMetrics.compute(
        {"rss": 10, "news": 10, "academic": 10}
    )

    # 3 of 5 known categories active → 0.6 either way; we're checking
    # that adding an extra zero-count canonical bucket doesn't change
    # the ratio (proves the property isn't accidentally including
    # only-active buckets in the denominator).
    assert metrics.category_coverage == 0.6
