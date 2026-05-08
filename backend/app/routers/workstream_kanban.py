"""Workstream kanban card management router."""

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request

from app.authz import require_paid_user, require_workstream_access
from app.deps import supabase, get_current_user, openai_client
from app.models.workstream import (
    WorkstreamCardWithDetails,
    WorkstreamCardCreate,
    WorkstreamCardUpdate,
    WorkstreamCardsGroupedResponse,
    WorkstreamCardWatchingUpdate,
    BulkCardActionRequest,
    SharePayloadResponse,
    VALID_WORKSTREAM_CARD_STATUSES,
    VALID_BRIEF_STATUSES,
    WorkstreamResearchStatus,
    WorkstreamResearchStatusResponse,
)
from app.models.research import ResearchTask
from app.research_service import ResearchService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["workstream-kanban"])


def _require_workstream_read(workstream_id: str, current_user: dict) -> None:
    require_workstream_access(supabase, workstream_id, current_user, "read")


def _require_workstream_edit(workstream_id: str, current_user: dict) -> None:
    require_workstream_access(supabase, workstream_id, current_user, "edit")


def _normalize_frontend_base_url(value: Optional[str]) -> str:
    """Return a safe frontend base URL, or an empty string if unavailable."""
    if not value:
        return ""
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")


def _build_card_share_url(card: Dict[str, Any], base_url: str = "") -> str:
    """Build a share URL for a card using slug when available."""
    slug = card.get("slug") or card.get("id")
    if not slug:
        return ""
    path = f"/cards/{slug}"
    return f"{base_url}{path}" if base_url else path


def _record_research_trigger(
    workstream_card_id: str, current_status: Optional[str], depth: str
) -> None:
    """Stamp last_research_* on a workstream_card and promote inbox → working.

    Per docs/16_PRD_Kanban_Redesign_and_Sharing.md "State transitions": running
    research on an Inbox card moves it to Working; running it elsewhere leaves
    the stage alone (Ready cards just get their brief flagged stale upstream).
    """
    update: Dict[str, Any] = {
        "last_research_depth": depth,
        "last_research_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if current_status == "inbox":
        update["status"] = "working"

    try:
        supabase.table("workstream_cards").update(update).eq(
            "id", workstream_card_id
        ).execute()
    except Exception as e:  # noqa: BLE001 — non-fatal; research task is already created
        logger.warning(f"Failed to stamp research metadata on card {workstream_card_id}: {e}")


def _row_to_card_with_details(item: Dict[str, Any]) -> WorkstreamCardWithDetails:
    """Map a `workstream_cards` row (with `cards(*)` joined) to the response model."""
    return WorkstreamCardWithDetails(
        id=item["id"],
        workstream_id=item["workstream_id"],
        card_id=item["card_id"],
        added_by=item["added_by"],
        added_at=item["added_at"],
        status=item.get("status", "inbox"),
        position=item.get("position", 0),
        notes=item.get("notes"),
        reminder_at=item.get("reminder_at"),
        added_from=item.get("added_from", "manual"),
        updated_at=item.get("updated_at"),
        is_watching=bool(item.get("is_watching", False)),
        brief_status=item.get("brief_status") or "none",
        last_research_depth=item.get("last_research_depth") or "none",
        last_research_at=item.get("last_research_at"),
        previous_status=item.get("previous_status"),
        card=item.get("cards"),
    )


@router.get(
    "/me/workstreams/{workstream_id}/cards",
    response_model=WorkstreamCardsGroupedResponse,
)
async def get_workstream_cards(
    workstream_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get all cards in a workstream grouped by stage (Kanban view).

    Stages (v2): inbox / working / ready / archived. Watching is a card
    attribute (`is_watching`), not a stage. See
    docs/16_PRD_Kanban_Redesign_and_Sharing.md.

    Args:
        workstream_id: UUID of the workstream
        current_user: Authenticated user (injected)

    Returns:
        WorkstreamCardsGroupedResponse with cards grouped by status

    Raises:
        HTTPException 404: Workstream not found or not owned by user
    """
    _require_workstream_read(workstream_id, current_user)

    # Fetch all cards with joined card details, ordered by position
    cards_response = (
        supabase.table("workstream_cards")
        .select("*, cards(*)")
        .eq("workstream_id", workstream_id)
        .order("position")
        .execute()
    )

    grouped: Dict[str, List[WorkstreamCardWithDetails]] = {
        "inbox": [],
        "working": [],
        "ready": [],
        "archived": [],
    }

    for item in cards_response.data or []:
        card_status = item.get("status", "inbox")
        if card_status not in grouped:
            card_status = "inbox"
        grouped[card_status].append(_row_to_card_with_details(item))

    return WorkstreamCardsGroupedResponse(**grouped)


@router.post(
    "/me/workstreams/{workstream_id}/cards",
    response_model=WorkstreamCardWithDetails,
)
async def add_card_to_workstream(
    workstream_id: str,
    card_data: WorkstreamCardCreate,
    current_user: dict = Depends(get_current_user),
):
    """
    Add a card to a workstream.

    The card will be added with the specified status (defaults to 'inbox')
    and positioned at the end of that column.

    Args:
        workstream_id: UUID of the workstream
        card_data: Card addition request (card_id, optional status/notes)
        current_user: Authenticated user (injected)

    Returns:
        WorkstreamCardWithDetails with the created card association

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized
        HTTPException 409: Card already in workstream
    """
    _require_workstream_edit(workstream_id, current_user)

    # Verify card exists
    card_response = (
        supabase.table("cards").select("*").eq("id", card_data.card_id).execute()
    )
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    # Check if card is already in workstream
    existing = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_data.card_id)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409, detail="Card is already in this workstream"
        )

    # Get max position for the target status column
    status = card_data.status or "inbox"
    position_response = (
        supabase.table("workstream_cards")
        .select("position")
        .eq("workstream_id", workstream_id)
        .eq("status", status)
        .order("position", desc=True)
        .limit(1)
        .execute()
    )

    next_position = 0
    if position_response.data:
        next_position = position_response.data[0]["position"] + 1

    # Create workstream card record
    now = datetime.now(timezone.utc).isoformat()
    new_card = {
        "workstream_id": workstream_id,
        "card_id": card_data.card_id,
        "added_by": current_user["id"],
        "added_at": now,
        "status": status,
        "position": next_position,
        "notes": card_data.notes,
        "added_from": "manual",
        "updated_at": now,
    }

    result = supabase.table("workstream_cards").insert(new_card).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to add card to workstream")

    inserted = dict(result.data[0])
    inserted["cards"] = card_response.data[0]
    return _row_to_card_with_details(inserted)


@router.patch(
    "/me/workstreams/{workstream_id}/cards/{card_id}",
    response_model=WorkstreamCardWithDetails,
)
async def update_workstream_card(
    workstream_id: str,
    card_id: str,
    update_data: WorkstreamCardUpdate,
    current_user: dict = Depends(get_current_user),
):
    """
    Update a workstream card's status, position, notes, or reminder.

    When changing status (moving to a different column), the card is placed
    at the end of the new column unless a specific position is provided.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        update_data: Update request (status, position, notes, reminder_at)
        current_user: Authenticated user (injected)

    Returns:
        WorkstreamCardWithDetails with updated data

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized
    """
    _require_workstream_edit(workstream_id, current_user)

    # Fetch the workstream card by its junction table ID (card_id param is actually workstream_card.id)
    # The frontend passes the workstream_card junction table ID, not the underlying card UUID
    wsc_response = (
        supabase.table("workstream_cards")
        .select("*, cards(*)")
        .eq("workstream_id", workstream_id)
        .eq("id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    existing = wsc_response.data[0]
    workstream_card_id = existing["id"]

    update_dict: Dict[str, Any] = {
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    if update_data.status is not None:
        new_status = update_data.status
        prev_status = existing.get("status") or "inbox"
        if new_status != prev_status:
            # Get max position in new column
            position_response = (
                supabase.table("workstream_cards")
                .select("position")
                .eq("workstream_id", workstream_id)
                .eq("status", new_status)
                .order("position", desc=True)
                .limit(1)
                .execute()
            )
            next_position = 0
            if position_response.data:
                next_position = position_response.data[0]["position"] + 1

            update_dict["status"] = new_status
            update_dict["position"] = (
                update_data.position
                if update_data.position is not None
                else next_position
            )

            # Archive bookkeeping: remember where we came from so restore can
            # send the card back to its original column.
            if new_status == "archived" and prev_status != "archived":
                update_dict["previous_status"] = prev_status
            elif prev_status == "archived" and new_status != "archived":
                # Coming out of the archive — clear previous_status so it won't
                # accidentally apply on a future archive cycle.
                update_dict["previous_status"] = None
        else:
            update_dict["status"] = new_status
            if update_data.position is not None:
                update_dict["position"] = update_data.position
    elif update_data.position is not None:
        update_dict["position"] = update_data.position

    if update_data.notes is not None:
        update_dict["notes"] = update_data.notes

    if update_data.reminder_at is not None:
        update_dict["reminder_at"] = update_data.reminder_at

    if update_data.is_watching is not None:
        update_dict["is_watching"] = update_data.is_watching

    if update_data.brief_status is not None:
        update_dict["brief_status"] = update_data.brief_status

    result = (
        supabase.table("workstream_cards")
        .update(update_dict)
        .eq("id", workstream_card_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update workstream card")

    final_response = (
        supabase.table("workstream_cards")
        .select("*, cards(*)")
        .eq("id", workstream_card_id)
        .execute()
    )

    if not final_response.data:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated card")

    return _row_to_card_with_details(final_response.data[0])


@router.delete("/me/workstreams/{workstream_id}/cards/{card_id}")
async def remove_card_from_workstream(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Remove a card from a workstream.

    This only removes the association; the card itself is not deleted.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        current_user: Authenticated user (injected)

    Returns:
        Success message

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized
    """
    _require_workstream_edit(workstream_id, current_user)

    # Check card exists in workstream (card_id param is actually workstream_card.id - the junction table ID)
    existing = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("id", card_id)
        .execute()
    )

    if not existing.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    # Delete the association
    supabase.table("workstream_cards").delete().eq("workstream_id", workstream_id).eq(
        "id", card_id
    ).execute()

    return {"status": "removed", "message": "Card removed from workstream"}


@router.post(
    "/me/workstreams/{workstream_id}/cards/{card_id}/deep-dive",
    response_model=ResearchTask,
)
async def trigger_card_deep_dive(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Trigger deep research for a card in the workstream.

    Creates a research task with task_type='deep_research' for the specified card.
    The research runs asynchronously; poll GET /research/{task_id} for status.

    Rate limited to 2 deep research requests per card per day.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        current_user: Authenticated user (injected)

    Returns:
        ResearchTask with the created task details

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized
        HTTPException 429: Daily rate limit exceeded
    """
    require_paid_user(current_user)
    _require_workstream_edit(workstream_id, current_user)

    # Verify card exists in workstream (card_id param is actually workstream_card.id - the junction table ID)
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id, card_id, status")
        .eq("workstream_id", workstream_id)
        .eq("id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    wsc_row = wsc_response.data[0]
    actual_card_id = wsc_row["card_id"]

    # Check rate limit for deep research
    service = ResearchService(supabase, openai_client)
    if not await service.check_rate_limit(actual_card_id):
        raise HTTPException(
            status_code=429, detail="Daily deep research limit reached (2 per card)"
        )

    task_record = {
        "user_id": current_user["id"],
        "card_id": actual_card_id,
        "task_type": "deep_research",
        "status": "queued",
    }

    task_result = supabase.table("research_tasks").insert(task_record).execute()

    if not task_result.data:
        raise HTTPException(status_code=500, detail="Failed to create research task")

    # Stamp research metadata + auto-promote inbox → working (PRD §State transitions).
    _record_research_trigger(card_id, wsc_row.get("status"), "deep")

    task = task_result.data[0]
    return ResearchTask(**task)


@router.post(
    "/me/workstreams/{workstream_id}/cards/{card_id}/quick-update",
    response_model=ResearchTask,
)
async def trigger_card_quick_update(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Trigger a quick 5-source update for a card in the workstream.

    Creates a research task with task_type='quick_update' for the specified card.
    This is a lighter-weight research update compared to deep_research.
    The research runs asynchronously; poll GET /research/{task_id} for status.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the workstream card (junction table ID)
        current_user: Authenticated user (injected)

    Returns:
        ResearchTask with the created task details

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized
    """
    require_paid_user(current_user)
    _require_workstream_edit(workstream_id, current_user)

    # Verify card exists in workstream (card_id param is actually workstream_card.id - the junction table ID)
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id, card_id, status")
        .eq("workstream_id", workstream_id)
        .eq("id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    wsc_row = wsc_response.data[0]
    actual_card_id = wsc_row["card_id"]

    task_record = {
        "user_id": current_user["id"],
        "card_id": actual_card_id,
        "task_type": "quick_update",
        "status": "queued",
    }

    task_result = supabase.table("research_tasks").insert(task_record).execute()

    if not task_result.data:
        raise HTTPException(status_code=500, detail="Failed to create research task")

    _record_research_trigger(card_id, wsc_row.get("status"), "quick")

    task = task_result.data[0]
    return ResearchTask(**task)


@router.post(
    "/me/workstreams/{workstream_id}/cards/{card_id}/check-updates",
    response_model=ResearchTask,
)
async def trigger_card_check_updates(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Check for updates on a watched card.

    This is an alias for quick-update, used by the kanban board's "Check for Updates"
    action on cards in the Watching column. Creates a research task with task_type='quick_update'.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the workstream card (junction table ID)
        current_user: Authenticated user (injected)

    Returns:
        ResearchTask with the created task details

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized
    """
    # Delegate to the quick-update implementation
    return await trigger_card_quick_update(workstream_id, card_id, current_user)


@router.get(
    "/me/workstreams/{workstream_id}/research-status",
    response_model=WorkstreamResearchStatusResponse,
)
async def get_workstream_research_status(
    workstream_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get active research tasks for cards in a workstream.

    Returns all research tasks (queued, processing) and recently completed tasks (last hour)
    for cards that are in the specified workstream. Used to show research progress indicators.

    Args:
        workstream_id: UUID of the workstream
        current_user: Authenticated user (injected)

    Returns:
        WorkstreamResearchStatusResponse with list of active tasks

    Raises:
        HTTPException 404: Workstream not found
        HTTPException 403: Not authorized
    """
    _require_workstream_read(workstream_id, current_user)

    # Get all card_ids in this workstream
    wsc_response = (
        supabase.table("workstream_cards")
        .select("card_id")
        .eq("workstream_id", workstream_id)
        .execute()
    )

    if not wsc_response.data:
        return WorkstreamResearchStatusResponse(tasks=[])

    card_ids = [item["card_id"] for item in wsc_response.data if item.get("card_id")]

    # If no valid card_ids, return empty response
    if not card_ids:
        return WorkstreamResearchStatusResponse(tasks=[])

    # Get research tasks for these cards that are:
    # - Currently active (queued or processing) AND created in the last 6h —
    #   anything older is an orphan from a crashed worker run, and we don't
    #   want it stuck on the card as a perpetual spinner.
    # - Recently completed/failed (within last hour for feedback)
    try:
        one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        active_cutoff = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()

        # Query active tasks
        active_tasks = (
            supabase.table("research_tasks")
            .select("id, card_id, task_type, status, started_at, completed_at")
            .in_("card_id", card_ids)
            .in_("status", ["queued", "processing"])
            .gte("created_at", active_cutoff)
            .execute()
        )

        # Query recently completed tasks
        recent_tasks = (
            supabase.table("research_tasks")
            .select("id, card_id, task_type, status, started_at, completed_at")
            .in_("card_id", card_ids)
            .in_("status", ["completed", "failed"])
            .gte("completed_at", one_hour_ago)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Error querying research tasks: {e}")
        return WorkstreamResearchStatusResponse(tasks=[])

    # Combine and format results
    all_tasks = (active_tasks.data or []) + (recent_tasks.data or [])

    # Deduplicate by card_id, keeping the most recent task per card
    task_by_card: Dict[str, dict] = {}
    for task in all_tasks:
        card_id = task["card_id"]
        if card_id not in task_by_card:
            task_by_card[card_id] = task
        else:
            # Keep the more recent task (prefer active over completed)
            existing = task_by_card[card_id]
            if task["status"] in ["queued", "processing"]:
                task_by_card[card_id] = task
            elif existing["status"] not in ["queued", "processing"]:
                # Both are completed/failed - keep most recent by completed_at
                if task.get("completed_at", "") > existing.get("completed_at", ""):
                    task_by_card[card_id] = task

    result_tasks = [
        WorkstreamResearchStatus(
            card_id=t["card_id"],
            task_id=t["id"],
            task_type=t["task_type"],
            status=t["status"],
            started_at=t.get("started_at"),
            completed_at=t.get("completed_at"),
        )
        for t in task_by_card.values()
    ]

    return WorkstreamResearchStatusResponse(tasks=result_tasks)


# ============================================================================
# v2: Watching toggle, share-payload, bulk actions
# See docs/16_PRD_Kanban_Redesign_and_Sharing.md
# ============================================================================


def _verify_workstream_owner(workstream_id: str, user_id: str) -> None:
    """Backward-compatible edit guard for older v2 helper call sites."""
    require_workstream_access(supabase, workstream_id, {"id": user_id}, "edit")


@router.post(
    "/me/workstreams/{workstream_id}/cards/{card_id}/watching",
    response_model=WorkstreamCardWithDetails,
)
async def toggle_workstream_card_watching(
    workstream_id: str,
    card_id: str,
    body: WorkstreamCardWatchingUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Toggle the `is_watching` flag on a workstream card."""
    _require_workstream_edit(workstream_id, current_user)

    wsc_response = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("id", card_id)
        .execute()
    )
    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    supabase.table("workstream_cards").update(
        {
            "is_watching": body.is_watching,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", card_id).execute()

    refreshed = (
        supabase.table("workstream_cards")
        .select("*, cards(*)")
        .eq("id", card_id)
        .execute()
    )
    if not refreshed.data:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated card")
    return _row_to_card_with_details(refreshed.data[0])


@router.get(
    "/me/workstreams/{workstream_id}/cards/{card_id}/share-payload",
    response_model=SharePayloadResponse,
)
async def get_workstream_card_share_payload(
    workstream_id: str,
    card_id: str,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Return a server-rendered email-friendly share payload for one card.

    The frontend opens the user's mail client via `mailto:` using these fields,
    so the body wording stays consistent regardless of which surface triggers
    the share.
    """
    _require_workstream_read(workstream_id, current_user)

    wsc_response = (
        supabase.table("workstream_cards")
        .select("*, cards(*)")
        .eq("workstream_id", workstream_id)
        .eq("id", card_id)
        .execute()
    )
    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    item = wsc_response.data[0]
    card = item.get("cards") or {}
    name = card.get("name") or "Untitled signal"
    summary = (card.get("summary") or "").strip()

    base_url = _normalize_frontend_base_url(
        os.getenv("FRONTEND_URL")
        or request.headers.get("x-foresight-frontend-url")
        or request.headers.get("origin")
    )
    url = _build_card_share_url(card, base_url)

    subject = f"Foresight signal: {name}"
    body_lines = [name, ""]
    if summary:
        body_lines.extend([summary, ""])
    body_lines.append(url)
    body = "\n".join(body_lines)

    return SharePayloadResponse(subject=subject, body=body, url=url)


@router.post(
    "/me/workstreams/{workstream_id}/bulk",
)
async def bulk_workstream_card_action(
    workstream_id: str,
    body: BulkCardActionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Run a bulk action across selected workstream cards.

    Supported actions (mutating):
      - archive          → status='archived' (records previous_status)
      - restore          → un-archive back to previous_status (else 'working')
      - watch / unwatch  → toggle is_watching
      - set_status       → params.status in {inbox,working,ready,archived}
      - set_brief_status → params.brief_status in VALID_BRIEF_STATUSES

    Read-only actions (caller renders results):
      - copy_share_links → returns {urls: [...]}
      - email_selection  → returns {subject, body}

    Heavier actions (rerun_research, generate_portfolio, generate_combined_memo,
    export_raw) are stubbed out for now and return 501.
    """
    if body.action in {"copy_share_links", "email_selection"}:
        _require_workstream_read(workstream_id, current_user)
    else:
        if body.action in {
            "rerun_research",
            "generate_portfolio",
            "generate_combined_memo",
            "export_raw",
        }:
            require_paid_user(current_user)
        _require_workstream_edit(workstream_id, current_user)

    rows_response = (
        supabase.table("workstream_cards")
        .select("*, cards(*)")
        .eq("workstream_id", workstream_id)
        .in_("id", body.card_ids)
        .execute()
    )
    rows = rows_response.data or []
    if len(rows) != len(set(body.card_ids)):
        # Some ids didn't match; surface that but still operate on the matched rows.
        logger.info(
            f"bulk action {body.action}: {len(rows)} of {len(body.card_ids)} cards matched"
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    action = body.action
    params = body.params or {}

    if action == "archive":
        for row in rows:
            if row.get("status") == "archived":
                continue
            supabase.table("workstream_cards").update(
                {
                    "status": "archived",
                    "previous_status": row.get("status") or "inbox",
                    "updated_at": now_iso,
                }
            ).eq("id", row["id"]).execute()
        return {"updated": len(rows), "action": action}

    if action == "restore":
        for row in rows:
            if row.get("status") != "archived":
                continue
            target = row.get("previous_status") or "working"
            if target not in VALID_WORKSTREAM_CARD_STATUSES or target == "archived":
                target = "working"
            supabase.table("workstream_cards").update(
                {
                    "status": target,
                    "previous_status": None,
                    "updated_at": now_iso,
                }
            ).eq("id", row["id"]).execute()
        return {"updated": len(rows), "action": action}

    if action in ("watch", "unwatch"):
        flag = action == "watch"
        if rows:
            supabase.table("workstream_cards").update(
                {"is_watching": flag, "updated_at": now_iso}
            ).in_("id", [r["id"] for r in rows]).execute()
        return {"updated": len(rows), "action": action, "is_watching": flag}

    if action == "set_status":
        new_status = params.get("status")
        if new_status not in VALID_WORKSTREAM_CARD_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"params.status must be one of: {sorted(VALID_WORKSTREAM_CARD_STATUSES)}",
            )
        for row in rows:
            update: Dict[str, Any] = {"status": new_status, "updated_at": now_iso}
            prev = row.get("status") or "inbox"
            if new_status == "archived" and prev != "archived":
                update["previous_status"] = prev
            elif prev == "archived" and new_status != "archived":
                update["previous_status"] = None
            supabase.table("workstream_cards").update(update).eq(
                "id", row["id"]
            ).execute()
        return {"updated": len(rows), "action": action, "status": new_status}

    if action == "set_brief_status":
        new_brief = params.get("brief_status")
        if new_brief not in VALID_BRIEF_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"params.brief_status must be one of: {sorted(VALID_BRIEF_STATUSES)}",
            )
        if rows:
            supabase.table("workstream_cards").update(
                {"brief_status": new_brief, "updated_at": now_iso}
            ).in_("id", [r["id"] for r in rows]).execute()
        return {"updated": len(rows), "action": action, "brief_status": new_brief}

    if action == "copy_share_links":
        base_url = _normalize_frontend_base_url(
            os.getenv("FRONTEND_URL") or str(params.get("frontend_url") or "")
        )
        urls = []
        for row in rows:
            card = row.get("cards") or {}
            url = _build_card_share_url(card, base_url)
            if url:
                urls.append(url)
        return {"urls": urls, "action": action}

    if action == "email_selection":
        base_url = _normalize_frontend_base_url(
            os.getenv("FRONTEND_URL") or str(params.get("frontend_url") or "")
        )
        lines: List[str] = []
        for row in rows:
            card = row.get("cards") or {}
            name = card.get("name") or "Untitled signal"
            url = _build_card_share_url(card, base_url)
            lines.append(f"- {name} {url}".rstrip())
        subject = f"Foresight signals ({len(rows)})"
        body_text = "Sharing the following Foresight signals:\n\n" + "\n".join(lines)
        return {"subject": subject, "body": body_text, "action": action}

    if action in (
        "rerun_research",
        "generate_portfolio",
        "generate_combined_memo",
        "export_raw",
    ):
        # These actions are tracked in the PRD but not wired into the worker
        # yet; the frontend should fall back to per-card calls until phase 4/5
        # ships them.
        raise HTTPException(
            status_code=501,
            detail=f"Bulk action '{action}' is not implemented in this build.",
        )

    raise HTTPException(status_code=400, detail=f"Unknown bulk action: {action}")
