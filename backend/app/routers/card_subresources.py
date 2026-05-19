"""Card sub-resource router -- sources, timeline, history, related, follow, notes, assets, velocity."""

import asyncio
import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.deps import supabase, get_current_user, _safe_error
from app.supabase_in_guard import SAFE_IN_LIMIT, chunked_in_query
from app.supabase_retry import execute_with_h2_retry
from app.models.history import (
    ScoreHistory,
    ScoreHistoryResponse,
    StageHistory,
    StageHistoryList,
    RelatedCard,
    RelatedCardsList,
)
from app.models.workstream import Note, NoteCreate, PinSignalResponse
from app.models.assets import CardAsset, CardAssetsResponse
from app.models.card_followers import CardFollowerResponse, FollowToggleResponse
from app.card_artifacts import (
    enrich_cards_with_collab,
    get_card_artifacts,
    get_followed_card_ids,
    get_follower_counts,
)

logger = logging.getLogger(__name__)

# Cap for batch endpoints. Anything bigger usually indicates a paginated UI
# bug; reject explicitly instead of silently dropping ids.
BATCH_CARD_ID_LIMIT = 250

router = APIRouter(prefix="/api/v1", tags=["card-subresources"])


# ============================================================================
# Entity models
# ============================================================================


class EntityItem(BaseModel):
    id: str
    name: str
    entity_type: str
    context: Optional[str] = None
    source_id: Optional[str] = None
    canonical_name: Optional[str] = None
    created_at: str


class EntityListResponse(BaseModel):
    entities: List[EntityItem]
    total_count: int
    card_id: str


class CardIdsRequest(BaseModel):
    # Validated as UUIDs so non-UUID input (e.g. slugs leaking through from the
    # frontend) fails with a clean 422 instead of bubbling to Postgres and
    # surfacing as a 500 on the `cards.id` uuid column.
    card_ids: List[UUID]


# ============================================================================
# Card relationships / sources / timeline
# ============================================================================


@router.get("/cards/{card_id}/sources")
async def get_card_sources(
    card_id: str, current_user: dict = Depends(get_current_user)
):
    """Get sources for a card"""
    response = (
        supabase.table("sources")
        .select("*")
        .eq("card_id", card_id)
        .order("relevance_score", desc=True)
        .execute()
    )
    return response.data


@router.get("/cards/{card_id}/timeline")
async def get_card_timeline(
    card_id: str, current_user: dict = Depends(get_current_user)
):
    """Get timeline for a card"""
    response = (
        supabase.table("card_timeline")
        .select("*")
        .eq("card_id", card_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data


@router.get("/cards/{card_id}/entities", response_model=EntityListResponse)
async def get_card_entities(
    card_id: str,
    entity_type: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    """
    Get entities extracted from a card's sources.

    Returns entities (technologies, organizations, concepts, people, locations)
    associated with the given card, optionally filtered by entity type.

    Args:
        card_id: UUID of the card to get entities for
        entity_type: Optional filter by entity type (technology, organization,
                     concept, person, location)
        limit: Maximum number of entities to return (default: 50)

    Returns:
        EntityListResponse with list of entities and metadata
    """
    # First verify the card exists
    card_response = supabase.table("cards").select("id").eq("id", card_id).execute()
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    # Build query for entities
    query = (
        supabase.table("entities")
        .select("id, name, entity_type, context, source_id, canonical_name, created_at")
        .eq("card_id", card_id)
    )

    # Apply optional entity_type filter
    if entity_type:
        query = query.eq("entity_type", entity_type)

    # Execute query ordered by name, with limit
    response = query.order("name").limit(limit).execute()

    # Convert to EntityItem models
    entities = (
        [EntityItem(**record) for record in response.data] if response.data else []
    )

    return EntityListResponse(
        entities=entities,
        total_count=len(entities),
        card_id=card_id,
    )


@router.get("/cards/{card_id}/score-history", response_model=ScoreHistoryResponse)
async def get_card_score_history(
    card_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get historical score data for a card to enable trend visualization.

    Returns a list of score snapshots ordered by recorded_at (most recent first),
    containing all 7 score dimensions (maturity, velocity, novelty, impact,
    relevance, risk, opportunity) for each timestamp.

    Args:
        card_id: UUID of the card to get score history for
        start_date: Optional filter to get records from this date onwards
        end_date: Optional filter to get records up to this date

    Returns:
        ScoreHistoryResponse with list of ScoreHistory records and metadata
    """
    # First verify the card exists
    card_response = supabase.table("cards").select("id").eq("id", card_id).execute()
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    # Build query for score history
    query = supabase.table("card_score_history").select("*").eq("card_id", card_id)

    # Apply date filters if provided
    if start_date:
        query = query.gte("recorded_at", start_date.isoformat())
    if end_date:
        query = query.lte("recorded_at", end_date.isoformat())

    # Execute query ordered by recorded_at descending
    response = query.order("recorded_at", desc=True).execute()

    # Convert to ScoreHistory models
    history_records = (
        [ScoreHistory(**record) for record in response.data] if response.data else []
    )

    return ScoreHistoryResponse(
        history=history_records,
        card_id=card_id,
        total_count=len(history_records),
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/cards/{card_id}/stage-history", response_model=StageHistoryList)
async def get_card_stage_history(
    card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get maturity stage transition history for a card.

    Returns a list of stage transitions ordered by changed_at (most recent first),
    tracking maturity stage progression through stages 1-8 and horizon shifts
    (H3 -> H2 -> H1).

    The data is sourced from the card_timeline table, filtered to only include
    'stage_changed' event types.

    Args:
        card_id: UUID of the card to get stage history for

    Returns:
        StageHistoryList with stage transition records and metadata
    """
    # First verify the card exists
    card_response = supabase.table("cards").select("id").eq("id", card_id).execute()
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    # Query card_timeline for stage change events
    # Filter by event_type='stage_changed' to get only stage transitions
    response = (
        supabase.table("card_timeline")
        .select(
            "id, card_id, created_at, old_stage_id, new_stage_id, old_horizon, new_horizon, trigger, reason"
        )
        .eq("card_id", card_id)
        .eq("event_type", "stage_changed")
        .order("created_at", desc=True)
        .execute()
    )

    # Convert to StageHistory models, mapping created_at to changed_at
    history_records = []
    if response.data:
        history_records.extend(
            StageHistory(
                id=record["id"],
                card_id=record["card_id"],
                changed_at=record["created_at"],  # Map created_at to changed_at
                old_stage_id=record.get("old_stage_id"),
                new_stage_id=record["new_stage_id"],
                old_horizon=record.get("old_horizon"),
                new_horizon=record.get("new_horizon", "H3"),  # Default to H3 if not set
                trigger=record.get("trigger"),
                reason=record.get("reason"),
            )
            for record in response.data
            if record.get("new_stage_id") is not None
        )
    return StageHistoryList(
        history=history_records, total_count=len(history_records), card_id=card_id
    )


@router.get("/cards/{card_id}/related", response_model=RelatedCardsList)
async def get_related_cards(
    card_id: str, limit: int = 20, current_user: dict = Depends(get_current_user)
):
    """
    Get cards related to the specified card for concept network visualization.

    Returns cards connected to the source card through the card_relationships table,
    including relationship metadata (type and strength) for edge visualization.
    Relationships are bidirectional - cards appear whether they are source or target.

    Args:
        card_id: UUID of the source card to get relationships for
        limit: Maximum number of related cards to return (default: 20)

    Returns:
        RelatedCardsList with related card details and relationship metadata
    """
    # First verify the card exists
    card_response = supabase.table("cards").select("id").eq("id", card_id).execute()
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    # Query relationships where this card is either source or target
    # Get relationships where card is the source
    source_response = (
        supabase.table("card_relationships")
        .select(
            "id, source_card_id, target_card_id, relationship_type, strength, created_at"
        )
        .eq("source_card_id", card_id)
        .limit(limit)
        .execute()
    )

    # Get relationships where card is the target
    target_response = (
        supabase.table("card_relationships")
        .select(
            "id, source_card_id, target_card_id, relationship_type, strength, created_at"
        )
        .eq("target_card_id", card_id)
        .limit(limit)
        .execute()
    )

    # Combine and deduplicate relationships
    all_relationships = []
    seen_relationship_ids = set()

    for rel in (source_response.data or []) + (target_response.data or []):
        if rel["id"] not in seen_relationship_ids:
            seen_relationship_ids.add(rel["id"])
            all_relationships.append(rel)

    # If no relationships found, return empty list
    if not all_relationships:
        return RelatedCardsList(related_cards=[], total_count=0, source_card_id=card_id)

    # Get the related card IDs (the "other" card in each relationship)
    related_card_ids = set()
    for rel in all_relationships:
        if rel["source_card_id"] == card_id:
            related_card_ids.add(rel["target_card_id"])
        else:
            related_card_ids.add(rel["source_card_id"])

    # Fetch full card details for all related cards
    def _fetch_related(chunk):
        resp = (
            supabase.table("cards")
            .select("id, name, slug, summary, pillar_id, stage_id, horizon")
            .in_("id", chunk)
            .execute()
        )
        return resp.data or []

    related_rows = await asyncio.to_thread(
        chunked_in_query, _fetch_related, list(related_card_ids)
    )

    # Create a lookup map for cards
    cards_map = {card["id"]: card for card in related_rows}

    # Build the related cards list with relationship context
    related_cards = []
    for rel in all_relationships:
        # Determine which card is the "related" one (not the source card_id)
        if rel["source_card_id"] == card_id:
            related_id = rel["target_card_id"]
        else:
            related_id = rel["source_card_id"]

        if card_data := cards_map.get(related_id):
            related_cards.append(
                RelatedCard(
                    id=card_data["id"],
                    name=card_data["name"],
                    slug=card_data["slug"],
                    summary=card_data.get("summary"),
                    pillar_id=card_data.get("pillar_id"),
                    stage_id=card_data.get("stage_id"),
                    horizon=card_data.get("horizon"),
                    relationship_type=rel["relationship_type"],
                    relationship_strength=rel.get("strength"),
                    relationship_id=rel["id"],
                )
            )

    # Limit the results to the specified limit
    related_cards = related_cards[:limit]

    return RelatedCardsList(
        related_cards=related_cards,
        total_count=len(related_cards),
        source_card_id=card_id,
    )


# ============================================================================
# Follow / unfollow
# ============================================================================


def _card_follow_state(card_id: str, user_id: str) -> CardFollowerResponse:
    counts = get_follower_counts(supabase, [card_id])
    followed = get_followed_card_ids(supabase, user_id, [card_id])
    return CardFollowerResponse(
        follower_count=counts.get(card_id, 0),
        is_following=card_id in followed,
    )


@router.get("/cards/{card_id}/followers", response_model=CardFollowerResponse)
async def get_card_followers(
    card_id: str, current_user: dict = Depends(get_current_user)
):
    """Return follower count and current user's follow state for a card."""
    return await asyncio.to_thread(_card_follow_state, card_id, current_user["id"])


def _check_batch_limit(card_ids: List[UUID]) -> None:
    if len(card_ids) > BATCH_CARD_ID_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Batch size {len(card_ids)} exceeds limit of {BATCH_CARD_ID_LIMIT}. "
                "Page the request from the client."
            ),
        )


@router.post("/cards/follower-status")
async def get_cards_follower_status(
    request: CardIdsRequest, current_user: dict = Depends(get_current_user)
):
    """Batch follower count/status lookup for card lists."""
    _check_batch_limit(request.card_ids)
    # Service helpers and Supabase keys are strings; return dict keys must be
    # JSON-serializable strings as well.
    card_ids = [str(cid) for cid in request.card_ids]
    counts, followed = await asyncio.gather(
        asyncio.to_thread(get_follower_counts, supabase, card_ids),
        asyncio.to_thread(get_followed_card_ids, supabase, current_user["id"], card_ids),
    )
    return {
        card_id: {
            "follower_count": counts.get(card_id, 0),
            "is_following": card_id in followed,
        }
        for card_id in card_ids
    }


@router.get("/cards/{card_id}/artifacts")
async def get_card_artifact_summary(
    card_id: str, current_user: dict = Depends(get_current_user)
):
    """Return generated artifact indicators for one card."""
    artifacts = await asyncio.to_thread(
        get_card_artifacts, supabase, [card_id], current_user["id"]
    )
    artifact = artifacts.get(card_id)
    return artifact.dict() if artifact else {}


@router.post("/cards/artifacts")
async def get_cards_artifact_summary(
    request: CardIdsRequest, current_user: dict = Depends(get_current_user)
):
    """Batch artifact indicator lookup for card lists."""
    _check_batch_limit(request.card_ids)
    card_ids = [str(cid) for cid in request.card_ids]
    artifacts = await asyncio.to_thread(
        get_card_artifacts, supabase, card_ids, current_user["id"]
    )
    return {card_id: artifact.dict() for card_id, artifact in artifacts.items()}


@router.post(
    "/cards/{card_id}/follow",
    response_model=FollowToggleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def follow_card(card_id: str, current_user: dict = Depends(get_current_user)):
    """Follow a card. Idempotent for repeated clicks."""

    def _follow() -> FollowToggleResponse:
        # Don't include created_at in the payload: PostgREST upsert translates
        # to ON CONFLICT DO UPDATE SET <every-column-in-payload>, which would
        # overwrite the original follow timestamp on each re-click. The DB
        # default fills it on first insert; on conflict we only refresh
        # followed_at.
        now = datetime.now(timezone.utc).isoformat()
        supabase.table("card_follows").upsert(
            {
                "user_id": current_user["id"],
                "card_id": card_id,
                "followed_at": now,
            },
            on_conflict="user_id,card_id",
        ).execute()
        try:
            from app.signal_quality import update_signal_quality_score

            update_signal_quality_score(supabase, card_id)
        except Exception as e:
            logger.warning(
                f"Failed to update signal quality score for {card_id}: {e}"
            )
        return FollowToggleResponse(
            **_card_follow_state(card_id, current_user["id"]).dict()
        )

    return await asyncio.to_thread(_follow)


@router.delete("/cards/{card_id}/follow", response_model=FollowToggleResponse)
async def unfollow_card(card_id: str, current_user: dict = Depends(get_current_user)):
    """Unfollow a card"""

    def _unfollow() -> FollowToggleResponse:
        supabase.table("card_follows").delete().eq(
            "user_id", current_user["id"]
        ).eq("card_id", card_id).execute()
        try:
            from app.signal_quality import update_signal_quality_score

            update_signal_quality_score(supabase, card_id)
        except Exception as e:
            logger.warning(
                f"Failed to update signal quality score for {card_id}: {e}"
            )
        state = _card_follow_state(card_id, current_user["id"])
        return FollowToggleResponse(
            follower_count=state.follower_count,
            is_following=False,
        )

    return await asyncio.to_thread(_unfollow)


# ============================================================================
# Following / My Signals
# ============================================================================


@router.get("/me/following")
async def get_following_cards(current_user: dict = Depends(get_current_user)):
    """Get cards followed by current user"""
    response = (
        supabase.table("card_follows")
        .select(
            """
        *,
        cards!inner(*)
    """
        )
        .eq("user_id", current_user["id"])
        .execute()
    )
    return response.data


# ----------------------------------------------------------------------------
# Personal Signals — shared context loader
# ----------------------------------------------------------------------------
#
# Both /me/signals (paginated feed) and /me/signals/stats need the same four
# "what cards does this user have any relationship with" reads. We load them
# in parallel via asyncio.gather + asyncio.to_thread (Supabase's sync client
# blocks the event loop, per CLAUDE.md) so a hub with hundreds of follows
# doesn't pay four serial round-trips before returning anything.

# Default page size for the paginated /me/signals feed. Sized to match the
# initial viewport plus a comfortable read-ahead — small enough to keep first
# paint fast, large enough that grid layouts don't have to load-more on mount.
DEFAULT_SIGNALS_PAGE_LIMIT = 30
MAX_SIGNALS_PAGE_LIMIT = 100

# How "needs research" is defined in the stats panel. Kept here so the stats
# query and the feed query can never drift.
NEEDS_RESEARCH_QUALITY_THRESHOLD = 30


_SOURCE_FILTERS = {"followed", "created", "workstream"}


class _SignalContext:
    """Pre-computed user/card relationship state shared between feed + stats."""

    __slots__ = (
        "followed_map",
        "created_id_set",
        "ws_card_map",
        "workstreams",
        "prefs_map",
        "all_ids",
        "filtered_ids",
        "pinned_ids",
    )

    def __init__(
        self,
        followed_map: Dict[str, dict],
        created_ids: List[str],
        ws_card_map: Dict[str, List[str]],
        workstreams: List[dict],
        prefs_map: Dict[str, dict],
        source: Optional[str],
    ) -> None:
        self.followed_map = followed_map
        self.created_id_set = set(created_ids)
        self.ws_card_map = ws_card_map
        self.workstreams = workstreams
        self.prefs_map = prefs_map

        followed_ids = set(followed_map.keys())
        ws_ids = set(ws_card_map.keys())

        if source == "followed":
            filtered = followed_ids
        elif source == "created":
            filtered = self.created_id_set
        elif source == "workstream":
            filtered = ws_ids
        else:
            filtered = followed_ids | self.created_id_set | ws_ids

        self.all_ids = followed_ids | self.created_id_set | ws_ids
        self.filtered_ids = filtered
        self.pinned_ids = {
            cid
            for cid, pref in prefs_map.items()
            if pref.get("is_pinned") and cid in filtered
        }


async def _load_workstream_card_map(
    workstreams: List[dict],
) -> Dict[str, List[str]]:
    """Map card_id -> list of workstream names the card sits in."""
    if not workstreams:
        return {}
    ws_ids = [ws["id"] for ws in workstreams]
    name_by_id = {ws["id"]: ws["name"] for ws in workstreams}
    out: Dict[str, List[str]] = {}

    # Chunk workstream IDs to stay under the IN-clause URL guard. We can't
    # feed the helper directly to ``chunked_in_query`` here because each
    # chunk's call still needs the H2-GOAWAY retry wrapper.
    for start in range(0, len(ws_ids), SAFE_IN_LIMIT):
        chunk = ws_ids[start : start + SAFE_IN_LIMIT]
        resp = await execute_with_h2_retry(
            lambda c=chunk: supabase.table("workstream_cards")
            .select("card_id, workstream_id")
            .in_("workstream_id", c)
            .execute()
        )
        for row in resp.data or []:
            cid = row.get("card_id")
            if not cid:
                continue
            out.setdefault(cid, []).append(
                name_by_id.get(row.get("workstream_id"), "Unknown")
            )
    return out


async def _load_user_prefs(user_id: str) -> Dict[str, dict]:
    """Pin/notes preferences. Returns {} only when the table itself is missing;
    other Supabase failures are re-raised so a transient auth/query error can't
    silently strip every user's pins + notes from the response.
    """
    try:
        resp = await execute_with_h2_retry(
            lambda: supabase.table("user_signal_preferences")
            .select("card_id, is_pinned, notes")
            .eq("user_id", user_id)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        # Postgres signals a missing table with SQLSTATE 42P01 (relation does
        # not exist). Only swallow that — anything else must bubble up.
        msg = str(exc)
        if "user_signal_preferences" in msg or "42P01" in msg:
            logger.warning(
                "user_signal_preferences table may not exist; skipping pin data"
            )
            return {}
        raise
    return {r["card_id"]: r for r in rows if r.get("card_id")}


async def _build_signal_context(
    user_id: str, source: Optional[str]
) -> _SignalContext:
    """Run the four user-scoped reads in parallel.

    Each leg uses ``execute_with_h2_retry`` so a transient HTTP/2 GOAWAY on
    the shared Supabase connection doesn't surface as a 500. Without the
    retry, fan-out from this gather (5+ concurrent streams on one connection)
    is enough to occasionally trip ``RemoteProtocolError`` mid-stream.
    """

    follows_rows, created_rows, workstreams, prefs_map = await asyncio.gather(
        execute_with_h2_retry(
            lambda: supabase.table("card_follows")
            .select("card_id, created_at, priority")
            .eq("user_id", user_id)
            .execute()
        ),
        execute_with_h2_retry(
            lambda: supabase.table("cards")
            .select("id")
            .eq("created_by", user_id)
            .eq("status", "active")
            .execute()
        ),
        execute_with_h2_retry(
            lambda: supabase.table("workstreams")
            .select("id, name")
            .eq("user_id", user_id)
            .execute()
        ),
        _load_user_prefs(user_id),
    )

    follows_rows = follows_rows.data or []
    created_rows = created_rows.data or []
    workstreams = workstreams.data or []
    # workstream_cards depends on workstreams, so it sequences after the gather.
    ws_card_map = await _load_workstream_card_map(workstreams)

    followed_map = {r["card_id"]: r for r in (follows_rows or []) if r.get("card_id")}
    created_ids = [r["id"] for r in (created_rows or []) if r.get("id")]

    return _SignalContext(
        followed_map=followed_map,
        created_ids=created_ids,
        ws_card_map=ws_card_map,
        workstreams=workstreams or [],
        prefs_map=prefs_map,
        source=source,
    )


def _sanitize_ilike(search: Optional[str]) -> Optional[str]:
    """Strip ILIKE metacharacters from the user-supplied search term.

    The /me/signals RPCs and `_apply_card_filters` both feed `search` into
    `column ILIKE '%' || $1 || '%'`. Without sanitization, a `%` or `_` in
    the search would alter the LIKE pattern, and `,.()[]` would break the
    postgrest `or_` clause filter syntax. Returns None for empty/blank input.
    """
    if not search:
        return None
    cleaned = re.sub(r"[,.()\[\]%_]", "", search).strip()
    return cleaned or None


def _apply_card_filters(
    query,
    *,
    search: Optional[str],
    pillar: Optional[str],
    horizon: Optional[str],
    quality_min: Optional[int],
):
    """Apply the shared text/pillar/horizon/quality filters to a cards query."""
    safe_search = _sanitize_ilike(search)
    if safe_search:
        query = query.or_(
            f"name.ilike.%{safe_search}%,summary.ilike.%{safe_search}%"
        )
    if pillar:
        query = query.eq("pillar_id", pillar)
    if horizon:
        query = query.eq("horizon", horizon)
    if quality_min is not None and quality_min > 0:
        query = query.gte("signal_quality_score", quality_min)
    return query


def _personalize_card(card: dict, ctx: _SignalContext) -> dict:
    cid = card["id"]
    pref = ctx.prefs_map.get(cid, {})
    follow = ctx.followed_map.get(cid)
    return {
        **card,
        "is_followed": cid in ctx.followed_map,
        "is_created": cid in ctx.created_id_set,
        "is_pinned": bool(pref.get("is_pinned")),
        "personal_notes": pref.get("notes"),
        "follow_priority": follow.get("priority") if follow else None,
        "followed_at": follow.get("created_at") if follow else None,
        "workstream_names": ctx.ws_card_map.get(cid, []),
    }


def _order_ids_by_followed_at(ids: List[str], ctx: _SignalContext) -> List[str]:
    """Sort IDs by follow created_at desc; cards the user hasn't followed
    fall to the end (e.g. user-created or workstream cards under sort=followed).

    Stable tiebreak by id keeps pagination deterministic.
    """
    def sort_key(cid: str):
        follow = ctx.followed_map.get(cid)
        if follow:
            # Followed cards: bucket 0, then by created_at desc (newer first),
            # then id desc for tiebreak.
            return (0, follow.get("created_at") or "", cid)
        return (1, "", cid)

    # Bucket 0 (followed) before bucket 1; within bucket 0 we want NEWEST
    # followed_at first, so sort that bucket descending and the bucket index
    # ascending. Easiest: sort ascending, then reverse the followed bucket.
    followed = sorted(
        (cid for cid in ids if cid in ctx.followed_map), key=sort_key, reverse=True
    )
    unfollowed = sorted(cid for cid in ids if cid not in ctx.followed_map)
    return followed + unfollowed


async def _fetch_cards_page(
    ids: List[str],
    *,
    sort_by: str,
    search: Optional[str],
    pillar: Optional[str],
    horizon: Optional[str],
    quality_min: Optional[int],
    limit: int,
    offset: int,
    ctx: _SignalContext,
) -> List[dict]:
    """Return up to `limit` raw card rows from `ids` honoring sort + filters.

    Caller is responsible for `enrich_cards_with_collab` + `_personalize_card`.
    """
    if not ids or limit <= 0:
        return []

    safe_search = _sanitize_ilike(search)

    # For sorts that live on the cards table, push pagination into Postgres
    # so we never materialize more than `limit` rows per page.
    # RPC instead of `.in_("id", ids)` because `ids` can hold ~300 UUIDs for
    # heavy users, which blows the URL past Cloudflare's ~8KB limit (returns
    # HTML 400 that postgrest can't parse as JSON).
    if sort_by in ("quality", "name", "updated"):
        def fetch_page() -> List[dict]:
            return (
                supabase.rpc(
                    "me_signals_feed_page",
                    {
                        "p_card_ids": ids,
                        "p_search": safe_search,
                        "p_pillar": pillar,
                        "p_horizon": horizon,
                        "p_quality_min": quality_min,
                        "p_sort_by": sort_by,
                        "p_limit": limit,
                        "p_offset": offset,
                    },
                )
                .execute()
                .data
                or []
            )

        return await execute_with_h2_retry(fetch_page)

    # sort_by == "followed" — sort field lives on card_follows, not cards.
    # We must filter BEFORE slicing: filtering after the slice would under-fill
    # pages and break `has_more` whenever a search/pillar/horizon/quality_min
    # filter is active (a sliced ID can be rejected by the filter while later
    # matching IDs become unreachable). Strategy: ask Postgres for the set of
    # IDs that pass the filters, intersect with the in-memory followed order,
    # then slice — so pagination + filtering stay aligned.
    if search or pillar or horizon or (quality_min is not None and quality_min > 0):
        def fetch_filtered_ids() -> List[str]:
            rows = (
                supabase.rpc(
                    "me_signals_filter_ids",
                    {
                        "p_card_ids": ids,
                        "p_search": safe_search,
                        "p_pillar": pillar,
                        "p_horizon": horizon,
                        "p_quality_min": quality_min,
                    },
                )
                .execute()
                .data
                or []
            )
            return [r["id"] for r in rows if r.get("id")]

        filtered_id_list = await execute_with_h2_retry(fetch_filtered_ids)
        filtered_id_set = set(filtered_id_list)
        candidate_ids = [cid for cid in ids if cid in filtered_id_set]
    else:
        candidate_ids = ids

    ordered = _order_ids_by_followed_at(candidate_ids, ctx)
    page_ids = ordered[offset : offset + limit]
    if not page_ids:
        return []

    def _fetch_page_chunk(chunk):
        # No need to reapply filters: page_ids is already the filtered set.
        return (
            supabase.table("cards")
            .select("*")
            .in_("id", chunk)
            .eq("status", "active")
            .execute()
            .data
            or []
        )

    # page_ids can hit MAX_SIGNALS_PAGE_LIMIT (100), which is over the
    # .in_() URL-length guard's threshold. Chunk so the guard doesn't
    # fire for power users requesting page_size=100.
    rows = await asyncio.to_thread(chunked_in_query, _fetch_page_chunk, page_ids)
    # Postgres returned the slice in arbitrary order; reapply our explicit one.
    order_idx = {cid: i for i, cid in enumerate(page_ids)}
    rows.sort(key=lambda r: order_idx.get(r.get("id"), len(order_idx)))
    return rows


@router.get("/me/signals")
async def get_my_signals(
    sort_by: str = Query(
        "updated", description="Sort: updated, followed, quality, name"
    ),
    search: Optional[str] = Query(None, description="Search term"),
    pillar: Optional[str] = Query(None, description="Filter by pillar"),
    horizon: Optional[str] = Query(None, description="Filter by horizon"),
    source: Optional[str] = Query(
        None, description="Filter by: followed, created, workstream"
    ),
    quality_min: Optional[int] = Query(None, ge=0, le=100),
    limit: int = Query(
        DEFAULT_SIGNALS_PAGE_LIMIT, ge=1, le=MAX_SIGNALS_PAGE_LIMIT
    ),
    offset: int = Query(0, ge=0),
    include_pinned: bool = Query(
        True,
        description=(
            "Include the user's pinned signals as a separate full list. "
            "Pass false on subsequent pages to avoid retransmitting them."
        ),
    ),
    current_user: dict = Depends(get_current_user),
):
    """Paginated personal signal feed.

    Returns:
        signals: this page of the feed (pinned signals excluded — they ride
            in the `pinned` field so the UI can show them as a top section
            without paginating).
        pinned: full pinned set (only when `include_pinned=true`); always
            small (per-user, manually curated). Sorted by the same `sort_by`.
        next_offset / has_more: cursor for the load-more sentinel.
    """
    if source is not None and source not in _SOURCE_FILTERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"source must be one of {sorted(_SOURCE_FILTERS)}",
        )
    if sort_by not in ("updated", "followed", "quality", "name"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sort_by must be one of: updated, followed, quality, name",
        )

    user_id = current_user["id"]
    ctx = await _build_signal_context(user_id, source)

    feed_ids = list(ctx.filtered_ids - ctx.pinned_ids)
    pinned_ids = list(ctx.pinned_ids)

    if not feed_ids and not pinned_ids:
        return {
            "signals": [],
            "pinned": [] if include_pinned else None,
            "next_offset": offset,
            "has_more": False,
        }

    # Fetch one extra row to determine has_more without a separate count query.
    feed_rows = await _fetch_cards_page(
        feed_ids,
        sort_by=sort_by,
        search=search,
        pillar=pillar,
        horizon=horizon,
        quality_min=quality_min,
        limit=limit + 1,
        offset=offset,
        ctx=ctx,
    )
    has_more = len(feed_rows) > limit
    feed_rows = feed_rows[:limit]

    # Supabase sync client blocks the event loop — wrap collab enrichment.
    enriched_feed = await asyncio.to_thread(
        enrich_cards_with_collab, supabase, feed_rows, user_id
    )
    feed_signals = [_personalize_card(c, ctx) for c in enriched_feed]

    pinned_signals: Optional[List[dict]]
    if include_pinned and pinned_ids:
        pinned_rows = await _fetch_cards_page(
            pinned_ids,
            sort_by=sort_by,
            search=search,
            pillar=pillar,
            horizon=horizon,
            quality_min=quality_min,
            limit=len(pinned_ids),
            offset=0,
            ctx=ctx,
        )
        enriched_pinned = await asyncio.to_thread(
            enrich_cards_with_collab, supabase, pinned_rows, user_id
        )
        pinned_signals = [_personalize_card(c, ctx) for c in enriched_pinned]
    elif include_pinned:
        pinned_signals = []
    else:
        pinned_signals = None

    return {
        "signals": feed_signals,
        "pinned": pinned_signals,
        "next_offset": offset + len(feed_signals),
        "has_more": has_more,
    }


@router.get("/me/signals/stats")
async def get_my_signals_stats(
    search: Optional[str] = Query(None),
    pillar: Optional[str] = Query(None),
    horizon: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    quality_min: Optional[int] = Query(None, ge=0, le=100),
    current_user: dict = Depends(get_current_user),
):
    """Counts + workstream list for the Signals hub.

    Designed to be cheap: no `select("*")`, no enrichment. Mirrors the same
    filters as `/me/signals` so the StatsRow numbers match what the user
    actually sees in the feed.
    """
    if source is not None and source not in _SOURCE_FILTERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"source must be one of {sorted(_SOURCE_FILTERS)}",
        )

    user_id = current_user["id"]
    ctx = await _build_signal_context(user_id, source)

    filtered_ids = list(ctx.filtered_ids)
    if not filtered_ids:
        return {
            "stats": {
                "total": 0,
                "followed_count": 0,
                "created_count": 0,
                "workstream_count": len(ctx.workstreams),
                "updates_this_week": 0,
                "needs_research": 0,
            },
            "workstreams": ctx.workstreams,
        }

    one_week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    # followed_count + created_count must mirror the feed's filter/status
    # predicate — counting raw relationship sets would leak archived cards and
    # cards filtered out by search/pillar/horizon/quality_min, breaking the
    # invariant that total >= followed_count and total >= created_count.
    followed_id_list = list(ctx.followed_map.keys() & ctx.filtered_ids)
    created_id_list = list(ctx.created_id_set & ctx.filtered_ids)

    # Single RPC instead of 5-way .in_("id", filtered_ids) fan-out. The
    # previous fan-out URL-encoded ~300 UUIDs five times and hit Cloudflare's
    # ~8KB URL limit (HTML 400 → APIError "JSON could not be generated").
    # RPC sends the ID array in the JSON body, so URL length is constant.
    safe_search = _sanitize_ilike(search)

    def call_counts_rpc():
        return supabase.rpc(
            "me_signals_counts",
            {
                "p_card_ids": filtered_ids,
                "p_followed_ids": followed_id_list,
                "p_created_ids": created_id_list,
                "p_search": safe_search,
                "p_pillar": pillar,
                "p_horizon": horizon,
                "p_quality_min": quality_min,
                "p_one_week_ago": one_week_ago,
                "p_needs_research_threshold": NEEDS_RESEARCH_QUALITY_THRESHOLD,
            },
        ).execute()

    resp = await execute_with_h2_retry(call_counts_rpc)
    counts = resp.data or {}

    return {
        "stats": {
            "total": counts.get("total") or 0,
            "followed_count": counts.get("followed_count") or 0,
            "created_count": counts.get("created_count") or 0,
            "workstream_count": len(ctx.workstreams),
            "updates_this_week": counts.get("updates_this_week") or 0,
            "needs_research": counts.get("needs_research") or 0,
        },
        "workstreams": ctx.workstreams,
    }


# ============================================================================
# Pin signal
# ============================================================================


@router.post("/me/signals/{card_id}/pin", response_model=PinSignalResponse)
async def pin_signal(card_id: str, current_user: dict = Depends(get_current_user)):
    """Pin/unpin a signal in the user's personal hub."""
    user_id = current_user["id"]

    # Check if preference exists
    existing = (
        supabase.table("user_signal_preferences")
        .select("id, is_pinned")
        .eq("user_id", user_id)
        .eq("card_id", card_id)
        .execute()
    )

    if existing.data:
        # Toggle pin
        new_val = not existing.data[0].get("is_pinned", False)
        supabase.table("user_signal_preferences").update(
            {"is_pinned": new_val, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("id", existing.data[0]["id"]).execute()
        return {"is_pinned": new_val}
    else:
        # Create with pinned=True
        supabase.table("user_signal_preferences").insert(
            {
                "user_id": user_id,
                "card_id": card_id,
                "is_pinned": True,
            }
        ).execute()
        return {"is_pinned": True}


# ============================================================================
# Notes
# ============================================================================


@router.get("/cards/{card_id}/notes", response_model=List[Note])
async def get_card_notes(card_id: str, current_user: dict = Depends(get_current_user)):
    """Get notes for a card"""
    response = (
        supabase.table("card_notes")
        .select("*")
        .eq("card_id", card_id)
        .or_(f"user_id.eq.{current_user['id']},is_private.eq.false")
        .order("created_at", desc=True)
        .execute()
    )
    return [Note(**note) for note in response.data]


@router.post("/cards/{card_id}/notes", response_model=Note)
async def create_note(
    card_id: str, note_data: NoteCreate, current_user: dict = Depends(get_current_user)
):
    """Create note for a card"""
    note_dict = note_data.dict()
    note_dict.update(
        {
            "user_id": current_user["id"],
            "card_id": card_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    response = supabase.table("card_notes").insert(note_dict).execute()
    if response.data:
        return Note(**response.data[0])
    else:
        raise HTTPException(status_code=400, detail="Failed to create note")


# ============================================================================
# Assets
# ============================================================================


@router.get("/cards/{card_id}/assets", response_model=CardAssetsResponse)
async def get_card_assets(card_id: str, current_user: dict = Depends(get_current_user)):
    """
    Get all generated assets for a card.

    Returns a list of all briefs, research reports, and exports
    associated with the card across all workstreams.

    Args:
        card_id: UUID of the card
        current_user: Authenticated user (injected)

    Returns:
        CardAssetsResponse with list of assets

    Raises:
        HTTPException 404: Card not found
    """
    try:
        # Verify card exists
        card_response = (
            supabase.table("cards").select("id, name").eq("id", card_id).execute()
        )
        if not card_response.data:
            raise HTTPException(status_code=404, detail="Card not found")

        assets = []

        # 1. Fetch executive briefs for this card
        briefs_response = (
            supabase.table("executive_briefs")
            .select(
                "id, version, status, summary, generated_at, model_used, created_at"
            )
            .eq("card_id", card_id)
            .order("created_at", desc=True)
            .execute()
        )

        for brief in briefs_response.data or []:
            # Map status
            brief_status = (
                "ready"
                if brief.get("status") == "completed"
                else brief.get("status", "ready")
            )
            if brief_status == "generating":
                brief_status = "generating"
            elif brief_status in ("pending", "failed"):
                brief_status = "failed" if brief_status == "failed" else "ready"

            title = f"Executive Brief v{brief.get('version', 1)}"
            if brief.get("summary"):
                title = f"Executive Brief v{brief.get('version', 1)}"

            assets.append(
                CardAsset(
                    id=brief["id"],
                    type="brief",
                    title=title,
                    created_at=brief.get("generated_at") or brief.get("created_at"),
                    version=brief.get("version", 1),
                    ai_generated=True,
                    ai_model=brief.get("model_used"),
                    status=brief_status,
                    metadata={
                        "summary_preview": (
                            brief.get("summary", "")[:200]
                            if brief.get("summary")
                            else None
                        )
                    },
                )
            )

        # 2. Fetch research tasks (deep research reports)
        research_response = (
            supabase.table("research_tasks")
            .select("id, task_type, status, result_summary, completed_at, created_at")
            .eq("card_id", card_id)
            .order("created_at", desc=True)
            .execute()
        )

        for task in research_response.data or []:
            # Only include completed or failed tasks as assets
            if task.get("status") not in ("completed", "failed"):
                continue

            task_type = task.get("task_type", "research")
            asset_type = "research"
            if task_type == "deep_research":
                title = "Strategic Intelligence Report"
            elif task_type == "update":
                title = "Quick Update Report"
            else:
                title = f"{task_type.replace('_', ' ').title()} Report"

            result = task.get("result_summary", {}) or {}

            assets.append(
                CardAsset(
                    id=task["id"],
                    type=asset_type,
                    title=title,
                    created_at=task.get("completed_at") or task.get("created_at"),
                    ai_generated=True,
                    status="ready" if task.get("status") == "completed" else "failed",
                    metadata={
                        "task_type": task_type,
                        "sources_found": result.get("sources_found"),
                        "sources_added": result.get("sources_added"),
                    },
                )
            )

        # Sort all assets by created_at descending
        assets.sort(key=lambda x: x.created_at or "", reverse=True)

        return CardAssetsResponse(
            card_id=card_id, assets=assets, total_count=len(assets)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching card assets: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card assets retrieval", e),
        ) from e


# ============================================================================
# Velocity
# ============================================================================


@router.get("/cards/{card_id}/velocity")
async def get_card_velocity(
    card_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get velocity trend summary for a specific card."""
    from app.velocity_service import get_velocity_summary

    summary = get_velocity_summary(card_id, supabase)
    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Card not found or velocity data unavailable.",
        )
    return summary
