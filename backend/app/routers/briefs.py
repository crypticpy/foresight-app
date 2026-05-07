"""Executive briefs router."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.activity_log import record_activity
from app.authz import require_paid_user, require_workstream_access
from app.deps import supabase, get_current_user, _safe_error, openai_client
from app.brief_service import ExecutiveBriefService
from app.export_service import ExportService
from app.models.brief import (
    ExecutiveBriefResponse,
    BriefGenerateResponse,
    BriefStatusResponse,
    BriefVersionsResponse,
    BriefVersionListItem,
)
from app.models.briefs_extra import (
    BulkExportRequest,
    BulkBriefCardStatus,
    BulkBriefStatusResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["briefs"])


@router.post(
    "/me/workstreams/{workstream_id}/cards/{card_id}/brief",
    response_model=BriefGenerateResponse,
)
async def generate_executive_brief(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Generate a new version of an executive brief for a card in a workstream.

    Creates a new brief version that runs asynchronously.
    Each call creates a new version (v1, v2, v3, etc.).
    Poll GET .../brief/status for completion status.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        current_user: Authenticated user (injected)

    Returns:
        BriefGenerateResponse with brief ID, version, and pending status

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized to access workstream
    """
    require_paid_user(current_user)
    require_workstream_access(supabase, workstream_id, current_user, "edit")

    # Verify card exists in workstream and get the workstream_cards record
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id, card_id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    workstream_card_id = wsc_response.data[0]["id"]

    # Create brief service
    brief_service = ExecutiveBriefService(supabase, openai_client)

    try:
        # Check if there's a brief currently generating
        existing_brief = await brief_service.get_brief_by_workstream_card(
            workstream_card_id
        )

        if existing_brief and existing_brief.get("status") in ("pending", "generating"):
            # Don't allow generating while another is in progress
            return BriefGenerateResponse(
                id=existing_brief["id"],
                status=existing_brief["status"],
                version=existing_brief.get("version", 1),
                message="Brief generation already in progress",
            )

        # Get the last completed brief to determine new sources
        last_completed = await brief_service.get_latest_completed_brief(
            workstream_card_id
        )
        since_timestamp = None
        sources_since_previous = None

        if last_completed and last_completed.get("generated_at"):
            since_timestamp = last_completed["generated_at"]
            # Count new sources since last brief
            new_source_count = await brief_service.count_new_sources(
                card_id, since_timestamp
            )
            sources_since_previous = {
                "count": new_source_count,
                "since_version": last_completed.get("version", 1),
                "since_date": since_timestamp,
            }

        # Create the brief record with pending status (auto-increments version)
        brief_record = await brief_service.create_brief_record(
            workstream_card_id=workstream_card_id,
            card_id=card_id,
            user_id=current_user["id"],
            sources_since_previous=sources_since_previous,
        )

        brief_id = brief_record["id"]
        brief_version = brief_record.get("version", 1)
        record_activity(
            supabase,
            workstream_id=workstream_id,
            actor_id=current_user["id"],
            action="brief.generated",
            target_type="brief",
            target_id=brief_id,
            metadata={"card_id": card_id, "version": brief_version},
        )

        return BriefGenerateResponse(
            id=brief_id,
            status="pending",
            version=brief_version,
            message=f"Brief v{brief_version} queued for generation",
        )

    except Exception as e:
        logger.error(f"Failed to initiate brief generation: {str(e)}")
        raise HTTPException(
            status_code=500, detail=_safe_error("brief generation", e)
        ) from e


@router.get(
    "/me/workstreams/{workstream_id}/cards/{card_id}/brief",
    response_model=ExecutiveBriefResponse,
)
async def get_executive_brief(
    workstream_id: str,
    card_id: str,
    version: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Get an executive brief for a card in a workstream.

    Returns the latest version by default, or a specific version if provided.
    Returns 404 if no brief exists.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        version: Optional version number (defaults to latest)
        current_user: Authenticated user (injected)

    Returns:
        ExecutiveBriefResponse with full brief content

    Raises:
        HTTPException 404: Workstream, card, or brief not found
        HTTPException 403: Not authorized to access workstream
    """
    # Verify workstream belongs to user
    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    if ws_response.data[0]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this workstream"
        )

    # Verify card exists in workstream and get the workstream_cards record
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    workstream_card_id = wsc_response.data[0]["id"]

    # Fetch the brief (latest or specific version)
    brief_service = ExecutiveBriefService(supabase, openai_client)
    brief = await brief_service.get_brief_by_workstream_card(
        workstream_card_id, version=version
    )

    if not brief:
        if version:
            raise HTTPException(
                status_code=404, detail=f"Brief version {version} not found"
            )
        raise HTTPException(status_code=404, detail="No brief found for this card")

    return ExecutiveBriefResponse(**brief)


@router.get(
    "/me/workstreams/{workstream_id}/cards/{card_id}/brief/versions",
    response_model=BriefVersionsResponse,
)
async def get_brief_versions(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get all versions of executive briefs for a card in a workstream.

    Returns a list of all brief versions, ordered by version number descending.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        current_user: Authenticated user (injected)

    Returns:
        BriefVersionsResponse with list of all versions

    Raises:
        HTTPException 404: Workstream or card not found
        HTTPException 403: Not authorized to access workstream
    """
    # Verify workstream belongs to user
    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    if ws_response.data[0]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this workstream"
        )

    # Verify card exists in workstream and get the workstream_cards record
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    workstream_card_id = wsc_response.data[0]["id"]

    # Fetch all versions
    brief_service = ExecutiveBriefService(supabase, openai_client)
    versions = await brief_service.get_brief_versions(workstream_card_id)

    # Convert to response model
    version_items = [
        BriefVersionListItem(
            id=v["id"],
            version=v.get("version", 1),
            status=v["status"],
            summary=v.get("summary"),
            sources_since_previous=v.get("sources_since_previous"),
            generated_at=v.get("generated_at"),
            created_at=v["created_at"],
            model_used=v.get("model_used"),
        )
        for v in versions
    ]

    return BriefVersionsResponse(
        workstream_card_id=workstream_card_id,
        card_id=card_id,
        total_versions=len(version_items),
        versions=version_items,
    )


@router.get(
    "/me/workstreams/{workstream_id}/cards/{card_id}/brief/status",
    response_model=BriefStatusResponse,
)
async def get_brief_status(
    workstream_id: str, card_id: str, current_user: dict = Depends(get_current_user)
):
    """
    Get the status of brief generation for a card.

    Used for polling during async brief generation.
    Returns status, summary (if complete), or error (if failed).

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        current_user: Authenticated user (injected)

    Returns:
        BriefStatusResponse with generation status

    Raises:
        HTTPException 404: Workstream, card, or brief not found
        HTTPException 403: Not authorized to access workstream
    """
    # Verify workstream belongs to user
    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    if ws_response.data[0]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this workstream"
        )

    # Verify card exists in workstream and get the workstream_cards record
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    workstream_card_id = wsc_response.data[0]["id"]

    # Fetch the most recent brief
    brief_service = ExecutiveBriefService(supabase, openai_client)
    brief = await brief_service.get_brief_by_workstream_card(workstream_card_id)

    if not brief:
        raise HTTPException(status_code=404, detail="No brief found for this card")

    # Build progress message based on status
    progress_message = None
    if brief["status"] == "pending":
        progress_message = "Brief generation queued..."
    elif brief["status"] == "generating":
        progress_message = "Generating executive brief..."

    return BriefStatusResponse(
        id=brief["id"],
        status=brief["status"],
        version=brief.get("version", 1),
        summary=brief.get("summary"),
        error_message=brief.get("error_message"),
        generated_at=brief.get("generated_at"),
        progress_message=progress_message,
    )


@router.get("/me/workstreams/{workstream_id}/cards/{card_id}/brief/export/{format}")
async def export_brief(
    workstream_id: str,
    card_id: str,
    format: str,
    version: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Export an executive brief in the specified format.

    Exports the brief content (not the original card) as a PDF or PowerPoint
    presentation formatted for executive communication.

    Args:
        workstream_id: UUID of the workstream
        card_id: UUID of the card
        format: Export format (pdf or pptx)
        version: Optional version number to export (defaults to latest)
        current_user: Authenticated user (injected)

    Returns:
        FileResponse with the exported brief document

    Raises:
        HTTPException 400: Invalid export format
        HTTPException 404: Workstream, card, or brief not found
        HTTPException 403: Not authorized to access workstream
    """
    # Validate format
    format_lower = format.lower()
    if format_lower not in ("pdf", "pptx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid export format: {format}. Supported formats: pdf, pptx",
        )

    # Verify workstream belongs to user
    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    if ws_response.data[0]["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this workstream"
        )

    # Verify card exists in workstream and get the workstream_cards record
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_id)
        .execute()
    )

    if not wsc_response.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")

    workstream_card_id = wsc_response.data[0]["id"]

    # Fetch the brief
    brief_service = ExecutiveBriefService(supabase, openai_client)
    brief = await brief_service.get_brief_by_workstream_card(
        workstream_card_id, version=version
    )

    if not brief:
        raise HTTPException(status_code=404, detail="No brief found for this card")

    if brief["status"] != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Brief is not yet complete. Please wait for generation to finish.",
        )

    # Fetch card info for the export (including classification)
    card_response = (
        supabase.table("cards")
        .select("name, pillar_id, horizon, stage_id")
        .eq("id", card_id)
        .single()
        .execute()
    )

    card_name = "Unknown Card"
    classification = {}
    if card_response.data:
        card_name = card_response.data.get("name", "Unknown Card")
        # Build classification info for professional PDF
        classification = {
            "pillar": card_response.data.get("pillar_id"),
            "horizon": card_response.data.get("horizon"),
            "stage": card_response.data.get("stage_id"),
        }

    # Generate export using ExportService
    export_service = ExportService(supabase)

    try:
        # Parse generated_at if present
        generated_at = None
        if brief.get("generated_at"):
            from datetime import datetime

            if isinstance(brief["generated_at"], str):
                generated_at = datetime.fromisoformat(
                    brief["generated_at"].replace("Z", "+00:00")
                )
            else:
                generated_at = brief["generated_at"]

        if format_lower == "pdf":
            # Use professional PDF with logo, branding, and AI disclosure
            file_path = await export_service.generate_professional_brief_pdf(
                brief_title=card_name,
                card_name=card_name,
                executive_summary=brief.get("summary", ""),
                content_markdown=brief.get("content_markdown", ""),
                generated_at=generated_at,
                version=brief.get("version", 1),
                classification=classification,
            )
            content_type = "application/pdf"
            extension = "pdf"
        else:
            file_path = await export_service.generate_brief_pptx(
                brief_title=card_name,
                card_name=card_name,
                executive_summary=brief.get("summary", ""),
                content_markdown=brief.get("content_markdown", ""),
                generated_at=generated_at,
                version=brief.get("version", 1),
                classification=classification,
                use_gamma=True,  # Try Gamma.app first, fallback to local
            )
            content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            extension = "pptx"

        # Generate safe filename
        safe_name = "".join(c if c.isalnum() or c in " -_" else "_" for c in card_name)
        safe_name = safe_name[:50]  # Limit length
        version_str = (
            f"_v{brief.get('version', 1)}" if brief.get("version", 1) > 1 else ""
        )
        filename = f"Brief_{safe_name}{version_str}.{extension}"

        return FileResponse(
            path=file_path, filename=filename, media_type=content_type, background=None
        )

    except Exception as e:
        logger.error(f"Brief export generation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("export generation", e),
        ) from e


# =============================================================================
# Bulk Brief Export (Portfolio)
# =============================================================================


@router.get("/me/workstreams/{workstream_id}/bulk-brief-status")
async def get_bulk_brief_status(
    workstream_id: str, current_user: dict = Depends(get_current_user)
) -> BulkBriefStatusResponse:
    """
    Get brief status for all cards in the Brief column.

    Used by the frontend to show which cards have completed briefs
    before initiating a bulk export.

    Args:
        workstream_id: UUID of the workstream
        current_user: Authenticated user (injected)

    Returns:
        BulkBriefStatusResponse with summary counts and per-card status
    """
    # Verify workstream belongs to user
    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id, name")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")
    if ws_response.data[0]["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get all cards in brief column
    wsc_response = (
        supabase.table("workstream_cards")
        .select("id, card_id, status, position, cards(id, name, pillar_id, horizon)")
        .eq("workstream_id", workstream_id)
        .eq("status", "brief")
        .order("position")
        .execute()
    )

    card_statuses = []
    cards_with_briefs = 0
    cards_ready = 0

    for wsc in wsc_response.data or []:
        card = wsc.get("cards", {})
        card_id = wsc.get("card_id")
        position = wsc.get("position", 0)

        # Check for completed brief
        brief_response = (
            supabase.table("executive_briefs")
            .select("id, status")
            .eq("workstream_card_id", wsc["id"])
            .eq("status", "completed")
            .limit(1)
            .execute()
        )

        has_brief = len(brief_response.data or []) > 0
        brief_status = brief_response.data[0]["status"] if has_brief else None

        if has_brief:
            cards_with_briefs += 1
            if brief_status == "completed":
                cards_ready += 1

        card_statuses.append(
            BulkBriefCardStatus(
                card_id=card_id,
                card_name=card.get("name", "Unknown"),
                has_brief=has_brief,
                brief_status=brief_status,
                position=position,
            )
        )

    return BulkBriefStatusResponse(
        total_cards=len(card_statuses),
        cards_with_briefs=cards_with_briefs,
        cards_ready=cards_ready,
        card_statuses=card_statuses,
    )


@router.post("/me/workstreams/{workstream_id}/bulk-brief-export")
async def bulk_brief_export(
    workstream_id: str,
    request: BulkExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Export multiple briefs as a single portfolio presentation (legacy endpoint).

    Saved portfolios use ``POST /me/portfolios/{id}/export`` instead. This
    endpoint remains for the kanban Brief-column flow.
    """
    from app.portfolio_export import render_portfolio_export

    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id, name")
        .eq("id", workstream_id)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")
    if ws_response.data[0]["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    deck_title = ws_response.data[0].get("name") or "Strategic Portfolio"
    return await render_portfolio_export(
        card_order=request.card_order or [],
        deck_title=deck_title,
        format=request.format,
        workstream_id=workstream_id,
    )
