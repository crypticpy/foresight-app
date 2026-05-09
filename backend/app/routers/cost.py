"""Cost guardrail HTTP surface.

Two endpoints:

- ``GET  /api/v1/admin/cost/budget`` — full ``BudgetState`` for the
  admin Usage tab (admin-only).
- ``POST /api/v1/admin/cost/reset`` — stamp ``reset_after = now()`` so a
  tripped guardrail clears without raising the cap (admin-only). Audited.
- ``GET  /api/v1/cost/status`` — minimal ``{paused: bool}`` for the
  site-wide banner; available to any authenticated user.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Request

from app import cost_guardrail
from app.authz import require_admin
from app.deps import get_current_user, limiter, supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["cost"])


@router.get("/admin/cost/budget")
@limiter.limit("60/minute")
async def get_cost_budget(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    require_admin(current_user)
    state = await cost_guardrail.get_budget_state()
    return state.to_dict()


@router.post("/admin/cost/reset")
@limiter.limit("10/minute")
async def reset_cost_guardrail(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    require_admin(current_user)
    state = await cost_guardrail.reset_guardrail(current_user)
    # Audit the action so it shows up in the audit-log tab next to setting changes.
    try:
        supabase.table("admin_audit_log").insert(
            {
                "actor_id": current_user.get("id"),
                "actor_email": current_user.get("email"),
                "action": "cost.reset",
                "target_type": "cost_guardrail",
                "target_id": "rolling_window",
                "before": None,
                "after": {"reset_after": state.reset_after},
                "request_ip": request.client.host if request.client else None,
            }
        ).execute()
    except Exception:
        logger.exception("cost: failed to write reset audit row")
    return state.to_dict()


@router.get("/cost/status")
@limiter.limit("60/minute")
async def get_cost_status(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict[str, Any]:
    """Public read for the site-wide banner. No admin requirement.

    Returns just enough for the UI to render the "research paused" banner
    without leaking spend totals or caps to non-admins.
    """
    state = await cost_guardrail.get_budget_state()
    return {
        "paused": state.tripped,
        "enabled": state.enabled,
    }
