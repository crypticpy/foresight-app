"""Regression: signal-agent source indices are batch-local, not run-global.

The agent runs one tool loop per pillar batch and numbers that batch's
sources ``[0..N-1]``. It returns ``source_indices`` in that *batch-local*
space. The execution stage used to resolve those indices against the
run-global ``processed_sources`` list — so source index 68 in a CH batch
grabbed the 68th source of the whole run (a climate article) instead of the
68th source the CH agent actually saw (an animal-services article). That
cross-batch scramble mislinked ~360 cards' sources (e.g. an animal-shelter
card showing climate-resilience sources).

The fix: each ``SignalAction`` captures its ``resolved_sources`` — the
ProcessedSource objects from the batch the agent saw — at tool-call time,
where the indices are valid. Execution uses those objects and never re-
resolves indices against a global list (the global list is no longer even
passed into ``_execute_actions``). These tests pin that contract.
"""

from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import signal_agent_service as svc  # noqa: E402


class _StubRaw:
    def __init__(self, title: str):
        self.title = title
        self.url = f"https://example.test/{title}"
        self.source_name = "stub"
        self.content = f"content for {title}"


class _StubSource:
    """Minimal ProcessedSource stand-in — the tool handlers only read
    ``.raw.title`` (for the confirmation payload) and ``.embedding``."""

    def __init__(self, title: str):
        self.raw = _StubRaw(title)
        self.analysis = None
        self.triage = None
        self.embedding = None


def _make_service() -> svc.SignalAgentService:
    return svc.SignalAgentService(
        supabase=MagicMock(),
        run_id="00000000-0000-0000-0000-000000000000",
    )


def _batch(prefix: str, n: int):
    return [_StubSource(f"{prefix}{i}") for i in range(n)]


# ---------------------------------------------------------------------------
# create_signal
# ---------------------------------------------------------------------------


def test_create_signal_resolves_sources_from_its_own_batch():
    """Identical batch-local indices in two batches resolve to each batch's
    own sources — never the other batch's (the cross-batch scramble)."""
    service = _make_service()
    batch_a = _batch("A", 4)
    batch_b = _batch("B", 4)

    _, action_a = service._tool_create_signal(
        {"signal_name": "Signal A", "source_indices": [1, 2]}, batch_a
    )
    _, action_b = service._tool_create_signal(
        {"signal_name": "Signal B", "source_indices": [1, 2]}, batch_b
    )

    # Each action bound to the exact objects from its own batch (identity).
    assert action_a.resolved_sources == [batch_a[1], batch_a[2]]
    assert action_b.resolved_sources == [batch_b[1], batch_b[2]]
    assert action_a.resolved_sources[0] is batch_a[1]
    assert action_a.resolved_sources[0] is not batch_b[1]

    # Titles confirm no cross-batch bleed.
    assert [s.raw.title for s in action_a.resolved_sources] == ["A1", "A2"]
    assert [s.raw.title for s in action_b.resolved_sources] == ["B1", "B2"]


def test_create_signal_skips_out_of_range_indices():
    """Out-of-range indices are dropped before capture, so resolved_sources
    only ever contains real batch members."""
    service = _make_service()
    batch = _batch("A", 3)

    _, action = service._tool_create_signal(
        {"signal_name": "Signal", "source_indices": [0, 2, 99]}, batch
    )

    assert action.source_indices == [0, 2]
    assert action.resolved_sources == [batch[0], batch[2]]


def test_create_signal_coerces_non_integer_indices():
    """The model sometimes emits indices as floats (2.0) or strings ("1").
    Those must be coerced to int — a float index raises TypeError when used
    to subscript batch_sources, and a str breaks the 0 <= idx range check —
    while genuine garbage ("abc", None) is dropped, not crashed on."""
    service = _make_service()
    batch = _batch("A", 4)

    _, action = service._tool_create_signal(
        {"signal_name": "Signal", "source_indices": [1.0, "2", "abc", None, 3]},
        batch,
    )

    assert action.source_indices == [1, 2, 3]
    assert action.resolved_sources == [batch[1], batch[2], batch[3]]
    # The captured objects must be real batch members (no TypeError, no float keys).
    assert all(s in batch for s in action.resolved_sources)


# ---------------------------------------------------------------------------
# attach_source_to_signal
# ---------------------------------------------------------------------------


def test_attach_resolves_sources_from_its_own_batch():
    service = _make_service()
    # Make the card-existence check return a real row.
    service.supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"id": "existing-card", "name": "Existing Signal"}
    ]
    batch_a = _batch("A", 4)
    batch_b = _batch("B", 4)

    _, action_a = asyncio.run(
        service._tool_attach_source_to_signal(
            {"signal_id": "existing-card", "source_indices": [3]}, batch_a
        )
    )
    _, action_b = asyncio.run(
        service._tool_attach_source_to_signal(
            {"signal_id": "existing-card", "source_indices": [3]}, batch_b
        )
    )

    assert action_a.resolved_sources == [batch_a[3]]
    assert action_b.resolved_sources == [batch_b[3]]
    assert action_a.resolved_sources[0].raw.title == "A3"
    assert action_b.resolved_sources[0].raw.title == "B3"
