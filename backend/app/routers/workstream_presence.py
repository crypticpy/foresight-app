"""Optional table-backed workstream presence."""

import asyncio
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.authz import require_workstream_access
from app.deps import supabase, get_current_user
from app.feature_flags import collaboration_enabled, realtime_enabled
from app.models.workstream_collab import PresenceHeartbeatResponse, WorkstreamMember

router = APIRouter(prefix="/api/v1", tags=["workstream-presence"])


@router.post(
    "/me/workstreams/{workstream_id}/presence/heartbeat",
    response_model=PresenceHeartbeatResponse,
)
async def heartbeat_presence(
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
):
    collaboration_enabled()
    realtime_enabled()
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "read")

    def write() -> PresenceHeartbeatResponse:
        now = datetime.now(timezone.utc).isoformat()
        result = (
            supabase.table("workstream_presence")
            .upsert(
                {
                    "workstream_id": workstream_id,
                    "user_id": current_user["id"],
                    "last_seen_at": now,
                },
                on_conflict="workstream_id,user_id",
            )
            .execute()
        )
        row = result.data[0] if result.data else {
            "workstream_id": workstream_id,
            "user_id": current_user["id"],
            "last_seen_at": now,
        }
        return PresenceHeartbeatResponse(**row)

    return await asyncio.to_thread(write)


@router.get("/me/workstreams/{workstream_id}/presence", response_model=list[WorkstreamMember])
async def list_presence(
    workstream_id: str,
    current_user: dict = Depends(get_current_user),
):
    collaboration_enabled()
    realtime_enabled()
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "read")

    def load() -> list[WorkstreamMember]:
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=45)).isoformat()
        rows = (
            supabase.table("workstream_presence")
            .select("*")
            .eq("workstream_id", workstream_id)
            .gte("last_seen_at", cutoff)
            .order("last_seen_at", desc=True)
            .execute()
        ).data or []
        user_ids = [row["user_id"] for row in rows if row.get("user_id")]
        profiles = {}
        if user_ids:
            profile_rows = supabase.table("users").select("id, email, display_name").in_("id", user_ids).execute()
            profiles = {row["id"]: row for row in profile_rows.data or []}
        return [
            WorkstreamMember(
                user_id=row["user_id"],
                email=(profiles.get(row["user_id"]) or {}).get("email"),
                display_name=(profiles.get(row["user_id"]) or {}).get("display_name"),
                role="viewer",
                created_at=row.get("last_seen_at"),
            )
            for row in rows
        ]

    return await asyncio.to_thread(load)
