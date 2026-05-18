"""AI-generated strategic insights sub-router.

Endpoints
---------
* ``GET /analytics/insights`` — uses ``openai_client`` (mini tier) to
  generate strategic insights from the top-scoring active cards, with a
  24-hour cache keyed by ``(pillar_filter, insight_limit, cache_date)``.
  Cache is hash-validated against the underlying card data so trending
  shifts trigger regeneration even within the window.

This is a FastAPI sub-router with no prefix; the parent ``analytics``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

The LLM prompt and hash helper live in this file because they're only
used by this endpoint — moving them out of the parent module shrinks
the aggregator without creating a shared-module surface.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import date as date_type
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import _safe_error, get_current_user, openai_client, supabase
from app.models.analytics import InsightItem, InsightsResponse
from app.openai_provider import get_chat_mini_deployment

logger = logging.getLogger(__name__)
router = APIRouter(tags=["analytics"])


# Strategic Insights Prompt for AI Generation
INSIGHTS_GENERATION_PROMPT = """You are a strategic foresight analyst for the City of Austin municipal government.

Based on the following top emerging trends from our horizon scanning system, generate concise strategic insights for city leadership.

TRENDS DATA:
{trends_data}

For each trend, provide a strategic insight that:
1. Explains the key implications for municipal operations
2. Identifies potential opportunities or risks
3. Suggests actionable next steps for city planners

Respond with JSON:
{{
  "insights": [
    {{
      "trend_name": "Name of the trend",
      "insight": "2-3 sentence strategic insight for city leadership"
    }}
  ]
}}

Keep each insight concise (2-3 sentences) and actionable. Focus on municipal relevance."""


def _compute_card_data_hash(cards: list) -> str:
    """Compute a hash of card data to detect changes for cache invalidation."""
    data_str = "|".join(
        [
            f"{c.get('id', '')}:{c.get('velocity_score', 0)}:{c.get('impact_score', 0)}"
            for c in sorted(cards, key=lambda x: x.get("id", ""))
        ]
    )
    return hashlib.sha256(data_str.encode()).hexdigest()


@router.get("/analytics/insights", response_model=InsightsResponse)
async def get_analytics_insights(
    pillar_id: Optional[str] = Query(
        None, pattern=r"^[A-Z]{2}$", description="Filter by pillar code"
    ),
    limit: int = Query(5, ge=1, le=10, description="Number of insights to generate"),
    force_refresh: bool = Query(
        False, description="Force regeneration, bypassing cache"
    ),
    current_user: dict = Depends(get_current_user),
):
    """
    Get AI-generated strategic insights for top emerging trends.

    Returns insights for the highest-scoring active cards, optionally filtered by pillar.
    Uses OpenAI to generate strategic insights based on trend data.

    Implements 24-hour caching to avoid redundant API calls:
    - Cache key: pillar_id + limit + date
    - Cache invalidated: when top card scores change significantly
    - Force refresh: use force_refresh=true to bypass cache

    If AI service is unavailable, returns an error message with empty insights list.
    """
    try:
        # -------------------------------------------------------------------------
        # Step 1: Fetch top cards (needed for both cache check and generation)
        # -------------------------------------------------------------------------
        query = (
            supabase.table("cards")
            .select(
                "id, name, slug, summary, pillar_id, horizon, velocity_score, impact_score, relevance_score, novelty_score"
            )
            .eq("status", "active")
        )

        if pillar_id:
            query = query.eq("pillar_id", pillar_id)

        response = await asyncio.to_thread(
            lambda: query.order("velocity_score", desc=True).limit(limit * 2).execute()
        )

        if not response.data:
            return InsightsResponse(
                insights=[],
                generated_at=datetime.now(timezone.utc),
                ai_available=True,
                period_analyzed="No active cards found",
            )

        # Calculate combined scores and sort
        cards_with_scores = []
        for card in response.data:
            velocity = card.get("velocity_score") or 0
            impact = card.get("impact_score") or 0
            relevance = card.get("relevance_score") or 0
            novelty = card.get("novelty_score") or 0
            combined_score = (velocity + impact + relevance + novelty) / 4
            cards_with_scores.append({**card, "combined_score": combined_score})

        cards_with_scores.sort(key=lambda x: x["combined_score"], reverse=True)
        top_cards = cards_with_scores[:limit]

        if not top_cards:
            return InsightsResponse(
                insights=[], generated_at=datetime.now(timezone.utc), ai_available=True
            )

        # Compute hash for cache validation
        current_hash = _compute_card_data_hash(top_cards)
        top_card_ids = [c["id"] for c in top_cards]

        # -------------------------------------------------------------------------
        # Step 2: Check cache (unless force_refresh)
        # -------------------------------------------------------------------------
        if not force_refresh:
            try:
                cache_response = await asyncio.to_thread(
                    lambda: supabase.table("cached_insights")
                    .select("insights_json, generated_at, card_data_hash")
                    .eq("pillar_filter", pillar_id)
                    .eq("insight_limit", limit)
                    .eq("cache_date", date_type.today().isoformat())
                    .gt("expires_at", datetime.now(timezone.utc).isoformat())
                    .limit(1)
                    .execute()
                )

                if cache_response.data:
                    cached = cache_response.data[0]
                    # Validate cache - check if underlying data changed
                    if cached.get("card_data_hash") == current_hash:
                        logger.info(
                            f"Serving cached insights for pillar={pillar_id}, limit={limit}"
                        )
                        cached_json = cached["insights_json"]

                        # Reconstruct response from cached JSON
                        cached_insights = [
                            InsightItem(**item)
                            for item in cached_json.get("insights", [])
                        ]
                        return InsightsResponse(
                            insights=cached_insights,
                            generated_at=datetime.fromisoformat(
                                cached["generated_at"].replace("Z", "+00:00")
                            ),
                            ai_available=cached_json.get("ai_available", True),
                            period_analyzed=cached_json.get("period_analyzed"),
                            fallback_message=cached_json.get("fallback_message"),
                        )
                    else:
                        logger.info("Cache invalidated - card data changed")
            except Exception as cache_err:
                # Cache check failed - proceed to generate
                logger.warning(f"Cache lookup failed: {cache_err}")

        # -------------------------------------------------------------------------
        # Step 3: Generate new insights via AI
        # -------------------------------------------------------------------------
        start_time = datetime.now(timezone.utc)

        trends_data = "\n".join(
            [
                f"- {card['name']}: {card.get('summary', 'No summary available')[:200]} "
                f"(Pillar: {card.get('pillar_id', 'N/A')}, Horizon: {card.get('horizon', 'N/A')}, "
                f"Score: {card['combined_score']:.1f})"
                for card in top_cards
            ]
        )

        ai_available = True
        fallback_message = None
        insights = []

        try:
            prompt = INSIGHTS_GENERATION_PROMPT.format(trends_data=trends_data)

            ai_response = await asyncio.to_thread(
                lambda: openai_client.chat.completions.create(
                    model=get_chat_mini_deployment(),
                    messages=[{"role": "user", "content": prompt}],
                    response_format={"type": "json_object"},
                    max_completion_tokens=1000,
                    timeout=30,
                )
            )

            result = json.loads(ai_response.choices[0].message.content)

            for i, insight_data in enumerate(result.get("insights", [])):
                if i < len(top_cards):
                    card = top_cards[i]
                    insights.append(
                        InsightItem(
                            trend_name=insight_data.get("trend_name", card["name"]),
                            score=card["combined_score"],
                            insight=insight_data.get("insight", ""),
                            pillar_id=card.get("pillar_id"),
                            card_id=card.get("id"),
                            card_slug=card.get("slug"),
                            velocity_score=card.get("velocity_score"),
                        )
                    )

        except Exception as ai_error:
            logger.warning(f"AI insights generation failed: {str(ai_error)}")
            ai_available = False
            fallback_message = (
                "AI insights temporarily unavailable. Showing trend summaries instead."
            )

            insights = [
                InsightItem(
                    trend_name=card["name"],
                    score=card["combined_score"],
                    insight=(
                        card.get("summary", "No summary available")[:300]
                        if card.get("summary")
                        else "Strategic analysis pending."
                    ),
                    pillar_id=card.get("pillar_id"),
                    card_id=card.get("id"),
                    card_slug=card.get("slug"),
                    velocity_score=card.get("velocity_score"),
                )
                for card in top_cards
            ]

        generation_time_ms = int(
            (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
        )
        generated_at = datetime.now(timezone.utc)
        period_analyzed = f"Top {len(top_cards)} trending cards" + (
            f" in {pillar_id}" if pillar_id else ""
        )

        # -------------------------------------------------------------------------
        # Step 4: Store in cache
        # -------------------------------------------------------------------------
        try:
            cache_json = {
                "insights": [i.dict() for i in insights],
                "ai_available": ai_available,
                "period_analyzed": period_analyzed,
                "fallback_message": fallback_message,
            }

            # Upsert cache entry
            await asyncio.to_thread(
                lambda: supabase.table("cached_insights")
                .upsert(
                    {
                        "pillar_filter": pillar_id,
                        "insight_limit": limit,
                        "cache_date": date_type.today().isoformat(),
                        "insights_json": cache_json,
                        "top_card_ids": top_card_ids,
                        "card_data_hash": current_hash,
                        "ai_model_used": (
                            get_chat_mini_deployment() if ai_available else None
                        ),
                        "generation_time_ms": generation_time_ms,
                        "generated_at": generated_at.isoformat(),
                        "expires_at": (generated_at + timedelta(hours=24)).isoformat(),
                    },
                    on_conflict="pillar_filter,insight_limit,cache_date",
                )
                .execute()
            )

            logger.info(
                f"Cached insights for pillar={pillar_id}, limit={limit}, took {generation_time_ms}ms"
            )
        except Exception as cache_err:
            logger.warning(f"Failed to cache insights: {cache_err}")

        return InsightsResponse(
            insights=insights,
            generated_at=generated_at,
            ai_available=ai_available,
            period_analyzed=period_analyzed,
            fallback_message=fallback_message,
        )

    except Exception as e:
        logger.error(f"Analytics insights endpoint failed: {str(e)}")
        raise HTTPException(
            status_code=500, detail=_safe_error("analytics insights", e)
        ) from e
