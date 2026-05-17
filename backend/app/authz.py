"""Authorization helpers for user, org, and future shared workstreams.

The backend uses the Supabase service-role client, so API routers must enforce
application-level authorization explicitly.  Keep capability checks here so the
Phase 3 collaboration model can add workstream membership roles without
rewriting every endpoint.
"""

from dataclasses import dataclass
from typing import Any, Literal

from fastapi import HTTPException, status
from supabase import Client


ADMIN_ROLES = {"admin", "service_role"}
WORKSTREAM_OWNER_TYPE_ORG = "org"
WORKSTREAM_OWNER_TYPE_USER = "user"
WORKSTREAM_OWNER_TYPE_USER_CLONE = "user_clone"
ACCOUNT_TYPE_PAID = "paid"
ACCOUNT_TYPE_GUEST = "guest"
WORKSTREAM_MEMBER_CAPABILITIES = {
    "owner": (True, True, True, True),
    "editor": (True, True, True, False),
    "commenter": (True, True, False, False),
    "viewer": (True, False, False, False),
}
Capability = Literal["read", "comment", "edit", "manage"]


@dataclass(frozen=True)
class WorkstreamAccess:
    workstream: dict[str, Any]
    can_read: bool
    can_comment: bool
    can_edit: bool
    can_manage: bool
    role: str | None = None


def is_admin(user: dict[str, Any]) -> bool:
    """Return True when the authenticated profile has an administrative role."""
    return (user.get("role") or "").lower() in ADMIN_ROLES


def require_admin(user: dict[str, Any]) -> None:
    """Raise 403 unless the authenticated profile has an administrative role."""
    if not is_admin(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )


def require_paid_user(user: dict[str, Any]) -> None:
    """Raise 403 for any non-paid accounts before any paid or spending action.

    Requires `account_type == "paid"` explicitly. Missing or unknown values
    are treated as forbidden so a misconfigured profile can't silently bypass
    the spending gate.
    """
    if is_admin(user):
        return
    account_type = (user.get("account_type") or "").lower()
    if account_type == ACCOUNT_TYPE_PAID:
        return
    detail = (
        f"Accounts of type '{account_type}' cannot perform this action"
        if account_type
        else "Only paid accounts can perform this action"
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=detail,
    )


def get_workstream_access(
    supabase: Client, workstream_id: str, user: dict[str, Any]
) -> WorkstreamAccess:
    """Resolve the current user's access to a workstream.

    Current pilot rules:
    - admins can read, edit, and manage all workstreams (including org templates).
    - org workstreams are templates fanned out into per-user clones; non-admins
      get **no** direct access. The workstreams router resolves template ids to
      the caller's clone before responding, so this branch is reachable for
      non-admins only when something tries to address a template id directly.
    - user_clone workstreams are owned by the cloning user (same `user_id` /
      ownership semantics as user workstreams; they just carry a non-null
      `cloned_from_id`).
    - user workstreams are read/edit/manage by their owner only.

    The `workstream_members` lookup is wired in so Phase 3 collaboration can
    grant shared editors/viewers on user (or cloned) workstreams without
    rewriting downstream endpoint checks.
    """
    ws_response = (
        supabase.table("workstreams")
        .select("id, user_id, owner_type, name, cloned_from_id")
        .eq("id", workstream_id)
        .limit(1)
        .execute()
    )
    if not ws_response.data:
        raise HTTPException(status_code=404, detail="Workstream not found")

    workstream = ws_response.data[0]
    user_id = user["id"]

    if is_admin(user):
        return WorkstreamAccess(
            workstream=workstream,
            can_read=True,
            can_comment=True,
            can_edit=True,
            can_manage=True,
            role="admin",
        )

    if workstream.get("user_id") == user_id:
        return WorkstreamAccess(
            workstream=workstream,
            can_read=True,
            can_comment=True,
            can_edit=True,
            can_manage=True,
            role="owner",
        )

    member_response = (
        supabase.table("workstream_members")
        .select("role")
        .eq("workstream_id", workstream_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if member_response.data:
        role = member_response.data[0].get("role")
        can_read, can_comment, can_edit, can_manage = WORKSTREAM_MEMBER_CAPABILITIES.get(
            role, (False, False, False, False)
        )
        return WorkstreamAccess(
            workstream=workstream,
            can_read=can_read,
            can_comment=can_comment,
            can_edit=can_edit,
            can_manage=can_manage,
            role=role,
        )

    # Non-admin users have no direct access to org templates. The UI never
    # links to a template id (workstreams.py rewrites the id to the caller's
    # clone), so reaching this branch implies either a stale URL or someone
    # probing template ids — treat it like a missing workstream.
    if workstream.get("owner_type") == WORKSTREAM_OWNER_TYPE_ORG:
        raise HTTPException(status_code=404, detail="Workstream not found")

    return WorkstreamAccess(
        workstream=workstream,
        can_read=False,
        can_comment=False,
        can_edit=False,
        can_manage=False,
        role=None,
    )


def accessible_workstream_ids(
    supabase: Client,
    user_id: str,
    is_admin_user: bool = False,
) -> set[str] | None:
    """Return workstream ids the caller can read, or ``None`` for admins.

    A ``None`` return is a sentinel meaning "no scoping needed — admin sees
    everything". Callers that build an ``.in_("id", …)`` filter should treat
    ``None`` as "skip the filter entirely". An empty set means the caller is
    a non-admin with zero accessible workstreams; callers should short-circuit
    rather than emit a query with an empty ``in_`` (which would still return
    every row in PostgREST).

    For non-admins the set covers:
      - workstreams the user owns (``workstreams.user_id == user_id``)
      - workstreams the user is a member of via ``workstream_members``

    Org templates are intentionally excluded; non-admins see their per-user
    clones via the ownership branch.
    """
    if is_admin_user:
        return None

    accessible: set[str] = set()

    owned = (
        supabase.table("workstreams")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )
    for row in owned.data or []:
        ws_id = row.get("id")
        if ws_id:
            accessible.add(ws_id)

    shared = (
        supabase.table("workstream_members")
        .select("workstream_id")
        .eq("user_id", user_id)
        .execute()
    )
    for row in shared.data or []:
        ws_id = row.get("workstream_id")
        if ws_id:
            accessible.add(ws_id)

    return accessible


def require_workstream_access(
    supabase: Client,
    workstream_id: str,
    user: dict[str, Any],
    capability: Capability = "read",
) -> WorkstreamAccess:
    """Raise 403 unless the user has the requested workstream capability."""
    access = get_workstream_access(supabase, workstream_id, user)
    allowed = {
        "read": access.can_read,
        "comment": access.can_comment,
        "edit": access.can_edit,
        "manage": access.can_manage,
    }[capability]
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this workstream",
        )
    return access


def require_card_research_access(
    supabase: Client, card_id: str, user: dict[str, Any]
) -> None:
    """Raise unless the user can spend research budget against this card.

    Current pilot rule: admins, card creators, workstream owners, or shared
    editors can queue research. Org-workstream visibility alone does not grant
    permission to trigger paid research.
    """
    if is_admin(user):
        return

    card_response = (
        supabase.table("cards")
        .select("id, created_by")
        .eq("id", card_id)
        .limit(1)
        .execute()
    )
    if not card_response.data:
        raise HTTPException(status_code=404, detail="Card not found")

    if card_response.data[0].get("created_by") == user["id"]:
        return

    wsc_response = (
        supabase.table("workstream_cards")
        .select("workstream_id")
        .eq("card_id", card_id)
        .limit(100)
        .execute()
    )
    workstream_ids = [
        row["workstream_id"] for row in (wsc_response.data or []) if row.get("workstream_id")
    ]
    if workstream_ids:
        editable = (
            supabase.table("workstreams")
            .select("id")
            .in_("id", workstream_ids)
            .eq("user_id", user["id"])
            .limit(1)
            .execute()
        )
        if editable.data:
            return

        member_response = (
            supabase.table("workstream_members")
            .select("role")
            .in_("workstream_id", workstream_ids)
            .eq("user_id", user["id"])
            .in_("role", ["owner", "editor"])
            .limit(1)
            .execute()
        )
        if member_response.data:
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized to queue research for this card",
    )


def require_card_in_workstream(
    supabase: Client, card_id: str, workstream_id: str
) -> None:
    """Raise 404 when a card is not currently associated with a workstream."""
    result = (
        supabase.table("workstream_cards")
        .select("id")
        .eq("workstream_id", workstream_id)
        .eq("card_id", card_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Card not found in this workstream")
