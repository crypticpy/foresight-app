"""Admin settings sub-router.

Endpoints
---------
* ``GET   /admin/settings`` — list every setting definition together with
  its effective value (override row > ``os.environ`` > coded default),
  the override timestamp, and who last touched it.
* ``PATCH /admin/settings/{key}`` — persist a single setting override,
  write an ``admin.setting.update`` audit row, push the value into
  ``os.environ`` so the running process sees it without restart, and
  hot-reload caches that pin the value (OpenAI provider, cost guardrail).
  Rate-limited to 30/min.
* ``POST  /admin/discovery/preset`` — bulk-apply one of the coded
  discovery presets (``conservative`` / ``balanced`` / ``aggressive``)
  by reusing the single-knob save path for each field, so the audit log
  captures one row per knob change. Rate-limited to 10/min.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

``SETTING_DEFINITIONS`` is the single source of truth for which keys
exist, their group / label / value_type, and any allowlist. New settings
get added here (and only here). The discovery presets in
``DISCOVERY_PRESETS`` write through ``_apply_admin_setting_change`` so
they cannot diverge from per-key PATCH validation or audit shape.
"""

from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app import cost_guardrail
from app.audit_service import log_admin_action as _log_admin_action
from app.authz import require_admin
from app.deps import get_current_user, limiter, supabase
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
router = APIRouter(tags=["admin"])


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
        "description": "Enable workstream collaboration features (card discussions).",
        "value_type": "boolean",
        # On by default — admins can opt out via the admin settings UI or by
        # setting FORESIGHT_ENABLE_COLLABORATION=false on the API service.
        # Keep this in sync with feature_flags.collaboration_enabled() and
        # routers.config.get_config() which both default this flag to True.
        "default": True,
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
