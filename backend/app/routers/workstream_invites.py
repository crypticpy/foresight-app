"""Workstream invite token endpoints."""

import asyncio
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.activity_log import record_activity, record_audit_event
from app.authz import require_workstream_access
from app.deps import supabase, get_current_user
from app.feature_flags import collaboration_enabled
from app.models.workstream_collab import (
    CompleteSignupRequest,
    InviteAcceptResponse,
    WorkstreamInvite,
    WorkstreamInviteCreate,
    WorkstreamInviteCreateResponse,
    WorkstreamInvitePreview,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["workstream-invites"],
    dependencies=[Depends(collaboration_enabled)],
)


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


def _active_invite_or_error(token: str) -> dict:
    result = (
        supabase.table("workstream_invites")
        .select("*")
        .eq("token", token)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invite not found")
    invite = result.data[0]
    if invite.get("revoked_at") or invite.get("consumed_at"):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite is no longer active")
    if _parse_ts(invite["expires_at"]) < _now():
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired")
    return invite


def _preview_from_invite(invite: dict) -> WorkstreamInvitePreview:
    ws = (
        supabase.table("workstreams")
        .select("id, name")
        .eq("id", invite["workstream_id"])
        .limit(1)
        .execute()
    )
    inviter = (
        supabase.table("users")
        .select("display_name, email")
        .eq("id", invite["created_by"])
        .limit(1)
        .execute()
    )
    if not ws.data:
        raise HTTPException(status_code=404, detail="Workstream not found")
    inviter_row = inviter.data[0] if inviter.data else {}
    return WorkstreamInvitePreview(
        workstream_id=invite["workstream_id"],
        workstream_name=ws.data[0].get("name") or "Shared workstream",
        inviter_display_name=inviter_row.get("display_name"),
        inviter_email=inviter_row.get("email"),
        intended_role=invite["intended_role"],
        intended_account_type=invite.get("intended_account_type") or "paid",
        email=invite.get("email"),
        expires_at=invite["expires_at"],
    )


@router.post(
    "/me/workstreams/{workstream_id}/invites",
    response_model=WorkstreamInviteCreateResponse,
)
async def create_workstream_invite(
    workstream_id: str,
    invite: WorkstreamInviteCreate,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "manage")

    def create_invite() -> WorkstreamInviteCreateResponse:
        token = secrets.token_urlsafe(32)
        expires_at = _now() + timedelta(days=invite.expires_in_days)
        row = {
            "workstream_id": workstream_id,
            "email": invite.email,
            "intended_role": invite.role,
            "intended_account_type": invite.intended_account_type,
            "token": token,
            "created_by": current_user["id"],
            "expires_at": expires_at.isoformat(),
        }
        result = supabase.table("workstream_invites").insert(row).execute()
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to create invite")
        created = result.data[0]
        record_activity(
            supabase,
            workstream_id=workstream_id,
            actor_id=current_user["id"],
            action="invite.created",
            target_type="invite",
            target_id=created["id"],
            metadata={"role": invite.role, "email": invite.email},
        )
        record_audit_event(
            supabase,
            actor_id=current_user["id"],
            action="invite.created",
            target_type="workstream_invite",
            target_id=created["id"],
            after_state={k: v for k, v in created.items() if k != "token"},
        )
        return WorkstreamInviteCreateResponse(
            invite_id=created["id"],
            token=token,
            share_url=f"{_frontend_base_url()}/invite/{token}",
            expires_at=created["expires_at"],
        )

    return await asyncio.to_thread(create_invite)


@router.get("/me/workstreams/{workstream_id}/invites", response_model=list[WorkstreamInvite])
async def list_workstream_invites(
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "manage")

    def list_invites() -> list[WorkstreamInvite]:
        rows = (
            supabase.table("workstream_invites")
            .select("*")
            .eq("workstream_id", workstream_id)
            .is_("consumed_at", "null")
            .is_("revoked_at", "null")
            .order("created_at", desc=True)
            .execute()
        )
        return [
            WorkstreamInvite(
                **row,
                share_url=f"{_frontend_base_url()}/invite/{row['token']}",
            )
            for row in rows.data or []
            if _parse_ts(row["expires_at"]) >= _now()
        ]

    return await asyncio.to_thread(list_invites)


@router.delete("/me/workstreams/{workstream_id}/invites/{invite_id}")
async def revoke_workstream_invite(
    workstream_id: str,
    invite_id: str,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "manage")

    def revoke() -> dict:
        existing = (
            supabase.table("workstream_invites")
            .select("*")
            .eq("id", invite_id)
            .eq("workstream_id", workstream_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Invite not found")
        result = (
            supabase.table("workstream_invites")
            .update({"revoked_at": _now().isoformat()})
            .eq("id", invite_id)
            .execute()
        )
        record_activity(
            supabase,
            workstream_id=workstream_id,
            actor_id=current_user["id"],
            action="invite.revoked",
            target_type="invite",
            target_id=invite_id,
            metadata={"email": existing.data[0].get("email")},
        )
        record_audit_event(
            supabase,
            actor_id=current_user["id"],
            action="invite.revoked",
            target_type="workstream_invite",
            target_id=invite_id,
            before_state={k: v for k, v in existing.data[0].items() if k != "token"},
            after_state={k: v for k, v in (result.data[0] if result.data else {}).items() if k != "token"},
        )
        return {"status": "revoked"}

    return await asyncio.to_thread(revoke)


@router.get("/invites/{token}", response_model=WorkstreamInvitePreview)
async def preview_invite(token: str):
    return await asyncio.to_thread(lambda: _preview_from_invite(_active_invite_or_error(token)))


@router.post("/invites/{token}/accept", response_model=InviteAcceptResponse)
async def accept_invite(
    token: str,
    current_user: dict = Depends(get_current_user),
):
    def accept() -> InviteAcceptResponse:
        invite = _active_invite_or_error(token)
        existing = (
            supabase.table("workstream_members")
            .select("role")
            .eq("workstream_id", invite["workstream_id"])
            .eq("user_id", current_user["id"])
            .limit(1)
            .execute()
        )
        if existing.data:
            status_value = "already_member"
            role = existing.data[0].get("role")
        else:
            role = invite["intended_role"]
            supabase.table("workstream_members").insert(
                {
                    "workstream_id": invite["workstream_id"],
                    "user_id": current_user["id"],
                    "role": role,
                    "added_by": invite["created_by"],
                }
            ).execute()
            status_value = "accepted"

        supabase.table("workstream_invites").update(
            {"consumed_at": _now().isoformat(), "consumed_by": current_user["id"]}
        ).eq("id", invite["id"]).execute()
        record_activity(
            supabase,
            workstream_id=invite["workstream_id"],
            actor_id=current_user["id"],
            action="invite.accepted",
            target_type="invite",
            target_id=invite["id"],
            metadata={"role": role},
        )
        return InviteAcceptResponse(
            workstream_id=invite["workstream_id"],
            role=role,
            status=status_value,
        )

    return await asyncio.to_thread(accept)


@router.post("/auth/complete-signup", response_model=InviteAcceptResponse)
async def complete_signup(
    request: CompleteSignupRequest,
    current_user: dict = Depends(get_current_user),
):
    def complete() -> InviteAcceptResponse:
        invite = _active_invite_or_error(request.invite_token)
        supabase.table("users").update(
            {"account_type": invite.get("intended_account_type") or "paid"}
        ).eq("id", current_user["id"]).execute()
        current_user["account_type"] = invite.get("intended_account_type") or "paid"
        return accept_sync(invite, current_user)

    def accept_sync(invite: dict, user: dict) -> InviteAcceptResponse:
        existing = (
            supabase.table("workstream_members")
            .select("role")
            .eq("workstream_id", invite["workstream_id"])
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )
        if existing.data:
            role = existing.data[0].get("role")
            status_value = "already_member"
        else:
            role = invite["intended_role"]
            supabase.table("workstream_members").insert(
                {
                    "workstream_id": invite["workstream_id"],
                    "user_id": user["id"],
                    "role": role,
                    "added_by": invite["created_by"],
                }
            ).execute()
            status_value = "accepted"
        supabase.table("workstream_invites").update(
            {"consumed_at": _now().isoformat(), "consumed_by": user["id"]}
        ).eq("id", invite["id"]).execute()
        return InviteAcceptResponse(
            workstream_id=invite["workstream_id"],
            role=role,
            status=status_value,
        )

    return await asyncio.to_thread(complete)
