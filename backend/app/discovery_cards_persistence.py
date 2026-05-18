"""Per-card persistence helpers for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D11b. Owns three of the
write-side helpers used by the cards stage:

- ``store_source_to_card`` — runs URL + embedding dedup, then inserts a
  row into ``sources`` (with optional ``duplicate_of`` for related
  matches) and fires the source-quality scorer.
- ``auto_approve_card`` — flips a card from ``pending_review`` to
  ``active`` and writes a timeline event.
- ``create_timeline_event`` — inserts a row into ``card_timeline``.

Functions are stateless — they take the Supabase client (and, where
needed, the ``AIService`` instance) as explicit arguments. Each
function catches its own exceptions and logs at warning/error level
so a single bad row cannot abort the rest of the cards-stage batch.

The orchestrator ``_create_or_enrich_cards`` and the per-card creator
``_create_card_from_source`` still live in ``discovery_service`` — they
will be extracted in subsequent PRs once the lens cascade has its own
module.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from supabase import Client

from . import domain_reputation_service
from .ai_service import AIService
from .research_service import ProcessedSource

logger = logging.getLogger(__name__)


async def create_timeline_event(
    supabase: Client,
    card_id: str,
    event_type: str,
    description: str,
    source_id: Optional[str] = None,
    metadata: Optional[Dict] = None,
) -> None:
    """Create a timeline event for a card."""
    try:
        supabase.table("card_timeline").insert(
            {
                "card_id": card_id,
                "event_type": event_type,
                "title": event_type.replace("_", " ").title(),
                "description": description,
                "triggered_by_source_id": source_id,
                "metadata": metadata or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as e:
        logger.warning(f"Failed to create timeline event: {e}")


async def auto_approve_card(supabase: Client, card_id: str) -> None:
    """
    Auto-approve a card that meets the confidence threshold.

    Flips ``status`` and ``review_status`` to ``active``, stamps
    ``auto_approved_at``, and writes a timeline event. Errors are
    logged at warning level so the rest of the cards-stage batch
    continues.

    Args:
        supabase: Supabase client
        card_id: Card to approve
    """
    try:
        supabase.table("cards").update(
            {
                "status": "active",
                "review_status": "active",
                "auto_approved_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", card_id).execute()

        await create_timeline_event(
            supabase,
            card_id=card_id,
            event_type="auto_approved",
            description="Card auto-approved based on high confidence score",
        )

    except Exception as e:
        logger.warning(f"Failed to auto-approve card {card_id}: {e}")


async def store_source_to_card(
    supabase: Client,
    ai_service: AIService,
    source: ProcessedSource,
    card_id: str,
) -> Optional[str]:
    """
    Store a processed source to a card.

    Runs embedding-based deduplication before inserting. If the source
    is a duplicate (>0.95 similarity), it is skipped. If related
    (0.85-0.95), it is stored with ``duplicate_of`` set.

    Args:
        supabase: Supabase client
        ai_service: AI service used by the dedup check for embeddings
        source: Processed source
        card_id: Target card ID

    Returns:
        Source ID or None if failed
    """
    try:
        # --- Deduplication check (URL + embedding) ---
        from app.deduplication import check_duplicate

        dedup_result = await check_duplicate(
            supabase=supabase,
            card_id=card_id,
            content=source.raw.content or "",
            url=source.raw.url or "",
            embedding=source.embedding if hasattr(source, "embedding") else None,
            ai_service=ai_service,
        )

        if dedup_result.action == "skip":
            logger.debug(
                f"Dedup: skipping duplicate source (sim={dedup_result.similarity:.4f}): "
                f"{source.raw.url[:50]}..."
            )
            return None

        # Look up domain reputation ID for this source (Task 2.7)
        _domain_reputation_id = None
        try:
            if _rep := domain_reputation_service.get_reputation(
                supabase, source.raw.url or ""
            ):
                _domain_reputation_id = _rep.get("id")
        except Exception as exc:
            # Non-fatal — source row still gets stored without rep linkage.
            logger.debug(
                "discovery: get_reputation failed for %s: %s",
                source.raw.url,
                exc,
            )

        from app.source_quality import extract_domain

        source_record = {
            "card_id": card_id,
            "url": source.raw.url,
            "title": (source.raw.title or "Untitled")[:500],
            "publication": (
                (source.raw.source_name or "")[:200]
                if source.raw.source_name
                else None
            ),
            "full_text": (
                source.raw.content[:10000] if source.raw.content else None
            ),
            "ai_summary": (source.analysis.summary if source.analysis else None),
            "key_excerpts": (
                source.analysis.key_excerpts[:5]
                if source.analysis and source.analysis.key_excerpts
                else []
            ),
            "relevance_to_card": (
                source.analysis.relevance if source.analysis else 0.5
            ),
            # Pre-print / peer-review status (Task 2.6)
            "is_peer_reviewed": (
                False
                if getattr(source.raw, "is_preprint", False)
                else (
                    True
                    if getattr(source.raw, "source_type", None) == "academic"
                    else None
                )
            ),
            "api_source": "discovery_scan",
            "domain": extract_domain(source.raw.url or ""),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }

        # If related (0.85-0.95 similarity), mark duplicate_of
        if (
            dedup_result.action == "store_as_related"
            and dedup_result.duplicate_of_id
        ):
            source_record["duplicate_of"] = dedup_result.duplicate_of_id

        # Add domain_reputation_id if available (Task 2.7)
        if _domain_reputation_id:
            source_record["domain_reputation_id"] = _domain_reputation_id

        result = supabase.table("sources").insert(source_record).execute()

        if result.data:
            source_id = result.data[0]["id"]

            # Compute and store source quality score (non-blocking)
            try:
                from app.source_quality import compute_and_store_quality_score

                compute_and_store_quality_score(
                    supabase,
                    source_id,
                    analysis=(
                        source.analysis if hasattr(source, "analysis") else None
                    ),
                    triage=source.triage if hasattr(source, "triage") else None,
                )
            except Exception as e:
                logger.warning(
                    f"Failed to compute quality score for source {source_id}: {e}"
                )

            return source_id

    except Exception as e:
        logger.error(f"Failed to store source: {e}")

    return None
