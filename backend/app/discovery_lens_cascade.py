"""Lens classification cascade for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D11c. Owns the fire-and-forget
LLM cascade that stamps CSP / PPP lens metadata onto a freshly-created
card. Discovery fires the cascade as a task and waits on the pending
tasks set in ``finalize_run``; this module just runs one cascade for
one card.

The public entry point is ``classify_card_lens`` — it takes the
Supabase client, the ``LensClassificationService`` instance (the
caller's responsibility — kept on ``DiscoveryService`` so the per-run
cache survives), the new card id, and the card dict. Errors are
swallowed at warning level so an unclassified card never breaks the
discovery run; the admin ``/admin/classify/backfill`` endpoint is the
recovery path.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

from supabase import Client

from .lens_classification_service import LensClassificationService

logger = logging.getLogger(__name__)


async def classify_card_lens(
    supabase: Client,
    lens_service: LensClassificationService,
    card_id: str,
    card_dict: Dict[str, Any],
) -> None:
    """Run the lens cascade for a freshly-created card. Best-effort.

    Writes only LLM-derived columns; ``user_metadata`` is untouched. A
    failure here never propagates — discovery returning a card without
    lens metadata is recoverable via ``/admin/classify/backfill``.

    Args:
        supabase: Supabase client used to write the lens columns back
            onto the card.
        lens_service: The shared ``LensClassificationService`` instance.
            Kept on ``DiscoveryService`` so its CSP-taxonomy cache
            survives across cards in the same run.
        card_id: ID of the card being classified.
        card_dict: Card fields the cascade reads (name, summary,
            pillar_id, horizon, stage_id).
    """
    try:
        result = await lens_service.classify_card(card_dict)
        update = result.to_card_update()
        # Only stamp classified_at when classifier_version is set —
        # which the cascade only does when all required stages
        # succeeded. On partial failure, leave timestamps null so the
        # backfill picks the card up again next pass.
        if update.get("classifier_version") is not None:
            update["classified_at"] = lens_service.now_iso()
        await asyncio.to_thread(
            lambda: supabase.table("cards")
            .update(update)
            .eq("id", card_id)
            .execute()
        )
        logger.debug("Lens cascade complete for card %s", card_id)
    except Exception as exc:
        logger.warning("Lens cascade failed for card %s: %s", card_id, exc)
