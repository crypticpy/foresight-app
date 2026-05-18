"""Card creation for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D11d. Owns the per-card
write that turns a single ``ProcessedSource`` into a new ``cards`` row,
stamps the embedding, records the ``discovered`` timeline event, and
fires the lens cascade as a fire-and-forget task.

The public entry point is ``create_card_from_source`` — it takes the
Supabase client, the ``AIService`` instance, the source + run id, plus
the keyword-only run context (the triggering user id, the pending
lens-task set, the per-run lens service). Returns the new card id or
``None`` on failure.

The lens cascade is dispatched via ``asyncio.create_task`` and the
resulting task is added to ``pending_lens_tasks`` (with a done-callback
that removes it). The caller awaits the set in
``finalize_run`` — this module does not block on cascade completion.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional, Set

from supabase import Client

from .ai_service import AIService
from .discovery_cards_persistence import create_timeline_event
from .discovery_lens_cascade import classify_card_lens
from .lens_classification_service import LensClassificationService
from .research_service import ProcessedSource

logger = logging.getLogger(__name__)


# Stage number to ID mapping (matches stages table). Mirrors the value
# in ``discovery_service`` — kept locally so this module can stand on
# its own without reaching back into the orchestrator.
STAGE_NUMBER_TO_ID = {
    1: "1_concept",
    2: "2_exploring",
    3: "3_pilot",
    4: "4_proof",
    5: "5_implementing",
    6: "6_scaling",
    7: "7_mature",
    8: "8_declining",
}


# Pillar code mapping: AI codes -> Database pillar IDs. All 6 canonical
# pillar codes pass through natively. Same table as ``discovery_service``
# — see PR-D11d note above.
PILLAR_CODE_MAP = {
    "CH": "CH",
    "EW": "EW",
    "HG": "HG",
    "HH": "HH",
    "MC": "MC",
    "PS": "PS",
}


def _convert_pillar_id(ai_pillar: Optional[str]) -> Optional[str]:
    """Map an AI pillar code to its database pillar id (passthrough for canon)."""
    if not ai_pillar:
        return None
    if ai_pillar in PILLAR_CODE_MAP:
        return PILLAR_CODE_MAP[ai_pillar]
    logger.warning(f"Unknown pillar code: {ai_pillar}, using as-is")
    return ai_pillar


def _convert_goal_id(ai_goal: Optional[str]) -> Optional[str]:
    """Map AI goal ``"CH.1"`` to DB ``"CH-01"``; passthrough on malformed input."""
    if not ai_goal or "." not in ai_goal:
        return ai_goal

    parts = ai_goal.split(".")
    if len(parts) != 2:
        return ai_goal

    pillar = parts[0]
    try:
        number = int(parts[1])
        mapped_pillar = PILLAR_CODE_MAP.get(pillar, pillar)
        return f"{mapped_pillar}-{number:02d}"
    except ValueError:
        return ai_goal


async def create_card_from_source(
    supabase: Client,
    ai_service: AIService,
    source: ProcessedSource,
    run_id: str,
    *,
    triggered_by_user_id: Optional[str],
    pending_lens_tasks: Set[asyncio.Task],
    lens_service: LensClassificationService,
    confidence: Optional[float] = None,
) -> Optional[str]:
    """
    Create a new card from a processed source.

    On success: inserts the card row, stamps the embedding (reuses the
    source's embedding when available, else generates one from the
    card name + summary), records a ``discovered`` timeline event,
    and dispatches the lens-cascade task. The task is added to
    ``pending_lens_tasks`` with a self-removing done-callback so the
    caller can ``asyncio.wait`` on the set in ``finalize_run``.

    Returns the new card id, or ``None`` if the source has no
    analysis, the insert returned no row, or any exception was
    swallowed by the outer try.
    """
    if not source.analysis:
        return None

    analysis = source.analysis

    # Generate slug
    slug = analysis.suggested_card_name.lower()
    slug = "".join(c if c.isalnum() or c == " " else "" for c in slug)
    slug = "-".join(slug.split())[:50]

    # Ensure unique slug
    existing = supabase.table("cards").select("id").eq("slug", slug).execute()
    if existing.data:
        slug = f"{slug}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"

    # Convert stage number to stage_id (foreign key)
    stage_id = STAGE_NUMBER_TO_ID.get(analysis.suggested_stage, "4_proof")

    goal_id = _convert_goal_id(analysis.goals[0]) if analysis.goals else None
    try:
        now = datetime.now(timezone.utc).isoformat()
        ai_confidence = None
        if confidence is not None:
            try:
                ai_confidence = round(float(confidence), 2)
            except Exception:
                ai_confidence = None

        result = (
            supabase.table("cards")
            .insert(
                {
                    "name": analysis.suggested_card_name,
                    "slug": slug,
                    "summary": analysis.summary,
                    "horizon": analysis.horizon,
                    "stage_id": stage_id,  # Use mapped stage_id, not integer
                    "pillar_id": (
                        _convert_pillar_id(analysis.pillars[0])
                        if analysis.pillars
                        else None
                    ),
                    "goal_id": goal_id,  # Use converted goal_id
                    # Scoring (4-dimensional: Impact, Velocity, Novelty, Risk)
                    "maturity_score": int(analysis.credibility * 20),
                    "novelty_score": int(analysis.novelty * 20),
                    "impact_score": int(analysis.impact * 20),
                    "relevance_score": int(analysis.relevance * 20),
                    "velocity_score": int(
                        analysis.velocity * 10
                    ),  # 1-10 scale to 0-100
                    "risk_score": int(analysis.risk * 10),  # 1-10 scale to 0-100
                    "status": "draft",  # New cards start as draft (review queue)
                    "review_status": "pending_review",
                    "discovered_at": now,
                    "discovery_run_id": run_id,
                    "ai_confidence": ai_confidence,
                    "discovery_metadata": {
                        "source_url": source.raw.url,
                        "source_title": source.raw.title,
                        "source_name": source.raw.source_name,
                    },
                    # Note: removed discovery_source - column doesn't exist in schema
                    "created_by": triggered_by_user_id,
                    "created_at": now,
                    "updated_at": now,
                }
            )
            .execute()
        )

        if result.data:
            card_id = result.data[0]["id"]

            # Store embedding on the card for Related Trends feature
            try:
                if source.embedding:
                    supabase.table("cards").update(
                        {"embedding": source.embedding}
                    ).eq("id", card_id).execute()
                else:
                    # Generate fresh embedding from card text
                    embed_text = (
                        f"{analysis.suggested_card_name} {analysis.summary}"
                    )
                    embedding = await ai_service.generate_embedding(embed_text)
                    supabase.table("cards").update(
                        {"embedding": embedding}
                    ).eq("id", card_id).execute()
            except Exception as e:
                logger.warning(f"Failed to store embedding on card {card_id}: {e}")

            # Create timeline event
            await create_timeline_event(
                supabase,
                card_id=card_id,
                event_type="discovered",
                description="Card discovered via automated scan",
            )

            # Lens cascade — fire-and-forget. The cascade does ~5 LLM
            # round-trips (~$0.006/card); blocking would inflate the
            # discovery-run wall clock by minutes. The admin backfill
            # endpoint is the recovery path if any card slips through.
            primary_pillar_code = (
                analysis.pillars[0] if analysis.pillars else None
            )
            lens_task = asyncio.create_task(
                classify_card_lens(
                    supabase,
                    lens_service,
                    card_id,
                    {
                        "name": analysis.suggested_card_name,
                        "summary": analysis.summary,
                        "pillar_id": _convert_pillar_id(primary_pillar_code)
                        if primary_pillar_code
                        else None,
                        "horizon": analysis.horizon,
                        "stage_id": stage_id,
                    },
                )
            )
            pending_lens_tasks.add(lens_task)
            lens_task.add_done_callback(pending_lens_tasks.discard)

            return card_id

    except Exception as e:
        logger.error(f"Failed to create card: {e}")

    return None
