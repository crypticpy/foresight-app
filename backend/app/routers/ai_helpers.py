"""AI helper and card creation router."""

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.deps import supabase, get_current_user, _safe_error, limiter
from app.openai_provider import (
    azure_openai_client,
    get_chat_mini_deployment,
)
from app.models.card_creation import (
    CreateCardFromTopicRequest,
    CreateCardFromTopicResponse,
    ManualCardCreateRequest,
    KeywordSuggestionResponse,
)
from app.models.ai_helpers import SuggestDescriptionRequest, SuggestDescriptionResponse
from app.taxonomy import STAGE_NUMBER_TO_ID, extract_stage_number

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["ai_helpers"])


def _slugify(name: str, card_id: str) -> str:
    """Canonical base slug for a user card; falls back to the card id for
    name-less input (e.g. emoji-only topics) so the value is never empty."""
    from app.signal_agent_service import _generate_slug

    return _generate_slug(name) or card_id


async def _make_unique_slug(name: str, card_id: str) -> str:
    """Pick a readable, probably-unique ``cards.slug`` for a user-created card.

    ``cards.slug`` is UNIQUE NOT NULL with no DB default, so every insert must
    supply one — the discovery, signal-agent, research and workstream-scan paths
    all do, but these two user-facing endpoints historically did not, which
    500'd every Create-Signal submission. This pre-check produces a clean slug in
    the common case and disambiguates a known collision with a card-id fragment.

    It is intentionally *best-effort*: the read-then-write has a TOCTOU window, so
    the UNIQUE constraint — enforced by ``_insert_card_with_unique_slug`` — is the
    actual guarantee, not this function.
    """
    base = _slugify(name, card_id)
    existing = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select("id")
        .eq("slug", base)
        .limit(1)
        .execute()
    )
    if existing.data:
        return f"{base}-{card_id[:8]}"
    return base


def _is_unique_violation(e: Exception) -> bool:
    """True if a Supabase insert failed on a UNIQUE constraint (Postgres 23505)."""
    if getattr(e, "code", None) == "23505":
        return True
    msg = str(e)
    return "23505" in msg or "duplicate key value" in msg


async def _insert_card_with_unique_slug(card_data: dict, name: str):
    """Insert a card row, guaranteeing a unique ``slug`` even under concurrency.

    ``_make_unique_slug`` chooses a readable slug, but its read-then-write can't
    prevent two concurrent Create-Signal calls for the same new name from both
    passing the existence check and then colliding on the UNIQUE constraint. The
    database is the only real arbiter, so on a unique violation we retry once with
    the full card id appended — globally unique, so the retry cannot collide.
    """
    card_id = card_data["id"]
    card_data["slug"] = await _make_unique_slug(name, card_id)
    try:
        return await asyncio.to_thread(
            lambda: supabase.table("cards").insert(card_data).execute()
        )
    except Exception as e:
        if not _is_unique_violation(e):
            raise
        card_data["slug"] = f"{_slugify(name, card_id)}-{card_id}"
        logger.info(
            "Slug collision on card %s; retrying with id-suffixed slug %s",
            card_id,
            card_data["slug"],
        )
        return await asyncio.to_thread(
            lambda: supabase.table("cards").insert(card_data).execute()
        )


def _resolve_stage_id(stage: str | None) -> str:
    """Resolve a maturity-stage input to a valid ``stages`` FK id.

    The create-signal form sends a stage *number* ("1".."8"); ``cards.stage_id``
    is a FK to ``stages`` whose ids are "1_concept".."8_declining". Accept a bare
    number or a full id (via ``extract_stage_number``); anything missing or
    out-of-range falls back to Concept — the earliest stage — so a bad value can
    never 500 on the FK constraint.
    """
    stage_number = extract_stage_number(str(stage)) if stage else None
    return STAGE_NUMBER_TO_ID.get(stage_number, "1_concept")


@router.post("/cards/create-from-topic")
@limiter.limit("10/minute")
async def create_card_from_topic(
    request: Request, body: CreateCardFromTopicRequest, user=Depends(get_current_user)
):
    """Quick card creation from a topic phrase. Creates card and optionally starts background scan."""
    try:
        card_id = str(uuid.uuid4())
        card_data = {
            "id": card_id,
            "name": body.topic[:200],
            "description": f"User-created signal: {body.topic}",
            "origin": "user_created",
            "is_exploratory": not body.pillar_hints,
            "created_by": user["id"],
            "review_status": "active",
            "signal_quality_score": 0,
            "quality_breakdown": {},
        }

        if body.pillar_hints and len(body.pillar_hints) > 0:
            card_data["pillar_id"] = body.pillar_hints[0]

        if body.source_preferences:
            card_data["source_preferences"] = body.source_preferences.dict(
                exclude_none=True
            )

        result = await _insert_card_with_unique_slug(card_data, body.topic)

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create card",
            )

        # If workstream specified, add to workstream
        if body.workstream_id:
            try:
                await asyncio.to_thread(
                    lambda: supabase.table("workstream_cards")
                    .insert(
                        {
                            "workstream_id": body.workstream_id,
                            "card_id": card_id,
                            "column_name": "inbox",
                        }
                    )
                    .execute()
                )
            except Exception as ws_err:
                logger.warning(
                    f"Card {card_id} created but failed to add to workstream "
                    f"{body.workstream_id}: {str(ws_err)}"
                )

        return CreateCardFromTopicResponse(
            card_id=card_id,
            card_name=body.topic[:200],
            status="created",
            message="Card created. Sources will be discovered in the next scan cycle.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create card from topic: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card creation", e),
        ) from e


@router.post("/cards/create-manual")
@limiter.limit("10/minute")
async def create_manual_card(
    request: Request, body: ManualCardCreateRequest, user=Depends(get_current_user)
):
    """Create a card from a full manual form with all fields specified.

    Unlike the quick topic-based creation, this endpoint accepts detailed card
    metadata including pillar assignments, horizon, stage, and optional seed URLs.
    Cards created manually are marked with origin='user_created' and bypass the
    discovery pipeline.

    Args:
        body: ManualCardCreateRequest with name, description, pillars, etc.
        user: Authenticated user from JWT token.

    Returns:
        JSON with card_id, card_name, status, and message.

    Raises:
        400: Invalid request data or failed insert.
        500: Unexpected server error.
    """
    try:
        card_id = str(uuid.uuid4())

        # Determine primary pillar from the list, or None for exploratory
        primary_pillar = None
        if body.pillar_ids and len(body.pillar_ids) > 0:
            primary_pillar = body.pillar_ids[0]

        stage_id = _resolve_stage_id(body.stage)

        card_data = {
            "id": card_id,
            "name": body.name,
            "description": body.description,
            "origin": "user_created",
            "is_exploratory": body.is_exploratory or (not primary_pillar),
            "created_by": user["id"],
            "review_status": "active",
            "signal_quality_score": 0,
            "quality_breakdown": {},
            "horizon": body.horizon or "H1",
            "stage_id": stage_id,
        }

        if primary_pillar:
            card_data["pillar_id"] = primary_pillar

        if body.source_preferences:
            card_data["source_preferences"] = body.source_preferences.dict(
                exclude_none=True
            )

        result = await _insert_card_with_unique_slug(card_data, body.name)

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create card",
            )

        # Store seed URLs as sources if provided
        if body.seed_urls and len(body.seed_urls) > 0:
            for url in body.seed_urls:
                try:
                    source_data = {
                        "id": str(uuid.uuid4()),
                        "url": url,
                        "title": url,  # Placeholder title; enrichment happens later
                        "source_type": "user_submitted",
                    }
                    src_result = await asyncio.to_thread(
                        lambda: supabase.table("sources").insert(source_data).execute()
                    )
                    if src_result.data:
                        await asyncio.to_thread(
                            lambda: supabase.table("card_sources")
                            .insert(
                                {
                                    "card_id": card_id,
                                    "source_id": src_result.data[0]["id"],
                                }
                            )
                            .execute()
                        )
                except Exception as url_err:
                    logger.warning(
                        f"Card {card_id}: failed to add seed URL {url}: {url_err}"
                    )

        return {
            "card_id": card_id,
            "card_name": body.name,
            "status": "created",
            "message": "Card created successfully.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create manual card: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card creation", e),
        ) from e


@router.post("/ai/suggest-keywords")
@limiter.limit("10/minute")
async def suggest_keywords(
    request: Request, topic: str, user=Depends(get_current_user)
):
    """Suggest municipal-relevant keywords for a topic."""
    try:
        client = azure_openai_client
        response = client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a municipal government research assistant for the "
                        "City of Austin. Given a topic, suggest 5-10 search keywords "
                        "that would find relevant sources about this topic in the "
                        "context of city government operations, policy, and services. "
                        "Return ONLY a JSON array of strings."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Suggest municipal-relevant search keywords for: {topic}",
                },
            ],
            max_completion_tokens=300,
        )

        try:
            keywords = json.loads(response.choices[0].message.content)
        except (json.JSONDecodeError, IndexError):
            keywords = [topic]

        return KeywordSuggestionResponse(topic=topic, suggestions=keywords)
    except Exception as e:
        logger.error(f"Failed to suggest keywords for '{topic}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("keyword suggestion", e),
        ) from e


@router.post("/ai/suggest-description", response_model=SuggestDescriptionResponse)
@limiter.limit("10/minute")
async def suggest_description(
    request: Request,
    body: SuggestDescriptionRequest,
    user=Depends(get_current_user),
):
    """Generate a workstream description from a name, pillars, and keywords.

    Uses the mini tier for cost efficiency. Returns a 1-2 sentence professional
    description explaining what signals the workstream will track.
    """
    try:
        # Build user prompt with available context
        parts = [f"Workstream name: {body.name}"]
        if body.pillar_ids:
            pillar_labels = {
                "CH": "Community Health",
                "MC": "Mobility & Connectivity",
                "HS": "Housing & Shelter",
                "EC": "Economic Opportunity",
                "ES": "Environmental Sustainability",
                "CE": "Cultural & Educational Vitality",
                "EW": "Environmental & Water",
                "HG": "Housing & Growth",
                "HH": "Health & Human Services",
                "PS": "Public Safety",
            }
            names = [pillar_labels.get(p, p) for p in body.pillar_ids]
            parts.append(f"Strategic pillars: {', '.join(names)}")
        if body.keywords:
            parts.append(f"Keywords: {', '.join(body.keywords)}")

        user_prompt = "\n".join(parts)

        client = azure_openai_client
        response = client.chat.completions.create(
            model=get_chat_mini_deployment(),
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are helping a City of Austin strategic analyst create a "
                        "workstream description for their horizon scanning system. "
                        "Generate a clear, professional 1-2 sentence description that "
                        "explains what signals this workstream will track. Be specific "
                        "about the domain and purpose."
                    ),
                },
                {
                    "role": "user",
                    "content": user_prompt,
                },
            ],
            max_completion_tokens=150,
        )

        description = (response.choices[0].message.content or "").strip() or f"Tracks emerging signals related to {body.name}."

        return SuggestDescriptionResponse(description=description)
    except Exception as e:
        logger.error(f"Failed to suggest description for '{body.name}': {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("description suggestion", e),
        ) from e
