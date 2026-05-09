"""Admin, taxonomy, source rating, quality, and domain reputation router."""

import asyncio
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.authz import require_admin
from app.deps import (
    supabase,
    get_current_user,
    _safe_error,
    limiter,
    evict_cached_profile,
)
from app.openai_provider import reload_config as reload_openai_config
from app.models.source_rating import (
    SourceRatingCreate,
    SourceRatingResponse,
    SourceRatingAggregate,
)
from app.models.domain_reputation import (
    DomainReputationCreate,
    DomainReputationUpdate,
)
from app import quality_service, domain_reputation_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["admin"])

# Strong refs for fire-and-forget background tasks (currently the lens
# backfill). Without this, asyncio.create_task results can be GC'd before
# they finish — Python's event loop only holds weak refs.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


class AccountTypeUpdate(BaseModel):
    account_type: Literal["paid", "guest"]


class AdminUserUpdate(BaseModel):
    role: Optional[Literal["admin", "user", "service_role"]] = None
    account_type: Optional[Literal["paid", "guest"]] = None
    display_name: Optional[str] = Field(default=None, max_length=200)


class AdminSettingUpdate(BaseModel):
    value: Any


SETTING_DEFINITIONS: list[dict[str, Any]] = [
    {
        "key": "OPENAI_CHAT_MODEL",
        "group_name": "models",
        "label": "Chat model",
        "description": "Primary model for user-facing Ask Foresight responses.",
        "value_type": "string",
        "default": "gpt-5.4-2026-03-05",
    },
    {
        "key": "OPENAI_CHAT_AGENT_MODEL",
        "group_name": "models",
        "label": "Agent model",
        "description": "Model for agentic research and tool-heavy workflows.",
        "value_type": "string",
        "default": "gpt-5.4-2026-03-05",
    },
    {
        "key": "OPENAI_CHAT_MINI_MODEL",
        "group_name": "models",
        "label": "Mini model",
        "description": "Lower-cost model for classification and structured helper tasks.",
        "value_type": "string",
        "default": "gpt-5.4-mini-2026-03-17",
    },
    {
        "key": "OPENAI_EMBEDDING_MODEL",
        "group_name": "models",
        "label": "Embedding model",
        "description": "Embedding model used for vector search and deduplication.",
        "value_type": "string",
        "default": "text-embedding-ada-002",
    },
    {
        "key": "OPENAI_REASONING_EFFORT",
        "group_name": "models",
        "label": "Reasoning effort",
        "description": "Default reasoning effort passed to supported OpenAI models.",
        "value_type": "string",
        "default": "medium",
    },
    {
        "key": "FORESIGHT_CHAT_QUOTA_ENABLED",
        "group_name": "chat",
        "label": "Chat quotas enabled",
        "description": "Enable daily chat session and turn limits.",
        "value_type": "boolean",
        "default": True,
    },
    {
        "key": "FORESIGHT_CHAT_DAILY_SESSIONS",
        "group_name": "chat",
        "label": "Daily chat sessions",
        "description": "Maximum Ask Foresight sessions per user per day.",
        "value_type": "number",
        "default": 3,
    },
    {
        "key": "FORESIGHT_CHAT_TURNS_PER_SESSION",
        "group_name": "chat",
        "label": "Turns per chat session",
        "description": "Maximum user turns allowed in one chat session.",
        "value_type": "number",
        "default": 5,
    },
    {
        "key": "FORESIGHT_ENABLE_AI_RESEARCH",
        "group_name": "research",
        "label": "AI research enabled",
        "description": "Allow user-triggered AI research tasks.",
        "value_type": "boolean",
        "default": True,
    },
    {
        "key": "FORESIGHT_ENABLE_DEEP_RESEARCH",
        "group_name": "research",
        "label": "Deep research enabled",
        "description": "Allow comprehensive deep research tasks.",
        "value_type": "boolean",
        "default": True,
    },
    {
        "key": "FORESIGHT_MAX_RESEARCH_TASK_ESTIMATED_COST_USD",
        "group_name": "research",
        "label": "Max research task cost",
        "description": "Optional per-task estimated cost cap in USD.",
        "value_type": "number",
        "default": None,
    },
    {
        "key": "FORESIGHT_ENABLE_SCHEDULER",
        "group_name": "runtime",
        "label": "Scheduler enabled",
        "description": "Controls APScheduler startup for nightly/weekly jobs.",
        "value_type": "boolean",
        "default": False,
    },
    {
        "key": "FORESIGHT_EMBED_WORKER",
        "group_name": "runtime",
        "label": "Embedded worker",
        "description": "Run the background worker inside the API process.",
        "value_type": "boolean",
        "default": True,
    },
    {
        "key": "FORESIGHT_DEMO_FREEZE",
        "group_name": "runtime",
        "label": "Demo freeze",
        "description": "Suppress automatic scheduler and worker auto-fires during demos.",
        "value_type": "boolean",
        "default": False,
    },
    {
        "key": "FORESIGHT_ENABLE_PUBLIC_SHARE",
        "group_name": "features",
        "label": "Public/share links",
        "description": "Enable share-link creation and viewing flows.",
        "value_type": "boolean",
        "default": False,
    },
    {
        "key": "FORESIGHT_ENABLE_COLLABORATION",
        "group_name": "features",
        "label": "Collaboration",
        "description": "Enable workstream collaboration features.",
        "value_type": "boolean",
        "default": False,
    },
    {
        "key": "FORESIGHT_ENABLE_GUEST_ACCOUNTS",
        "group_name": "features",
        "label": "Guest accounts",
        "description": "Enable guest-account invitation and collaboration flows.",
        "value_type": "boolean",
        "default": False,
    },
    {
        "key": "FORESIGHT_ENABLE_REALTIME",
        "group_name": "features",
        "label": "Realtime collaboration",
        "description": "Enable realtime presence/collaboration surfaces.",
        "value_type": "boolean",
        "default": False,
    },
]


def _parse_env_value(raw: str | None, value_type: str, default: Any) -> Any:
    if raw is None or raw == "":
        return default
    if value_type == "boolean":
        return raw.strip().lower() in {"1", "true", "yes", "y", "on"}
    if value_type == "number":
        try:
            return float(raw) if "." in raw else int(raw)
        except ValueError:
            return default
    return raw


def _coerce_setting_value(value: Any, value_type: str) -> Any:
    if value_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "y", "on"}
        return bool(value)
    if value_type == "number":
        if value is None or value == "":
            return None
        if isinstance(value, bool):
            # bool is a subclass of int — reject so admins don't accidentally
            # save True/False under a numeric setting.
            raise HTTPException(
                status_code=400,
                detail="Numeric setting requires a number, not a boolean",
            )
        if isinstance(value, (int, float)):
            return value
        text = str(value).strip()
        try:
            return float(text) if "." in text else int(text)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid number for setting: {value!r}",
            ) from exc
    if value_type == "json":
        return value
    return "" if value is None else str(value)


def _setting_definitions_by_key() -> dict[str, dict[str, Any]]:
    return {item["key"]: item for item in SETTING_DEFINITIONS}


# Single source of truth for which user fields the audit log is allowed to
# capture. Used both to drive the SELECT in update_admin_user and to filter
# the before/after snapshots, so adding a new updatable field cannot silently
# log None for its prior value.
_AUDITABLE_USER_FIELDS: tuple[str, ...] = ("role", "account_type", "display_name")

# Defense-in-depth: even though current SETTING_DEFINITIONS don't include
# secrets, redact any audit payload key (or setting target_id) that looks
# sensitive so a future addition can't leak via the audit table.
_SENSITIVE_KEY_PATTERN = re.compile(
    r"(password|secret|api[_-]?key|token|credential)", re.IGNORECASE
)
_REDACTED = "***REDACTED***"


def _redact_for_audit(target_id: str, payload: Any) -> Any:
    """Mask sensitive values in an audit payload.

    Two triggers: the target_id itself looks sensitive (e.g. a setting whose
    key contains "api_key") OR an individual field name does. Non-dict
    payloads pass through — we only know how to redact key/value maps.
    """
    if not isinstance(payload, dict):
        return payload
    target_is_sensitive = bool(_SENSITIVE_KEY_PATTERN.search(target_id or ""))
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        field_is_sensitive = bool(_SENSITIVE_KEY_PATTERN.search(str(key)))
        if (target_is_sensitive or field_is_sensitive) and value is not None:
            redacted[key] = _REDACTED
        else:
            redacted[key] = value
    return redacted


def _log_admin_action(
    *,
    actor: dict,
    action: str,
    target_type: str,
    target_id: str,
    before: Any,
    after: Any,
    request: Optional[Request] = None,
) -> None:
    """Insert an admin_audit_log row.

    Failures are logged but never raised — the caller's mutation has already
    succeeded by the time we get here, so a missed audit row should not
    surface as an HTTP error. Operators monitor via the logger.
    """
    try:
        supabase.table("admin_audit_log").insert(
            {
                "actor_id": actor.get("id"),
                "actor_email": actor.get("email"),
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "before": _redact_for_audit(target_id, before),
                "after": _redact_for_audit(target_id, after),
                "request_ip": request.client.host if request and request.client else None,
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to write admin_audit_log entry: action=%s target=%s/%s",
            action,
            target_type,
            target_id,
        )


@router.get("/admin/overview")
async def get_admin_overview(current_user: dict = Depends(get_current_user)):
    """Return high-level operational metrics for the admin console."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        users = supabase.table("users").select("id, role, account_type").execute().data or []
        cards = supabase.table("cards").select("id, status, created_at").execute().data or []
        workstreams = (
            supabase.table("workstreams")
            .select("id, owner_type, is_active, auto_scan")
            .execute()
            .data
            or []
        )
        tasks = (
            supabase.table("research_tasks")
            .select("id, status, task_type, created_at")
            .order("created_at", desc=True)
            .limit(500)
            .execute()
            .data
            or []
        )
        discovery_runs = (
            supabase.table("discovery_runs")
            .select("id, status, started_at, created_at")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
        scans = (
            supabase.table("workstream_scans")
            .select("id, status, created_at")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )

        def counts_by(rows: list[dict], key: str) -> dict[str, int]:
            counts: dict[str, int] = {}
            for row in rows:
                value = row.get(key) or "unknown"
                counts[value] = counts.get(value, 0) + 1
            return counts

        one_week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        new_cards = 0
        for card in cards:
            try:
                if datetime.fromisoformat(card["created_at"].replace("Z", "+00:00")) >= one_week_ago:
                    new_cards += 1
            except Exception:
                continue

        return {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "users": {
                "total": len(users),
                "by_account_type": counts_by(users, "account_type"),
                "by_role": counts_by(users, "role"),
            },
            "cards": {
                "total": len(cards),
                "new_last_7d": new_cards,
                "by_status": counts_by(cards, "status"),
            },
            "workstreams": {
                "total": len(workstreams),
                "active": sum(bool(row.get("is_active")) for row in workstreams),
                "org_owned": sum(row.get("owner_type") == "org" for row in workstreams),
                "auto_scan": sum(bool(row.get("auto_scan")) for row in workstreams),
            },
            "research_tasks": {
                "total_sampled": len(tasks),
                "by_status": counts_by(tasks, "status"),
                "by_type": counts_by(tasks, "task_type"),
            },
            "discovery_runs": {
                "recent_count": len(discovery_runs),
                "by_status": counts_by(discovery_runs, "status"),
            },
            "workstream_scans": {
                "recent_count": len(scans),
                "by_status": counts_by(scans, "status"),
            },
            "runtime": {
                "environment": os.getenv("ENVIRONMENT", "development"),
                "scheduler_enabled": _parse_env_value(
                    os.getenv("FORESIGHT_ENABLE_SCHEDULER"), "boolean", False
                ),
                "embedded_worker": _parse_env_value(
                    os.getenv("FORESIGHT_EMBED_WORKER"), "boolean", True
                ),
                "demo_freeze": _parse_env_value(
                    os.getenv("FORESIGHT_DEMO_FREEZE"), "boolean", False
                ),
            },
        }

    return await asyncio.to_thread(load)


@router.get("/admin/users")
async def list_admin_users(
    search: Optional[str] = Query(default=None, max_length=120),
    account_type: Optional[Literal["paid", "guest"]] = None,
    role: Optional[str] = Query(default=None, max_length=40),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """List users for administration."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        query = supabase.table("users").select(
            "id, email, display_name, role, account_type, department, created_at, updated_at",
            count="exact",
        )
        if search:
            safe_search = search.replace("%", "\\%").replace("_", "\\_")
            query = query.or_(
                f"email.ilike.%{safe_search}%,display_name.ilike.%{safe_search}%"
            )
        if account_type:
            query = query.eq("account_type", account_type)
        if role:
            query = query.eq("role", role)
        result = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return {"items": result.data or [], "total": result.count or 0}

    return await asyncio.to_thread(load)


@router.patch("/admin/users/{user_id}")
@limiter.limit("30/minute")
async def update_admin_user(
    request: Request,
    user_id: str,
    update: AdminUserUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update user role, account type, or display name."""
    require_admin(current_user)

    def update_row() -> tuple[dict[str, Any], dict[str, Any]]:
        data = update.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(status_code=400, detail="No user fields provided")

        # Read the previous row so the audit `before` snapshot is meaningful.
        # We keep the SELECT and the snapshot bounded to _AUDITABLE_USER_FIELDS
        # so adding a new field to AdminUserUpdate later can't silently log
        # None for its prior value. Use limit(1) instead of .single() so a
        # missing row returns a clean 404 (PostgREST .single() raises on
        # zero rows, which would 500 on a concurrent delete).
        select_cols = ", ".join(("id",) + _AUDITABLE_USER_FIELDS)
        previous_resp = (
            supabase.table("users")
            .select(select_cols)
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if not previous_resp.data:
            raise HTTPException(status_code=404, detail="User not found")
        previous_row = previous_resp.data[0]
        before_snapshot = {
            key: previous_row.get(key)
            for key in data
            if key in _AUDITABLE_USER_FIELDS
        }

        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        result = supabase.table("users").update(data).eq("id", user_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return result.data[0], before_snapshot

    updated, before_snapshot = await asyncio.to_thread(update_row)
    # Evict the edited user's cached profile so role / account_type changes
    # apply on their next request instead of waiting up to 5 minutes.
    evict_cached_profile(user_id)
    after_snapshot = {key: updated.get(key) for key in before_snapshot}
    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.user.update",
        target_type="user",
        target_id=user_id,
        before=before_snapshot,
        after=after_snapshot,
        request=request,
    )
    return updated


@router.get("/admin/settings")
async def list_admin_settings(current_user: dict = Depends(get_current_user)):
    """List model, chat, research, and runtime settings with effective values."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        rows = supabase.table("admin_settings").select("*").execute().data or []
        overrides = {row["key"]: row for row in rows}
        items = []
        for definition in SETTING_DEFINITIONS:
            key = definition["key"]
            override = overrides.get(key)
            env_value = _parse_env_value(
                os.getenv(key), definition["value_type"], definition["default"]
            )
            # An override row with value=NULL means "explicitly cleared —
            # fall back to env / default" (admin_settings.value is nullable).
            # Keep has_override true so the UI can show the row exists, but
            # surface env_value as the effective value.
            override_value = override.get("value") if override else None
            value = (
                override_value
                if override is not None and override_value is not None
                else env_value
            )
            items.append(
                {
                    **definition,
                    "env_value": env_value,
                    "value": value,
                    "has_override": override is not None,
                    "updated_at": override.get("updated_at") if override else None,
                    "updated_by": override.get("updated_by") if override else None,
                }
            )
        return {"items": items}

    return await asyncio.to_thread(load)


@router.patch("/admin/settings/{key}")
@limiter.limit("30/minute")
async def update_admin_setting(
    request: Request,
    key: str,
    update: AdminSettingUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Persist an admin setting override and update process-local env for visibility."""
    require_admin(current_user)
    definitions = _setting_definitions_by_key()
    definition = definitions.get(key)
    if not definition:
        raise HTTPException(status_code=404, detail="Unknown admin setting")

    value = _coerce_setting_value(update.value, definition["value_type"])

    def save() -> tuple[dict[str, Any], Any]:
        # Read prior value so the audit `before` is meaningful even when the
        # row didn't exist yet (None == "no override; was falling back to env").
        prior_resp = (
            supabase.table("admin_settings")
            .select("value")
            .eq("key", key)
            .execute()
        )
        prior_value = (
            prior_resp.data[0].get("value") if prior_resp.data else None
        )

        now = datetime.now(timezone.utc).isoformat()
        row = {
            "key": key,
            "value": value,
            "value_type": definition["value_type"],
            "group_name": definition["group_name"],
            "label": definition["label"],
            "description": definition.get("description"),
            "updated_by": current_user["id"],
            "updated_at": now,
        }
        result = supabase.table("admin_settings").upsert(row, on_conflict="key").execute()
        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to save setting")
        if value is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = str(value)
        return result.data[0], prior_value

    saved, prior_value = await asyncio.to_thread(save)
    await asyncio.to_thread(
        _log_admin_action,
        actor=current_user,
        action="admin.setting.update",
        target_type="setting",
        target_id=key,
        before={"value": prior_value},
        after={"value": value},
        request=request,
    )
    # Some settings are cached at import time. Refresh in-memory state so the
    # change takes effect this process — without a restart. If the reload
    # fails the DB row is already saved but the running process is on stale
    # config; surface as 500 so the admin doesn't think the change applied.
    if key.startswith("OPENAI_"):
        try:
            reload_openai_config()
        except Exception as exc:
            logger.exception("Failed to reload OpenAI config after admin save")
            raise HTTPException(
                status_code=500,
                detail=(
                    "Setting persisted but in-memory OpenAI config reload "
                    "failed; restart the API to pick up the change."
                ),
            ) from exc
    return saved


@router.get("/admin/jobs/recent")
async def list_recent_admin_jobs(
    limit: int = Query(default=50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """Return recent operational jobs across research, discovery, and scans."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        research = (
            supabase.table("research_tasks")
            .select("id, task_type, status, card_id, workstream_id, created_at, started_at, completed_at, error_message")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        discovery = (
            supabase.table("discovery_runs")
            .select("id, status, triggered_by, started_at, completed_at, cards_created, cards_enriched, error_message, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        scans = (
            supabase.table("workstream_scans")
            .select("id, workstream_id, user_id, status, created_at, started_at, completed_at, error_message")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
        return {
            "research_tasks": research,
            "discovery_runs": discovery,
            "workstream_scans": scans,
        }

    return await asyncio.to_thread(load)


@router.get("/admin/audit")
@limiter.limit("60/minute")
async def list_admin_audit(
    request: Request,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    target_type: Optional[Literal["user", "setting"]] = None,
    actor_id: Optional[str] = None,
    since: Optional[datetime] = None,
    current_user: dict = Depends(get_current_user),
):
    """Paginated admin audit log with optional filters."""
    require_admin(current_user)

    def load() -> dict[str, Any]:
        query = supabase.table("admin_audit_log").select(
            "id, actor_id, actor_email, action, target_type, target_id, "
            "before, after, request_ip, created_at",
            count="exact",
        )
        if target_type:
            query = query.eq("target_type", target_type)
        if actor_id:
            query = query.eq("actor_id", actor_id)
        if since:
            query = query.gte("created_at", since.isoformat())
        result = (
            query.order("created_at", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        return {"items": result.data or [], "total": result.count or 0}

    return await asyncio.to_thread(load)


@router.get("/admin/users/guests")
async def list_guest_users(current_user: dict = Depends(get_current_user)):
    """List guest accounts and attached workstreams for admin review."""
    require_admin(current_user)

    def load() -> list[dict]:
        guests = (
            supabase.table("users")
            .select("id, email, display_name, account_type, created_at, updated_at")
            .eq("account_type", "guest")
            .order("created_at", desc=True)
            .execute()
        )
        rows = guests.data or []
        user_ids = [row["id"] for row in rows]
        memberships_by_user: dict[str, list[dict]] = {user_id: [] for user_id in user_ids}
        if user_ids:
            memberships = (
                supabase.table("workstream_members")
                .select("user_id, role, workstream_id, workstreams(name)")
                .in_("user_id", user_ids)
                .execute()
            )
            for membership in memberships.data or []:
                memberships_by_user.setdefault(membership["user_id"], []).append(membership)
        for row in rows:
            row["workstreams"] = memberships_by_user.get(row["id"], [])
        return rows

    return await asyncio.to_thread(load)


@router.post("/admin/users/{user_id}/account_type")
async def update_user_account_type(
    user_id: str,
    update: AccountTypeUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Upgrade or downgrade a user between paid and guest."""
    require_admin(current_user)

    def update_row() -> dict:
        result = (
            supabase.table("users")
            .update(
                {
                    "account_type": update.account_type,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", user_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return result.data[0]

    return await asyncio.to_thread(update_row)


# ============================================================================
# Taxonomy endpoints
# ============================================================================


@router.get("/taxonomy")
async def get_taxonomy(user=Depends(get_current_user)):
    """Get all taxonomy data"""
    pillars, goals, anchors, stages = await asyncio.gather(
        asyncio.to_thread(
            lambda: supabase.table("pillars").select("*").order("name").execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("goals")
            .select("*")
            .order("pillar_id", "sort_order")
            .execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("anchors").select("*").order("name").execute()
        ),
        asyncio.to_thread(
            lambda: supabase.table("stages").select("*").order("sort_order").execute()
        ),
    )

    return {
        "pillars": pillars.data,
        "goals": goals.data,
        "anchors": anchors.data,
        "stages": stages.data,
    }


# ============================================================================
# Admin scan
# ============================================================================


@router.post("/admin/scan")
@limiter.limit("3/minute")
async def trigger_manual_scan(
    request: Request, current_user: dict = Depends(get_current_user)
):
    """
    Manually trigger content scan for all active cards.

    This triggers a quick update research task for cards that haven't been
    updated in the last 24 hours. Limited to admin users.

    """
    require_admin(current_user)

    try:
        # Get cards that need updates (not updated in last 24 hours)
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

        cards_result = (
            supabase.table("cards")
            .select("id, name")
            .eq("status", "active")
            .lt("updated_at", cutoff)
            .limit(10)
            .execute()
        )

        if not cards_result.data:
            return {
                "status": "skipped",
                "message": "No cards need updating",
                "cards_queued": 0,
            }

        # Queue update tasks for each card
        tasks_created = 0
        for card in cards_result.data:
            task_record = {
                "user_id": current_user["id"],
                "card_id": card["id"],
                "task_type": "update",
                "status": "queued",
            }
            result = supabase.table("research_tasks").insert(task_record).execute()
            if result.data:
                tasks_created += 1
                logger.info(f"Queued update task for card: {card['name']}")

        return {
            "status": "scan_triggered",
            "message": f"Queued {tasks_created} update tasks",
            "cards_queued": tasks_created,
        }

    except Exception as e:
        logger.error(f"Manual scan failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("manual scan", e),
        ) from e


# ============================================================================
# Source Rating endpoints
# ============================================================================


@router.post("/sources/{source_id}/rate", response_model=SourceRatingResponse)
async def rate_source(
    source_id: str,
    rating: SourceRatingCreate,
    user=Depends(get_current_user),
):
    """Create or update user's rating for a source. Upserts on (source_id, user_id)."""
    try:
        data = {
            "source_id": source_id,
            "user_id": user["id"],
            "quality_rating": rating.quality_rating,
            "relevance_rating": rating.relevance_rating.value,
            "comment": rating.comment,
        }
        result = (
            supabase.table("source_ratings")
            .upsert(data, on_conflict="source_id,user_id")
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to save rating",
            )

        # Trigger SQI recalculation for parent card(s) of this source.
        # Fire-and-forget: rating is saved even if recalculation fails.
        try:
            card_links = (
                supabase.table("card_sources")
                .select("card_id")
                .eq("source_id", source_id)
                .execute()
            )
            for link in card_links.data or []:
                if card_id := link.get("card_id"):
                    try:
                        quality_service.calculate_sqi(supabase, card_id)
                    except Exception as sqi_err:
                        logger.warning(
                            f"SQI recalc failed for card {card_id} after rating: {sqi_err}"
                        )
        except Exception as lookup_err:
            logger.warning(
                f"Failed to look up parent cards for source {source_id}: {lookup_err}"
            )

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to rate source {source_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("rating save", e),
        ) from e


@router.get("/sources/{source_id}/ratings", response_model=SourceRatingAggregate)
async def get_source_ratings(source_id: str, user=Depends(get_current_user)):
    """Get aggregated ratings for a source plus current user's rating."""
    try:
        all_ratings = (
            supabase.table("source_ratings")
            .select("*")
            .eq("source_id", source_id)
            .execute()
        )

        ratings = all_ratings.data or []
        if not ratings:
            return SourceRatingAggregate(
                source_id=source_id,
                avg_quality=0,
                total_ratings=0,
                relevance_distribution={
                    "high": 0,
                    "medium": 0,
                    "low": 0,
                    "not_relevant": 0,
                },
            )

        avg_quality = sum(r["quality_rating"] for r in ratings) / len(ratings)
        relevance_dist = {"high": 0, "medium": 0, "low": 0, "not_relevant": 0}
        for r in ratings:
            if r["relevance_rating"] in relevance_dist:
                relevance_dist[r["relevance_rating"]] += 1

        current_user_rating = next(
            (r for r in ratings if r["user_id"] == user["id"]), None
        )

        return SourceRatingAggregate(
            source_id=source_id,
            avg_quality=round(avg_quality, 2),
            total_ratings=len(ratings),
            relevance_distribution=relevance_dist,
            current_user_rating=current_user_rating,
        )
    except Exception as e:
        logger.error(f"Failed to get source ratings for {source_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("source ratings retrieval", e),
        ) from e


@router.delete("/sources/{source_id}/rate")
async def delete_source_rating(source_id: str, user=Depends(get_current_user)):
    """Remove user's rating for a source."""
    try:
        supabase.table("source_ratings").delete().eq("source_id", source_id).eq(
            "user_id", user["id"]
        ).execute()
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Failed to delete source rating for {source_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("rating deletion", e),
        ) from e


# ============================================================================
# Quality / SQI endpoints
# ============================================================================


@router.get("/cards/{card_id}/quality")
async def get_card_quality(card_id: str, user=Depends(get_current_user)):
    """Get full SQI breakdown for a card."""
    try:
        breakdown = quality_service.get_breakdown(
            supabase, card_id
        ) or quality_service.calculate_sqi(supabase, card_id)
        return breakdown
    except Exception as e:
        logger.error(f"Failed to get quality for card {card_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card quality retrieval", e),
        ) from e


@router.post("/cards/{card_id}/quality/recalculate")
@limiter.limit("20/minute")
async def recalculate_card_quality(
    request: Request, card_id: str, user=Depends(get_current_user)
):
    """Force SQI recalculation for a card."""
    require_admin(user)

    try:
        return quality_service.calculate_sqi(supabase, card_id)
    except Exception as e:
        logger.error(f"Failed to recalculate quality for card {card_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("card quality recalculation", e),
        ) from e


@router.post("/admin/quality/recalculate-all")
async def recalculate_all_quality(user=Depends(get_current_user)):
    """Batch recalculate SQI for all cards. Admin only."""
    require_admin(user)

    try:
        return quality_service.recalculate_all_cards(supabase)
    except Exception as e:
        logger.error(f"Failed to batch recalculate quality: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("batch quality recalculation", e),
        ) from e


@router.get("/cards/{card_id}/quality-score")
async def get_signal_quality_score(card_id: str, user=Depends(get_current_user)):
    """Get computed signal quality score for a card."""
    from app.signal_quality import compute_signal_quality_score

    return compute_signal_quality_score(supabase, card_id)


@router.post("/cards/{card_id}/quality-score/refresh")
async def refresh_signal_quality_score(card_id: str, user=Depends(get_current_user)):
    """Recompute and store the signal quality score."""
    require_admin(user)

    from app.signal_quality import update_signal_quality_score

    score = update_signal_quality_score(supabase, card_id)
    return {"card_id": card_id, "signal_quality_score": score}


# ============================================================================
# Domain Reputation endpoints
# ============================================================================


@router.get("/domain-reputation")
async def list_domain_reputations(
    page: int = 1,
    page_size: int = 50,
    tier: Optional[int] = None,
    category: Optional[str] = None,
    user=Depends(get_current_user),
):
    """List all domains with reputation data, paginated and filterable."""
    try:
        query = supabase.table("domain_reputation").select("*", count="exact")
        if tier:
            query = query.eq("curated_tier", tier)
        if category:
            query = query.eq("category", category)
        query = query.order("composite_score", desc=True)
        query = query.range((page - 1) * page_size, page * page_size - 1)
        result = query.execute()
        return {
            "items": result.data,
            "total": result.count,
            "page": page,
            "page_size": page_size,
        }
    except Exception as e:
        logger.error(f"Failed to list domain reputations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputations listing", e),
        ) from e


@router.get("/domain-reputation/{domain_id}")
async def get_domain_reputation(domain_id: str, user=Depends(get_current_user)):
    """Get single domain reputation detail."""
    try:
        result = (
            supabase.table("domain_reputation")
            .select("*")
            .eq("id", domain_id)
            .single()
            .execute()
        )
        return result.data
    except Exception as e:
        logger.error(f"Failed to get domain reputation {domain_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=_safe_error("domain reputation lookup", e),
        ) from e


@router.post("/admin/domain-reputation")
async def create_domain_reputation(
    body: DomainReputationCreate, user=Depends(get_current_user)
):
    """Add a new domain to the reputation system. Admin only."""
    require_admin(user)

    try:
        data = body.model_dump()
        # Calculate initial composite score based on tier
        tier_scores = {1: 85, 2: 60, 3: 35}
        tier_score = tier_scores.get(data.get("curated_tier"), 20)
        data["composite_score"] = tier_score * 0.50 + data.get(
            "texas_relevance_bonus", 0
        )
        result = supabase.table("domain_reputation").insert(data).execute()
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create domain reputation",
            )
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create domain reputation: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputation creation", e),
        ) from e


@router.patch("/admin/domain-reputation/{domain_id}")
async def update_domain_reputation(
    domain_id: str,
    body: DomainReputationUpdate,
    user=Depends(get_current_user),
):
    """Update a domain's tier, category, or other fields. Admin only."""
    require_admin(user)

    try:
        data = body.model_dump(exclude_none=True)
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields provided for update",
            )
        result = (
            supabase.table("domain_reputation")
            .update(data)
            .eq("id", domain_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Domain reputation not found",
            )
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update domain reputation {domain_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputation update", e),
        ) from e


@router.delete("/admin/domain-reputation/{domain_id}")
async def delete_domain_reputation(domain_id: str, user=Depends(get_current_user)):
    """Remove a domain from the reputation system. Admin only."""
    require_admin(user)

    try:
        supabase.table("domain_reputation").delete().eq("id", domain_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        logger.error(f"Failed to delete domain reputation {domain_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputation deletion", e),
        ) from e


@router.post("/admin/domain-reputation/recalculate")
async def recalculate_domain_reputations(user=Depends(get_current_user)):
    """Recalculate all composite scores from user ratings + pipeline stats."""
    require_admin(user)

    try:
        return domain_reputation_service.recalculate_all(supabase)
    except Exception as e:
        logger.error(f"Failed to recalculate domain reputations: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("domain reputations recalculation", e),
        ) from e


# NOTE: top-domains endpoint lives in analytics.py to avoid route duplication.


# ============================================================================
# Velocity calculation endpoint
# ============================================================================


@router.post("/admin/velocity/calculate")
async def trigger_velocity_calculation(
    current_user: dict = Depends(get_current_user),
):
    """Trigger velocity trend calculation for all active cards. Runs in background."""
    require_admin(current_user)

    from app.velocity_service import calculate_velocity_trends

    async def _run_velocity():
        try:
            result = await calculate_velocity_trends(supabase)
            logger.info("On-demand velocity calculation completed: %s", result)
        except Exception as exc:
            logger.exception("On-demand velocity calculation failed: %s", exc)

    asyncio.create_task(_run_velocity())
    return {
        "status": "started",
        "message": "Velocity calculation is running in the background.",
    }


# ============================================================================
# Lens classification backfill
# ============================================================================


class LensBackfillRequest(BaseModel):
    """Targets for the lens classification cascade.

    - ``card_ids``: explicit list of card UUIDs. Bypasses the version filter.
    - ``limit``:    cap on candidates pulled from the version filter.
                    Hard-capped at 500 to keep a single backfill run bounded.
    - ``force``:    re-classify even when ``classifier_version`` already matches.
    """

    card_ids: Optional[list[str]] = None
    limit: int = 100
    force: bool = False


@router.post("/admin/classify/backfill")
async def trigger_lens_backfill(
    body: LensBackfillRequest,
    current_user: dict = Depends(get_current_user),
):
    """Re-classify cards through the lens cascade. Runs in the background.

    Selection rules:
    - If ``card_ids`` is provided, those exact cards are processed (still
      version-checked unless ``force=True``).
    - Otherwise the endpoint pulls cards whose ``classifier_version`` is
      NULL or does not match the current ``CLASSIFIER_VERSION`` constant.
    - ``user_metadata`` is **never** overwritten by this endpoint — only
      LLM-derived columns are written.

    Idempotent: re-running with no version change is a no-op.
    """
    require_admin(current_user)

    from app.lens_classification_service import (
        CLASSIFIER_VERSION,
        LensClassificationService,
    )

    target_version = CLASSIFIER_VERSION
    capped_limit = max(1, min(body.limit, 500))

    select_cols = "id, name, summary, pillar_id, horizon, stage_id"
    query = supabase.table("cards").select(select_cols).limit(capped_limit)

    if body.card_ids:
        query = query.in_("id", body.card_ids)
        if not body.force:
            query = query.or_(
                f'classifier_version.is.null,classifier_version.neq."{target_version}"'
            )
    elif not body.force:
        query = query.or_(
            f'classifier_version.is.null,classifier_version.neq."{target_version}"'
        )

    try:
        cards_resp = await asyncio.to_thread(query.execute)
    except Exception as exc:
        logger.exception("Lens backfill candidate query failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=_safe_error("lens backfill candidate lookup", exc),
        ) from exc

    cards = cards_resp.data or []
    if not cards:
        return {
            "status": "skipped",
            "queued": 0,
            "target_version": target_version,
            "message": "No cards matched the version filter.",
        }

    async def _run_backfill():
        from app.openai_provider import openai_async_client

        service = LensClassificationService(openai_async_client, supabase)
        succeeded = 0
        partial = 0
        failed = 0
        for card in cards:
            try:
                result = await service.classify_card(card)
                update = result.to_card_update()
                # Only mark classified_at when the cascade actually
                # stamped a version (i.e. all required stages succeeded).
                # Partial failures keep classifier_version null so the
                # next backfill pass re-tries them.
                if update.get("classifier_version") is not None:
                    update["classified_at"] = service.now_iso()
                    succeeded += 1
                else:
                    partial += 1
                await asyncio.to_thread(
                    lambda c=card, u=update: supabase.table("cards")
                    .update(u)
                    .eq("id", c["id"])
                    .execute()
                )
            except Exception as exc:
                logger.exception(
                    "Lens backfill failed for card %s: %s", card.get("id"), exc
                )
                failed += 1
        logger.info(
            "Lens backfill complete: target=%s succeeded=%d partial=%d failed=%d",
            target_version,
            succeeded,
            partial,
            failed,
        )

    backfill_task = asyncio.create_task(_run_backfill())
    _BACKGROUND_TASKS.add(backfill_task)
    backfill_task.add_done_callback(_BACKGROUND_TASKS.discard)

    return {
        "status": "started",
        "queued": len(cards),
        "target_version": target_version,
        "force": body.force,
    }
