"""Workstream collaboration activity feed."""

import asyncio

from fastapi import APIRouter, Depends, Query

from app.authz import require_workstream_access
from app.deps import supabase, get_current_user
from app.feature_flags import collaboration_enabled
from app.models.workstream_collab import ActivityEvent
from app.supabase_in_guard import chunked_in_query

router = APIRouter(
    prefix="/api/v1",
    tags=["workstream-activity"],
    dependencies=[Depends(collaboration_enabled)],
)


@router.get("/me/workstreams/{workstream_id}/activity", response_model=list[ActivityEvent])
async def get_workstream_activity(
    workstream_id: str,
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    await asyncio.to_thread(require_workstream_access, supabase, workstream_id, current_user, "read")

    def load() -> list[ActivityEvent]:
        rows = (
            supabase.table("workstream_activity")
            .select("*")
            .eq("workstream_id", workstream_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
        actor_ids = sorted({row["actor_id"] for row in rows if row.get("actor_id")})
        profiles = {}
        if actor_ids:
            def _fetch_profiles(chunk):
                resp = (
                    supabase.table("users")
                    .select("id, display_name")
                    .in_("id", chunk)
                    .execute()
                )
                return resp.data or []

            profiles = {
                row["id"]: row
                for row in chunked_in_query(_fetch_profiles, actor_ids)
            }
        return [
            ActivityEvent(
                **row,
                actor_display_name=(profiles.get(row.get("actor_id") or "") or {}).get("display_name"),
            )
            for row in rows
        ]

    return await asyncio.to_thread(load)
