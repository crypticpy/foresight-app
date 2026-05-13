"""Tests for the per-pillar card-creation cap (PR #87).

The signal agent runs one batch per pillar and tells each batch in its
system prompt "Budget: up to 15 new signals total." The execution stage
must honor that *per-pillar* — a single global counter starves whichever
batch's actions get processed last. The first balance run after PR #85+#86
exposed this: HH had 76 sources fan out into 10 well-formed signal
proposals, all of which got dropped on the floor because EW + MC actions
ran first and used the global 15.

This file pins:

1. Each pillar can hit ``max_new_cards`` independently — when one pillar
   is at the per-pillar limit, actions for other pillars still go through.
2. A global ``max_new_cards_total`` ceiling still exists as a safety net
   against runaway agents (default 60 = ~$14 worst-case at $0.24/card).
3. Skipped actions log a clear per-pillar reason (not the old generic
   "Card creation limit reached" message) so operators can diagnose
   starvation vs. ceiling cutoffs from a log search.
4. Actions whose ``signal_properties.pillar_id`` is missing or malformed
   bucket under the ``UNKNOWN`` pillar — they share their own cap rather
   than silently piggy-backing on a real pillar's slot.
"""

from __future__ import annotations

import os
import sys
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import signal_agent_service as svc  # noqa: E402


def _make_action(
    *,
    pillar: Optional[str],
    name: str,
) -> svc.SignalAction:
    """Build a minimal create_signal action keyed to ``pillar``."""
    return svc.SignalAction(
        action_type="create_signal",
        signal_card_id=None,
        source_indices=[],
        signal_name=name,
        signal_summary=f"summary of {name}",
        signal_properties={"pillar_id": pillar} if pillar is not None else None,
        relationship_type="primary",
        confidence=0.99,
        reasoning=f"reason for {name}",
    )


class _Config:
    """Minimal stand-in for the config object _execute_actions reads."""

    def __init__(
        self,
        *,
        max_new_cards_per_run: int = 15,
        max_new_cards_total: int = 60,
        auto_approve_threshold: float = 0.95,
    ):
        self.max_new_cards_per_run = max_new_cards_per_run
        self.max_new_cards_total = max_new_cards_total
        self.auto_approve_threshold = auto_approve_threshold


def _make_service_with_fake_create(card_ids: List[str]) -> svc.SignalAgentService:
    """Service whose ``_execute_create_signal`` returns the next id from the list.

    Lets each test control how many "successful" creations happen
    deterministically — none of the real Supabase/OpenAI plumbing runs.
    """
    service = svc.SignalAgentService(
        supabase=MagicMock(),
        run_id="00000000-0000-0000-0000-000000000000",
    )
    ids = iter(card_ids)
    service._execute_create_signal = AsyncMock(  # type: ignore[method-assign]
        side_effect=lambda *_a, **_kw: next(ids, None)
    )
    return service


# ---------------------------------------------------------------------------
# Per-pillar cap — the core fix
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_per_pillar_cap_lets_each_pillar_hit_its_own_limit():
    """Two pillars, each gets its full per-pillar budget."""
    config = _Config(max_new_cards_per_run=2, max_new_cards_total=60)
    actions = [
        _make_action(pillar="HH", name=f"HH-{i}") for i in range(3)
    ] + [
        _make_action(pillar="EW", name=f"EW-{i}") for i in range(3)
    ]
    service = _make_service_with_fake_create([f"card-{i}" for i in range(6)])

    result = await service._execute_actions(actions, [], config)

    # Each pillar exhausted its own cap, not the other's.
    assert len(result["signals_created"]) == 4
    # 3 attempts per pillar, 2 succeed → 1 skip per pillar = 2 total skips
    assert service._execute_create_signal.await_count == 4


@pytest.mark.asyncio
async def test_late_pillar_not_starved_by_earlier_pillar():
    """Reproduces the HH=0 leak from the post-PR-86 balance run.

    Old behavior: a single global counter. Actions arrived ordered
    EW × 15, then HH × 5. Global cap was 15 → HH got 0.

    New behavior: per-pillar cap. EW fills its own 15-slot bucket, HH
    fills its own. HH cards survive.
    """
    config = _Config(max_new_cards_per_run=15, max_new_cards_total=60)
    actions = [_make_action(pillar="EW", name=f"EW-{i}") for i in range(15)]
    actions += [_make_action(pillar="HH", name=f"HH-{i}") for i in range(5)]
    service = _make_service_with_fake_create([f"card-{i}" for i in range(20)])

    result = await service._execute_actions(actions, [], config)

    # All 20 land — EW filled, HH still got its 5.
    assert len(result["signals_created"]) == 20


@pytest.mark.asyncio
async def test_per_pillar_cap_skips_only_overflow_in_that_pillar():
    """Overflow in one pillar must not consume budget in another."""
    config = _Config(max_new_cards_per_run=2, max_new_cards_total=60)
    actions = [_make_action(pillar="HH", name=f"HH-{i}") for i in range(5)]
    actions += [_make_action(pillar="MC", name="MC-1")]
    service = _make_service_with_fake_create([f"card-{i}" for i in range(3)])

    result = await service._execute_actions(actions, [], config)

    # HH: 5 attempts → 2 created + 3 skipped
    # MC: 1 attempt → 1 created
    assert len(result["signals_created"]) == 3


# ---------------------------------------------------------------------------
# Global ceiling — the safety net
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_global_ceiling_still_binds_when_many_pillars_active():
    """Six pillars × 15 = 90 wanted; global ceiling 30 caps the run."""
    config = _Config(max_new_cards_per_run=15, max_new_cards_total=30)
    actions: List[svc.SignalAction] = []
    for code in ("CH", "EW", "HG", "HH", "MC", "PS"):
        actions += [_make_action(pillar=code, name=f"{code}-{i}") for i in range(15)]
    service = _make_service_with_fake_create([f"card-{i}" for i in range(100)])

    result = await service._execute_actions(actions, [], config)

    assert len(result["signals_created"]) == 30


@pytest.mark.asyncio
async def test_global_ceiling_logs_distinct_reason(caplog):
    """The two cutoff paths must log different messages so an operator
    can grep their way to a diagnosis."""
    config = _Config(max_new_cards_per_run=1, max_new_cards_total=2)
    # Three pillars at per-pillar cap 1 — first two land, third blocked
    # by global ceiling 2, not per-pillar.
    actions = [
        _make_action(pillar="CH", name="CH-1"),
        _make_action(pillar="EW", name="EW-1"),
        _make_action(pillar="MC", name="MC-1"),
    ]
    service = _make_service_with_fake_create(["card-1", "card-2"])

    import logging

    with caplog.at_level(logging.WARNING, logger="app.signal_agent_service"):
        await service._execute_actions(actions, [], config)

    messages = [r.getMessage() for r in caplog.records]
    assert any("Global card ceiling (2)" in m for m in messages)
    # Per-pillar warnings should not appear (no pillar ever hit its 1).
    assert not any("Per-pillar card limit" in m for m in messages)


# ---------------------------------------------------------------------------
# UNKNOWN-pillar bucket — actions without pillar_id share a single slot
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_missing_pillar_id_buckets_under_unknown():
    """Actions with no pillar_id share an UNKNOWN cap — they don't
    silently consume a real pillar's slot."""
    config = _Config(max_new_cards_per_run=1, max_new_cards_total=60)
    actions = [
        _make_action(pillar=None, name="orphan-1"),
        _make_action(pillar=None, name="orphan-2"),
        _make_action(pillar="HH", name="HH-1"),
    ]
    service = _make_service_with_fake_create(["card-1", "card-2"])

    result = await service._execute_actions(actions, [], config)

    # orphan-1 lands (first UNKNOWN), orphan-2 skips (UNKNOWN cap=1),
    # HH-1 lands (its own bucket is empty).
    assert len(result["signals_created"]) == 2


@pytest.mark.asyncio
async def test_per_pillar_warning_names_the_pillar(caplog):
    """The warning string must include the pillar code so a log search
    for 'Per-pillar card limit reached for HH' is precise."""
    config = _Config(max_new_cards_per_run=1, max_new_cards_total=60)
    actions = [
        _make_action(pillar="HH", name="HH-1"),
        _make_action(pillar="HH", name="HH-2"),
    ]
    service = _make_service_with_fake_create(["card-1"])

    import logging

    with caplog.at_level(logging.WARNING, logger="app.signal_agent_service"):
        await service._execute_actions(actions, [], config)

    messages = [r.getMessage() for r in caplog.records]
    assert any("Per-pillar card limit" in m and "HH" in m for m in messages)


# ---------------------------------------------------------------------------
# attach_to_existing is not capped — only create_signal counts
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_attach_actions_do_not_consume_cap():
    """``attach_to_existing`` enriches an existing card, not a new one —
    those actions must not eat into the per-pillar create budget."""
    config = _Config(max_new_cards_per_run=1, max_new_cards_total=60)
    attach_action = svc.SignalAction(
        action_type="attach_to_existing",
        signal_card_id="existing-card-id",
        source_indices=[0],
        signal_name=None,
        signal_summary=None,
        signal_properties={"pillar_id": "HH"},
        relationship_type="primary",
        confidence=0.99,
        reasoning="merge into existing",
    )
    actions = [
        attach_action,
        _make_action(pillar="HH", name="HH-1"),
    ]
    service = _make_service_with_fake_create(["card-1"])
    service._execute_attach_to_existing = AsyncMock(  # type: ignore[method-assign]
        return_value={"sources_stored": 1, "junction_created": 1}
    )

    result = await service._execute_actions(actions, [], config)

    # Create-signal still goes through despite an attach in front of it.
    assert len(result["signals_created"]) == 1
    assert result["signals_enriched"] == ["existing-card-id"]
