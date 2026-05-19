"""Unit tests for the PR-F2/F3 observability-hook port.

PR-F2 deleted ``DiscoveryService._triage_sources`` (1046-line dead
method). PR-F3 ported its three observability hooks
(``update_source_triage`` / ``update_source_analysis`` /
``update_source_outcome``) onto the live ``triage_sources_with_metrics``
in ``discovery_triage``. Without the port, the deletion would have
quietly regressed the operator-facing source-row state:
``discovered_sources`` rows would no longer reflect the triage
decision, the analysis result, or the pipeline-stage error reason —
leaving the observability UI staring at stale "queued"-looking rows.

These tests pin the new wiring on the live path:

1. A source that passes triage triggers ``update_source_triage(passed=True)``
   AND ``update_source_analysis(analysis)`` against the row's id.
2. A source that fails triage triggers ``update_source_triage(passed=False)``
   AND NOT ``update_source_analysis`` (analysis only runs for passers).
3. A source without a ``discovered_source_id`` (workstream scans, ad-hoc
   invocations) silently skips the hooks rather than crashing on a
   None id.
4. An exception in the per-source try block is recorded onto the row
   via ``update_source_outcome("error", error_stage="triage", ...)``.
"""

from __future__ import annotations

import asyncio
import os
import sys
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _run(coro):
    return asyncio.run(coro)


def _make_raw_source(
    *,
    title: str = "T",
    content: Optional[str] = "Body",
    url: str = "https://x/y",
    discovered_source_id: Optional[str] = "src-uuid-1",
):
    from app.research_service import RawSource

    rs = RawSource(
        url=url,
        title=title,
        content=content,
        source_name="test",
        relevance=0.9,
    )
    rs.discovered_source_id = discovered_source_id
    return rs


def _stub_ai_service(*, triage_passes: bool = True):
    """Stub AIService with the three methods triage uses.

    ``triage_passes`` controls whether the triage classifier returns a
    confidence above the 0.6 threshold. Pass-path tests want
    confidence high; fail-path tests want it low.
    """
    from app.ai_service import TriageResult

    ai = MagicMock()
    ai.triage_source = AsyncMock(
        return_value=TriageResult(
            is_relevant=True,
            confidence=0.9 if triage_passes else 0.3,
            primary_pillar=None,
            reason="ok",
        )
    )

    analysis_mock = MagicMock()
    analysis_mock.summary = "short summary"
    analysis_mock.suggested_card_name = "Card Name"
    ai.analyze_source = AsyncMock(return_value=analysis_mock)
    ai.generate_embedding = AsyncMock(return_value=[0.0] * 1536)
    return ai


def _stub_supabase():
    sb = MagicMock()
    sb.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value = MagicMock(
        data=None
    )
    return sb


def _stub_domain_reputation(monkeypatch):
    """Short-circuit domain_reputation_service so its Supabase reads
    never run against the mock and the test stays focused on hooks.
    """
    from app import discovery_triage

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


# ---------------------------------------------------------------------------
# Passing source: triage(True) + analysis(...) both recorded
# ---------------------------------------------------------------------------


def test_passing_source_records_triage_and_analysis_on_discovered_source(
    monkeypatch,
) -> None:
    """A source that passes triage must have both ``update_source_triage``
    (with ``passed=True``) and ``update_source_analysis`` called against
    its ``discovered_source_id``. This is the PR-F3 wiring.
    """
    from app import discovery_triage
    from app.discovery_triage import triage_sources_with_metrics

    _stub_domain_reputation(monkeypatch)

    triage_calls: List = []
    analysis_calls: List = []
    outcome_calls: List = []

    async def fake_update_triage(sb, source_id, triage, passed):
        triage_calls.append((source_id, passed, triage.confidence))

    async def fake_update_analysis(sb, source_id, analysis):
        analysis_calls.append((source_id, analysis.summary))

    async def fake_update_outcome(sb, source_id, status, **_kw):
        outcome_calls.append((source_id, status))

    monkeypatch.setattr(
        discovery_triage, "update_source_triage", fake_update_triage
    )
    monkeypatch.setattr(
        discovery_triage, "update_source_analysis", fake_update_analysis
    )
    monkeypatch.setattr(
        discovery_triage, "update_source_outcome", fake_update_outcome
    )

    src = _make_raw_source(discovered_source_id="src-pass-1")
    processed, _breakdown = _run(
        triage_sources_with_metrics(
            _stub_supabase(),
            _stub_ai_service(triage_passes=True),
            [src],
        )
    )

    assert len(processed) == 1
    assert len(triage_calls) == 1
    assert triage_calls[0][0] == "src-pass-1"
    assert triage_calls[0][1] is True
    assert len(analysis_calls) == 1
    assert analysis_calls[0][0] == "src-pass-1"
    # No exception → no outcome=error write.
    assert outcome_calls == []


# ---------------------------------------------------------------------------
# Failing source: triage(False) recorded, analysis skipped
# ---------------------------------------------------------------------------


def test_failing_source_records_triage_false_and_skips_analysis(monkeypatch) -> None:
    """A source whose triage confidence falls below 0.6 records the
    decision (``passed=False``) but must NOT call ``update_source_analysis``
    — analysis only runs for passers and writing a fake analysis row
    would pollute the observability UI.
    """
    from app import discovery_triage
    from app.discovery_triage import triage_sources_with_metrics

    _stub_domain_reputation(monkeypatch)

    triage_calls: List = []
    analysis_calls: List = []

    async def fake_update_triage(sb, source_id, triage, passed):
        triage_calls.append((source_id, passed))

    async def fake_update_analysis(sb, source_id, analysis):
        analysis_calls.append(source_id)

    monkeypatch.setattr(
        discovery_triage, "update_source_triage", fake_update_triage
    )
    monkeypatch.setattr(
        discovery_triage, "update_source_analysis", fake_update_analysis
    )

    src = _make_raw_source(discovered_source_id="src-fail-1")
    processed, _breakdown = _run(
        triage_sources_with_metrics(
            _stub_supabase(),
            _stub_ai_service(triage_passes=False),
            [src],
        )
    )

    assert len(processed) == 0  # filtered out by the 0.6 threshold
    assert triage_calls == [("src-fail-1", False)]
    assert analysis_calls == []


# ---------------------------------------------------------------------------
# No discovered_source_id: hooks are silently skipped (no crash)
# ---------------------------------------------------------------------------


def test_source_without_discovered_id_skips_hooks(monkeypatch) -> None:
    """Workstream scans and ad-hoc invocations call this path with
    sources that don't have a persisted row (``discovered_source_id``
    is ``None``). The hook calls must short-circuit rather than passing
    ``None`` as a row id — that would either crash on the supabase
    update or worse, silently update every row in the table.
    """
    from app import discovery_triage
    from app.discovery_triage import triage_sources_with_metrics

    _stub_domain_reputation(monkeypatch)

    triage_calls: List = []
    analysis_calls: List = []

    async def fake_update_triage(sb, source_id, triage, passed):
        triage_calls.append(source_id)

    async def fake_update_analysis(sb, source_id, analysis):
        analysis_calls.append(source_id)

    monkeypatch.setattr(
        discovery_triage, "update_source_triage", fake_update_triage
    )
    monkeypatch.setattr(
        discovery_triage, "update_source_analysis", fake_update_analysis
    )

    src = _make_raw_source(discovered_source_id=None)
    processed, _breakdown = _run(
        triage_sources_with_metrics(
            _stub_supabase(),
            _stub_ai_service(triage_passes=True),
            [src],
        )
    )

    assert len(processed) == 1
    # Both hooks were skipped because the source has no row id.
    assert triage_calls == []
    assert analysis_calls == []


# ---------------------------------------------------------------------------
# Per-source exception is captured onto discovered_sources
# ---------------------------------------------------------------------------


def test_exception_in_triage_loop_writes_error_outcome(monkeypatch) -> None:
    """If anything in the per-source try block raises (an LLM time-out,
    a domain-rep call going sideways, an unexpected schema diff), the
    handler must mark the row as ``error`` with ``error_stage="triage"``
    so the operator can see *why* the source dropped out — instead of
    just watching it silently vanish from the queue.
    """
    from app import discovery_triage
    from app.discovery_triage import triage_sources_with_metrics

    _stub_domain_reputation(monkeypatch)

    outcome_calls: List = []

    async def fake_update_outcome(sb, source_id, status, **kw):
        outcome_calls.append((source_id, status, kw.get("error_stage")))

    monkeypatch.setattr(
        discovery_triage, "update_source_outcome", fake_update_outcome
    )

    # Make analyze_source raise so the per-source try block hits its
    # except branch (triage passes first, then analysis blows up).
    ai = _stub_ai_service(triage_passes=True)
    ai.analyze_source = AsyncMock(side_effect=RuntimeError("LLM timeout"))

    src = _make_raw_source(discovered_source_id="src-err-1")
    processed, _breakdown = _run(
        triage_sources_with_metrics(_stub_supabase(), ai, [src])
    )

    assert processed == []  # the source did not survive the analysis crash
    assert len(outcome_calls) == 1
    assert outcome_calls[0][0] == "src-err-1"
    assert outcome_calls[0][1] == "error"
    assert outcome_calls[0][2] == "triage"
