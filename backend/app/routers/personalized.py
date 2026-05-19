"""Personalized discovery queue — per-user multi-factor ranked card feed.

Combines novelty (recent + not-dismissed), workstream relevance, pillar
alignment, and followed-card context into a single discovery_score. The
scoring weights live in `app.discovery_scoring` so they can be tuned in
one place. The endpoint surfaces the score and a breakdown alongside each
card so the UI can show a "why is this here" tooltip.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query, Request

from app.deps import get_current_user, supabase
from app.discovery_scoring import calculate_discovery_score
from app.security import limiter
from app.supabase_in_guard import async_chunked_in_query

router = APIRouter(prefix="/api/v1", tags=["personalized"])

# Lookback window for candidate cards. The personalized queue is for
# "what's worth my attention right now," not exhaustive browsing — older
# items belong in Discover with its filters.
_CANDIDATE_WINDOW_DAYS = 90

# Hard cap on how many cards we score in one request. Scoring is fast
# (pure Python dict work), so 500 is plenty of headroom for re-ranking
# the most-recent slice; if pagination ever needs to walk past this, the
# right move is server-side scoring + persistence, not raising the cap.
_CANDIDATE_POOL = 500


@router.get("/me/discovery/queue")
@limiter.limit("60/minute")
async def get_personalized_queue(
    request: Request,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """Return a ranked list of cards for the current user.

    Each item is a full card row with two extra fields glued on:
    `discovery_score` (0-1, composite) and `score_breakdown` (per-factor
    values + weights used). The frontend `PersonalizedCard` type expects
    exactly this shape.
    """
    user_id = current_user["id"]

    # Workstreams: user-owned active rows + all org-owned active rows
    # + workstreams shared with the user via workstream_members. /me/workstreams
    # surfaces all three buckets, so the personalized ranker must score against
    # the same set or it silently ignores collaborator-shared rows.
    own_ws_resp, org_ws_resp, memberships_resp = await asyncio.gather(
        asyncio.to_thread(
            lambda: supabase.table("workstreams")
            .select("id, pillar_ids, goal_ids, keywords, horizon, is_active")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("workstreams")
            .select("id, pillar_ids, goal_ids, keywords, horizon, is_active")
            .eq("owner_type", "org")
            .eq("is_active", True)
            .execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("workstream_members")
            .select("workstream_id")
            .eq("user_id", user_id)
            .execute()
        ),
    )
    workstreams: List[Dict[str, Any]] = (own_ws_resp.data or []) + (
        org_ws_resp.data or []
    )

    shared_ids = [
        row["workstream_id"]
        for row in (memberships_resp.data or [])
        if row.get("workstream_id")
    ]
    if shared_ids:
        def _fetch_shared(chunk):
            resp = (
                supabase.table("workstreams")
                .select("id, pillar_ids, goal_ids, keywords, horizon, is_active")
                .in_("id", chunk)
                .eq("is_active", True)
                .execute()
            )
            return resp.data or []

        shared_rows = await async_chunked_in_query(_fetch_shared, shared_ids)
        # Dedupe — a workstream can hit two of own/org/shared in principle.
        seen = {ws["id"] for ws in workstreams if ws.get("id")}
        for ws in shared_rows:
            if ws.get("id") and ws["id"] not in seen:
                workstreams.append(ws)
                seen.add(ws["id"])

    # Followed cards: only the fields the scorer reads (pillar + goal).
    follows = await asyncio.to_thread(
        lambda: supabase.table("card_follows")
        .select("card_id, cards(id, pillar_id, goal_id)")
        .eq("user_id", user_id)
        .execute()
    )
    followed_cards: List[Dict[str, Any]] = [
        row["cards"] for row in (follows.data or []) if row.get("cards")
    ]

    # Dismissals: hide from candidates *and* feed into the novelty boost.
    dismissals = await asyncio.to_thread(
        lambda: supabase.table("user_card_dismissals")
        .select("card_id")
        .eq("user_id", user_id)
        .execute()
    )
    dismissed_ids: set = {
        row["card_id"] for row in (dismissals.data or []) if row.get("card_id")
    }

    # Candidate pool: recent, active, not-rejected cards. We do NOT pre-filter
    # by workstream — that would defeat the "novelty + alignment" balance
    # the scorer is supposed to produce.
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=_CANDIDATE_WINDOW_DAYS)
    ).isoformat()
    candidates_resp = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select("*")
        .eq("status", "active")
        .neq("review_status", "rejected")
        .gte("created_at", cutoff)
        .order("created_at", desc=True)
        .limit(_CANDIDATE_POOL)
        .execute()
    )
    candidates: List[Dict[str, Any]] = candidates_resp.data or []
    if dismissed_ids:
        candidates = [c for c in candidates if c.get("id") not in dismissed_ids]

    # Score + decorate.
    scored: List[Dict[str, Any]] = []
    for card in candidates:
        result = calculate_discovery_score(
            card,
            workstreams,
            followed_cards,
            user_dismissed_card_ids=dismissed_ids,
        )
        scored.append(
            {
                **card,
                "discovery_score": result["discovery_score"],
                "score_breakdown": result["score_breakdown"],
            }
        )

    # Primary sort by score, tiebreak by recency. Reverse so highest-first.
    scored.sort(
        key=lambda c: (c["discovery_score"], c.get("created_at") or ""),
        reverse=True,
    )

    return scored[offset : offset + limit]
