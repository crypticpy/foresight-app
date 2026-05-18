"""Admin aggregator + remaining inline endpoints.

This file owns the shared ``/api/v1`` prefix and ``admin`` tag, mounts
focused sub-routers for endpoint clusters that have been extracted, and
hosts the remaining endpoints inline pending their own extraction.

Sub-routers mounted here
------------------------
* ``admin_taxonomy.py`` — ``GET /taxonomy`` (read-only pillar / goal /
  anchor / stage rows for the frontend taxonomy selectors).
* ``admin_scan.py`` — ``POST /admin/scan`` (admin-only trigger that
  queues update research tasks for stale active cards, 3/min limit).
* ``admin_source_rating.py`` — ``POST /sources/{id}/rate``,
  ``GET /sources/{id}/ratings``, ``DELETE /sources/{id}/rate`` (upsert
  / aggregate / remove user ratings, with parent-card SQI recalc).
* ``admin_quality.py`` — card-level SQI breakdown / recalculation and
  the standalone signal_quality score endpoints.
* ``admin_domain_reputation.py`` — list / get / create / update / delete
  / recalculate for the domain reputation system.

When extracting another endpoint cluster, add the import + an
``include_router`` line below. Do NOT change the parent prefix — keep
``/api/v1`` in exactly one place so the URL surface doesn't drift.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from . import (
    admin_domain_reputation,
    admin_quality,
    admin_scan,
    admin_source_rating,
    admin_taxonomy,
)
from app.authz import require_admin
from app.deps import (
    supabase,
    get_current_user,
    _safe_error,
    limiter,
    evict_cached_profile,
)
from app import cost_guardrail
from app.audit_service import log_admin_action as _log_admin_action
from app.openai_provider import (
    ALLOWED_CHAT_MODELS,
    ALLOWED_EMBEDDING_MODELS,
    ALLOWED_REASONING_EFFORTS,
    DEFAULT_CHAT_AGENT_MODEL,
    DEFAULT_CHAT_MINI_MODEL,
    DEFAULT_CHAT_MODEL,
    DEFAULT_EMBEDDING_MODEL,
    DEFAULT_REASONING_EFFORT,
    reload_config as reload_openai_config,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["admin"])

# Mount sub-routers under the shared /api/v1 prefix.
router.include_router(admin_taxonomy.router)
router.include_router(admin_scan.router)
router.include_router(admin_source_rating.router)
router.include_router(admin_quality.router)
router.include_router(admin_domain_reputation.router)

# Back-compat re-exports for tests / legacy callers that reach handlers
# by attribute on this module. Production code should import from the
# sub-router directly.
get_taxonomy = admin_taxonomy.get_taxonomy
trigger_manual_scan = admin_scan.trigger_manual_scan
rate_source = admin_source_rating.rate_source
get_source_ratings = admin_source_rating.get_source_ratings
delete_source_rating = admin_source_rating.delete_source_rating
get_card_quality = admin_quality.get_card_quality
recalculate_card_quality = admin_quality.recalculate_card_quality
recalculate_all_quality = admin_quality.recalculate_all_quality
get_signal_quality_score = admin_quality.get_signal_quality_score
refresh_signal_quality_score = admin_quality.refresh_signal_quality_score
list_domain_reputations = admin_domain_reputation.list_domain_reputations
get_domain_reputation = admin_domain_reputation.get_domain_reputation
create_domain_reputation = admin_domain_reputation.create_domain_reputation
update_domain_reputation = admin_domain_reputation.update_domain_reputation
delete_domain_reputation = admin_domain_reputation.delete_domain_reputation
recalculate_domain_reputations = (
    admin_domain_reputation.recalculate_domain_reputations
)

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
        "default": DEFAULT_CHAT_MODEL,
        "allowed_values": list(ALLOWED_CHAT_MODELS),
    },
    {
        "key": "OPENAI_CHAT_AGENT_MODEL",
        "group_name": "models",
        "label": "Agent model",
        "description": "Model for agentic research and tool-heavy workflows.",
        "value_type": "string",
        "default": DEFAULT_CHAT_AGENT_MODEL,
        "allowed_values": list(ALLOWED_CHAT_MODELS),
    },
    {
        "key": "OPENAI_CHAT_MINI_MODEL",
        "group_name": "models",
        "label": "Mini model",
        "description": "Lower-cost model for classification and structured helper tasks.",
        "value_type": "string",
        "default": DEFAULT_CHAT_MINI_MODEL,
        "allowed_values": list(ALLOWED_CHAT_MODELS),
    },
    {
        "key": "OPENAI_EMBEDDING_MODEL",
        "group_name": "models",
        "label": "Embedding model",
        "description": "Embedding model used for vector search and deduplication.",
        "value_type": "string",
        "default": DEFAULT_EMBEDDING_MODEL,
        "allowed_values": list(ALLOWED_EMBEDDING_MODELS),
    },
    {
        "key": "OPENAI_REASONING_EFFORT",
        "group_name": "models",
        "label": "Reasoning effort",
        "description": "Default reasoning effort passed to supported OpenAI models.",
        "value_type": "string",
        "default": DEFAULT_REASONING_EFFORT,
        "allowed_values": list(ALLOWED_REASONING_EFFORTS),
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
        "key": "FORESIGHT_COST_GUARDRAIL_ENABLED",
        "group_name": "research",
        "label": "Cost guardrail enabled",
        "description": (
            "Master switch for the rolling-window cost guardrail. When off, "
            "cost settings below are ignored and runaway spend is not blocked."
        ),
        "value_type": "boolean",
        "default": False,
    },
    {
        "key": "FORESIGHT_COST_BUDGET_USD",
        "group_name": "research",
        "label": "Cost budget (USD)",
        "description": (
            "Hard cap on total spend over the rolling window. When reached, "
            "research / discovery / signal-agent paths refuse new work until "
            "the cap is raised or the guardrail is reset. Null = no cap."
        ),
        "value_type": "number",
        "default": None,
    },
    {
        "key": "FORESIGHT_COST_BUDGET_WINDOW_DAYS",
        "group_name": "research",
        "label": "Cost budget window (days)",
        "description": "Length of the rolling window the cap applies to.",
        "value_type": "number",
        "default": 7,
    },
    {
        "key": "FORESIGHT_COST_ALERT_THRESHOLD_USD",
        "group_name": "research",
        "label": "Cost alert threshold (USD)",
        "description": (
            "Soft threshold. Crossing it logs a cost.alert audit row but does "
            "not block work. Null = no alert."
        ),
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
        "key": "FORESIGHT_AUDIT_LLM_CONTENT",
        "group_name": "runtime",
        "label": "Capture LLM prompt/response content",
        "description": (
            "Persist redacted prompts and responses to llm_usage_events for the "
            "admin audit tab. Off by default — enable when you need a content "
            "trail for FOIA / oversight. Token & cost metrics are always captured."
        ),
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
    # Discovery pipeline knobs. These take effect on the *next* discovery
    # run; in-flight runs keep their captured config. Edits here flow through
    # ``app.discovery_service.build_discovery_config``.
    {
        "key": "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN",
        "group_name": "discovery",
        "label": "Max queries per run",
        "description": "Cap on search queries executed per discovery run.",
        "value_type": "number",
        "default": 100,
    },
    {
        "key": "FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY",
        "group_name": "discovery",
        "label": "Max sources per query",
        "description": "Cap on URLs taken from each individual search query.",
        "value_type": "number",
        "default": 10,
    },
    {
        "key": "FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL",
        "group_name": "discovery",
        "label": "Max sources total",
        "description": "Hard ceiling on URLs fetched per run, summed across all queries and categories.",
        "value_type": "number",
        "default": 500,
    },
    {
        "key": "FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN",
        "group_name": "discovery",
        "label": "Max new cards per run",
        "description": "Cap on brand-new cards a single run can create. Enrichments to existing cards are unlimited.",
        "value_type": "number",
        "default": 15,
    },
    {
        "key": "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD",
        "group_name": "discovery",
        "label": "Auto-approve threshold",
        "description": "Confidence (0–1) above which new cards skip the review queue. Higher = stricter.",
        "value_type": "number",
        "default": 0.95,
    },
    {
        "key": "FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD",
        "group_name": "discovery",
        "label": "Strong-match threshold",
        "description": "Vector similarity (0–1) at which a source is treated as the same signal as an existing card and enriches it.",
        "value_type": "number",
        "default": 0.85,
    },
    {
        "key": "FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD",
        "group_name": "discovery",
        "label": "Weak-match threshold",
        "description": "Lower vector similarity bound that triggers an LLM tie-breaker between enriching and creating.",
        "value_type": "number",
        "default": 0.75,
    },
    {
        "key": "FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD",
        "group_name": "discovery",
        "label": "Name-match threshold",
        "description": "String-similarity bound on titles used as a deduplication signal alongside the vector match.",
        "value_type": "number",
        "default": 0.80,
    },
]


# Coded discovery presets. Picking a preset bulk-PATCHes all eight discovery
# knobs to the values below. The "balanced" preset matches the in-code defaults
# so applying it cleanly resets any drift.
DISCOVERY_PRESETS: dict[str, dict[str, Any]] = {
    "conservative": {
        "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN": 50,
        "FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY": 5,
        "FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL": 200,
        "FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN": 8,
        "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD": 0.97,
        # 0.92 matches the historical strict dedup threshold documented in
        # CLAUDE.md. Operators picking the conservative preset get the
        # tightest dedup we ship; balanced/aggressive trade dedup strictness
        # for enrichment recall.
        "FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD": 0.92,
        "FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD": 0.82,
        "FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD": 0.88,
    },
    "balanced": {
        "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN": 100,
        "FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY": 10,
        "FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL": 500,
        "FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN": 15,
        "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD": 0.95,
        "FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD": 0.85,
        "FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD": 0.75,
        "FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD": 0.80,
    },
    "aggressive": {
        "FORESIGHT_DISCOVERY_MAX_QUERIES_PER_RUN": 200,
        "FORESIGHT_DISCOVERY_MAX_SOURCES_PER_QUERY": 15,
        "FORESIGHT_DISCOVERY_MAX_SOURCES_TOTAL": 1000,
        "FORESIGHT_DISCOVERY_MAX_NEW_CARDS_PER_RUN": 30,
        "FORESIGHT_DISCOVERY_AUTO_APPROVE_THRESHOLD": 0.92,
        "FORESIGHT_DISCOVERY_SIMILARITY_THRESHOLD": 0.80,
        "FORESIGHT_DISCOVERY_WEAK_MATCH_THRESHOLD": 0.70,
        "FORESIGHT_DISCOVERY_NAME_SIMILARITY_THRESHOLD": 0.75,
    },
}


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


async def _apply_admin_setting_change(
    *,
    key: str,
    raw_value: Any,
    current_user: dict,
    request: Optional[Request],
    action: str = "admin.setting.update",
) -> dict[str, Any]:
    """Persist a single setting override, audit it, and refresh in-process state.

    Shared by both the per-setting PATCH endpoint and the bulk preset endpoint
    so they cannot drift on validation, audit shape, or the OpenAI reload hook.
    """
    definition = _setting_definitions_by_key().get(key)
    if not definition:
        raise HTTPException(status_code=404, detail="Unknown admin setting")

    value = _coerce_setting_value(raw_value, definition["value_type"])

    # If the setting carries an allowlist (e.g. model tiers), reject anything
    # outside it before it can be persisted or pushed into os.environ. Guards
    # against an admin setting OPENAI_CHAT_MODEL=gpt-5.5 (retired) or a typo
    # routing production traffic to a model that doesn't exist.
    allowed_values = definition.get("allowed_values")
    if allowed_values and value not in allowed_values:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Value {value!r} is not allowed for {key}. "
                f"Allowed: {sorted(allowed_values)}"
            ),
        )

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
        action=action,
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
    if key in {
        cost_guardrail.COST_BUDGET_KEY,
        cost_guardrail.COST_WINDOW_KEY,
        cost_guardrail.COST_ALERT_KEY,
        cost_guardrail.COST_ENABLED_KEY,
    }:
        cost_guardrail.invalidate_cache()
    return saved


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
    return await _apply_admin_setting_change(
        key=key,
        raw_value=update.value,
        current_user=current_user,
        request=request,
    )


class DiscoveryPresetApply(BaseModel):
    """Request body for ``POST /admin/discovery/preset``.

    ``preset`` must be one of the keys in ``DISCOVERY_PRESETS`` — the endpoint
    rejects unknown values with 400 rather than silently doing nothing so
    typos surface immediately.
    """

    preset: Literal["conservative", "balanced", "aggressive"]


@router.post("/admin/discovery/preset")
@limiter.limit("10/minute")
async def apply_discovery_preset(
    request: Request,
    body: DiscoveryPresetApply,
    current_user: dict = Depends(get_current_user),
):
    """Bulk-apply a coded discovery preset by writing each knob individually.

    Each knob still flows through ``_apply_admin_setting_change`` so the audit
    log captures one row per field change. We intentionally do NOT batch the
    eight rows into a single audit entry — single-knob audit shape is the
    contract, and reverting one knob from the preset later should be searchable.
    """
    require_admin(current_user)
    values = DISCOVERY_PRESETS.get(body.preset)
    if values is None:
        # Pydantic Literal already rejects unknown presets, but guard against
        # a future code path that bypasses validation.
        raise HTTPException(status_code=400, detail="Unknown discovery preset")

    saved: list[dict[str, Any]] = []
    for key, value in values.items():
        row = await _apply_admin_setting_change(
            key=key,
            raw_value=value,
            current_user=current_user,
            request=request,
            action="admin.discovery.preset.apply",
        )
        saved.append(row)
    return {"preset": body.preset, "items": saved}


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


# NOTE: top-domains endpoint lives in analytics.py to avoid route duplication.
# Card quality / SQI endpoints live in admin_quality.py.
# Domain reputation CRUD lives in admin_domain_reputation.py.


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


# ============================================================================
# Embedding backfill (re-embed cards + sources after a model swap)
# ============================================================================


class EmbeddingBackfillRequest(BaseModel):
    """Targets for the embedding re-run.

    Use after rotating ``OPENAI_EMBEDDING_MODEL`` so persisted vectors stop
    living in two different latent spaces.

    Repeated invocations auto-advance per-table cursors so the corpus is
    walked forward rather than re-embedding the same prefix. Send
    ``restart=true`` to reset both cursors to 0.
    """

    target: Literal["cards", "sources", "both"] = "both"
    limit: int = 2000
    concurrency: int = 3
    restart: bool = False
    # Default True so the operator's first run after the model swap actually
    # covers NULL-embedding rows (e.g. sources, 100% NULL today). Set False
    # to restrict to model-rotation semantics — refresh existing vectors only.
    include_null: bool = True


# Last-completed run summary, surfaced by GET /admin/embeddings/backfill/status
# so the operator can see what the most recent button-press actually did
# without tailing Railway logs. In-memory only — fine because the operator's
# the only consumer and a redeploy resets state.
#
# Caveat: prod runs gunicorn with 4 Uvicorn workers (`backend/entrypoint.sh`),
# so this dict + the lock below are *per-process*. The overlap guard prevents
# two concurrent backfills on a single worker; two requests landing on
# different workers can still race. A proper cross-worker lock (Postgres
# advisory lock or Redis) is a follow-up. The 3/min rate limit narrows the
# practical window further but is also per-worker.
_LAST_EMBEDDING_BACKFILL: dict[str, Any] = {"state": "idle"}
_EMBEDDING_BACKFILL_LOCK = asyncio.Lock()


@router.post("/admin/embeddings/backfill")
@limiter.limit("3/minute")
async def trigger_embedding_backfill(
    request: Request,
    body: EmbeddingBackfillRequest,
    current_user: dict = Depends(get_current_user),
):
    """Re-embed `cards` and/or `sources` rows against the active embedding model.

    Pulls up to ``limit`` rows per table whose ``embedding`` is non-null,
    regenerates the vector with the input shape each pipeline writes today
    (cards: name+summary+description, sources: title+ai_summary), and
    overwrites the column. Runs in the background; check
    ``GET /admin/embeddings/backfill/status`` for the result.

    Rate-limited to 3/min and rejects overlapping launches with 409 so a
    double-click can't run two concurrent backfills that race on the same
    rows (wasted embedding spend + last-write-wins on the column). See the
    module-level note on `_LAST_EMBEDDING_BACKFILL` for the cross-worker
    limitation.
    """
    require_admin(current_user)

    from app.embedding_backfill_service import run_embedding_backfill
    from app.openai_provider import get_embedding_deployment

    capped_limit = max(1, min(body.limit, 10000))
    capped_concurrency = max(1, min(body.concurrency, 10))

    # Hold the lock across the check-and-set so two concurrent requests on
    # the same worker can't both pass the != "running" check before either
    # transitions the state. The body of `_run` is launched as a background
    # task and runs outside the lock.
    async with _EMBEDDING_BACKFILL_LOCK:
        if _LAST_EMBEDDING_BACKFILL.get("state") == "running":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An embedding backfill is already running",
            )

        # Auto-advance the per-table cursor from the previous run's `next_offset`
        # so repeated button-presses walk the corpus instead of re-embedding the
        # same prefix. `restart=true` resets both cursors back to 0.
        offsets: dict[str, int] = {"cards": 0, "sources": 0}
        if not body.restart:
            prior_summary = _LAST_EMBEDDING_BACKFILL.get("summary") or {}
            for table in ("cards", "sources"):
                table_summary = prior_summary.get(table) or {}
                next_offset = table_summary.get("next_offset")
                if isinstance(next_offset, int) and next_offset > 0:
                    # If the prior run reported `done: true`, that table has been
                    # exhausted — wrap back to 0 so the next click starts a fresh
                    # pass rather than getting stuck past the tail.
                    offsets[table] = 0 if table_summary.get("done") else next_offset

        _LAST_EMBEDDING_BACKFILL.clear()
        _LAST_EMBEDDING_BACKFILL.update(
            {
                "state": "running",
                "target": body.target,
                "limit": capped_limit,
                "concurrency": capped_concurrency,
                "model": get_embedding_deployment(),
                "offsets": offsets,
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    async def _run():
        try:
            summary = await run_embedding_backfill(
                supabase,
                target=body.target,
                limit=capped_limit,
                concurrency=capped_concurrency,
                offsets=offsets,
                include_null=body.include_null,
            )
            _LAST_EMBEDDING_BACKFILL.update(
                {
                    "state": "complete",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "summary": summary,
                }
            )
        except Exception as exc:
            logger.exception("Embedding backfill failed: %s", exc)
            _LAST_EMBEDDING_BACKFILL.update(
                {
                    "state": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error": _safe_error("embedding backfill", exc),
                }
            )

    task = asyncio.create_task(_run())
    _BACKGROUND_TASKS.add(task)
    task.add_done_callback(_BACKGROUND_TASKS.discard)

    return {
        "status": "started",
        "target": body.target,
        "limit": capped_limit,
        "concurrency": capped_concurrency,
        "offsets": offsets,
    }


@router.get("/admin/embeddings/backfill/status")
async def get_embedding_backfill_status(
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Return the most recent embedding-backfill run's state.

    Returns ``{"state": "idle"}`` if the process hasn't run since boot.
    """
    require_admin(current_user)
    return dict(_LAST_EMBEDDING_BACKFILL)
