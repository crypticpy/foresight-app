"""Workstream member management endpoints."""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.activity_log import record_activity, record_audit_event
from app.authz import require_workstream_access
from app.deps import supabase, get_current_user
from app.feature_flags import collaboration_enabled
from app.supabase_in_guard import chunked_in_query
from app.models.workstream_collab import (
    WorkstreamMember,
    WorkstreamMemberCreate,
    WorkstreamMemberUpdate,
)

router = APIRouter(
    prefix="/api/v1",
    tags=["workstream-members"],
    dependencies=[Depends(collaboration_enabled)],
)


def _profile_lookup(user_ids: list[str]) -> dict[str, dict]:
    if not user_ids:
        return {}

    def _fetch(chunk):
        resp = (
            supabase.table("users")
            .select("id, email, display_name")
            .in_("id", chunk)
            .execute()
        )
        return resp.data or []

    return {row["id"]: row for row in chunked_in_query(_fetch, user_ids)}


def _serialize_member(row: dict, profiles: dict[str, dict]) -> WorkstreamMember:
    profile = profiles.get(row["user_id"], {})
    return WorkstreamMember(
        user_id=row["user_id"],
        email=profile.get("email"),
        display_name=profile.get("display_name"),
        role=row["role"],
        added_by=row.get("added_by"),
        created_at=row.get("created_at"),
    )


@router.get("/me/workstreams/{workstream_id}/members", response_model=list[WorkstreamMember])
async def list_workstream_members(
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "read")

    def load_rows() -> list[WorkstreamMember]:
        ws = (
            supabase.table("workstreams")
            .select("user_id")
            .eq("id", workstream_id)
            .limit(1)
            .execute()
        )
        rows = []
        if ws.data and ws.data[0].get("user_id"):
            rows.append(
                {
                    "user_id": ws.data[0]["user_id"],
                    "role": "owner",
                    "added_by": None,
                    "created_at": None,
                }
            )
        members = (
            supabase.table("workstream_members")
            .select("*")
            .eq("workstream_id", workstream_id)
            .order("created_at")
            .execute()
        )
        rows.extend(members.data or [])
        profiles = _profile_lookup([row["user_id"] for row in rows if row.get("user_id")])
        return [_serialize_member(row, profiles) for row in rows]

    return await asyncio.to_thread(load_rows)


@router.post("/me/workstreams/{workstream_id}/members", response_model=WorkstreamMember)
async def add_workstream_member(
    workstream_id: str,
    member: WorkstreamMemberCreate,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "manage")

    def add_member() -> WorkstreamMember:
        profile = (
            supabase.table("users")
            .select("id, email, display_name, account_type")
            .eq("email", member.user_email)
            .limit(1)
            .execute()
        )
        if not profile.data:
            raise HTTPException(status_code=404, detail="No Foresight user exists with that email")
        target = profile.data[0]
        if target.get("id") == current_user["id"]:
            raise HTTPException(status_code=400, detail="Owners already manage their own workstreams")
        if (target.get("account_type") or "paid") == "guest" and member.role == "editor":
            raise HTTPException(status_code=400, detail="Guest accounts cannot be editors")

        row = {
            "workstream_id": workstream_id,
            "user_id": target["id"],
            "role": member.role,
            "added_by": current_user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        result = (
            supabase.table("workstream_members")
            .upsert(row, on_conflict="workstream_id,user_id")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to add member")
        created = result.data[0]
        record_activity(
            supabase,
            workstream_id=workstream_id,
            actor_id=current_user["id"],
            action="member.added",
            target_type="user",
            target_id=target["id"],
            metadata={"role": member.role},
        )
        record_audit_event(
            supabase,
            actor_id=current_user["id"],
            action="member.added",
            target_type="workstream_member",
            target_id=created.get("id"),
            after_state=created,
        )
        return _serialize_member(created, {target["id"]: target})

    return await asyncio.to_thread(add_member)


@router.patch(
    "/me/workstreams/{workstream_id}/members/{user_id}",
    response_model=WorkstreamMember,
)
async def update_workstream_member(
    workstream_id: str,
    user_id: str,
    update: WorkstreamMemberUpdate,
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "manage")

    def update_member() -> WorkstreamMember:
        existing = (
            supabase.table("workstream_members")
            .select("*")
            .eq("workstream_id", workstream_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Member not found")
        before = existing.data[0]
        if before.get("role") == "owner":
            raise HTTPException(status_code=400, detail="Ownership transfer is not supported")
        result = (
            supabase.table("workstream_members")
            .update({"role": update.role, "updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("workstream_id", workstream_id)
            .eq("user_id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to update member")
        after = result.data[0]
        record_activity(
            supabase,
            workstream_id=workstream_id,
            actor_id=current_user["id"],
            action="member.role_changed",
            target_type="user",
            target_id=user_id,
            metadata={"before": before.get("role"), "after": update.role},
        )
        record_audit_event(
            supabase,
            actor_id=current_user["id"],
            action="member.role_changed",
            target_type="workstream_member",
            target_id=after.get("id"),
            before_state=before,
            after_state=after,
        )
        profiles = _profile_lookup([user_id])
        return _serialize_member(after, profiles)

    return await asyncio.to_thread(update_member)


@router.delete("/me/workstreams/{workstream_id}/members/{user_id}")
async def remove_workstream_member(
    workstream_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    if user_id != current_user["id"]:
        await asyncio.to_thread(
            require_workstream_access,
            supabase,
            workstream_id,
            current_user,
            "manage",
        )
    else:
        await asyncio.to_thread(
            require_workstream_access,
            supabase,
            workstream_id,
            current_user,
            "read",
        )

    def remove_member() -> dict:
        existing = (
            supabase.table("workstream_members")
            .select("*")
            .eq("workstream_id", workstream_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            raise HTTPException(status_code=404, detail="Member not found")
        before = existing.data[0]
        if before.get("role") == "owner":
            raise HTTPException(status_code=400, detail="Owners cannot leave without transfer")
        supabase.table("workstream_members").delete().eq("workstream_id", workstream_id).eq(
            "user_id", user_id
        ).execute()
        record_activity(
            supabase,
            workstream_id=workstream_id,
            actor_id=current_user["id"],
            action="member.removed",
            target_type="user",
            target_id=user_id,
            metadata={"role": before.get("role")},
        )
        record_audit_event(
            supabase,
            actor_id=current_user["id"],
            action="member.removed",
            target_type="workstream_member",
            target_id=before.get("id"),
            before_state=before,
        )
        return {"status": "removed"}

    return await asyncio.to_thread(remove_member)


@router.delete("/me/workstream_memberships/me")
async def leave_workstream(
    workstream_id: str = Query(...),
    current_user: dict = Depends(get_current_user),
):
    return await remove_workstream_member(workstream_id, current_user["id"], current_user)
