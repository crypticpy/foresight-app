"""Collaboration comments and reactions."""

import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from app.activity_log import record_activity
from app.comment_service import (
    can_delete_comment,
    can_edit_comment,
    extract_mentions,
    render_markdown,
    require_comment_read,
    require_comment_write,
)
from app.authz import require_workstream_access
from app.deps import supabase, get_current_user
from app.feature_flags import collaboration_enabled
from app.models.workstream_collab import (
    CommentCreate,
    CommentReactionToggle,
    CommentResponse,
    CommentUpdate,
)
from app.notification_service import notify, notify_workstream_members

router = APIRouter(
    prefix="/api/v1",
    tags=["comments"],
    dependencies=[Depends(collaboration_enabled)],
)


def _comment_profiles(rows: list[dict]) -> dict[str, dict]:
    user_ids = sorted({row["author_id"] for row in rows if row.get("author_id")})
    if not user_ids:
        return {}
    res = supabase.table("users").select("id, display_name").in_("id", user_ids).execute()
    return {row["id"]: row for row in res.data or []}


def _reaction_maps(comment_ids: list[str], user_id: str) -> tuple[dict[str, dict[str, int]], dict[str, list[str]]]:
    if not comment_ids:
        return {}, {}
    rows = (
        supabase.table("comment_reactions")
        .select("comment_id, user_id, emoji")
        .in_("comment_id", comment_ids)
        .execute()
    )
    counts: dict[str, dict[str, int]] = {}
    mine: dict[str, list[str]] = {}
    for row in rows.data or []:
        comment_id = row["comment_id"]
        emoji = row["emoji"]
        counts.setdefault(comment_id, {})
        counts[comment_id][emoji] = counts[comment_id].get(emoji, 0) + 1
        if row.get("user_id") == user_id:
            mine.setdefault(comment_id, []).append(emoji)
    return counts, mine


def _serialize_comments(rows: list[dict], user_id: str) -> list[CommentResponse]:
    profiles = _comment_profiles(rows)
    counts, mine = _reaction_maps([row["id"] for row in rows], user_id)
    return [
        CommentResponse(
            **row,
            author_display_name=(profiles.get(row.get("author_id") or "") or {}).get("display_name"),
            reactions=counts.get(row["id"], {}),
            my_reactions=mine.get(row["id"], []),
        )
        for row in rows
    ]


@router.get("/comments", response_model=list[CommentResponse])
async def list_comments(
    target_type: str = Query(...),
    target_id: str = Query(...),
    workstream_id: str | None = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    resolved_workstream_id = await asyncio.to_thread(
        require_comment_read,
        supabase,
        target_type=target_type,
        target_id=target_id,
        workstream_id=workstream_id,
        user=current_user,
    )

    def load() -> list[CommentResponse]:
        query = (
            supabase.table("comments")
            .select("*")
            .eq("target_type", target_type)
            .eq("target_id", target_id)
            .order("created_at")
        )
        if resolved_workstream_id:
            query = query.eq("workstream_id", resolved_workstream_id)
        return _serialize_comments(query.execute().data or [], current_user["id"])

    return await asyncio.to_thread(load)


@router.post("/comments", response_model=CommentResponse)
async def create_comment(
    comment: CommentCreate,
    current_user: dict = Depends(get_current_user),
):
    resolved_workstream_id = await asyncio.to_thread(
        require_comment_write,
        supabase,
        target_type=comment.target_type,
        target_id=comment.target_id,
        workstream_id=comment.workstream_id,
        user=current_user,
    )

    def create() -> CommentResponse:
        mentions = extract_mentions(supabase, comment.body_markdown, resolved_workstream_id)
        now = datetime.now(timezone.utc).isoformat()
        row = {
            "target_type": comment.target_type,
            "target_id": comment.target_id,
            "workstream_id": resolved_workstream_id,
            "parent_id": comment.parent_id,
            "author_id": current_user["id"],
            "body_markdown": comment.body_markdown,
            "body_html": render_markdown(comment.body_markdown),
            "mentions": mentions,
            "created_at": now,
        }
        result = supabase.table("comments").insert(row).execute()
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to create comment")
        created = result.data[0]
        if resolved_workstream_id:
            record_activity(
                supabase,
                workstream_id=resolved_workstream_id,
                actor_id=current_user["id"],
                action="comment.added",
                target_type=comment.target_type,
                target_id=comment.target_id,
                metadata={"comment_id": created["id"]},
            )
            notify_workstream_members(
                supabase,
                workstream_id=resolved_workstream_id,
                kind="workstream_comment",
                actor_id=current_user["id"],
                target_type="comment",
                target_id=created["id"],
                payload={"target_type": comment.target_type, "target_id": comment.target_id},
            )
        for user_id in mentions:
            notify(
                supabase,
                user_id=user_id,
                kind="mention",
                actor_id=current_user["id"],
                workstream_id=resolved_workstream_id,
                target_type="comment",
                target_id=created["id"],
            )
        return _serialize_comments([created], current_user["id"])[0]

    return await asyncio.to_thread(create)


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: str,
    update: CommentUpdate,
    current_user: dict = Depends(get_current_user),
):
    def do_update() -> CommentResponse:
        existing = supabase.table("comments").select("*").eq("id", comment_id).limit(1).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Comment not found")
        row = existing.data[0]
        can_manage = False
        if row.get("workstream_id"):
            access = require_workstream_access(supabase, row["workstream_id"], current_user, "read")
            can_manage = access.can_manage
        if update.body_markdown is not None and not can_edit_comment(row, current_user, can_manage):
            raise HTTPException(status_code=403, detail="Cannot edit this comment")
        if update.resolved is not None and not can_manage and row.get("author_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Cannot resolve this comment")

        patch = {}
        if update.body_markdown is not None:
            patch.update(
                {
                    "body_markdown": update.body_markdown,
                    "body_html": render_markdown(update.body_markdown),
                    "mentions": extract_mentions(supabase, update.body_markdown, row.get("workstream_id")),
                    "edited_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        if update.resolved is not None:
            patch["resolved_at"] = datetime.now(timezone.utc).isoformat() if update.resolved else None
        if not patch:
            return _serialize_comments([row], current_user["id"])[0]
        result = supabase.table("comments").update(patch).eq("id", comment_id).execute()
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to update comment")
        return _serialize_comments(result.data, current_user["id"])[0]

    return await asyncio.to_thread(do_update)


@router.delete("/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: dict = Depends(get_current_user),
):
    def do_delete() -> dict:
        existing = supabase.table("comments").select("*").eq("id", comment_id).limit(1).execute()
        if not existing.data:
            raise HTTPException(status_code=404, detail="Comment not found")
        row = existing.data[0]
        can_manage = False
        if row.get("workstream_id"):
            access = require_workstream_access(supabase, row["workstream_id"], current_user, "read")
            can_manage = access.can_manage
        if not can_delete_comment(row, current_user, can_manage):
            raise HTTPException(status_code=403, detail="Cannot delete this comment")
        supabase.table("comments").update(
            {
                "body_markdown": "Comment removed",
                "body_html": "<p>Comment removed</p>",
                "deleted_at": datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", comment_id).execute()
        return {"status": "deleted"}

    return await asyncio.to_thread(do_delete)


@router.post("/comments/{comment_id}/reactions")
async def toggle_reaction(
    comment_id: str,
    reaction: CommentReactionToggle,
    current_user: dict = Depends(get_current_user),
):
    def toggle() -> dict:
        existing_comment = supabase.table("comments").select("*").eq("id", comment_id).limit(1).execute()
        if not existing_comment.data:
            raise HTTPException(status_code=404, detail="Comment not found")
        row = existing_comment.data[0]
        if row.get("workstream_id"):
            require_workstream_access(supabase, row["workstream_id"], current_user, "read")
        existing = (
            supabase.table("comment_reactions")
            .select("id")
            .eq("comment_id", comment_id)
            .eq("user_id", current_user["id"])
            .eq("emoji", reaction.emoji)
            .limit(1)
            .execute()
        )
        if existing.data:
            supabase.table("comment_reactions").delete().eq("id", existing.data[0]["id"]).execute()
            return {"status": "removed"}
        supabase.table("comment_reactions").insert(
            {"comment_id": comment_id, "user_id": current_user["id"], "emoji": reaction.emoji}
        ).execute()
        return {"status": "added"}

    return await asyncio.to_thread(toggle)
