"""Lens classification cascade.

Multi-prompt classifier that produces the per-card metadata introduced by
``docs/18_FEATURE_Lens_Architecture.md`` and persisted by the schema migration
``20260507000006_lens_architecture_schema.sql``.

Pipeline (stages run concurrently — they are independent decisions about the
same card text):

  1. Core         (FULL model)  → signal_type, secondary_pillars
  2. Anchors      (MINI)        → six 0-100 strategic-anchor scores
  3. CSP tagging  (MINI)        → csp_goal_ids[], csp_measure_ids[]
  4. Dim triage   (MINI)        → which operational dims to elaborate
  5. Per-dim      (MINI, parallel, conditional on stage 4):
       - issue_tags  → closed-vocabulary tags
       - budget      → BudgetAssessment
       - climate     → ClimateAssessment

Cost per card: ~$0.006 first pass; ~$0.002 for an update of an already-tagged
card. `CLASSIFIER_VERSION` is bumped when prompts change, which makes the
backfill worker re-classify stale cards on its next pass.

This module **never writes to** ``cards.user_metadata``. The user-edit layer
is sacred — the worker writes only LLM-derived columns.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import openai

from .ai_service import REQUEST_TIMEOUT, with_retry
from .models.lens import (
    VALID_BUDGET_CYCLES,
    VALID_BUDGET_DIMENSIONS,
    VALID_BUDGET_MAGNITUDE_BANDS,
    VALID_CLIMATE_DRIVERS,
    VALID_CLIMATE_HORIZONS,
    VALID_ISSUE_TAGS,
    VALID_PILLAR_CODES,
    VALID_SIGNAL_TYPES,
    AnchorScores,
    BudgetAssessment,
    ClimateAssessment,
    LensClassificationResult,
    LensCoreClassification,
    LensTriage,
)
from .openai_provider import get_chat_deployment, get_chat_mini_deployment

logger = logging.getLogger(__name__)


# Version string written to ``cards.classifier_version``. Bump on prompt
# changes — the backfill worker re-classifies cards whose recorded version
# doesn't match. Kept short so it fits ``cards.classifier_version`` cleanly.
CLASSIFIER_VERSION = "lens-v1"

# Truncation budget for the card text fed into each stage. Mini stages use
# a smaller window to keep cost down.
_CORE_TEXT_LIMIT = 6000
_MINI_TEXT_LIMIT = 3500


# Each cascade run fires up to 7 LLM calls in parallel (4 always-run +
# 3 conditional dim stages). A discovery burst that creates 50 new cards
# fan-outs to ~350 simultaneous Azure OpenAI requests, which reliably
# saturates the deployment's RPM and thunders into retry/back-off. Cap the
# number of concurrent cascade runs system-wide to bound that fan-out.
CASCADE_MAX_CONCURRENCY = 5
_cascade_semaphore: Optional[asyncio.Semaphore] = None


def _get_cascade_semaphore() -> asyncio.Semaphore:
    """Lazy-init the cascade semaphore against the current event loop.

    asyncio primitives bind to the loop active when first awaited. The
    cascade is invoked from multiple loops (FastAPI request loop, worker
    loop, backfill task), but in practice all three are the same per-process
    loop — the lazy init just ensures we don't construct against a
    not-yet-running loop at import time.
    """
    global _cascade_semaphore
    if _cascade_semaphore is None:
        _cascade_semaphore = asyncio.Semaphore(CASCADE_MAX_CONCURRENCY)
    return _cascade_semaphore


# ---------------------------------------------------------------------------
# Card text assembly
# ---------------------------------------------------------------------------


def _build_card_text(card: Dict[str, Any]) -> str:
    """Assemble the prompt text from a card row.

    Inputs are tolerated to be either a fresh ``AnalysisResult`` projection
    (used during discovery) or a Supabase row (used during backfill). Missing
    fields render as empty strings rather than raising.
    """
    name = card.get("name") or card.get("suggested_card_name") or ""
    summary = card.get("summary") or ""
    pillar = card.get("pillar_id") or card.get("pillar") or ""
    horizon = card.get("horizon") or ""
    stage = card.get("stage_id") or card.get("suggested_stage") or ""

    parts: List[str] = []
    if name:
        parts.append(f"Title: {name}")
    if pillar:
        parts.append(f"Primary pillar: {pillar}")
    if horizon:
        parts.append(f"Horizon: {horizon}")
    if stage:
        parts.append(f"Stage: {stage}")
    if summary:
        parts.append("")
        parts.append("Summary:")
        parts.append(summary)
    return "\n".join(parts).strip()


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


_CORE_PROMPT = """You are a strategic horizon-scanning analyst classifying a signal for the City of Austin.

Decide two things:

1. **signal_type** — one of:
   - "trend"  — an established pattern of change already underway
   - "driver" — a force or condition causing change
   - "signal" — an early indicator that something may be emerging

2. **secondary_pillars** — additional Strategic Pillar codes that this signal also touches besides its primary pillar. List ONLY codes from this set:
   - CH = Community Health & Sustainability
   - EW = Economic & Workforce Development
   - HG = High-Performing Government
   - HH = Homelessness & Housing
   - MC = Mobility & Critical Infrastructure
   - PS = Public Safety

   Do NOT include the primary pillar (already given). If the signal is single-pillar, return [].

Card:
{card_text}

Respond with ONLY a JSON object on this schema (no prose, no markdown fence):
{{
  "signal_type": "trend|driver|signal",
  "secondary_pillars": ["CODE", ...],
  "reasoning": "one sentence"
}}
"""


_ANCHORS_PROMPT = """Score this signal on each of Austin's six Strategic Anchors. Each score is an integer 0-100 representing how much the anchor is implicated by the signal:

- equity                    — fair access and outcomes
- affordability             — cost burden on residents
- innovation                — novel approaches, tech, process
- sustainability_resiliency — environmental, climate, operational resilience
- proactive_prevention      — getting ahead of harm vs. reacting
- community_trust           — engagement, transparency, partnership

Calibration:
- 0-19   = not implicated
- 20-39  = tangentially implicated
- 40-59  = clearly implicated but not central
- 60-79  = central concern
- 80-100 = the dominant lens for understanding this signal

Card:
{card_text}

Respond with ONLY a JSON object (no prose, no markdown fence):
{{
  "equity": 0,
  "affordability": 0,
  "innovation": 0,
  "sustainability_resiliency": 0,
  "proactive_prevention": 0,
  "community_trust": 0
}}
"""


_CSP_TAGGING_PROMPT = """Match this signal against the City of Austin's Citywide Strategic Plan (CSP) Goals and Measures.

Return ONLY the goal/measure codes that are clearly relevant. Most signals match 0-3 goals and 0-2 measures. Be conservative — irrelevant tags hurt more than missing ones.

CSP Goals (code — name):
{goals_block}

CSP Measures (code — name):
{measures_block}

Card:
{card_text}

Respond with ONLY a JSON object on this schema (no prose, no markdown fence):
{{
  "goal_codes":    ["CH.1", ...],
  "measure_codes": ["CH.1.1", ...]
}}
"""


_DIM_TRIAGE_PROMPT = """For this signal, decide which operational lenses warrant a deeper assessment. A lens warrants assessment only if the signal genuinely affects that dimension — not for tangential mentions.

- needs_budget       — likely material city budget impact (capex, opex, revenue, staffing, grants)
- needs_climate      — climate-driven hazard, mitigation, adaptation, or resilience implication
- needs_issue_tags   — fits one of these closed-vocabulary issue families: cost_of_living, behavioral_health_homelessness, youth_family_needs, equity_expectations, climate_change, aging_infrastructure, energy_transition, housing_landuse_pressure, state_federal_preemption, regional_interdependence, grant_funding, civic_trust, economic_competitiveness

Card:
{card_text}

Respond with ONLY a JSON object (no prose, no markdown fence):
{{
  "needs_budget":     true|false,
  "needs_climate":    true|false,
  "needs_issue_tags": true|false,
  "reasoning":        "one short sentence"
}}
"""


_BUDGET_PROMPT = """Produce a budget assessment for this signal as it relates to the City of Austin.

Card:
{card_text}

Constraints:
- relevance:      integer 0-100 (likelihood + magnitude of city budget impact)
- dimensions:     subset of {{capex, opex, revenue, staffing, grants}} — empty list if none
- magnitude_band: one of {{"<$100K", "$100K-$1M", "$1M-$10M", "$10M-$100M", ">$100M"}} or null if unclear
- cycle:          one of {{"FY26", "FY27", "FY28", "biennial", "one-time", "ongoing"}} or null if unclear

Respond with ONLY a JSON object (no prose, no markdown fence):
{{
  "relevance":      0,
  "dimensions":     [],
  "magnitude_band": null,
  "cycle":          null,
  "notes":          "one short sentence on the budget rationale"
}}
"""


_CLIMATE_PROMPT = """Produce a climate-overlay assessment for this signal as it relates to the City of Austin.

Card:
{card_text}

Constraints:
- relevance: integer 0-100 (degree to which this signal involves climate hazards, mitigation, adaptation, or resilience)
- drivers:   subset of {{extreme_heat, drought, flooding, wildfire, winter_storm, air_quality, energy_grid, water_supply}} — empty list if none
- horizon:   one of {{"now", "short", "medium", "long"}} or null
  - now      = already affecting Austin
  - short    = within ~2 years
  - medium   = 2-10 years
  - long     = 10+ years

Respond with ONLY a JSON object (no prose, no markdown fence):
{{
  "relevance": 0,
  "drivers":   [],
  "horizon":   null,
  "notes":     "one short sentence on the climate rationale"
}}
"""


_ISSUE_TAGS_PROMPT = """Apply closed-vocabulary issue tags to this signal. Only choose from:

cost_of_living, behavioral_health_homelessness, youth_family_needs, equity_expectations,
climate_change, aging_infrastructure, energy_transition, housing_landuse_pressure,
state_federal_preemption, regional_interdependence, grant_funding, civic_trust, economic_competitiveness

Most signals match 0-2 tags. Pick a tag only when the signal is clearly *about* that issue, not when it is merely related.

Card:
{card_text}

Respond with ONLY a JSON object (no prose, no markdown fence):
{{
  "tags": []
}}
"""


# ---------------------------------------------------------------------------
# CSP taxonomy cache
# ---------------------------------------------------------------------------


@dataclass
class _CspTaxonomy:
    """In-memory cache of CSP goals + measures.

    Loaded once per service instance — the worker creates one service per
    process and serves many cards from the same cache.
    """

    goal_by_code: Dict[str, str]                # 'CH.1' -> uuid
    measure_by_code: Dict[str, str]             # 'CH.1.1' -> uuid
    goals_block: str                            # rendered for the prompt
    measures_block: str                         # rendered for the prompt


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class LensClassificationService:
    """Multi-stage classifier producing per-card lens metadata."""

    classifier_version: str = CLASSIFIER_VERSION

    def __init__(self, openai_client: openai.AsyncOpenAI, supabase: Any):
        self.client = openai_client
        self.supabase = supabase
        self._taxonomy: Optional[_CspTaxonomy] = None
        self._taxonomy_lock = asyncio.Lock()

    # -- Public API ---------------------------------------------------------

    async def classify_card(
        self,
        card: Dict[str, Any],
        *,
        primary_pillar: Optional[str] = None,
    ) -> LensClassificationResult:
        """Run the full cascade for a single card.

        Args:
            card: Card row (or AnalysisResult-shaped dict). At minimum should
                include ``name`` / ``summary``. ``pillar_id`` is read for the
                core prompt's "primary pillar already given" hint.
            primary_pillar: Optional override for the primary pillar code
                (useful during discovery, before the card is persisted).

        Returns:
            LensClassificationResult ready to merge into a ``cards`` UPDATE.
            On stage failure, the cascade falls back to safe defaults
            (zero anchor scores, empty arrays, no operational dims) so the
            caller can still write *something* and move on.
        """
        async with _get_cascade_semaphore():
            return await self._classify_card_inner(
                card, primary_pillar=primary_pillar
            )

    async def _classify_card_inner(
        self,
        card: Dict[str, Any],
        *,
        primary_pillar: Optional[str] = None,
    ) -> LensClassificationResult:
        text = _build_card_text(card)
        if not text:
            logger.warning("Lens cascade called with empty card text")
            return self._fallback_result()

        pillar_code = primary_pillar or card.get("pillar_id") or card.get("pillar")
        taxonomy = await self._load_taxonomy()

        # All four "always run" stages execute concurrently — they're
        # independent reads of the same card text.
        core_raw, anchors_raw, csp_raw, triage_raw = await asyncio.gather(
            self._stage_core(text, pillar_code),
            self._stage_anchors(text),
            self._stage_csp_tagging(text, taxonomy),
            self._stage_dim_triage(text),
            return_exceptions=True,
        )

        # Track which "always-run" stages succeeded. The cascade only
        # stamps ``classifier_version`` when all four did — otherwise the
        # backfill picks the card up again next pass instead of leaving
        # zero/empty outputs from a transient outage as permanent truth.
        required_stages_ok = not any(
            isinstance(v, Exception)
            for v in (core_raw, anchors_raw, csp_raw, triage_raw)
        )

        core = self._unwrap(core_raw, LensCoreClassification, "core")
        anchors = self._unwrap_anchors(anchors_raw)
        csp_tuple: Tuple[List[str], List[str]] = (
            csp_raw if isinstance(csp_raw, tuple) else ([], [])
        )
        if isinstance(csp_raw, Exception):
            logger.warning("Lens stage csp_tagging failed: %s", csp_raw)
        triage = self._unwrap(triage_raw, LensTriage, "dim_triage")

        # Stage 5 — operational dims, parallel and conditional.
        dim_tasks: List[Any] = []
        if triage.needs_budget:
            dim_tasks.append(self._stage_budget(text))
        else:
            dim_tasks.append(_resolved(None))
        if triage.needs_climate:
            dim_tasks.append(self._stage_climate(text))
        else:
            dim_tasks.append(_resolved(None))
        if triage.needs_issue_tags:
            dim_tasks.append(self._stage_issue_tags(text))
        else:
            dim_tasks.append(_resolved([]))

        budget, climate, issue_tags = await asyncio.gather(
            *dim_tasks, return_exceptions=True
        )

        budget_assessment = self._coerce_dim(budget, BudgetAssessment, "budget")
        climate_assessment = self._coerce_dim(climate, ClimateAssessment, "climate")
        if isinstance(issue_tags, Exception):
            logger.warning("Lens stage issue_tags failed: %s", issue_tags)
            issue_tags = []
        elif issue_tags is None:
            issue_tags = []

        return LensClassificationResult(
            classifier_version=(
                self.classifier_version if required_stages_ok else None
            ),
            signal_type=core.signal_type,
            secondary_pillars=[
                p for p in core.secondary_pillars if p != pillar_code
            ],
            anchor_scores=anchors,
            csp_goal_ids=csp_tuple[0],
            csp_measure_ids=csp_tuple[1],
            issue_tags=issue_tags,
            budget_assessment=budget_assessment,
            climate_assessment=climate_assessment,
        )

    @staticmethod
    def now_iso() -> str:
        """ISO-8601 UTC timestamp for ``cards.classified_at``."""
        return datetime.now(timezone.utc).isoformat()

    # -- CSP taxonomy load --------------------------------------------------

    async def _load_taxonomy(self) -> _CspTaxonomy:
        if self._taxonomy is not None:
            return self._taxonomy
        async with self._taxonomy_lock:
            if self._taxonomy is not None:
                return self._taxonomy

            goals_resp = await asyncio.to_thread(
                lambda: self.supabase.table("csp_goals")
                .select("id, code, name")
                .order("display_order")
                .execute()
            )
            measures_resp = await asyncio.to_thread(
                lambda: self.supabase.table("csp_measures")
                .select("id, code, name")
                .order("display_order")
                .execute()
            )

            goals = goals_resp.data or []
            measures = measures_resp.data or []

            goal_by_code = {g["code"]: g["id"] for g in goals if g.get("code")}
            measure_by_code = {
                m["code"]: m["id"] for m in measures if m.get("code")
            }

            goals_block = "\n".join(
                f"  {g['code']} — {g['name']}" for g in goals if g.get("code")
            ) or "  (none seeded)"
            measures_block = "\n".join(
                f"  {m['code']} — {m['name']}" for m in measures if m.get("code")
            ) or "  (none seeded)"

            self._taxonomy = _CspTaxonomy(
                goal_by_code=goal_by_code,
                measure_by_code=measure_by_code,
                goals_block=goals_block,
                measures_block=measures_block,
            )
            logger.info(
                "Loaded CSP taxonomy: %d goals, %d measures",
                len(goal_by_code),
                len(measure_by_code),
            )
            return self._taxonomy

    # -- Stage 1: Core ------------------------------------------------------

    @with_retry()
    async def _stage_core(
        self, text: str, primary_pillar: Optional[str]
    ) -> LensCoreClassification:
        prompt = _CORE_PROMPT.format(card_text=text[:_CORE_TEXT_LIMIT])
        if primary_pillar:
            prompt = prompt.replace(
                "(already given)", f"(already classified as: {primary_pillar})"
            )
        response = await self.client.chat.completions.create(
            model=get_chat_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=400,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="core")
        secondary = [
            code
            for code in (data.get("secondary_pillars") or [])
            if isinstance(code, str) and code in VALID_PILLAR_CODES
        ]
        signal_type = data.get("signal_type")
        if signal_type not in VALID_SIGNAL_TYPES:
            signal_type = None
        return LensCoreClassification(
            signal_type=signal_type,
            secondary_pillars=secondary,
            reasoning=str(data.get("reasoning") or "")[:300],
        )

    # -- Stage 2: Anchor scoring -------------------------------------------

    @with_retry()
    async def _stage_anchors(self, text: str) -> AnchorScores:
        prompt = _ANCHORS_PROMPT.format(card_text=text[:_MINI_TEXT_LIMIT])
        response = await self.client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=200,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="anchors")

        def _clamp(v: Any) -> int:
            try:
                return max(0, min(100, int(v)))
            except (TypeError, ValueError):
                return 0

        return AnchorScores(
            equity=_clamp(data.get("equity")),
            affordability=_clamp(data.get("affordability")),
            innovation=_clamp(data.get("innovation")),
            sustainability_resiliency=_clamp(data.get("sustainability_resiliency")),
            proactive_prevention=_clamp(data.get("proactive_prevention")),
            community_trust=_clamp(data.get("community_trust")),
        )

    # -- Stage 3: CSP tagging ----------------------------------------------

    @with_retry()
    async def _stage_csp_tagging(
        self, text: str, taxonomy: _CspTaxonomy
    ) -> Tuple[List[str], List[str]]:
        if not taxonomy.goal_by_code and not taxonomy.measure_by_code:
            return [], []

        prompt = _CSP_TAGGING_PROMPT.format(
            card_text=text[:_MINI_TEXT_LIMIT],
            goals_block=taxonomy.goals_block,
            measures_block=taxonomy.measures_block,
        )
        response = await self.client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=300,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="csp_tagging")

        goal_ids: List[str] = []
        for code in data.get("goal_codes") or []:
            uid = taxonomy.goal_by_code.get(code) if isinstance(code, str) else None
            if uid:
                goal_ids.append(uid)

        measure_ids: List[str] = []
        for code in data.get("measure_codes") or []:
            uid = taxonomy.measure_by_code.get(code) if isinstance(code, str) else None
            if uid:
                measure_ids.append(uid)

        return goal_ids, measure_ids

    # -- Stage 4: Operational-dim triage -----------------------------------

    @with_retry()
    async def _stage_dim_triage(self, text: str) -> LensTriage:
        prompt = _DIM_TRIAGE_PROMPT.format(card_text=text[:_MINI_TEXT_LIMIT])
        response = await self.client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=150,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="dim_triage")
        return LensTriage(
            needs_budget=bool(data.get("needs_budget")),
            needs_climate=bool(data.get("needs_climate")),
            needs_issue_tags=bool(data.get("needs_issue_tags")),
            reasoning=str(data.get("reasoning") or "")[:300],
        )

    # -- Stage 5a: Budget --------------------------------------------------

    @with_retry()
    async def _stage_budget(self, text: str) -> BudgetAssessment:
        prompt = _BUDGET_PROMPT.format(card_text=text[:_MINI_TEXT_LIMIT])
        response = await self.client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=300,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="budget")

        relevance = _clamp_int(data.get("relevance"), 0, 100, default=0)
        dimensions = [
            d
            for d in (data.get("dimensions") or [])
            if isinstance(d, str) and d in VALID_BUDGET_DIMENSIONS
        ]
        magnitude_band = data.get("magnitude_band")
        if magnitude_band not in VALID_BUDGET_MAGNITUDE_BANDS:
            magnitude_band = None
        cycle = data.get("cycle")
        if cycle not in VALID_BUDGET_CYCLES:
            cycle = None
        notes = (str(data.get("notes")) if data.get("notes") else None)
        if notes is not None:
            notes = notes[:500]

        return BudgetAssessment(
            relevance=relevance,
            dimensions=dimensions,
            magnitude_band=magnitude_band,
            cycle=cycle,
            notes=notes,
        )

    # -- Stage 5b: Climate -------------------------------------------------

    @with_retry()
    async def _stage_climate(self, text: str) -> ClimateAssessment:
        prompt = _CLIMATE_PROMPT.format(card_text=text[:_MINI_TEXT_LIMIT])
        response = await self.client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=300,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="climate")

        relevance = _clamp_int(data.get("relevance"), 0, 100, default=0)
        drivers = [
            d
            for d in (data.get("drivers") or [])
            if isinstance(d, str) and d in VALID_CLIMATE_DRIVERS
        ]
        horizon = data.get("horizon")
        if horizon not in VALID_CLIMATE_HORIZONS:
            horizon = None
        notes = (str(data.get("notes")) if data.get("notes") else None)
        if notes is not None:
            notes = notes[:500]

        return ClimateAssessment(
            relevance=relevance,
            drivers=drivers,
            horizon=horizon,
            notes=notes,
        )

    # -- Stage 5c: Issue tags ----------------------------------------------

    @with_retry()
    async def _stage_issue_tags(self, text: str) -> List[str]:
        prompt = _ISSUE_TAGS_PROMPT.format(card_text=text[:_MINI_TEXT_LIMIT])
        response = await self.client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_completion_tokens=150,
            timeout=REQUEST_TIMEOUT,
        )
        data = _safe_json(response.choices[0].message.content, stage="issue_tags")
        return [
            t
            for t in (data.get("tags") or [])
            if isinstance(t, str) and t in VALID_ISSUE_TAGS
        ]

    # -- Failure-mode helpers ----------------------------------------------

    def _fallback_result(self) -> LensClassificationResult:
        return LensClassificationResult(
            classifier_version=self.classifier_version,
            signal_type=None,
            secondary_pillars=[],
            anchor_scores=AnchorScores.zeros(),
            csp_goal_ids=[],
            csp_measure_ids=[],
            issue_tags=[],
            budget_assessment=None,
            climate_assessment=None,
        )

    @staticmethod
    def _unwrap(value: Any, expected_type: type, stage_name: str):
        if isinstance(value, Exception):
            logger.warning("Lens stage %s failed: %s", stage_name, value)
            if expected_type is LensCoreClassification:
                return LensCoreClassification()
            if expected_type is LensTriage:
                return LensTriage()
        if isinstance(value, expected_type):
            return value
        # Defensive — shouldn't happen.
        logger.warning(
            "Lens stage %s returned unexpected type: %s", stage_name, type(value)
        )
        if expected_type is LensCoreClassification:
            return LensCoreClassification()
        if expected_type is LensTriage:
            return LensTriage()
        return value

    @staticmethod
    def _unwrap_anchors(value: Any) -> AnchorScores:
        if isinstance(value, AnchorScores):
            return value
        if isinstance(value, Exception):
            logger.warning("Lens stage anchors failed: %s", value)
        return AnchorScores.zeros()

    @staticmethod
    def _coerce_dim(value: Any, expected_type: type, stage_name: str):
        if value is None:
            return None
        if isinstance(value, Exception):
            logger.warning("Lens stage %s failed: %s", stage_name, value)
            return None
        if isinstance(value, expected_type):
            return value
        return None


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _safe_json(content: Optional[str], *, stage: str) -> Dict[str, Any]:
    if not content:
        logger.warning("Lens stage %s returned empty body", stage)
        return {}
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        logger.warning(
            "Lens stage %s returned non-JSON body (%s): %s",
            stage,
            exc,
            content[:200],
        )
        return {}


def _clamp_int(value: Any, lo: int, hi: int, *, default: int) -> int:
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


async def _resolved(value: Any) -> Any:
    """Wrap a precomputed value in a coroutine for ``asyncio.gather``."""
    return value


__all__ = [
    "CLASSIFIER_VERSION",
    "LensClassificationService",
]
