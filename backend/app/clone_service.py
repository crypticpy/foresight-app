"""Per-user workstream-clone materialization.

Implements the lazy first-touch model from
``docs/26_per_user_workstream_clones_plan.md``:

- **First-touch** (``ensure_user_clones_for_templates``): every user gets
  a private clone of every ``owner_type='org'`` template on first read.
- **Dismissals** (``record_dismissal_if_clone``): when a user removes a
  card from a clone, a tombstone is written so the future Friday fan-out
  job never re-delivers the same card.

The Friday fan-out job itself ships in PR-B — this module only handles
first-touch materialization, the dismissal tombstone, and the lookup
helper used by the kanban router.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.deps import supabase

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _list_org_templates() -> list[dict[str, Any]]:
    """Return all org-owned workstream templates."""
    response = (
        supabase.table("workstreams")
        .select("*")
        .eq("owner_type", "org")
        .execute()
    )
    return response.data or []


def _existing_clone_pointers(user_id: str) -> dict[str, str]:
    """Return ``{template_id: clone_workstream_id}`` for the user's existing clones."""
    response = (
        supabase.table("user_workstream_clones")
        .select("template_id, clone_workstream_id")
        .eq("user_id", user_id)
        .execute()
    )
    return {
        row["template_id"]: row["clone_workstream_id"]
        for row in (response.data or [])
        if row.get("template_id") and row.get("clone_workstream_id")
    }


def _clone_row_from_template(template: dict[str, Any], user_id: str, now_iso: str) -> dict[str, Any]:
    """Build the workstreams insert payload for a new user_clone."""
    return {
        "user_id": user_id,
        "name": template.get("name"),
        "description": template.get("description"),
        "pillar_ids": template.get("pillar_ids") or [],
        "goal_ids": template.get("goal_ids") or [],
        "stage_ids": template.get("stage_ids") or [],
        "horizon": template.get("horizon") or "ALL",
        "keywords": template.get("keywords") or [],
        "is_active": template.get("is_active", True),
        "auto_add": template.get("auto_add", False),
        # Auto-scan stays on the template — clones are read-only consumers of
        # the template's discovery output.
        "auto_scan": False,
        "framework_code": template.get("framework_code"),
        "framework_category_id": template.get("framework_category_id"),
        "driver_ids": template.get("driver_ids") or [],
        "top25_priority_ids": template.get("top25_priority_ids") or [],
        "budget_relevance": template.get("budget_relevance") or [],
        "purpose_statement": template.get("purpose_statement"),
        "owner_type": "user_clone",
        "cloned_from_id": template["id"],
        "created_at": now_iso,
        "updated_at": now_iso,
    }


def _copy_template_cards_to_clone(
    template_id: str, clone_id: str, user_id: str, now_iso: str
) -> int:
    """Copy every card in the template's pool into the clone's inbox.

    Position is assigned in card-creation-date ascending order so the
    oldest cards land at position 0 (top of the column).  Returns the
    number of cards copied.
    """
    template_cards = (
        supabase.table("workstream_cards")
        .select("card_id, cards!inner(created_at)")
        .eq("workstream_id", template_id)
        .execute()
        .data
        or []
    )
    template_cards.sort(key=lambda r: (r.get("cards") or {}).get("created_at") or "")

    new_rows = [
        {
            "workstream_id": clone_id,
            "card_id": row["card_id"],
            "added_by": user_id,
            "added_at": now_iso,
            "status": "inbox",
            "position": idx,
            "added_from": "auto",
            "updated_at": now_iso,
        }
        for idx, row in enumerate(template_cards)
        if row.get("card_id")
    ]
    if not new_rows:
        return 0
    insert = supabase.table("workstream_cards").insert(new_rows).execute()
    return len(insert.data or [])


def materialize_clone(template: dict[str, Any], user_id: str) -> str:
    """Create the clone workstream + copy template cards + write pointer row.

    Returns the clone's workstream id.  Raises on insert failure; callers
    should catch and skip the template (the user still gets their other
    clones; the next request retries).

    Race safety: the only DB-enforced uniqueness guard is
    ``user_workstream_clones(user_id, template_id)``, which is the *last*
    write in this flow.  If two concurrent requests both pass the earlier
    pointer-lookup check and reach this function, both will insert a
    ``user_clone`` workstream + copy cards before either tries to insert
    the pointer.  The loser's pointer insert fails on the unique
    constraint, leaving an orphan duplicate clone visible in the user's
    workstream list.

    To stay race-safe we treat the pointer row as the single source of
    truth: if the pointer insert fails, we delete the orphan workstream we
    just created (``workstream_cards.workstream_id`` cascades, so the
    copied junction rows go with it) and return the winner's clone id by
    re-reading the pointer.
    """
    now_iso = _now_iso()
    inserted = (
        supabase.table("workstreams")
        .insert(_clone_row_from_template(template, user_id, now_iso))
        .execute()
    )
    if not inserted.data:
        raise RuntimeError(
            f"Failed to insert clone workstream for template {template['id']}"
        )
    clone_id = inserted.data[0]["id"]

    copied = _copy_template_cards_to_clone(template["id"], clone_id, user_id, now_iso)

    try:
        supabase.table("user_workstream_clones").insert(
            {
                "user_id": user_id,
                "template_id": template["id"],
                "clone_workstream_id": clone_id,
                # Stamp last_fanout_at = now so the Friday job doesn't re-deliver
                # the same cards the user just received.
                "last_fanout_at": now_iso,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001 — covers PostgREST unique-violation
        # Concurrent first-touch from another request already wrote the
        # pointer.  Drop our orphan clone (cascade clears its
        # workstream_cards rows) and surface the winner's clone id.
        winner_id = _existing_clone_pointers(user_id).get(template["id"])
        if winner_id is None:
            # Pointer insert failed for some other reason — abort and let
            # the caller surface it so we don't leave the orphan around.
            supabase.table("workstreams").delete().eq("id", clone_id).execute()
            raise
        logger.info(
            "Lost clone-materialization race for user %s, template %s; "
            "dropping orphan clone %s (winner=%s, err=%s)",
            user_id,
            template["id"],
            clone_id,
            winner_id,
            exc,
        )
        supabase.table("workstreams").delete().eq("id", clone_id).execute()
        return winner_id

    logger.info(
        "Materialized workstream clone for user %s from template %s "
        "(clone=%s, %d cards copied)",
        user_id,
        template["id"],
        clone_id,
        copied,
    )
    return clone_id


def ensure_user_clones_for_templates(user_id: str) -> dict[str, str]:
    """Ensure the user has a clone for every org template.

    Returns ``{template_id: clone_workstream_id}`` for every template after
    materializing any that were missing.  A failure on one template is
    logged and that template is skipped — the user's other clones still
    materialize, and the next request retries the failed one.
    """
    templates = _list_org_templates()
    if not templates:
        return {}

    clone_by_template = _existing_clone_pointers(user_id)

    for template in templates:
        template_id = template["id"]
        if template_id in clone_by_template:
            continue
        try:
            clone_by_template[template_id] = materialize_clone(template, user_id)
        except Exception as exc:  # noqa: BLE001 — best-effort materialization
            logger.exception(
                "Failed to materialize clone for user %s, template %s: %s",
                user_id,
                template_id,
                exc,
            )
            continue

    return clone_by_template


def template_id_for_workstream(workstream_id: str) -> str | None:
    """Return ``cloned_from_id`` for a clone workstream, else ``None``."""
    response = (
        supabase.table("workstreams")
        .select("cloned_from_id, owner_type")
        .eq("id", workstream_id)
        .limit(1)
        .execute()
    )
    if not response.data:
        return None
    row = response.data[0]
    if row.get("owner_type") != "user_clone":
        return None
    return row.get("cloned_from_id")


def record_dismissal_if_clone(workstream_id: str, card_id: str) -> bool:
    """Write a dismissal tombstone if ``workstream_id`` is a user_clone.

    Returns True if a tombstone was written, False otherwise (template was
    not a clone, or the lookup failed).  Best-effort: any Supabase error is
    swallowed so a transient failure doesn't break the user's delete.
    """
    if not card_id:
        return False
    try:
        ws_row = (
            supabase.table("workstreams")
            .select("owner_type, cloned_from_id, user_id")
            .eq("id", workstream_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not ws_row:
            return False
        ws = ws_row[0]
        template_id = ws.get("cloned_from_id")
        owner_id = ws.get("user_id")
        if (
            ws.get("owner_type") != "user_clone"
            or not template_id
            or not owner_id
        ):
            return False
        supabase.table("user_workstream_card_dismissals").upsert(
            {
                "user_id": owner_id,
                "template_id": template_id,
                "card_id": card_id,
            },
            on_conflict="user_id,template_id,card_id",
        ).execute()
        return True
    except Exception as exc:  # noqa: BLE001 — non-fatal
        logger.warning(
            "Failed to record dismissal tombstone for clone %s, card %s: %s",
            workstream_id,
            card_id,
            exc,
        )
        return False
