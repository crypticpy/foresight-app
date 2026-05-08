"""Smoke tests for the lens classification cascade.

Exercises ``LensClassificationService.classify_card`` end-to-end with a
mocked AsyncOpenAI client and supabase client. Covers:

- Happy path: every stage returns valid JSON, output is shaped correctly
  and respects closed vocabularies.
- Triage gates: stage-4 ``needs_*`` flags suppress stage-5 prompts.
- Stage failure: a single failing stage falls back to safe defaults
  rather than raising.
- Invalid vocab: out-of-vocabulary tags/codes are dropped silently.

The cascade itself uses ``asyncio.gather`` heavily, so these tests run
under ``asyncio.run`` to drive the coroutines.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mocks
# ---------------------------------------------------------------------------


@dataclass
class _Choice:
    message: Any


@dataclass
class _Message:
    content: str


@dataclass
class _Response:
    choices: List[_Choice]


class _MockChatCompletions:
    """Returns canned JSON responses keyed by a heuristic on the prompt."""

    def __init__(self, responses: Dict[str, Any]) -> None:
        self._responses = responses
        self.calls: List[Dict[str, Any]] = []

    async def create(self, **kwargs) -> _Response:
        self.calls.append(kwargs)
        prompt = kwargs["messages"][0]["content"]
        for key, body in self._responses.items():
            if key in prompt:
                if isinstance(body, Exception):
                    raise body
                content = body if isinstance(body, str) else json.dumps(body)
                return _Response(choices=[_Choice(message=_Message(content=content))])
        # Default empty body — exercises the JSON-parse fallback.
        return _Response(choices=[_Choice(message=_Message(content="{}"))])


class _MockChat:
    def __init__(self, completions: _MockChatCompletions) -> None:
        self.completions = completions


class _MockAsyncOpenAI:
    def __init__(self, responses: Dict[str, Any]) -> None:
        self.completions = _MockChatCompletions(responses)
        self.chat = _MockChat(self.completions)


class _MockResp:
    def __init__(self, data: List[Dict[str, Any]]) -> None:
        self.data = data


class _MockTable:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self._rows = rows

    def select(self, *_a, **_kw):
        return self

    def order(self, *_a, **_kw):
        return self

    def execute(self) -> _MockResp:
        return _MockResp(self._rows)


class _MockSupabase:
    def __init__(self, tables: Dict[str, List[Dict[str, Any]]]) -> None:
        self._tables = tables

    def table(self, name: str) -> _MockTable:
        return _MockTable(self._tables.get(name, []))


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def csp_taxonomy_rows():
    goal_id = str(uuid.uuid4())
    measure_id = str(uuid.uuid4())
    return {
        "csp_goals": [
            {"id": goal_id, "code": "CH.1", "name": "Climate goal"},
        ],
        "csp_measures": [
            {"id": measure_id, "code": "CH.1.1", "name": "GHG measure"},
        ],
    }, goal_id, measure_id


@pytest.fixture
def stub_card():
    return {
        "id": str(uuid.uuid4()),
        "name": "Austin caps emissions for new buildings",
        "summary": "Austin's energy code mandates building electrification by 2030.",
        "pillar_id": "CH",
        "horizon": "now",
        "stage_id": "implementing",
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_classify_card_happy_path(monkeypatch, csp_taxonomy_rows, stub_card):
    """All stages return valid JSON; result is fully populated."""
    from app import lens_classification_service as svc_mod

    tables, goal_id, measure_id = csp_taxonomy_rows

    # Keys are unique substrings of each prompt — match order-independent.
    # Issue-tags / budget / climate must come BEFORE dim-triage and CSP because
    # dim-triage mentions "closed-vocabulary issue families" and "budget impact"
    # in the same body; first-substring-wins on dict iteration.
    responses = {
        "Apply closed-vocabulary issue tags": {
            "tags": [
                "climate_change",
                "energy_transition",
                "not_a_real_tag",
            ],
        },
        "Produce a budget assessment": {
            "relevance": 70,
            "dimensions": ["capex", "opex", "garbage"],
            "magnitude_band": "$10M-$100M",
            "cycle": "FY27",
            "notes": "energy code retrofits",
        },
        "climate-overlay assessment": {
            "relevance": 95,
            "drivers": ["extreme_heat", "energy_grid", "fake_driver"],
            "horizon": "short",
            "notes": "decarbonization",
        },
        "operational lenses": {
            "needs_budget": True,
            "needs_climate": True,
            "needs_issue_tags": True,
            "reasoning": "all three apply",
        },
        "Citywide Strategic Plan": {
            "goal_codes": ["CH.1", "BOGUS.0"],
            "measure_codes": ["CH.1.1"],
        },
        "Strategic Anchors": {
            "equity": 60,
            "affordability": 40,
            "innovation": 80,
            "sustainability_resiliency": 95,
            "proactive_prevention": 75,
            "community_trust": 50,
        },
        "horizon-scanning analyst": {
            "signal_type": "trend",
            "secondary_pillars": ["MC", "EW"],
            "reasoning": "cross-pillar climate impact",
        },
    }

    client = _MockAsyncOpenAI(responses)
    supabase_mock = _MockSupabase(tables)

    service = svc_mod.LensClassificationService(client, supabase_mock)
    result = asyncio.run(service.classify_card(stub_card))

    assert result.classifier_version == svc_mod.CLASSIFIER_VERSION
    assert result.signal_type == "trend"
    # Primary pillar (CH) should be filtered from secondary list.
    assert "CH" not in result.secondary_pillars
    assert set(result.secondary_pillars) == {"MC", "EW"}

    # Anchor scores clamp into 0-100 and preserve all six.
    assert result.anchor_scores.equity == 60
    assert result.anchor_scores.sustainability_resiliency == 95

    # CSP codes resolve to UUIDs; bogus codes drop.
    assert result.csp_goal_ids == [goal_id]
    assert result.csp_measure_ids == [measure_id]

    # Closed-vocab filtering on stage 5 outputs.
    assert result.budget_assessment is not None
    assert "garbage" not in result.budget_assessment.dimensions
    assert result.budget_assessment.dimensions == ["capex", "opex"]
    assert result.budget_assessment.magnitude_band == "$10M-$100M"
    assert result.budget_assessment.cycle == "FY27"

    assert result.climate_assessment is not None
    assert "fake_driver" not in result.climate_assessment.drivers
    assert result.climate_assessment.horizon == "short"

    assert "not_a_real_tag" not in result.issue_tags
    assert "climate_change" in result.issue_tags
    assert "energy_transition" in result.issue_tags

    # Stage 5 ran for all three dims — verify by call count.
    # Stages 1-4 (4) + stages 5a/5b/5c (3) = 7 chat calls.
    assert len(client.completions.calls) == 7


def test_classify_card_triage_gates_stage5(monkeypatch, csp_taxonomy_rows, stub_card):
    """When triage says no dims apply, stage-5 prompts must NOT fire."""
    from app import lens_classification_service as svc_mod

    tables, _, _ = csp_taxonomy_rows
    responses = {
        "operational lenses": {
            "needs_budget": False,
            "needs_climate": False,
            "needs_issue_tags": False,
            "reasoning": "irrelevant",
        },
        "Citywide Strategic Plan": {"goal_codes": [], "measure_codes": []},
        "Strategic Anchors": {
            "equity": 10,
            "affordability": 10,
            "innovation": 10,
            "sustainability_resiliency": 10,
            "proactive_prevention": 10,
            "community_trust": 10,
        },
        "horizon-scanning analyst": {
            "signal_type": "signal",
            "secondary_pillars": [],
            "reasoning": "narrow scope",
        },
    }
    client = _MockAsyncOpenAI(responses)
    service = svc_mod.LensClassificationService(client, _MockSupabase(tables))
    result = asyncio.run(service.classify_card(stub_card))

    assert result.budget_assessment is None
    assert result.climate_assessment is None
    assert result.issue_tags == []
    # Only stages 1-4 should have run.
    assert len(client.completions.calls) == 4


def test_classify_card_stage_failure_falls_back(
    monkeypatch, csp_taxonomy_rows, stub_card
):
    """A single stage raising shouldn't take down the whole cascade."""
    from app import lens_classification_service as svc_mod

    tables, _, _ = csp_taxonomy_rows
    responses = {
        "operational lenses": {
            "needs_budget": False,
            "needs_climate": False,
            "needs_issue_tags": False,
            "reasoning": "skip",
        },
        "Citywide Strategic Plan": {"goal_codes": [], "measure_codes": []},
        # Anchors stage raises — should fall back to AnchorScores.zeros()
        "Strategic Anchors": ValueError("simulated downstream failure"),
        "horizon-scanning analyst": {
            "signal_type": "driver",
            "secondary_pillars": [],
            "reasoning": "ok",
        },
    }
    client = _MockAsyncOpenAI(responses)
    service = svc_mod.LensClassificationService(client, _MockSupabase(tables))
    result = asyncio.run(service.classify_card(stub_card))

    # Cascade returned a result — anchors are zero rather than raising.
    assert result.signal_type == "driver"
    assert result.anchor_scores.equity == 0
    assert result.anchor_scores.sustainability_resiliency == 0
    # Required-stage failure (anchors) → classifier_version stays None so
    # the backfill picks this card up again next pass.
    assert result.classifier_version is None
    # to_card_update() reflects that — classifier_version is null in the
    # write payload and the caller must skip stamping classified_at.
    update = result.to_card_update()
    assert update["classifier_version"] is None


def test_classify_card_to_card_update_shape(
    monkeypatch, csp_taxonomy_rows, stub_card
):
    """``to_card_update()`` produces a dict suitable for Supabase UPDATE."""
    from app import lens_classification_service as svc_mod

    tables, goal_id, _ = csp_taxonomy_rows
    responses = {
        "operational lenses": {
            "needs_budget": False,
            "needs_climate": False,
            "needs_issue_tags": False,
            "reasoning": "",
        },
        "Citywide Strategic Plan": {
            "goal_codes": ["CH.1"],
            "measure_codes": [],
        },
        "Strategic Anchors": {
            "equity": 50,
            "affordability": 50,
            "innovation": 50,
            "sustainability_resiliency": 50,
            "proactive_prevention": 50,
            "community_trust": 50,
        },
        "horizon-scanning analyst": {
            "signal_type": "trend",
            "secondary_pillars": [],
            "reasoning": "",
        },
    }
    client = _MockAsyncOpenAI(responses)
    service = svc_mod.LensClassificationService(client, _MockSupabase(tables))
    result = asyncio.run(service.classify_card(stub_card))
    update = result.to_card_update()

    assert update["classifier_version"] == svc_mod.CLASSIFIER_VERSION
    assert update["signal_type"] == "trend"
    assert update["csp_goal_ids"] == [goal_id]
    # JSONB-bound fields must be plain dicts/lists, not pydantic objects.
    assert isinstance(update["anchor_scores"], dict)
    assert update["budget_assessment"] is None
    assert update["climate_assessment"] is None
    # ``classified_at`` is the caller's responsibility — not in the dict.
    assert "classified_at" not in update
    # ``user_metadata`` must NEVER appear in the LLM-write payload.
    assert "user_metadata" not in update


def test_classify_card_concurrency_capped(monkeypatch, csp_taxonomy_rows, stub_card):
    """No more than CASCADE_MAX_CONCURRENCY classify_card runs at once.

    Verifies the burst cascade — discovery firing N cards in quick succession
    — is bounded so we don't fan out to ``N * 7`` simultaneous LLM calls
    against Azure OpenAI.
    """
    from app import lens_classification_service as svc_mod

    tables, _, _ = csp_taxonomy_rows

    # Reset the lazy-init semaphore so this test sees a fresh one bound to
    # asyncio.run's loop. Other tests in this file run synchronously to
    # completion via asyncio.run, so they don't share live wait state.
    monkeypatch.setattr(svc_mod, "_cascade_semaphore", None)
    monkeypatch.setattr(svc_mod, "CASCADE_MAX_CONCURRENCY", 3)

    inflight = 0
    peak = 0

    class _SlowCompletions:
        """Each .create() awaits an event so we can hold N runs simultaneously."""

        def __init__(self) -> None:
            self.calls: List[Dict[str, Any]] = []

        async def create(self, **kwargs):
            nonlocal inflight, peak
            inflight += 1
            peak = max(peak, inflight)
            # Yield long enough for all queued runs to enter the gather.
            await asyncio.sleep(0.01)
            inflight -= 1
            self.calls.append(kwargs)
            return _Response(
                choices=[_Choice(message=_Message(content="{}"))]
            )

    class _SlowChat:
        def __init__(self, completions) -> None:
            self.completions = completions

    class _SlowClient:
        def __init__(self) -> None:
            self.completions = _SlowCompletions()
            self.chat = _SlowChat(self.completions)

    async def _run() -> None:
        client = _SlowClient()
        service = svc_mod.LensClassificationService(client, _MockSupabase(tables))
        # Fire 10 cascades simultaneously — must serialize past the cap.
        await asyncio.gather(
            *[service.classify_card(stub_card) for _ in range(10)]
        )

    asyncio.run(_run())

    # Each cascade fires up to 7 stages internally, but the SEMAPHORE is on
    # the outer classify_card, so peak inflight LLM calls = peak concurrent
    # cascades * stages_per_cascade. We assert peak total LLM in-flight does
    # not exceed CASCADE_MAX_CONCURRENCY * 7.
    assert peak <= 3 * 7, f"peak in-flight stages {peak} exceeded cap"
