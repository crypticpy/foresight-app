"""Blocked-topic filtering for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D6. Owns the post-triage
"blocked topics" stage: fetches active blocked keywords from the
``discovery_blocks`` table and drops any processed source whose title
or summary mentions one of them. Filtered-out sources have their
``discovered_sources`` row marked ``filtered_blocked`` so the user can
see why a paid-for fetch did not become a card.

The single public function is stateless — it takes the Supabase client
and the processed sources, and it never raises: on DB error it logs a
warning and returns the inputs unchanged so the rest of the pipeline
keeps running.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, List, Tuple

from supabase import Client

from .discovery_progress import update_source_outcome

if TYPE_CHECKING:
    from .research_service import ProcessedSource

logger = logging.getLogger(__name__)


async def check_blocked_topics(
    supabase: Client,
    sources: List["ProcessedSource"],
) -> Tuple[List["ProcessedSource"], int]:
    """
    Filter out sources whose title or summary matches an active blocked
    topic from ``discovery_blocks``.

    Args:
        supabase: Supabase client
        sources: Processed sources to check

    Returns:
        Tuple of ``(filtered_sources, blocked_count)``. On DB error the
        function logs a warning and returns ``(sources, 0)`` so the
        pipeline can continue without filtering.
    """
    try:
        result = (
            supabase.table("discovery_blocks")
            .select("topic_name, block_type, keywords")
            .eq("is_active", True)
            .execute()
        )

        if not result.data:
            return sources, 0

        blocked_keywords: set = set()
        for block in result.data:
            keywords = block.get("keywords", [])
            if isinstance(keywords, list):
                blocked_keywords.update(kw.lower() for kw in keywords)
            if topic := block.get("topic_name", ""):
                blocked_keywords.add(topic.lower())

        if not blocked_keywords:
            return sources, 0

        filtered: List["ProcessedSource"] = []
        blocked_count = 0

        for source in sources:
            check_text = f"{source.raw.title} {source.analysis.summary}".lower()

            is_blocked = any(kw in check_text for kw in blocked_keywords)

            if is_blocked:
                blocked_count += 1
                logger.debug(f"Blocked source: {source.raw.title[:50]}")
                if source.discovered_source_id:
                    await update_source_outcome(
                        supabase,
                        source.discovered_source_id,
                        "filtered_blocked",
                    )
            else:
                filtered.append(source)

        return filtered, blocked_count

    except Exception as e:
        logger.warning(f"Block check failed (continuing without filtering): {e}")
        return sources, 0
