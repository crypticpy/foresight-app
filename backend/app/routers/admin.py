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
* ``admin_velocity.py`` — ``POST /admin/velocity/calculate`` (admin-only
  background trigger for the velocity-trends recalculation).
* ``admin_lens_backfill.py`` — ``POST /admin/classify/backfill``
  (idempotent lens-classification cascade re-run with version filter).
* ``admin_embedding_backfill.py`` — ``POST /admin/embeddings/backfill``
  + ``GET /admin/embeddings/backfill/status`` (re-embed corpus after
  model rotation, with per-table cursor and 409 overlap guard).
* ``admin_users.py`` — ``GET /admin/users``, ``PATCH /admin/users/{id}``,
  ``GET /admin/users/guests``, ``POST /admin/users/{id}/account_type``
  (admin user management with bounded audit logging + profile cache
  eviction).

When extracting another endpoint cluster, add the import + an
``include_router`` line below. Do NOT change the parent prefix — keep
``/api/v1`` in exactly one place so the URL surface doesn't drift.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from . import (
    admin_domain_reputation,
    admin_embedding_backfill,
    admin_lens_backfill,
    admin_quality,
    admin_scan,
    admin_source_rating,
    admin_taxonomy,
    admin_users,
    admin_velocity,
)
from app.authz import require_admin
from app.deps import (
    supabase,
    get_current_user,
    limiter,
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
router.include_router(admin_velocity.router)
router.include_router(admin_lens_backfill.router)
router.include_router(admin_embedding_backfill.router)
router.include_router(admin_users.router)

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
trigger_velocity_calculation = admin_velocity.trigger_velocity_calculation
trigger_lens_backfill = admin_lens_backfill.trigger_lens_backfill
LensBackfillRequest = admin_lens_backfill.LensBackfillRequest
trigger_embedding_backfill = admin_embedding_backfill.trigger_embedding_backfill
get_embedding_backfill_status = (
    admin_embedding_backfill.get_embedding_backfill_status
)
EmbeddingBackfillRequest = admin_embedding_backfill.EmbeddingBackfillRequest
list_admin_users = admin_users.list_admin_users
update_admin_user = admin_users.update_admin_user
list_guest_users = admin_users.list_guest_users
update_user_account_type = admin_users.update_user_account_type
AccountTypeUpdate = admin_users.AccountTypeUpdate
AdminUserUpdate = admin_users.AdminUserUpdate


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


# NOTE: top-domains endpoint lives in analytics.py to avoid route duplication.
# Card quality / SQI endpoints live in admin_quality.py.
# Domain reputation CRUD lives in admin_domain_reputation.py.
# Velocity calculation lives in admin_velocity.py.
# Lens classification backfill lives in admin_lens_backfill.py.
# Embedding backfill (trigger + status) lives in admin_embedding_backfill.py.
# Admin user management (list, patch, guests, account_type) lives in admin_users.py.
