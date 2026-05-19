"""Unit tests for ``APITokenUsage`` and the triage-stage breakdown contract.

Pins the PR-C2 fixes:

1. ``APITokenUsage.add_tokens`` raises ``ValueError`` on an unknown
   operation rather than silently incrementing ``total_tokens`` while
   skipping the per-bucket counter. The old behaviour let a typo (e.g.
   ``"dedup"`` instead of ``"card_match"``) leave the per-bucket
   numbers under the total without any error, breaking every downstream
   cost waterfall.
2. ``triage_sources_with_metrics`` returns a per-operation breakdown
   (``triage`` / ``analysis`` / ``embedding``) rather than a single int.
   The caller in ``discovery_service`` previously dumped that single
   int into ``add_tokens("triage", total)``, so analysis and embedding
   token buckets were permanently zero in every recorded run.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.discovery_result_types import APITokenUsage  # noqa: E402


# ---------------------------------------------------------------------------
# APITokenUsage.add_tokens contract
# ---------------------------------------------------------------------------


def test_add_tokens_increments_each_known_bucket() -> None:
    """Each valid operation bumps its own bucket and ``total_tokens``."""
    usage = APITokenUsage()

    usage.add_tokens("triage", 100)
    usage.add_tokens("analysis", 200)
    usage.add_tokens("embedding", 50)
    usage.add_tokens("card_match", 25)

    assert usage.triage_tokens == 100
    assert usage.analysis_tokens == 200
    assert usage.embedding_tokens == 50
    assert usage.card_match_tokens == 25
    # Total must equal the sum of buckets — no silent drift.
    assert usage.total_tokens == 375
    assert (
        usage.triage_tokens
        + usage.analysis_tokens
        + usage.embedding_tokens
        + usage.card_match_tokens
        == usage.total_tokens
    )


def test_add_tokens_raises_on_unknown_operation() -> None:
    """Typos and renames must crash rather than silently rot the metrics.

    Before the C2 fix, ``add_tokens("dedup", 100)`` would leave every
    bucket at zero but still bump ``total_tokens`` by 100 — the cost
    waterfall would then show a $0 attribution to each operation that
    nonetheless sums to a non-zero total.
    """
    usage = APITokenUsage()

    with pytest.raises(ValueError, match="unknown operation"):
        usage.add_tokens("dedup", 100)

    # State must be untouched on a rejected call so we can recover.
    assert usage.total_tokens == 0
    assert usage.estimated_cost_usd == 0.0


def test_add_tokens_cost_is_proportional_to_total() -> None:
    """The cost estimate is a flat $0.03/1K-tokens rate against the running total."""
    usage = APITokenUsage()
    usage.add_tokens("triage", 1000)
    # 1000 tokens * 0.00003 = 0.03
    assert usage.estimated_cost_usd == pytest.approx(0.03, rel=1e-6)


# ---------------------------------------------------------------------------
# triage_sources_with_metrics returns a per-operation breakdown
# ---------------------------------------------------------------------------


def _run(coro):
    return asyncio.run(coro)


def _make_raw_source(
    *, title: str = "T", content: Optional[str] = "Body", url: str = "https://x/y"
):
    """Build a ``RawSource`` light enough not to need a real AIService.

    ``discovery_triage`` calls ``ai_service.triage_source`` and
    ``ai_service.analyze_source``; we stub those on a ``MagicMock`` and
    let ``ai_service.generate_embedding`` return a fixed vector. The
    domain_reputation lookup is the only sync Supabase touch and is
    short-circuited by passing a supabase mock that returns no rows.
    """
    from app.research_service import RawSource

    return RawSource(
        url=url,
        title=title,
        content=content,
        source_name="test",
        relevance=0.9,
    )


def _stub_ai_service():
    """Return an ``AIService`` mock with the three methods triage calls."""
    from app.ai_service import TriageResult

    ai = MagicMock()
    ai.triage_source = AsyncMock(
        return_value=TriageResult(
            is_relevant=True,
            confidence=0.9,
            primary_pillar=None,
            reason="ok",
        )
    )

    analysis_mock = MagicMock()
    analysis_mock.summary = "a short summary that the embed call will hash"
    analysis_mock.suggested_card_name = "Card Name"
    ai.analyze_source = AsyncMock(return_value=analysis_mock)
    ai.generate_embedding = AsyncMock(return_value=[0.0] * 1536)
    return ai


def _stub_supabase():
    """Return a supabase mock whose every read returns empty data.

    ``discovery_triage`` only touches Supabase for the optional domain
    reputation lookup and the (best-effort) ``quality_stats`` persist;
    both tolerate empty / no current_run_id.
    """
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=None
    )
    return sb


def test_triage_returns_per_operation_breakdown_when_a_source_passes(monkeypatch):
    """A source that passes triage routes through analysis + embedding;
    each operation must produce a non-zero entry in its own bucket of the
    returned breakdown.
    """
    from app import discovery_triage
    from app.discovery_triage import triage_sources_with_metrics

    # Domain reputation service is best-effort and tries Supabase rows —
    # stub it so the loop's hot path doesn't depend on registry data.
    monkeypatch.setattr(
        discovery_triage.domain_reputation_service,
        "get_reputation",
        lambda *_a, **_kw: None,
    )
    monkeypatch.setattr(
        discovery_triage.domain_reputation_service,
        "get_confidence_adjustment",
        lambda *_a, **_kw: 0.0,
    )
    monkeypatch.setattr(
        discovery_triage.domain_reputation_service,
        "record_triage_result",
        lambda *_a, **_kw: None,
    )

    sources: List = [
        _make_raw_source(
            title="A real headline about municipal innovation",
            content="A reasonably sized body so triage tokens are non-zero. " * 5,
        )
    ]

    processed, breakdown = _run(
        triage_sources_with_metrics(
            _stub_supabase(),
            _stub_ai_service(),
            sources,
            current_run_id=None,
        )
    )

    assert len(processed) == 1
    # Contract: the breakdown is a dict keyed exactly by the
    # APITokenUsage operation names — no other keys.
    assert set(breakdown.keys()) == {"triage", "analysis", "embedding"}
    # Each operation actually ran, so each bucket is positive. The
    # pre-fix code returned a single int summing all three; this assert
    # would have caught it (the sum would have been in ``triage`` only).
    assert breakdown["triage"] > 0
    assert breakdown["analysis"] > 0
    assert breakdown["embedding"] > 0


def test_triage_breakdown_keys_match_apitokenusage_operations(monkeypatch):
    """The returned breakdown's keys must each be valid ``add_tokens``
    operations so the caller can iterate without an explicit allowlist.

    This is the contract that ties the producer to the consumer — if
    triage starts returning a ``"dedup"`` bucket the caller will crash
    on ``add_tokens`` (per the C2 raise above), surfacing the drift.
    """
    from app import discovery_triage
    from app.discovery_triage import triage_sources_with_metrics

    monkeypatch.setattr(
        discovery_triage.domain_reputation_service,
        "get_reputation",
        lambda *_a, **_kw: None,
    )
    monkeypatch.setattr(
        discovery_triage.domain_reputation_service,
        "get_confidence_adjustment",
        lambda *_a, **_kw: 0.0,
    )
    monkeypatch.setattr(
        discovery_triage.domain_reputation_service,
        "record_triage_result",
        lambda *_a, **_kw: None,
    )

    _, breakdown = _run(
        triage_sources_with_metrics(
            _stub_supabase(),
            _stub_ai_service(),
            [_make_raw_source()],
            current_run_id=None,
        )
    )

    # Every returned key must be a valid APITokenUsage operation.
    usage = APITokenUsage()
    for op in breakdown:
        # This would raise ValueError if any key drifted from the
        # APITokenUsage contract.
        usage.add_tokens(op, 1)
