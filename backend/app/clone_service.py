"""Per-user workstream-clone materialization + Friday fan-out.

Implements the model from ``docs/26_per_user_workstream_clones_plan.md``:

- **First-touch** (``ensure_user_clones_for_templates``): every user gets
  a private clone of every ``owner_type='org'`` template on first read.
- **Friday fan-out** (``fan_out_clones``): a weekly scheduled job walks
  every pointer row, finds cards added to the template's pool since the
  user already received them, and inserts them into the user's clone
  inbox — skipping anything the user has dismissed.
- **Dismissals** (``record_dismissal_if_clone``): when a user removes a
  card from a clone, a tombstone is written so the Friday job never
  re-delivers the same card.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Callable

from app.deps import supabase
from app.supabase_in_guard import chunked_in_query

logger = logging.getLogger(__name__)

# PostgREST caps a single response at 1000 rows by default.  Page through
# any query whose result set can plausibly exceed that ceiling in production.
_PAGE_SIZE = 1000


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _paginate(build_query: Callable[[], Any]) -> list[dict[str, Any]]:
    """Drain a PostgREST query past the default response cap.

    ``build_query`` is a no-arg callable that returns a fresh, filter-applied
    builder (pre-``execute()``).  We call it once per page so the supabase
    client doesn't reuse a built request object across ``range()`` calls.
    """
    rows: list[dict[str, Any]] = []
    start = 0
    while True:
        page = (
            build_query()
            .range(start, start + _PAGE_SIZE - 1)
            .execute()
            .data
            or []
        )
        if not page:
            break
        rows.extend(page)
        if len(page) < _PAGE_SIZE:
            break
        start += _PAGE_SIZE
    return rows


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


def _fan_out_to_one_clone(
    *,
    template_id: str,
    user_id: str,
    clone_id: str,
    pool_card_ids: set[str],
    now_iso: str,
) -> int:
    """Insert pool cards the user hasn't seen or dismissed into a single clone.

    Returns the number of cards delivered.  Always bumps the pointer's
    ``last_fanout_at`` even when nothing was delivered, so the watermark
    advances on every run.
    """
    existing = _paginate(
        lambda: supabase.table("workstream_cards")
        .select("card_id, status, position")
        .eq("workstream_id", clone_id)
    )
    existing_ids = {r["card_id"] for r in existing if r.get("card_id")}
    inbox_positions = [
        r["position"]
        for r in existing
        if r.get("status") == "inbox" and r.get("position") is not None
    ]
    next_position = (max(inbox_positions) + 1) if inbox_positions else 0

    dismissed = _paginate(
        lambda: supabase.table("user_workstream_card_dismissals")
        .select("card_id")
        .eq("user_id", user_id)
        .eq("template_id", template_id)
    )
    dismissed_ids = {r["card_id"] for r in dismissed if r.get("card_id")}

    new_card_ids = pool_card_ids - existing_ids - dismissed_ids

    delivered = 0
    if new_card_ids:
        # Order new cards by underlying created_at ascending (with id as a
        # deterministic tiebreaker for same-timestamp cards) so the oldest
        # unseen cards land at the top of the new batch and weekly runs are
        # reproducible.
        new_card_id_list = list(new_card_ids)

        def _fetch_chunk(chunk):
            return _paginate(
                lambda: supabase.table("cards")
                .select("id, created_at")
                .in_("id", chunk)
            )

        card_rows = chunked_in_query(_fetch_chunk, new_card_id_list)
        card_rows.sort(
            key=lambda r: ((r.get("created_at") or ""), (r.get("id") or ""))
        )
        rows_to_insert = [
            {
                "workstream_id": clone_id,
                "card_id": card["id"],
                "added_by": user_id,
                "added_at": now_iso,
                "status": "inbox",
                "position": next_position + idx,
                "added_from": "auto",
                "updated_at": now_iso,
            }
            for idx, card in enumerate(card_rows)
        ]
        if rows_to_insert:
            inserted = (
                supabase.table("workstream_cards").insert(rows_to_insert).execute()
            )
            # Some PostgREST configs return [] from insert despite a successful
            # write; fall back to the row count we attempted so the summary
            # log line stays accurate.
            delivered = len(inserted.data) if inserted.data else len(rows_to_insert)

    supabase.table("user_workstream_clones").update(
        {"last_fanout_at": now_iso}
    ).eq("user_id", user_id).eq("template_id", template_id).execute()

    return delivered


def fan_out_clones() -> dict[str, int]:
    """Walk every clone pointer and deliver new template cards.

    For each org template, read the current card pool and the set of
    clones pointing at it; per-clone, insert any pool cards the user has
    not yet received and has not dismissed.

    Failures on one (template, clone) pair are logged and do not block
    the rest of the run — the Friday cadence retries weekly.

    Returns a summary dict (``templates``, ``clones_processed``,
    ``cards_delivered``, ``failures``) for the scheduler log line.
    """
    summary = {
        "templates": 0,
        "clones_processed": 0,
        "cards_delivered": 0,
        "failures": 0,
    }
    now_iso = _now_iso()

    templates = (
        supabase.table("workstreams")
        .select("id")
        .eq("owner_type", "org")
        .execute()
        .data
        or []
    )
    if not templates:
        return summary

    for template in templates:
        template_id = template["id"]
        try:
            pool_rows = _paginate(
                lambda tid=template_id: supabase.table("workstream_cards")
                .select("card_id")
                .eq("workstream_id", tid)
            )
            pool_card_ids = {r["card_id"] for r in pool_rows if r.get("card_id")}

            # Paginate clone pointers — an org template can fan out to far more
            # than PostgREST's default 1000-row response cap once we have real
            # users, and dropping the tail of the page silently would skip
            # whole users' deliveries until they happened to refresh.
            pointers = _paginate(
                lambda tid=template_id: supabase.table("user_workstream_clones")
                .select("user_id, clone_workstream_id")
                .eq("template_id", tid)
            )
            summary["templates"] += 1

            for ptr in pointers:
                user_id = ptr.get("user_id")
                clone_id = ptr.get("clone_workstream_id")
                if not user_id or not clone_id:
                    continue
                try:
                    delivered = _fan_out_to_one_clone(
                        template_id=template_id,
                        user_id=user_id,
                        clone_id=clone_id,
                        pool_card_ids=pool_card_ids,
                        now_iso=now_iso,
                    )
                    summary["clones_processed"] += 1
                    summary["cards_delivered"] += delivered
                except Exception as exc:  # noqa: BLE001 — best-effort per clone
                    summary["failures"] += 1
                    logger.exception(
                        "Fan-out failed for clone %s (user %s, template %s): %s",
                        clone_id,
                        user_id,
                        template_id,
                        exc,
                    )
        except Exception as exc:  # noqa: BLE001 — best-effort per template
            summary["failures"] += 1
            logger.exception(
                "Fan-out failed for template %s: %s", template_id, exc
            )

    logger.info(
        "Workstream-clone fan-out complete: %d templates, %d clones, "
        "%d cards delivered, %d failures",
        summary["templates"],
        summary["clones_processed"],
        summary["cards_delivered"],
        summary["failures"],
    )
    return summary


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
