"""Deduplication stage for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D10. Owns Step 6 of the
run pipeline: deciding for each processed source whether it is a URL
duplicate of an existing card-source, a strong vector match to an
existing card (enrich), a weak match that needs an LLM tiebreak, or
a genuinely new concept (create).

The public entry point is ``deduplicate_sources_with_metrics`` — it
returns a ``DeduplicationResult`` plus an estimated total token count
for the LLM card-match tiebreak calls used in this stage.

Functions are stateless — they take the Supabase client and the
``AIService`` instance as explicit arguments. Per-source exceptions
are caught and logged so one failure cannot abort the rest of the
batch. Vector-search RPC failures are caught and the source falls
through as a new-concept candidate (no Python fallback in this code
path; that lived in the legacy ``_deduplicate_sources`` method which
the production pipeline does not use).
"""

from __future__ import annotations

import asyncio
import logging
from typing import List, Tuple

from supabase import Client

from .ai_service import AIService
from .discovery_config import DiscoveryConfig
from .discovery_result_types import DeduplicationResult
from .research_service import ProcessedSource

logger = logging.getLogger(__name__)


async def deduplicate_sources_with_metrics(
    supabase: Client,
    ai_service: AIService,
    sources: List[ProcessedSource],
    config: DiscoveryConfig,
) -> Tuple[DeduplicationResult, int]:
    """
    Deduplicate processed sources against existing cards with token
    usage tracking.

    For each source: first check the ``sources`` table for an exact
    URL match and skip if found; otherwise call the
    ``find_similar_cards`` RPC for the top 3 vector neighbours.
    Sources whose top-neighbour similarity is ≥
    ``config.similarity_threshold`` go straight to the enrichment
    list; sources between ``weak_match_threshold`` and
    ``similarity_threshold`` are tiebroken by an LLM check; sources
    below both thresholds fall through as new-concept candidates.

    Returns ``(DeduplicationResult, estimated_total_tokens)``.
    """
    unique_sources: List[ProcessedSource] = []
    duplicate_count = 0
    enrichment_candidates: List[Tuple[ProcessedSource, str, float]] = []
    new_concept_candidates: List[ProcessedSource] = []
    total_tokens = 0

    for source in sources:
        try:
            # Check for existing URL first. supabase-py is sync; running
            # .execute() directly here would block the event loop for the
            # length of the round-trip — once per source. Push every
            # Supabase call in this loop off-loop so the worker heartbeat
            # and other concurrent tasks (gather'd lens cascades, brief
            # generation) keep ticking.
            url_check = await asyncio.to_thread(
                lambda src=source: supabase.table("sources")
                .select("id")
                .eq("url", src.raw.url)
                .execute()
            )

            if url_check.data:
                duplicate_count += 1
                continue

            # Vector similarity search against existing cards
            try:
                match_result = await asyncio.to_thread(
                    lambda src=source: supabase.rpc(
                        "find_similar_cards",
                        {
                            "query_embedding": src.embedding,
                            "match_threshold": config.weak_match_threshold,
                            "match_count": 3,
                        },
                    ).execute()
                )

                if match_result.data:
                    top_match = match_result.data[0]
                    similarity = top_match.get("similarity", 0)

                    if similarity >= config.similarity_threshold:
                        # Strong match - enrich existing card
                        enrichment_candidates.append(
                            (source, top_match["id"], similarity)
                        )
                    elif similarity >= config.weak_match_threshold:
                        # Weak match - use LLM to decide
                        card = await asyncio.to_thread(
                            lambda match_id=top_match["id"]: supabase.table(
                                "cards"
                            )
                            .select("name, summary")
                            .eq("id", match_id)
                            .single()
                            .execute()
                        )

                        if card.data:
                            decision = await ai_service.check_card_match(
                                source_summary=source.analysis.summary,
                                source_card_name=source.analysis.suggested_card_name,
                                existing_card_name=card.data["name"],
                                existing_card_summary=card.data.get("summary", ""),
                            )
                            # Estimate tokens for card match check
                            input_text = f"{source.analysis.summary} {source.analysis.suggested_card_name} {card.data['name']} {card.data.get('summary', '')}"
                            total_tokens += (
                                len(input_text) // 4 + 100
                            )  # input + output estimate

                            if (
                                decision.get("is_match")
                                and decision.get("confidence", 0) > 0.7
                            ):
                                enrichment_candidates.append(
                                    (source, top_match["id"], similarity)
                                )
                            else:
                                new_concept_candidates.append(source)
                        else:
                            new_concept_candidates.append(source)
                    else:
                        new_concept_candidates.append(source)
                else:
                    new_concept_candidates.append(source)

            except Exception as e:
                # Vector search failed - treat as new concept
                logger.warning(f"Vector search failed (treating as new): {e}")
                new_concept_candidates.append(source)

            unique_sources.append(source)

        except Exception as e:
            logger.warning(f"Deduplication failed for {source.raw.url}: {e}")
            continue

    return (
        DeduplicationResult(
            unique_sources=unique_sources,
            duplicate_count=duplicate_count,
            enrichment_candidates=enrichment_candidates,
            new_concept_candidates=new_concept_candidates,
        ),
        total_tokens,
    )
