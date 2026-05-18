"""Embedding backfill sub-router.

Endpoints
---------
* ``POST /admin/embeddings/backfill`` — admin-only trigger that
  re-embeds ``cards`` and/or ``sources`` rows against the active
  embedding model. Rate-limited to 3/min and 409s on overlapping
  launches so a double-click can't race two backfills on the same rows
  (wasted spend + last-write-wins on the column).
* ``GET /admin/embeddings/backfill/status`` — return the most recent
  run's state (``idle`` / ``running`` / ``complete`` / ``failed``)
  including per-table progress so the operator can inspect what the
  last button-press actually did without tailing logs.

This is a FastAPI sub-router with no prefix; the parent ``admin``
aggregator mounts it under the shared ``/api/v1`` prefix via
``router.include_router(...)``. Keep the prefix in exactly one place
(the aggregator) so the URL surface doesn't drift.

State is held in a module-level dict + an ``asyncio.Lock``. Both are
*per-process*; in production gunicorn spawns 4 Uvicorn workers, so the
overlap guard only catches double-clicks landing on the same worker.
A proper cross-worker lock (Postgres advisory lock or Redis) is a
follow-up — the 3/min rate limit narrows the practical window further
but is also per-worker.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.authz import require_admin
from app.deps import _safe_error, get_current_user, limiter, supabase

logger = logging.getLogger(__name__)
router = APIRouter(tags=["admin"])


# Strong refs for fire-and-forget background tasks. Without this,
# asyncio.create_task results can be GC'd before they finish — Python's
# event loop only holds weak refs.
_BACKGROUND_TASKS: set[asyncio.Task] = set()


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
