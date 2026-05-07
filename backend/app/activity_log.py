"""Append-only collaboration activity helpers."""

import logging
from datetime import datetime, timezone
from typing import Any

from supabase import Client

logger = logging.getLogger(__name__)


def record_activity(
    supabase: Client,
    *,
    workstream_id: str,
    actor_id: str | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Best-effort insert into workstream_activity."""
    try:
        supabase.table("workstream_activity").insert(
            {
                "workstream_id": workstream_id,
                "actor_id": actor_id,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "metadata": metadata or {},
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.warning("Failed to record workstream activity: %s", exc)


def record_audit_event(
    supabase: Client,
    *,
    actor_id: str | None,
    action: str,
    target_type: str | None = None,
    target_id: str | None = None,
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> None:
    """Best-effort insert into collaboration audit events."""
    try:
        supabase.table("audit_collaboration_events").insert(
            {
                "actor_id": actor_id,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "before_state": before_state,
                "after_state": after_state,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ).execute()
    except Exception as exc:
        logger.warning("Failed to record collaboration audit event: %s", exc)
