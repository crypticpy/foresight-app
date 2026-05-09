"""Rolling-window cost guardrail.

Two-layer model:

1. **Hard cap** (``FORESIGHT_COST_BUDGET_USD``): when exceeded, expensive
   paths (research / discovery / signal-agent) refuse to start new work
   until the cap is raised or the guardrail is reset.
2. **Soft alert** (``FORESIGHT_COST_ALERT_THRESHOLD_USD``): when crossed,
   we log a single ``cost.alert`` audit row per window. Existing work
   continues.

State that influences behavior:

- ``admin_settings`` rows for the four cost knobs (read live every refresh).
- ``cost_guardrail_state.reset_after`` — when an admin clicks "Reset
  guardrail," the rolling-window sum ignores spend before this time so
  the trip clears without raising the cap.

A ~30 s in-process cache fronts the supabase fetch so hot paths don't
query telemetry on every call. The cache is invalidated when the admin
saves a setting or resets the guardrail so changes take effect
immediately.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import HTTPException

from app.deps import supabase

logger = logging.getLogger(__name__)


COST_BUDGET_KEY = "FORESIGHT_COST_BUDGET_USD"
COST_WINDOW_KEY = "FORESIGHT_COST_BUDGET_WINDOW_DAYS"
COST_ALERT_KEY = "FORESIGHT_COST_ALERT_THRESHOLD_USD"
COST_ENABLED_KEY = "FORESIGHT_COST_GUARDRAIL_ENABLED"

_DEFAULT_WINDOW_DAYS = 7
_CACHE_TTL_SEC = 30.0


@dataclass
class BudgetState:
    enabled: bool
    spent_usd: float
    cap_usd: Optional[float]
    alert_usd: Optional[float]
    window_days: int
    window_start: str  # ISO8601, after applying reset_after if any
    reset_after: Optional[str]
    tripped: bool
    alerting: bool
    last_alert_at: Optional[str]
    last_tripped_at: Optional[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class BudgetExceededError(Exception):
    """Raised by ``check_budget_or_skip`` when the hard cap is tripped."""

    def __init__(self, state: BudgetState):
        self.state = state
        cap = state.cap_usd if state.cap_usd is not None else 0.0
        super().__init__(
            f"Cost guardrail tripped: ${state.spent_usd:.2f} of "
            f"${cap:.2f} cap over {state.window_days}d"
        )


_cache: dict[str, Any] = {"value": None, "expires": 0.0}
_cache_lock = asyncio.Lock()


def _coerce_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _read_setting(rows: list[dict[str, Any]], key: str) -> Any:
    """Return the effective value for ``key``.

    Mirrors the admin-settings UI: an admin override row with a non-null
    value wins; otherwise fall back to the matching environment variable
    so operators who configure ``FORESIGHT_COST_*`` purely via env still
    see the guardrail apply.
    """
    for row in rows:
        if row.get("key") == key:
            value = row.get("value")
            if value not in (None, ""):
                return value
            break
    env_value = os.getenv(key)
    if env_value is None or env_value == "":
        return None
    return env_value


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


_SPEND_PAGE_SIZE = 50_000


def _sum_spend(start: datetime, end: datetime) -> float:
    """Sum estimated_cost_usd from llm + external events in [start, end).

    Paginates with ``.range()`` so high-volume windows (>50k events) are
    summed exhaustively instead of silently truncated. A page is the
    last one when fewer than ``_SPEND_PAGE_SIZE`` rows come back.
    """
    total = 0.0
    for table in ("llm_usage_events", "external_api_usage_events"):
        offset = 0
        while True:
            try:
                resp = (
                    supabase.table(table)
                    .select("estimated_cost_usd")
                    .gte("created_at", start.isoformat())
                    .lt("created_at", end.isoformat())
                    .range(offset, offset + _SPEND_PAGE_SIZE - 1)
                    .execute()
                )
            except Exception as exc:
                logger.warning(
                    "cost_guardrail: %s sum failed at offset %d: %s — partial total %.2f",
                    table,
                    offset,
                    exc,
                    total,
                )
                break
            rows = resp.data or []
            for row in rows:
                cost = row.get("estimated_cost_usd")
                if cost is None:
                    continue
                try:
                    total += float(cost)
                except (TypeError, ValueError):
                    pass
            if len(rows) < _SPEND_PAGE_SIZE:
                break
            offset += _SPEND_PAGE_SIZE
    return total


def _fetch_state_sync(now: datetime) -> BudgetState:
    """Single sync round-trip: settings + state row + spend sum."""
    settings_resp = (
        supabase.table("admin_settings")
        .select("key,value")
        .in_(
            "key",
            [COST_BUDGET_KEY, COST_WINDOW_KEY, COST_ALERT_KEY, COST_ENABLED_KEY],
        )
        .execute()
    )
    rows = settings_resp.data or []
    enabled = _coerce_bool(_read_setting(rows, COST_ENABLED_KEY))
    cap = _coerce_number(_read_setting(rows, COST_BUDGET_KEY))
    alert = _coerce_number(_read_setting(rows, COST_ALERT_KEY))
    window_raw = _coerce_number(_read_setting(rows, COST_WINDOW_KEY))
    window_days = (
        int(window_raw) if window_raw and window_raw > 0 else _DEFAULT_WINDOW_DAYS
    )

    try:
        state_resp = (
            supabase.table("cost_guardrail_state")
            .select("reset_after,last_alert_at,last_tripped_at")
            .eq("id", 1)
            .execute()
        )
        state_row = (state_resp.data or [{}])[0]
    except Exception as exc:
        logger.warning("cost_guardrail: state fetch failed: %s", exc)
        state_row = {}
    reset_after = state_row.get("reset_after")
    last_alert_at = state_row.get("last_alert_at")
    last_tripped_at = state_row.get("last_tripped_at")

    window_start_dt = now - timedelta(days=window_days)
    effective_start_dt = window_start_dt
    reset_after_dt = _parse_iso(reset_after)
    if reset_after_dt and reset_after_dt > window_start_dt:
        effective_start_dt = reset_after_dt

    # Skip the spend query when no cap or alert is configured — saves a round
    # trip on the hot path for installs that haven't enabled the guardrail.
    spent = 0.0
    if enabled and (cap is not None or alert is not None):
        spent = _sum_spend(effective_start_dt, now)

    tripped = enabled and cap is not None and spent >= cap
    alerting = enabled and alert is not None and spent >= alert

    return BudgetState(
        enabled=enabled,
        spent_usd=round(spent, 6),
        cap_usd=cap,
        alert_usd=alert,
        window_days=window_days,
        window_start=effective_start_dt.isoformat(),
        reset_after=reset_after,
        tripped=tripped,
        alerting=alerting,
        last_alert_at=last_alert_at,
        last_tripped_at=last_tripped_at,
    )


def invalidate_cache() -> None:
    """Force the next ``get_budget_state`` call to re-fetch."""
    _cache["value"] = None
    _cache["expires"] = 0.0


async def get_budget_state(force: bool = False) -> BudgetState:
    """Return the current budget state, with ~30 s caching.

    ``force=True`` bypasses the cache (used after admins save a setting
    or reset the guardrail).
    """
    if not force and _cache["value"] is not None and time.monotonic() < _cache["expires"]:
        return _cache["value"]
    async with _cache_lock:
        if not force and _cache["value"] is not None and time.monotonic() < _cache["expires"]:
            return _cache["value"]
        state = await asyncio.to_thread(_fetch_state_sync, datetime.now(timezone.utc))
        _cache["value"] = state
        _cache["expires"] = time.monotonic() + _CACHE_TTL_SEC
        return state


async def _record_alert_once(state: BudgetState) -> None:
    """Write a single ``cost.alert`` audit row per rolling window."""
    last_alert_dt = _parse_iso(state.last_alert_at)
    window_start_dt = _parse_iso(state.window_start)
    if last_alert_dt and window_start_dt and last_alert_dt >= window_start_dt:
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    def _persist() -> None:
        try:
            supabase.table("admin_audit_log").insert(
                {
                    "actor_id": None,
                    "actor_email": "system",
                    "action": "cost.alert",
                    "target_type": "cost_guardrail",
                    "target_id": "rolling_window",
                    "before": None,
                    "after": {
                        "spent_usd": state.spent_usd,
                        "alert_usd": state.alert_usd,
                        "cap_usd": state.cap_usd,
                        "window_days": state.window_days,
                    },
                }
            ).execute()
            supabase.table("cost_guardrail_state").update(
                {"last_alert_at": now_iso}
            ).eq("id", 1).execute()
        except Exception:
            logger.exception("cost_guardrail: failed to record alert")

    await asyncio.to_thread(_persist)
    invalidate_cache()


async def _record_trip(state: BudgetState) -> None:
    """Stamp ``last_tripped_at`` once per window for the UI badge."""
    last_tripped_dt = _parse_iso(state.last_tripped_at)
    window_start_dt = _parse_iso(state.window_start)
    if last_tripped_dt and window_start_dt and last_tripped_dt >= window_start_dt:
        return

    now_iso = datetime.now(timezone.utc).isoformat()

    def _persist() -> None:
        try:
            supabase.table("admin_audit_log").insert(
                {
                    "actor_id": None,
                    "actor_email": "system",
                    "action": "cost.trip",
                    "target_type": "cost_guardrail",
                    "target_id": "rolling_window",
                    "before": None,
                    "after": {
                        "spent_usd": state.spent_usd,
                        "cap_usd": state.cap_usd,
                        "window_days": state.window_days,
                    },
                }
            ).execute()
            supabase.table("cost_guardrail_state").update(
                {"last_tripped_at": now_iso}
            ).eq("id", 1).execute()
        except Exception:
            logger.exception("cost_guardrail: failed to record trip")

    await asyncio.to_thread(_persist)
    invalidate_cache()


async def check_budget_or_raise() -> BudgetState:
    """For HTTP handlers. Raises ``HTTPException(503)`` when the hard cap is tripped.

    Also writes a single soft-alert audit row when the alert threshold
    is crossed. Returns the state otherwise.
    """
    state = await get_budget_state()
    if state.tripped:
        await _record_trip(state)
        cap_text = (
            f"${state.cap_usd:.2f}" if state.cap_usd is not None else "configured cap"
        )
        raise HTTPException(
            status_code=503,
            detail=(
                f"Cost guardrail tripped: ${state.spent_usd:.2f} spent in the "
                f"past {state.window_days} day(s) (cap {cap_text}). "
                "Contact an administrator to raise the cap or reset the guardrail."
            ),
        )
    if state.alerting:
        await _record_alert_once(state)
    return state


async def check_budget_or_skip() -> BudgetState:
    """For non-HTTP paths (worker, signal_agent). Raises ``BudgetExceededError`` on trip."""
    state = await get_budget_state()
    if state.tripped:
        await _record_trip(state)
        raise BudgetExceededError(state)
    if state.alerting:
        await _record_alert_once(state)
    return state


async def reset_guardrail(actor: dict[str, Any]) -> BudgetState:
    """Mark the guardrail reset by stamping ``reset_after = now()``.

    Spend events before this timestamp are excluded from the rolling
    window, so a tripped guardrail clears without raising the cap.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    def _save() -> None:
        supabase.table("cost_guardrail_state").update(
            {
                "reset_after": now_iso,
                "last_tripped_at": None,
                "last_alert_at": None,
                "updated_by": actor.get("id"),
                "updated_at": now_iso,
            }
        ).eq("id", 1).execute()

    await asyncio.to_thread(_save)
    invalidate_cache()
    return await get_budget_state(force=True)
