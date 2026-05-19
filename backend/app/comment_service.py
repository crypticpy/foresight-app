"""Comment rendering and authorization helpers."""

from __future__ import annotations

import html
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException
from supabase import Client

from app.authz import require_workstream_access
from app.supabase_in_guard import chunked_in_query


EMAIL_MENTION_RE = re.compile(r"@([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})")
UUID_MENTION_RE = re.compile(
    r"@([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
)


def render_markdown(markdown: str) -> str:
    """Small safe markdown subset until a sanitizer dependency is introduced."""
    escaped = html.escape(markdown.strip())
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*(.+?)\*", r"<em>\1</em>", escaped)
    escaped = re.sub(r"`(.+?)`", r"<code>\1</code>", escaped)
    escaped = escaped.replace("\n", "<br>")
    return f"<p>{escaped}</p>"


def extract_mentions(supabase: Client, body: str, workstream_id: str | None) -> list[str]:
    mentioned_ids = {match.group(1).lower() for match in UUID_MENTION_RE.finditer(body)}
    emails = {match.group(1).lower() for match in EMAIL_MENTION_RE.finditer(body)}
    if not emails:
        return sorted(mentioned_ids)

    def _fetch_users(chunk):
        resp = (
            supabase.table("users")
            .select("id, email")
            .in_("email", chunk)
            .execute()
        )
        return resp.data or []

    user_rows = chunked_in_query(_fetch_users, list(emails))
    user_ids = {row["id"] for row in user_rows if row.get("id")}
    if not workstream_id:
        return sorted(mentioned_ids | user_ids)

    # PostgREST treats `.in_("user_id", [])` as "match everything" — preserve
    # the sentinel UUID so an empty resolved-user set doesn't accidentally
    # pull every workstream member.
    member_lookup_ids = list(user_ids) or ["00000000-0000-0000-0000-000000000000"]

    def _fetch_members(chunk):
        resp = (
            supabase.table("workstream_members")
            .select("user_id")
            .eq("workstream_id", workstream_id)
            .in_("user_id", chunk)
            .execute()
        )
        return resp.data or []

    member_rows = chunked_in_query(_fetch_members, member_lookup_ids)
    member_ids = {row["user_id"] for row in member_rows if row.get("user_id")}

    owner = (
        supabase.table("workstreams")
        .select("user_id")
        .eq("id", workstream_id)
        .limit(1)
        .execute()
    )
    if owner.data and owner.data[0].get("user_id") in user_ids:
        member_ids.add(owner.data[0]["user_id"])
    return sorted(mentioned_ids | member_ids)


def resolve_comment_workstream(
    supabase: Client,
    *,
    target_type: str,
    target_id: str,
    workstream_id: str | None,
) -> str | None:
    if target_type == "workstream":
        return target_id
    if workstream_id:
        return workstream_id
    if target_type == "portfolio":
        res = (
            supabase.table("portfolios")
            .select("workstream_id")
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Portfolio not found")
        return res.data[0].get("workstream_id")
    if target_type == "brief":
        res = (
            supabase.table("executive_briefs")
            .select("workstream_card_id, workstream_cards(workstream_id)")
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Brief not found")
        return (res.data[0].get("workstream_cards") or {}).get("workstream_id")
    return None


def require_comment_read(
    supabase: Client,
    *,
    target_type: str,
    target_id: str,
    workstream_id: str | None,
    user: dict[str, Any],
) -> str | None:
    resolved_workstream_id = resolve_comment_workstream(
        supabase,
        target_type=target_type,
        target_id=target_id,
        workstream_id=workstream_id,
    )
    if resolved_workstream_id:
        require_workstream_access(supabase, resolved_workstream_id, user, "read")
    return resolved_workstream_id


def require_comment_write(
    supabase: Client,
    *,
    target_type: str,
    target_id: str,
    workstream_id: str | None,
    user: dict[str, Any],
) -> str | None:
    resolved_workstream_id = resolve_comment_workstream(
        supabase,
        target_type=target_type,
        target_id=target_id,
        workstream_id=workstream_id,
    )
    if resolved_workstream_id:
        require_workstream_access(supabase, resolved_workstream_id, user, "comment")
    return resolved_workstream_id


def can_edit_comment(comment: dict[str, Any], user: dict[str, Any], can_manage: bool) -> bool:
    if can_manage:
        return True
    if comment.get("author_id") != user["id"]:
        return False
    created_at = comment.get("created_at")
    if not created_at:
        return False
    created = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    return datetime.now(timezone.utc) - created <= timedelta(minutes=15)


def can_delete_comment(comment: dict[str, Any], user: dict[str, Any], can_manage: bool) -> bool:
    return can_manage or comment.get("author_id") == user["id"]
