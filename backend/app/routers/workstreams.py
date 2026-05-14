"""Workstream CRUD and feed router."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.authz import (
    WORKSTREAM_OWNER_TYPE_ORG,
    is_admin,
    require_paid_user,
    require_workstream_access,
)
from app.clone_service import ensure_user_clones_for_templates
from app.deps import supabase, get_current_user, _safe_error
from app.helpers.workstream_utils import (
    _filter_cards_for_workstream,
    _build_workstream_scan_config,
    _auto_queue_workstream_scan,
)
from app.models.workstream import (
    Workstream,
    WorkstreamCreate,
    WorkstreamUpdate,
    WorkstreamCreateResponse,
    AutoPopulateResponse,
    WorkstreamCardWithDetails,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["workstreams"])


@router.get("/me/workstreams")
async def get_user_workstreams(current_user: dict = Depends(get_current_user)):
    """Get the caller's workstreams (own + shared + materialized org clones).

    Org templates (owner_type='org') are not returned directly to non-admins.
    Instead the caller's clone for each template is materialized on first
    touch (see ``app.clone_service``) and the **clone** is returned with
    role='owner'.  Admins see the raw templates so they can manage filters.
    """
    user_id = current_user["id"]
    admin = is_admin(current_user)

    # Lazy first-touch: ensure non-admin callers have a clone for every org
    # template.  Cheap when clones already exist (one SELECT, no writes).
    if not admin:
        ensure_user_clones_for_templates(user_id)

    own = (
        supabase.table("workstreams")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    memberships = (
        supabase.table("workstream_members")
        .select("workstream_id, role")
        .eq("user_id", user_id)
        .execute()
    )
    member_role_by_ws = {
        row["workstream_id"]: row["role"]
        for row in memberships.data or []
        if row.get("workstream_id")
    }
    shared_data: list[dict] = []
    if member_role_by_ws:
        shared_data = (
            supabase.table("workstreams")
            .select("*")
            .in_("id", list(member_role_by_ws))
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    # Admins also see org templates directly (filter/curation surface).
    admin_templates: list[dict] = []
    if admin:
        admin_templates = (
            supabase.table("workstreams")
            .select("*")
            .eq("owner_type", WORKSTREAM_OWNER_TYPE_ORG)
            .order("created_at", desc=True)
            .execute()
            .data
            or []
        )

    seen: set[str] = set()
    rows: list[dict] = []
    for ws in admin_templates + shared_data + (own.data or []):
        if ws["id"] in seen:
            continue
        seen.add(ws["id"])
        if ws.get("user_id") == user_id:
            ws["role"] = "owner"
        elif ws["id"] in member_role_by_ws:
            ws["role"] = member_role_by_ws[ws["id"]]
        elif ws.get("owner_type") == WORKSTREAM_OWNER_TYPE_ORG:
            # Reachable only for admins per the branch above.
            ws["role"] = "admin"
        rows.append(ws)

    return [Workstream(**ws) for ws in rows]


@router.post("/me/workstreams", response_model=WorkstreamCreateResponse)
async def create_workstream(
    workstream_data: WorkstreamCreate, current_user: dict = Depends(get_current_user)
):
    """Create new workstream with optional auto-populate and auto-scan queueing.

    After successful creation:
    1. Auto-populates the workstream with matching existing cards
    2. If fewer than 3 cards matched AND auto_scan is enabled, queues a scan
    """
    require_paid_user(current_user)
    ws_dict = workstream_data.dict()
    ws_dict.update(
        {
            "user_id": current_user["id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    response = supabase.table("workstreams").insert(ws_dict).execute()
    if not response.data:
        raise HTTPException(status_code=400, detail="Failed to create workstream")

    workstream = response.data[0]
    workstream_id = workstream["id"]
    user_id = current_user["id"]

    # --- Post-creation: auto-populate with matching existing cards ---
    auto_populated_count = 0
    scan_queued = False

    try:
        # Fetch candidate cards from DB (broad filter via SQL where possible)
        query = supabase.table("cards").select("*").eq("status", "active")
        cards_response = query.order("created_at", desc=True).limit(60).execute()
        cards = cards_response.data or []

        # Apply workstream filters via shared helper
        cards = _filter_cards_for_workstream(workstream, cards)

        if candidates := cards[:20]:
            now = datetime.now(timezone.utc).isoformat()
            new_records = [
                {
                    "workstream_id": workstream_id,
                    "card_id": card["id"],
                    "added_by": user_id,
                    "added_at": now,
                    "status": "inbox",
                    "position": idx,
                    "added_from": "auto",
                    "updated_at": now,
                }
                for idx, card in enumerate(candidates)
            ]
            insert_result = (
                supabase.table("workstream_cards").insert(new_records).execute()
            )
            auto_populated_count = len(insert_result.data) if insert_result.data else 0

        logger.info(
            f"Post-creation auto-populate for workstream {workstream_id}: "
            f"{auto_populated_count} cards added"
        )

    except Exception as e:
        logger.error(
            f"Post-creation auto-populate failed for workstream {workstream_id}: {e}"
        )
        # Non-fatal: workstream was created successfully, continue

    # --- Post-creation: queue scan if auto_scan is on and few matches ---
    try:
        if workstream.get("auto_scan") and auto_populated_count < 3:
            ws_keywords = workstream.get("keywords") or []
            ws_pillar_ids = workstream.get("pillar_ids") or []

            if ws_keywords or ws_pillar_ids:
                scan_config = _build_workstream_scan_config(workstream, "post_creation")
                scan_queued = _auto_queue_workstream_scan(
                    supabase, workstream_id, user_id, scan_config
                )
    except Exception as e:
        logger.error(
            f"Post-creation scan queue failed for workstream {workstream_id}: {e}"
        )

    return WorkstreamCreateResponse(
        id=workstream_id,
        name=workstream.get("name", ""),
        description=workstream.get("description"),
        pillar_ids=workstream.get("pillar_ids") or [],
        goal_ids=workstream.get("goal_ids") or [],
        stage_ids=workstream.get("stage_ids") or [],
        horizon=workstream.get("horizon") or "ALL",
        keywords=workstream.get("keywords") or [],
        is_active=workstream.get("is_active", True),
        auto_scan=workstream.get("auto_scan", False),
        auto_add=workstream.get("auto_add", False),
        framework_code=workstream.get("framework_code"),
        framework_category_id=workstream.get("framework_category_id"),
        driver_ids=workstream.get("driver_ids") or [],
        top25_priority_ids=workstream.get("top25_priority_ids") or [],
        budget_relevance=workstream.get("budget_relevance") or [],
        purpose_statement=workstream.get("purpose_statement"),
        owner_type=workstream.get("owner_type", "user"),
        auto_populated_count=auto_populated_count,
        scan_queued=scan_queued,
    )


@router.patch("/me/workstreams/{workstream_id}", response_model=Workstream)
async def update_workstream(
    workstream_id: str,
    workstream_data: WorkstreamUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Update an existing workstream.

    - Verifies the workstream belongs to the current user
    - Accepts partial updates (any field can be updated)
    - Returns the updated workstream

    Args:
        workstream_id: UUID of the workstream to update
        workstream_data: Partial update data
        current_user: Authenticated user (injected)

    Returns:
        Updated Workstream object

    Raises:
        HTTPException 404: Workstream not found
        HTTPException 403: Workstream belongs to another user
    """
    require_workstream_access(supabase, workstream_id, current_user, "manage")

    # Build update dict with only non-None values
    update_dict = {k: v for k, v in workstream_data.dict().items() if v is not None}

    if not update_dict:
        # No updates provided, return existing workstream
        ws = (
            supabase.table("workstreams")
            .select("*")
            .eq("id", workstream_id)
            .limit(1)
            .execute()
        )
        return Workstream(**ws.data[0])

    # Add updated_at timestamp
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Perform update
    response = (
        supabase.table("workstreams")
        .update(update_dict)
        .eq("id", workstream_id)
        .execute()
    )
    if response.data:
        return Workstream(**response.data[0])
    else:
        raise HTTPException(status_code=400, detail="Failed to update workstream")


@router.delete("/me/workstreams/{workstream_id}")
async def delete_workstream(
    workstream_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Delete a workstream.

    - Verifies the workstream belongs to the current user
    - Permanently deletes the workstream

    Args:
        workstream_id: UUID of the workstream to delete
        current_user: Authenticated user (injected)

    Returns:
        Success message

    Raises:
        HTTPException 404: Workstream not found
        HTTPException 403: Workstream belongs to another user
    """
    require_workstream_access(supabase, workstream_id, current_user, "manage")

    # Perform delete
    supabase.table("workstreams").delete().eq("id", workstream_id).execute()

    return {"status": "deleted", "message": "Workstream successfully deleted"}


@router.get("/me/workstreams/{workstream_id}/feed")
async def get_workstream_feed(
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = 20,
    offset: int = 0,
):
    """
    Get cards for a workstream with filtering support.

    Filters cards based on workstream configuration:
    - pillar_ids: Filter by pillar IDs
    - goal_ids: Filter by goal IDs
    - stage_ids: Filter by stage IDs
    - horizon: Filter by horizon (H1, H2, H3, ALL)
    - keywords: Search card name/summary/description for keywords

    Args:
        workstream_id: UUID of the workstream
        current_user: Authenticated user (injected)
        limit: Maximum number of cards to return (default: 20)
        offset: Number of cards to skip for pagination (default: 0)

    Returns:
        List of Card objects matching workstream filters

    Raises:
        HTTPException 404: Workstream not found or not accessible
    """
    # Read access: owner OR any org-owned workstream.  Mutation routes still
    # require user_id ownership.
    ws_response = (
        supabase.table("workstreams")
        .select("*")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    workstream = ws_response.data[0]
    if workstream.get("owner_type") != "org" and workstream.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=404, detail="Workstream not found")

    # Build query based on workstream filters
    query = supabase.table("cards").select("*").eq("status", "active")

    # Filter by pillar_ids
    if workstream.get("pillar_ids"):
        query = query.in_("pillar_id", workstream["pillar_ids"])

    # Filter by goal_ids
    if workstream.get("goal_ids"):
        query = query.in_("goal_id", workstream["goal_ids"])

    # Note: stage_ids filter applied in Python because card stage_id format
    # is "5_implementing" while workstream stores ["4", "5", "6"]

    # Filter by horizon (skip if ALL)
    if workstream.get("horizon") and workstream["horizon"] != "ALL":
        query = query.eq("horizon", workstream["horizon"])

    response = (
        query.order("created_at", desc=True).range(offset, offset + limit - 1).execute()
    )
    cards = response.data or []

    if stage_ids := workstream.get("stage_ids", []):
        filtered_by_stage = []
        for card in cards:
            card_stage_id = card.get("stage_id") or ""
            stage_num = (
                card_stage_id.split("_")[0] if "_" in card_stage_id else card_stage_id
            )
            if stage_num in stage_ids:
                filtered_by_stage.append(card)
        cards = filtered_by_stage

    if keywords := workstream.get("keywords", []):
        filtered_cards = []
        for card in cards:
            card_text = " ".join(
                [
                    (card.get("name") or "").lower(),
                    (card.get("summary") or "").lower(),
                    (card.get("description") or "").lower(),
                ]
            )
            # Check if any keyword matches (case-insensitive)
            if any(keyword.lower() in card_text for keyword in keywords):
                filtered_cards.append(card)
        return filtered_cards

    return cards


@router.post(
    "/me/workstreams/{workstream_id}/auto-populate",
    response_model=AutoPopulateResponse,
)
async def auto_populate_workstream(
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=50, description="Maximum cards to add"),
):
    """
    Auto-populate workstream with matching cards.

    Finds cards matching the workstream's filter criteria (pillars, goals, stages,
    horizon, keywords) that are not already in the workstream, and adds them
    to the 'inbox' column.

    Args:
        workstream_id: UUID of the workstream
        current_user: Authenticated user (injected)
        limit: Maximum number of cards to add (default: 20, max: 50)

    Returns:
        AutoPopulateResponse with count and details of added cards

    Raises:
        HTTPException 404: Workstream not found
        HTTPException 403: Not authorized
    """
    # Verify workstream belongs to user
    ws_response = (
        supabase.table("workstreams")
        .select("*")
        .eq("id", workstream_id)
        .eq("user_id", current_user["id"])
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    workstream = ws_response.data[0]

    # Get existing card IDs in workstream
    existing_response = (
        supabase.table("workstream_cards")
        .select("card_id")
        .eq("workstream_id", workstream_id)
        .execute()
    )
    existing_card_ids = {item["card_id"] for item in existing_response.data or []}

    # Build query based on workstream filters
    query = supabase.table("cards").select("*").eq("status", "active")

    # Apply filters
    if workstream.get("pillar_ids"):
        query = query.in_("pillar_id", workstream["pillar_ids"])

    if workstream.get("goal_ids"):
        query = query.in_("goal_id", workstream["goal_ids"])

    # Note: stage_ids filter is applied client-side because card stage_id format
    # is "5_implementing" while workstream stores ["4", "5", "6"]
    # We need to extract the number prefix for comparison

    if workstream.get("horizon") and workstream["horizon"] != "ALL":
        query = query.eq("horizon", workstream["horizon"])

    # Fetch more cards than limit to account for filtering
    fetch_limit = min(limit * 3, 100)
    response = query.order("created_at", desc=True).limit(fetch_limit).execute()
    cards = response.data or []

    if stage_ids := workstream.get("stage_ids", []):
        filtered_by_stage = []
        for card in cards:
            card_stage_id = card.get("stage_id") or ""
            # Extract number prefix (e.g., "5" from "5_implementing")
            stage_num = (
                card_stage_id.split("_")[0] if "_" in card_stage_id else card_stage_id
            )
            if stage_num in stage_ids:
                filtered_by_stage.append(card)
        cards = filtered_by_stage

    if keywords := workstream.get("keywords", []):
        filtered_cards = []
        for card in cards:
            card_text = " ".join(
                [
                    (card.get("name") or "").lower(),
                    (card.get("summary") or "").lower(),
                    (card.get("description") or "").lower(),
                ]
            )
            if any(keyword.lower() in card_text for keyword in keywords):
                filtered_cards.append(card)
        cards = filtered_cards

    # Filter out cards already in workstream
    candidates = [c for c in cards if c["id"] not in existing_card_ids][:limit]

    if not candidates:
        return AutoPopulateResponse(added=0, cards=[])

    # Get current max position in inbox
    position_response = (
        supabase.table("workstream_cards")
        .select("position")
        .eq("workstream_id", workstream_id)
        .eq("status", "inbox")
        .order("position", desc=True)
        .limit(1)
        .execute()
    )

    start_position = 0
    if position_response.data:
        start_position = position_response.data[0]["position"] + 1

    # Add cards to workstream
    now = datetime.now(timezone.utc).isoformat()
    new_records = []
    for idx, card in enumerate(candidates):
        new_records.append(
            {
                "workstream_id": workstream_id,
                "card_id": card["id"],
                "added_by": current_user["id"],
                "added_at": now,
                "status": "inbox",
                "position": start_position + idx,
                "added_from": "auto",
                "updated_at": now,
            }
        )

    # Insert all records
    result = supabase.table("workstream_cards").insert(new_records).execute()

    if not result.data:
        raise HTTPException(
            status_code=500, detail="Failed to auto-populate workstream"
        )

    card_map = {c["id"]: c for c in candidates}
    added_cards = [
        WorkstreamCardWithDetails(
            id=item["id"],
            workstream_id=item["workstream_id"],
            card_id=item["card_id"],
            added_by=item["added_by"],
            added_at=item["added_at"],
            status=item.get("status", "inbox"),
            position=item.get("position", 0),
            notes=item.get("notes"),
            reminder_at=item.get("reminder_at"),
            added_from=item.get("added_from", "auto"),
            updated_at=item.get("updated_at"),
            card=card_map.get(item["card_id"]),
        )
        for item in result.data
    ]
    logger.info(
        f"Auto-populated workstream {workstream_id} with {len(added_cards)} cards"
    )

    return AutoPopulateResponse(added=len(added_cards), cards=added_cards)


@router.post("/me/workstreams/{workstream_id}/auto-scan")
async def toggle_workstream_auto_scan(
    workstream_id: str,
    enable: bool = True,
    user=Depends(get_current_user),
):
    """Enable or disable automatic scanning for a workstream.

    When auto_scan is enabled, the workstream will be included in periodic
    background source discovery runs.
    """
    try:
        # Verify workstream exists and belongs to user
        ws_check = (
            supabase.table("workstreams")
            .select("id, user_id")
            .eq("id", workstream_id)
            .execute()
        )
        if not ws_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workstream not found",
            )
        if ws_check.data[0]["user_id"] != user["id"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to modify this workstream",
            )

        # Update auto_scan setting
        result = (
            supabase.table("workstreams")
            .update(
                {
                    "auto_scan": enable,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", workstream_id)
            .execute()
        )
        if result.data:
            return {
                "workstream_id": workstream_id,
                "auto_scan": enable,
                "status": "enabled" if enable else "disabled",
            }
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update auto_scan setting",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to toggle auto_scan for workstream {workstream_id}: {str(e)}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("auto_scan update", e),
        ) from e
