"""Tests for the signal-agent pillar prior (PR 2 of the coverage stack).

Two behaviours are pinned here:

1. ``_phase1_batch_by_pillar`` honors the seeding-pillar hint
   (``source.pillar_code``) set by the discovery pipeline. Before this
   change the batcher used ``analysis.pillars[0]`` first, which let a
   classifier mislabel slip past the operator's intent — e.g. an
   HH-seeded balance scan ended up with 0 HH cards because the LLM
   relabelled the sources as MC.
2. ``_render_pillar_prior`` produces a soft prior block that:
   - names the batch pillar by code + full name when known,
   - tells the agent to default ``pillar_id`` to that batch pillar,
   - falls back to a neutral "no seeding pillar" block for ``UNKNOWN``.

The system prompt is also asserted to format cleanly with the new
``{batch_pillar_hint}`` placeholder so a missing argument can't slip
into production as a ``KeyError`` at request time.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import List, Optional
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import signal_agent_service as svc  # noqa: E402


# ---------------------------------------------------------------------------
# Stub ProcessedSource — the real dataclass requires triage/analysis/embedding
# but _phase1_batch_by_pillar only reads .analysis, .triage, and the dynamic
# .pillar_code attribute, so a minimal stub is more readable than a fixture.
# ---------------------------------------------------------------------------


@dataclass
class _StubAnalysis:
    pillars: List[str] = field(default_factory=list)


@dataclass
class _StubTriage:
    primary_pillar: Optional[str] = None


class _StubSource:
    """Stand-in for ProcessedSource matching the attributes the batcher reads."""

    def __init__(
        self,
        *,
        pillar_code: Optional[str] = None,
        analysis_pillars: Optional[List[str]] = None,
        triage_primary: Optional[str] = None,
    ):
        # Mirror discovery_service's dynamic assignment: only set the
        # attribute when the discovery pipeline actually had a hint.
        if pillar_code is not None:
            self.pillar_code = pillar_code
        self.analysis = (
            _StubAnalysis(pillars=analysis_pillars)
            if analysis_pillars is not None
            else None
        )
        self.triage = (
            _StubTriage(primary_pillar=triage_primary)
            if triage_primary is not None
            else None
        )


def _make_service() -> svc.SignalAgentService:
    """Instantiate SignalAgentService with cheap mocks.

    ``_phase1_batch_by_pillar`` only uses ``self.supabase`` for logging
    indirectly; we never call it on the supabase client, so a MagicMock
    suffices.
    """
    return svc.SignalAgentService(
        supabase=MagicMock(),
        run_id="00000000-0000-0000-0000-000000000000",
    )


# ---------------------------------------------------------------------------
# _phase1_batch_by_pillar — seeding-pillar hint takes precedence
# ---------------------------------------------------------------------------


def test_phase1_seeding_hint_wins_over_analysis_pillars():
    """Source seeded from HH with analysis-derived MC must batch as HH.

    This is the exact leak that drove HH/EW to 0 in the last balance run:
    classifier returned MC for the lead source, so the whole batch went
    to MC. The seeding hint now wins.
    """
    sources = [
        _StubSource(pillar_code="HH", analysis_pillars=["MC", "HG"]),
        _StubSource(pillar_code="HH", analysis_pillars=["MC"]),
    ]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    assert set(batches.keys()) == {"HH"}
    assert len(batches["HH"]) == 2


def test_phase1_seeding_hint_wins_over_triage_primary():
    sources = [_StubSource(pillar_code="EW", triage_primary="MC")]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    assert list(batches.keys()) == ["EW"]


def test_phase1_falls_back_to_analysis_when_no_hint():
    """Sources without a seeding hint must still batch under analysis."""
    sources = [
        _StubSource(analysis_pillars=["MC"]),
        _StubSource(analysis_pillars=["PS"]),
    ]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    assert set(batches.keys()) == {"MC", "PS"}


def test_phase1_falls_back_to_triage_when_no_hint_or_analysis():
    sources = [_StubSource(triage_primary="HG")]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    assert list(batches.keys()) == ["HG"]


def test_phase1_unknown_when_nothing_is_set():
    sources = [_StubSource()]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    assert list(batches.keys()) == ["UNKNOWN"]


def test_phase1_invalid_hint_falls_through():
    """A garbage pillar_code (typo, wrong case, deprecated code) must NOT
    silently create an invalid batch — fall through to analysis instead.
    """
    sources = [
        _StubSource(pillar_code="ZZ", analysis_pillars=["MC"]),
        _StubSource(pillar_code="hh", analysis_pillars=["PS"]),  # case mismatch
        _StubSource(pillar_code="", analysis_pillars=["HG"]),    # empty
    ]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    # None of ZZ / hh / "" appear as batch keys.
    assert "ZZ" not in batches
    assert "hh" not in batches
    assert "" not in batches
    # All three fall through to their analysis pillar.
    assert set(batches.keys()) == {"MC", "PS", "HG"}


def test_phase1_mixed_sources_partition_by_hint():
    """Mix of hinted + un-hinted sources: hinted go to the hint, others
    fall through to analysis.
    """
    sources = [
        _StubSource(pillar_code="HH", analysis_pillars=["MC"]),
        _StubSource(pillar_code="HH", analysis_pillars=["MC"]),
        _StubSource(analysis_pillars=["MC"]),  # truly an MC source
        _StubSource(pillar_code="EW", analysis_pillars=["HG"]),
    ]
    service = _make_service()

    batches = service._phase1_batch_by_pillar(sources)

    assert len(batches["HH"]) == 2
    assert len(batches["MC"]) == 1
    assert len(batches["EW"]) == 1


# ---------------------------------------------------------------------------
# _render_pillar_prior — soft prior block
# ---------------------------------------------------------------------------


def test_pillar_prior_known_code_names_pillar_and_sets_default():
    block = svc._render_pillar_prior("HH")
    assert "## Batch Pillar" in block
    assert "**HH (Homelessness & Housing)**" in block
    assert "Default `pillar_id`" in block
    assert "**HH**" in block
    # The prior must be soft, not absolute — it should still tell the
    # agent that genuinely-different content can go elsewhere.
    assert "outside" in block.lower()


def test_pillar_prior_for_each_known_pillar_is_self_consistent():
    """The block always names the pillar code as its default."""
    for code, name in svc.PILLAR_NAMES.items():
        block = svc._render_pillar_prior(code)
        assert code in block
        assert name in block
        assert f"**{code}**" in block


def test_pillar_prior_unknown_returns_neutral_block():
    block = svc._render_pillar_prior("UNKNOWN")
    assert "## Batch Pillar" in block
    assert "no seeding pillar" in block.lower()
    # Does NOT instruct a default — falls back to "classify on own merits".
    assert "default" not in block.lower()


def test_pillar_prior_invalid_code_returns_neutral_block():
    """Unrecognized strings collapse to the neutral block, not KeyError."""
    block = svc._render_pillar_prior("ZZ")
    assert "no seeding pillar" in block.lower()


# ---------------------------------------------------------------------------
# Prompt template — formatting contract
# ---------------------------------------------------------------------------


def test_system_prompt_accepts_batch_pillar_hint_placeholder():
    """The prompt must format cleanly with the new placeholder so a
    missing argument trips in tests, not in production.
    """
    rendered = svc.SIGNAL_AGENT_SYSTEM_PROMPT.format(
        batch_pillar_hint=svc._render_pillar_prior("PS"),
        existing_signals="None found.",
        source_summaries="[0] test source",
    )
    assert "## Batch Pillar" in rendered
    assert "**PS (Public Safety)**" in rendered
    assert "## Existing Related Signals" in rendered
    assert "## Sources to Process" in rendered


def test_system_prompt_missing_hint_raises():
    """Guard against a regression where the placeholder gets removed
    from the template but a caller forgets to update.
    """
    with pytest.raises(KeyError):
        svc.SIGNAL_AGENT_SYSTEM_PROMPT.format(
            existing_signals="None found.",
            source_summaries="[0] test source",
        )
