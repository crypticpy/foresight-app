"""Regression tests for the analytics_processing zero-value rendering bug.

The monitoring dashboard had three sites that used
``round(x, 2) if x else None`` to populate response fields. The truthy
guard silently converted 0.0 to None, so:

* 0% classification accuracy (every recent validation wrong) rendered
  as "no data" instead of "0%" — the worst case, because it hid an
  actively-broken classifier.
* 0% error rate (a perfectly clean period) also rendered as "no data".
* An average processing time of exactly 0.0s did the same.

The fix routes all three through ``_round_or_none``, which keeps None
as None but lets every numeric (including 0.0 and negative values)
pass through.

This file pins ``_round_or_none``'s behavior so a future
``if value:`` regression in the helper would be caught.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.analytics_processing import _round_or_none  # noqa: E402


def test_zero_round_trips_as_zero_not_none() -> None:
    """The whole point of the fix: 0.0 must NOT become None."""
    assert _round_or_none(0.0) == 0.0


def test_none_input_returns_none() -> None:
    assert _round_or_none(None) is None


def test_positive_value_is_rounded() -> None:
    assert _round_or_none(85.5678) == 85.57
    assert _round_or_none(85.5678, digits=1) == 85.6


def test_negative_value_is_preserved() -> None:
    """Defensive: negative percentages should still round-trip
    (shouldn't happen for these metrics, but the helper is generic
    and must not turn a real negative into None)."""
    assert _round_or_none(-1.234) == -1.23


def test_meets_target_logic_with_zero_accuracy() -> None:
    """Mirrors the router's ``meets_target=`` expression directly.

    Pre-fix this was ``accuracy >= 85.0 if accuracy else False`` which
    returned False for accuracy=0.0 (correct outcome, wrong reason).
    Post-fix it's ``accuracy is not None and accuracy >= 85.0``, which
    is the same outcome via a path that doesn't conflate 0.0 with None.
    """
    for accuracy, expected in [
        (None, False),
        (0.0, False),
        (84.99, False),
        (85.0, True),
        (100.0, True),
    ]:
        assert (accuracy is not None and accuracy >= 85.0) is expected, accuracy
