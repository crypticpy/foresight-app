"""Lens architecture metadata models.

Pydantic shapes for the per-card metadata introduced in
`docs/18_FEATURE_Lens_Architecture.md` and the schema migration
`20260507000006_lens_architecture_schema.sql`:

- ``AnchorScores``         — `cards.anchor_scores` JSONB
- ``BudgetAssessment``     — `cards.budget_assessment` JSONB
- ``ClimateAssessment``    — `cards.climate_assessment` JSONB
- ``UserMetadata``         — `cards.user_metadata` JSONB (the user-edit layer)
- ``LensTriage``           — Stage 4 cascade output (in-memory, not stored)
- ``LensCoreClassification`` — Stage 1 cascade output (in-memory)
- ``LensClassificationResult`` — full cascade output, persisted as a bundle

These are validation/serialization shapes only. The cascade itself lives in
``backend/app/lens_classification_service.py``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# ---------------------------------------------------------------------------
# Closed vocabularies
# ---------------------------------------------------------------------------

VALID_PILLAR_CODES = {"CH", "EW", "HG", "HH", "MC", "PS"}

VALID_SIGNAL_TYPES = {"trend", "driver", "signal"}

VALID_ANCHOR_CODES = (
    "equity",
    "affordability",
    "innovation",
    "sustainability_resiliency",
    "proactive_prevention",
    "community_trust",
)

# Lifted from the PPP driver seed (`20260506000002_ppp_seed.sql`) — the lens
# architecture is explicit that `issue_tags` supersedes per-driver hardcoding.
# Adding a new tag belongs in this list, not as a free-form column value.
VALID_ISSUE_TAGS = {
    # People
    "cost_of_living",
    "behavioral_health_homelessness",
    "youth_family_needs",
    "equity_expectations",
    # Place
    "climate_change",
    "aging_infrastructure",
    "energy_transition",
    "housing_landuse_pressure",
    # Partnerships
    "state_federal_preemption",
    "regional_interdependence",
    "grant_funding",
    "civic_trust",
    "economic_competitiveness",
}

VALID_BUDGET_DIMENSIONS = {"capex", "opex", "revenue", "staffing", "grants"}
VALID_BUDGET_MAGNITUDE_BANDS = {
    "<$100K",
    "$100K-$1M",
    "$1M-$10M",
    "$10M-$100M",
    ">$100M",
}
VALID_BUDGET_CYCLES = {"FY26", "FY27", "FY28", "biennial", "one-time", "ongoing"}

VALID_CLIMATE_DRIVERS = {
    "extreme_heat",
    "drought",
    "flooding",
    "wildfire",
    "winter_storm",
    "air_quality",
    "sea_level_rise",  # not Austin-relevant but harmless to include
    "energy_grid",
    "water_supply",
}
VALID_CLIMATE_HORIZONS = {"now", "short", "medium", "long"}


# ---------------------------------------------------------------------------
# Anchor scores
# ---------------------------------------------------------------------------


class AnchorScores(BaseModel):
    """Six 0-100 scores against the CSP Strategic Anchors.

    Stored at ``cards.anchor_scores``. Scores are cheap to compute on a mini
    model and drive the "By Anchor" lens.
    """

    model_config = ConfigDict(extra="forbid")

    equity: int = Field(ge=0, le=100)
    affordability: int = Field(ge=0, le=100)
    innovation: int = Field(ge=0, le=100)
    sustainability_resiliency: int = Field(ge=0, le=100)
    proactive_prevention: int = Field(ge=0, le=100)
    community_trust: int = Field(ge=0, le=100)

    @classmethod
    def zeros(cls) -> "AnchorScores":
        """Construct a zero-score baseline (used for parse failures)."""
        return cls(
            equity=0,
            affordability=0,
            innovation=0,
            sustainability_resiliency=0,
            proactive_prevention=0,
            community_trust=0,
        )


# ---------------------------------------------------------------------------
# Operational dimensions
# ---------------------------------------------------------------------------


class BudgetAssessment(BaseModel):
    """Budget operational dimension. Drives the Budget Book lens.

    Stored at ``cards.budget_assessment``. ``relevance`` 0-100 is the
    triage gate; cards below ~40 typically have empty ``dimensions``.
    """

    model_config = ConfigDict(extra="forbid")

    relevance: int = Field(ge=0, le=100)
    dimensions: List[str] = Field(default_factory=list)
    magnitude_band: Optional[str] = None
    cycle: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("dimensions")
    @classmethod
    def _validate_dimensions(cls, value: List[str]) -> List[str]:
        bad = [d for d in value if d not in VALID_BUDGET_DIMENSIONS]
        if bad:
            raise ValueError(
                f"Invalid budget dimension(s): {bad}. "
                f"Valid: {sorted(VALID_BUDGET_DIMENSIONS)}"
            )
        return value

    @field_validator("magnitude_band")
    @classmethod
    def _validate_magnitude_band(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_BUDGET_MAGNITUDE_BANDS:
            raise ValueError(
                f"Invalid magnitude_band {value!r}. "
                f"Valid: {sorted(VALID_BUDGET_MAGNITUDE_BANDS)}"
            )
        return value

    @field_validator("cycle")
    @classmethod
    def _validate_cycle(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_BUDGET_CYCLES:
            raise ValueError(
                f"Invalid cycle {value!r}. Valid: {sorted(VALID_BUDGET_CYCLES)}"
            )
        return value


class ClimateAssessment(BaseModel):
    """Climate operational dimension. Drives the Climate lens.

    Stored at ``cards.climate_assessment``. See
    ``docs/13_FEATURE_Climate_Overlay.md`` for the geo-overlay shape that
    layers on top of this assessment when geo data lands.
    """

    model_config = ConfigDict(extra="forbid")

    relevance: int = Field(ge=0, le=100)
    drivers: List[str] = Field(default_factory=list)
    horizon: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("drivers")
    @classmethod
    def _validate_drivers(cls, value: List[str]) -> List[str]:
        bad = [d for d in value if d not in VALID_CLIMATE_DRIVERS]
        if bad:
            raise ValueError(
                f"Invalid climate driver(s): {bad}. "
                f"Valid: {sorted(VALID_CLIMATE_DRIVERS)}"
            )
        return value

    @field_validator("horizon")
    @classmethod
    def _validate_horizon(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_CLIMATE_HORIZONS:
            raise ValueError(
                f"Invalid climate horizon {value!r}. "
                f"Valid: {sorted(VALID_CLIMATE_HORIZONS)}"
            )
        return value


# ---------------------------------------------------------------------------
# User metadata layer
# ---------------------------------------------------------------------------


USER_METADATA_OVERRIDE_KEYS = {"anchor_scores", "signal_type"}
USER_METADATA_ARRAY_KEYS = {"secondary_pillars", "issue_tags"}


class UserMetadata(BaseModel):
    """User-driven layer on top of LLM-derived metadata.

    Stored at ``cards.user_metadata``. **Re-classification never overwrites
    this object.** Effective values are computed at read time:

    - Scalar fields:   ``overrides[field] ?? llm_value[field]``
    - Object fields:   per-key override (e.g. anchor_scores)
    - Array fields:    ``(llm_value ∪ added[field]) - removed[field]``

    Inner keys are restricted to a closed vocabulary so a write of
    ``removed.csp_goal_ids`` (interpreted by ``effective_array`` for *any*
    field name) can't be used to hide LLM-derived values from other readers.
    """

    model_config = ConfigDict(extra="forbid")

    overrides: Dict[str, Any] = Field(default_factory=dict)
    added: Dict[str, List[str]] = Field(default_factory=dict)
    removed: Dict[str, List[str]] = Field(default_factory=dict)

    @field_validator("overrides")
    @classmethod
    def _validate_override_keys(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        bad = sorted(k for k in value if k not in USER_METADATA_OVERRIDE_KEYS)
        if bad:
            raise ValueError(
                f"Unsupported override key(s): {bad}. "
                f"Allowed: {sorted(USER_METADATA_OVERRIDE_KEYS)}"
            )
        return value

    @field_validator("added", "removed")
    @classmethod
    def _validate_array_keys(cls, value: Dict[str, List[str]]) -> Dict[str, List[str]]:
        bad = sorted(k for k in value if k not in USER_METADATA_ARRAY_KEYS)
        if bad:
            raise ValueError(
                f"Unsupported array-overlay key(s): {bad}. "
                f"Allowed: {sorted(USER_METADATA_ARRAY_KEYS)}"
            )
        return value

    @classmethod
    def empty(cls) -> "UserMetadata":
        return cls()

    def is_empty(self) -> bool:
        return not (self.overrides or self.added or self.removed)


# ---------------------------------------------------------------------------
# Cascade stage outputs (in-memory; not persisted directly)
# ---------------------------------------------------------------------------


class LensCoreClassification(BaseModel):
    """Stage 1 — core classification output (full model)."""

    model_config = ConfigDict(extra="forbid")

    signal_type: Optional[str] = None
    secondary_pillars: List[str] = Field(default_factory=list)
    reasoning: str = ""

    @field_validator("signal_type")
    @classmethod
    def _validate_signal_type(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in VALID_SIGNAL_TYPES:
            raise ValueError(
                f"Invalid signal_type {value!r}. Valid: {sorted(VALID_SIGNAL_TYPES)}"
            )
        return value

    @field_validator("secondary_pillars")
    @classmethod
    def _validate_secondary_pillars(cls, value: List[str]) -> List[str]:
        bad = [p for p in value if p not in VALID_PILLAR_CODES]
        if bad:
            raise ValueError(
                f"Invalid pillar code(s) in secondary_pillars: {bad}. "
                f"Valid: {sorted(VALID_PILLAR_CODES)}"
            )
        return value


class LensTriage(BaseModel):
    """Stage 4 — operational-dimension triage output (mini model).

    The triage decides which (mini) per-dim prompts run in stage 5. Anchors
    and CSP tagging do NOT go through triage — they always run.
    """

    model_config = ConfigDict(extra="forbid")

    needs_budget: bool = False
    needs_climate: bool = False
    needs_issue_tags: bool = False
    reasoning: str = ""


class LensClassificationResult(BaseModel):
    """Full cascade output, ready to write to the cards row.

    Built up across stages. Only LLM-derived fields appear here;
    ``user_metadata`` is read separately and merged at read time.

    ``classifier_version`` is set to the cascade's version string only
    when all required stages (core, anchors, csp, dim_triage) succeeded.
    On partial failure it stays ``None`` so the backfill worker (which
    selects ``classifier_version.is.null OR neq <current>``) re-tries the
    card on its next pass instead of treating zero/empty stage outputs as
    permanent truth.
    """

    model_config = ConfigDict(extra="forbid")

    classifier_version: Optional[str] = None
    signal_type: Optional[str] = None
    secondary_pillars: List[str] = Field(default_factory=list)
    anchor_scores: AnchorScores
    csp_goal_ids: List[str] = Field(default_factory=list)
    csp_measure_ids: List[str] = Field(default_factory=list)
    issue_tags: List[str] = Field(default_factory=list)
    budget_assessment: Optional[BudgetAssessment] = None
    climate_assessment: Optional[ClimateAssessment] = None

    def to_card_update(self) -> Dict[str, Any]:
        """Project to the dict shape expected by ``cards`` UPDATE.

        Pydantic objects are serialized to plain dicts so Supabase JSONB
        accepts them. ``classified_at`` is left to the caller (the cascade
        sets it to ``datetime.now(timezone.utc).isoformat()`` on success).
        """
        return {
            "classifier_version": self.classifier_version,
            "signal_type": self.signal_type,
            "secondary_pillars": self.secondary_pillars,
            "anchor_scores": self.anchor_scores.model_dump(),
            "csp_goal_ids": self.csp_goal_ids,
            "csp_measure_ids": self.csp_measure_ids,
            "issue_tags": self.issue_tags,
            "budget_assessment": (
                self.budget_assessment.model_dump()
                if self.budget_assessment is not None
                else None
            ),
            "climate_assessment": (
                self.climate_assessment.model_dump()
                if self.climate_assessment is not None
                else None
            ),
        }


# ---------------------------------------------------------------------------
# Effective-value helper (used by future read paths and the tagger UI)
# ---------------------------------------------------------------------------


def effective_array(
    llm_values: List[str],
    user_metadata: UserMetadata,
    field: str,
) -> List[str]:
    """Apply user added/removed overlays to an LLM-derived array field.

    Result preserves order: LLM values first (filtered by ``removed`` and
    de-duplicated), then user-added values not already present. The JS
    counterpart in ``lens-api.ts:effectiveArray`` uses the same semantics.
    """
    removed = set(user_metadata.removed.get(field, []))
    added = user_metadata.added.get(field, [])

    out: List[str] = []
    seen: set[str] = set()
    for v in llm_values:
        if v not in removed and v not in seen:
            out.append(v)
            seen.add(v)
    for v in added:
        if v not in removed and v not in seen:
            out.append(v)
            seen.add(v)
    return out


def effective_anchor_scores(
    llm_scores: AnchorScores,
    user_metadata: UserMetadata,
) -> AnchorScores:
    """Apply per-anchor user overrides on top of LLM-derived scores."""
    overrides = user_metadata.overrides.get("anchor_scores") or {}
    if not overrides:
        return llm_scores
    base = llm_scores.model_dump()
    for code in VALID_ANCHOR_CODES:
        if code in overrides:
            try:
                base[code] = max(0, min(100, int(overrides[code])))
            except (TypeError, ValueError):
                continue
    return AnchorScores(**base)


__all__ = [
    "VALID_PILLAR_CODES",
    "VALID_SIGNAL_TYPES",
    "VALID_ANCHOR_CODES",
    "VALID_ISSUE_TAGS",
    "VALID_BUDGET_DIMENSIONS",
    "VALID_BUDGET_MAGNITUDE_BANDS",
    "VALID_BUDGET_CYCLES",
    "VALID_CLIMATE_DRIVERS",
    "VALID_CLIMATE_HORIZONS",
    "AnchorScores",
    "BudgetAssessment",
    "ClimateAssessment",
    "UserMetadata",
    "LensCoreClassification",
    "LensTriage",
    "LensClassificationResult",
    "effective_array",
    "effective_anchor_scores",
]
