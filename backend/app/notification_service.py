"""In-app collaboration notifications."""

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)


def notify(
    supabase: Client,
    *,
    user_id: str,
    kind: str,
    actor_id: str | None = None,
    workstream_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Best-effort notification insert."""
    if actor_id and actor_id == user_id:
        return
    try:
        supabase.table("collaboration_notifications").insert(
            {
                "user_id": user_id,
                "kind": kind,
                "actor_id": actor_id,
                "workstream_id": workstream_id,
                "target_type": target_type,
                "target_id": target_id,
                "payload": payload or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.warning("Failed to insert collaboration notification: %s", exc)


def notify_workstream_members(
    supabase: Client,
    *,
    workstream_id: str,
    kind: str,
    actor_id: str | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    """Notify the owner and explicit members of a workstream."""
    recipients: set[str] = set()
    try:
        ws = (
            supabase.table("workstreams")
            .select("user_id")
            .eq("id", workstream_id)
            .limit(1)
            .execute()
        )
        if ws.data and ws.data[0].get("user_id"):
            recipients.add(ws.data[0]["user_id"])

        members = (
            supabase.table("workstream_members")
            .select("user_id")
            .eq("workstream_id", workstream_id)
            .execute()
        )
        for row in members.data or []:
            if row.get("user_id"):
                recipients.add(row["user_id"])
    except Exception as exc:
        logger.warning("Failed to resolve workstream notification recipients: %s", exc)
        return

    for user_id in recipients:
        notify(
            supabase,
            user_id=user_id,
            kind=kind,
            actor_id=actor_id,
            workstream_id=workstream_id,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
        )
