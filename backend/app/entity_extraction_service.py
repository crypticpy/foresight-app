"""Concept-tag extraction for Pattern Detection v2.

This is the first half of the entity pipeline. Given a card or source's
text, the service asks ``gpt-5.4-mini`` to return a structured tag list
shaped like::

    [
      {
        "canonical": "agentic AI",
        "aliases": ["AI agents", "autonomous AI"],
        "type": "tech",
        "salience": 0.8,
        "stance": "neutral"
      },
      ...
    ]

It then persists two things:

1. ``concept_tags`` + ``concept_tags_version`` on the parent row (cards in
   PR-1; sources in PR-2). The JSONB write is the source of truth.
2. Rows in ``entity_mentions`` carrying the **extracted** canonical name
   and type plus all denormalized columns (pillar, salience, stance,
   item_created_at). ``entity_id`` is left ``NULL`` here on purpose —
   ``entity_reconciliation_service.reconcile_pending`` fills it in a
   second pass so a backfill of N items only spends N LLM-mini calls in
   this stage instead of 2N (the embedding for reconciliation is a
   separate, cheaper call we can batch).

Design notes:

- **No fastapi imports.** This module is exercised by the worker, by the
  ``backfill_entity_tags_cards`` script, and (eventually) from an admin
  endpoint. It stays a plain service so all three callers share the same
  code path.
- **Idempotent on re-run.** Both the parent-row JSONB write and the
  ``entity_mentions`` upsert key off ``(item_id, item_type, canonical,
  type, prompt_version)``. Re-running the backfill is a no-op once the
  version stamp matches.
- **Parse hardening.** The parser tolerates fenced JSON, leading prose,
  and oversized tag lists — same surface we hardened in
  ``csp_goal_query_service._parse_query_list``.
- **Bumping the prompt version.** Increment ``EXTRACTION_PROMPT_VERSION``
  when the system prompt below changes. Reconciliation and detection are
  both scoped on ``prompt_version`` so a bump produces a parallel
  vocabulary and the detector can keep running on the old version until
  backfill catches up.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Iterable

from openai import AsyncOpenAI

from app.deps import supabase as default_supabase
from app.openai_provider import (
    get_chat_mini_deployment,
    openai_async_client as default_openai_client,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Knobs
# ---------------------------------------------------------------------------

EXTRACTION_PROMPT_VERSION = "v1"

# Tag-list bounds. Cards routinely span 3-6 real concepts; capping at 8
# keeps the LLM from inventing trailing filler. Minimum of 0 (an item can
# legitimately have no concept tags — e.g. a short notice) so we never
# fail the row over an empty list.
MAX_TAGS = 8

# Bounds on each field. Canonical names get clamped because we use them
# as a join key; pathologically long strings would blow up indexes.
MAX_CANONICAL_LEN = 80
MAX_ALIAS_LEN = 80
MAX_ALIASES_PER_TAG = 6

# Truncation budgets per source field — picked to keep one card's prompt
# around ~1.5k tokens of input, comfortable on gpt-5.4-mini.
MAX_NAME_CHARS = 200
MAX_SUMMARY_CHARS = 1000
MAX_DESCRIPTION_CHARS = 1500

VALID_TYPES = {
    "person", "org", "program", "tech", "place", "policy", "event", "other",
}
VALID_STANCES = {"support", "oppose", "neutral", "unknown"}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ConceptTagInput:
    """The minimum payload the extractor needs to tag one item.

    ``item_type`` discriminates between cards and sources for the
    downstream ``entity_mentions`` write. ``pillar_id`` is denormalized
    here so reconciliation/detection don't have to re-join cards on every
    scan. ``item_created_at`` is required: the detector windows on it,
    and pulling it from ``cards.created_at`` keeps backfill cheap.
    """

    item_id: str
    item_type: str  # 'card' | 'source'
    name: str
    summary: str | None
    description: str | None
    pillar_id: str | None
    item_created_at: str  # ISO-8601


@dataclass(frozen=True)
class ConceptTag:
    """One tag emitted by the LLM after validation/normalization."""

    canonical: str
    aliases: tuple[str, ...]
    type: str
    salience: float
    stance: str

    def to_jsonb(self) -> dict[str, Any]:
        return {
            "canonical": self.canonical,
            "aliases": list(self.aliases),
            "type": self.type,
            "salience": self.salience,
            "stance": self.stance,
        }


@dataclass(frozen=True)
class ExtractionResult:
    item_id: str
    item_type: str
    tags: tuple[ConceptTag, ...]
    prompt_version: str

    @property
    def is_empty(self) -> bool:
        return not self.tags


class ConceptTagExtractionError(RuntimeError):
    """LLM response could not be parsed into a usable tag list."""


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------


def _system_prompt() -> str:
    return (
        "You extract structured concept tags from a strategic-intelligence "
        "signal for a municipal-government foresight system. Each tag is a "
        "reusable canonical concept that downstream pattern detection can "
        "count across many cards and sources.\n\n"
        "RULES\n"
        "1. Return ONLY a JSON array of objects — no preamble, no trailing "
        "prose, no markdown fences.\n"
        "2. Each object has exactly these keys: canonical, aliases, type, "
        "salience, stance.\n"
        "3. canonical is the short, reusable form of the concept. Prefer "
        "specific over generic ('agentic AI' over 'AI', 'LIHTC' over "
        "'housing funding'). Use the form a domain practitioner would write.\n"
        "4. aliases is a list of the surface forms used IN THIS TEXT for "
        "the same concept. Empty list if the canonical is the only form.\n"
        "5. type is one of: person, org, program, tech, place, policy, "
        "event, other.\n"
        "6. salience is a float 0.0-1.0 — how central this concept is to "
        "the signal's argument. A card *about* the concept scores ~0.8-1.0; "
        "a passing mention scores ~0.1-0.3.\n"
        "7. stance is one of: support, oppose, neutral, unknown. Use "
        "neutral for descriptive content and unknown when the text doesn't "
        "take a position.\n"
        "8. Skip filler ('City of Austin', 'policy', 'innovation'). Skip "
        "boilerplate municipal actors unless they're load-bearing to the "
        "signal.\n"
        f"9. Return at most {MAX_TAGS} tags. Fewer is fine; quality over "
        "quantity.\n"
        "10. If the text is too short or generic to extract any reusable "
        "concept, return []."
    )


def _user_prompt(item: ConceptTagInput) -> str:
    name = (item.name or "").strip()[:MAX_NAME_CHARS] or "(no title)"
    summary = (item.summary or "").strip()[:MAX_SUMMARY_CHARS]
    description = (item.description or "").strip()[:MAX_DESCRIPTION_CHARS]

    blocks = [f"Title: {name}"]
    if summary:
        blocks.append(f"Summary: {summary}")
    if description:
        blocks.append(f"Description: {description}")
    blocks.append(
        f"\nExtract {MAX_TAGS} or fewer concept tags as JSON array. "
        "If nothing is extractable, return []."
    )
    return "\n".join(blocks)


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _clamp_str(value: Any, max_len: int) -> str:
    text = str(value or "").strip()
    if len(text) > max_len:
        text = text[:max_len].rstrip()
    return text


def _parse_concept_tags(raw: str | None) -> list[ConceptTag]:
    """Coerce an LLM response into ``list[ConceptTag]``.

    Tolerates the same failure shapes as ``csp_goal_query_service``: fenced
    JSON, prose preamble, oversized fields. An **empty list is a legal
    response** (the item just has no reusable concepts) so we do NOT raise
    on `[]`. We *do* raise on unparseable garbage so the caller can decide
    whether to retry or skip.
    """
    if raw is None:
        raise ConceptTagExtractionError("empty LLM response")

    cleaned = _FENCE_RE.sub("", raw.strip()).strip()
    if not cleaned:
        raise ConceptTagExtractionError("empty LLM response after fence strip")

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start == -1 or end <= start:
            raise ConceptTagExtractionError(
                f"unparseable response: {exc}"
            ) from exc
        try:
            parsed = json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc2:
            raise ConceptTagExtractionError(
                f"unparseable response after slice: {exc2}"
            ) from exc2

    if not isinstance(parsed, list):
        raise ConceptTagExtractionError("response was not a JSON array")

    out: list[ConceptTag] = []
    seen_canonicals: set[str] = set()
    for entry in parsed:
        if not isinstance(entry, dict):
            continue

        canonical = _clamp_str(entry.get("canonical"), MAX_CANONICAL_LEN)
        if not canonical:
            continue
        key = canonical.lower()
        if key in seen_canonicals:
            continue

        entity_type = str(entry.get("type") or "").strip().lower()
        if entity_type not in VALID_TYPES:
            entity_type = "other"

        # aliases: list of strings, deduped against canonical and each
        # other (case-folded), clamped to MAX_ALIASES_PER_TAG.
        aliases_raw = entry.get("aliases") or []
        aliases: list[str] = []
        alias_keys: set[str] = {key}
        if isinstance(aliases_raw, list):
            for alias in aliases_raw:
                if not isinstance(alias, str):
                    continue
                clean = _clamp_str(alias, MAX_ALIAS_LEN)
                if not clean:
                    continue
                ak = clean.lower()
                if ak in alias_keys:
                    continue
                alias_keys.add(ak)
                aliases.append(clean)
                if len(aliases) >= MAX_ALIASES_PER_TAG:
                    break

        # salience: clamp into [0, 1]. Default to 0.5 if missing or
        # garbage — the LLM rarely omits this but if it does, neutral.
        try:
            salience = float(entry.get("salience", 0.5))
        except (TypeError, ValueError):
            salience = 0.5
        if salience < 0.0:
            salience = 0.0
        elif salience > 1.0:
            salience = 1.0

        stance = str(entry.get("stance") or "").strip().lower()
        if stance not in VALID_STANCES:
            stance = "unknown"

        out.append(ConceptTag(
            canonical=canonical,
            aliases=tuple(aliases),
            type=entity_type,
            salience=salience,
            stance=stance,
        ))
        seen_canonicals.add(key)
        if len(out) >= MAX_TAGS:
            break

    return out


# ---------------------------------------------------------------------------
# LLM call
# ---------------------------------------------------------------------------


async def _call_llm(
    item: ConceptTagInput, *, openai_client: AsyncOpenAI
) -> str | None:
    response = await openai_client.chat.completions.create(
        model=get_chat_mini_deployment(),
        messages=[
            {"role": "system", "content": _system_prompt()},
            {"role": "user", "content": _user_prompt(item)},
        ],
        # MAX_TAGS=8 tags × ~80 tokens/tag (canonical, aliases, type,
        # salience, stance) + JSON overhead = ~800. 1024 is a comfortable
        # ceiling that still bounds spend.
        max_completion_tokens=1024,
    )
    if not response.choices:
        return None
    msg = response.choices[0].message
    return getattr(msg, "content", None)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _mentions_rows(
    item: ConceptTagInput, tags: Iterable[ConceptTag]
) -> list[dict[str, Any]]:
    """Build the entity_mentions payload for an item.

    entity_id is intentionally absent — reconciliation fills it.
    story_cluster_id / sqi are NULL for cards (PR-1) and populated for
    sources in PR-2.
    """
    return [
        {
            "canonical_name": tag.canonical,
            "entity_type": tag.type,
            "item_id": item.item_id,
            "item_type": item.item_type,
            "pillar_id": item.pillar_id,
            "stance": tag.stance,
            "salience": tag.salience,
            "item_created_at": item.item_created_at,
            "prompt_version": EXTRACTION_PROMPT_VERSION,
        }
        for tag in tags
    ]


async def _persist_card_tags(
    item: ConceptTagInput,
    tags: list[ConceptTag],
    *,
    supabase: Any,
) -> None:
    """Two-phase write: (1) mentions rows, then (2) parent JSONB.

    Order matters. If the JSONB write succeeded but the mentions insert
    failed, the next backfill pass would skip the card (version matches)
    and the mention rows would be lost forever. Writing mentions first
    means a partial failure leaves the card without a version stamp, so
    the next pass retries and the unique index swallows the duplicates.
    """
    mention_rows = _mentions_rows(item, tags)
    jsonb_payload = [tag.to_jsonb() for tag in tags]

    def write_mentions() -> None:
        if not mention_rows:
            return
        # upsert on the natural-key unique index so re-runs are idempotent.
        (
            supabase.table("entity_mentions")
            .upsert(
                mention_rows,
                on_conflict="item_id,item_type,canonical_name,entity_type,prompt_version",
            )
            .execute()
        )

    def write_card() -> None:
        if item.item_type != "card":
            # PR-2 will add the source branch; refuse silently here so a
            # mis-wired caller fails loud at write time rather than later.
            raise ValueError(
                f"entity_extraction_service PR-1 only handles cards; "
                f"got item_type={item.item_type!r}"
            )
        (
            supabase.table("cards")
            .update({
                "concept_tags": jsonb_payload,
                "concept_tags_version": EXTRACTION_PROMPT_VERSION,
            })
            .eq("id", item.item_id)
            .execute()
        )

    await asyncio.to_thread(write_mentions)
    await asyncio.to_thread(write_card)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def extract_for_item(
    item: ConceptTagInput,
    *,
    supabase: Any | None = None,
    openai_client: AsyncOpenAI | None = None,
) -> ExtractionResult:
    """Extract concept tags for one item and persist.

    Returns the parsed tags. Raises ``ConceptTagExtractionError`` if the
    LLM response is unparseable — callers (the backfill, the worker hook
    in PR-2) decide whether to skip, retry, or fail.

    A successful call with **zero** tags is fine: we still stamp the
    parent row's ``concept_tags_version`` so the next backfill pass
    doesn't keep re-trying empty items.
    """
    sb = supabase if supabase is not None else default_supabase
    oc = openai_client if openai_client is not None else default_openai_client

    raw = await _call_llm(item, openai_client=oc)
    tags = _parse_concept_tags(raw)

    await _persist_card_tags(item, tags, supabase=sb)

    return ExtractionResult(
        item_id=item.item_id,
        item_type=item.item_type,
        tags=tuple(tags),
        prompt_version=EXTRACTION_PROMPT_VERSION,
    )
