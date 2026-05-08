"""Public share-link management and viewer endpoints."""

import asyncio
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.authz import require_paid_user, require_workstream_access
from app.deps import supabase, get_current_user
from app.feature_flags import public_share_enabled
from app.models.workstream_collab import PublicSharePayload, ShareLinkCreate, ShareLinkResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["share-links"])


def _frontend_base_url() -> str:
    return (
        os.getenv("FRONTEND_BASE_URL")
        or os.getenv("APP_FRONTEND_URL")
        or "http://localhost:5173"
    ).rstrip("/")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _serialize(row: dict, include_token: bool = True) -> ShareLinkResponse:
    token = row["token"] if include_token else None
    return ShareLinkResponse(
        **row,
        token=token,
        share_url=f"{_frontend_base_url()}/shared/{row['token']}" if include_token else None,
    )


def _authorize_share_target(target_type: str, target_id: str, user: dict) -> None:
    require_paid_user(user)
    if target_type == "card":
        card = (
            supabase.table("cards")
            .select("id, created_by")
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        if not card.data:
            raise HTTPException(status_code=404, detail="Card not found")
        # Signal share links are auth-gated. Any paid user who can view the
        # signal library can mint a signal-level share link.
        return
    if target_type == "portfolio":
        portfolio = (
            supabase.table("portfolios")
            .select("id, user_id, workstream_id")
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        if not portfolio.data:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        row = portfolio.data[0]
        if row.get("workstream_id"):
            require_workstream_access(supabase, row["workstream_id"], user, "manage")
        elif row.get("user_id") != user["id"]:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return
    if target_type == "brief":
        brief = (
            supabase.table("executive_briefs")
            .select("id, workstream_card_id, workstream_cards(workstream_id)")
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        if not brief.data:
            raise HTTPException(status_code=404, detail="Brief not found")
        workstream_id = (brief.data[0].get("workstream_cards") or {}).get("workstream_id")
        if not workstream_id:
            raise HTTPException(status_code=404, detail="Brief not found")
        require_workstream_access(supabase, workstream_id, user, "manage")


@router.post(
    "/me/share-links",
    response_model=ShareLinkResponse,
    dependencies=[Depends(public_share_enabled)],
)
async def create_share_link(
    request: ShareLinkCreate,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(
        _authorize_share_target, request.target_type, request.target_id, current_user
    )

    def create() -> ShareLinkResponse:
        expires_at = (
            (_now() + timedelta(days=request.expires_in_days)).isoformat()
            if request.expires_in_days
            else None
        )
        row = {
            "target_type": request.target_type,
            "target_id": request.target_id,
            "token": secrets.token_urlsafe(32),
            "created_by": current_user["id"],
            "expires_at": expires_at,
        }
        result = supabase.table("share_links").insert(row).execute()
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to create share link")
        return _serialize(result.data[0])

    return await asyncio.to_thread(create)


@router.get(
    "/me/share-links",
    response_model=list[ShareLinkResponse],
    dependencies=[Depends(public_share_enabled)],
)
async def list_share_links(
    target_type: str | None = Query(default=None),
    target_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    def load() -> list[ShareLinkResponse]:
        query = (
            supabase.table("share_links")
            .select("*")
            .eq("created_by", current_user["id"])
            .is_("revoked_at", "null")
            .order("created_at", desc=True)
        )
        if target_type:
            query = query.eq("target_type", target_type)
        if target_id:
            query = query.eq("target_id", target_id)
        return [_serialize(row) for row in query.execute().data or []]

    return await asyncio.to_thread(load)


@router.delete(
    "/me/share-links/{share_link_id}",
    dependencies=[Depends(public_share_enabled)],
)
async def revoke_share_link(
    share_link_id: str,
    current_user: dict = Depends(get_current_user),
):
    def revoke() -> dict:
        result = (
            supabase.table("share_links")
            .update({"revoked_at": _now().isoformat()})
            .eq("id", share_link_id)
            .eq("created_by", current_user["id"])
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Share link not found")
        return {"status": "revoked"}

    return await asyncio.to_thread(revoke)


@router.get(
    "/share/{token}",
    response_model=PublicSharePayload,
    dependencies=[Depends(public_share_enabled)],
)
async def public_share(token: str, _current_user: dict = Depends(get_current_user)):
    def load() -> PublicSharePayload:
        result = supabase.table("share_links").select("*").eq("token", token).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Share link not found")
        link = result.data[0]
        if link.get("revoked_at"):
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link revoked")
        if link.get("expires_at") and _parse_ts(link["expires_at"]) < _now():
            raise HTTPException(status_code=status.HTTP_410_GONE, detail="Share link expired")

        target_type = link["target_type"]
        target_id = link["target_id"]
        if target_type == "card":
            data = supabase.table("cards").select("*").eq("id", target_id).limit(1).execute().data
            payload = data[0] if data else {}
        elif target_type == "portfolio":
            portfolio = supabase.table("portfolios").select("*").eq("id", target_id).limit(1).execute().data
            items = (
                supabase.table("portfolio_items")
                .select("*, cards(*)")
                .eq("portfolio_id", target_id)
                .order("position")
                .execute()
                .data
            )
            payload = {"portfolio": portfolio[0] if portfolio else {}, "items": items or []}
        else:
            data = supabase.table("executive_briefs").select("*").eq("id", target_id).limit(1).execute().data
            payload = data[0] if data else {}
        # Atomic increment to avoid the read-then-write race when multiple
        # recipients open the same link concurrently.
        try:
            supabase.rpc(
                "increment_share_link_view", {"link_id": link["id"]}
            ).execute()
        except Exception as exc:
            # Don't fail the share read if the analytics update errors.
            logger.warning(
                f"increment_share_link_view failed for {link['id']}: {exc}"
            )
        creator = (
            supabase.table("users")
            .select("display_name")
            .eq("id", link["created_by"])
            .limit(1)
            .execute()
            .data
            or []
        )
        creator_row = creator[0] if creator else {}
        return PublicSharePayload(
            target_type=target_type,
            target_id=target_id,
            data=payload,
            created_by_name=creator_row.get("display_name"),
            expires_at=link.get("expires_at"),
        )

    return await asyncio.to_thread(load)
