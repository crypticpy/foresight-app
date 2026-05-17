"""Portfolios router — saved card collections used to drive presentation export.

A portfolio is a curated, ordered set of cards (≤15) plus a name and optional
description. Phase 1 portfolios are scoped to a workstream; Phase 2 portfolios
have ``workstream_id = NULL`` and pull briefs from any workstream the card
belongs to.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.deps import supabase, get_current_user
from app.models.portfolio import (
    PORTFOLIO_MAX_ITEMS,
    AddItemsRequest,
    Portfolio,
    PortfolioCreate,
    PortfolioExportRequest,
    PortfolioItem,
    PortfolioItemCardSnapshot,
    PortfolioUpdate,
    PortfolioWithItems,
    ReorderItemsRequest,
)
from app.portfolio_export import render_portfolio_export

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["portfolios"])


def _row_to_portfolio(row: dict, item_count: int = 0) -> Portfolio:
    return Portfolio(
        id=row["id"],
        name=row["name"],
        description=row.get("description"),
        user_id=row["user_id"],
        workstream_id=row.get("workstream_id"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        last_exported_at=row.get("last_exported_at"),
        item_count=item_count,
    )


def _row_to_item(
    row: dict,
    card_lookup: Optional[dict[str, dict]] = None,
) -> PortfolioItem:
    card_snapshot = None
    if card_lookup is not None:
        card = card_lookup.get(row["card_id"])
        if card:
            card_snapshot = PortfolioItemCardSnapshot(
                id=card["id"],
                name=card.get("name") or "Untitled",
                slug=card.get("slug"),
                pillar_id=card.get("pillar_id"),
                horizon=card.get("horizon"),
                stage_id=card.get("stage_id"),
            )
    return PortfolioItem(
        id=row["id"],
        portfolio_id=row["portfolio_id"],
        card_id=row["card_id"],
        position=row.get("position", 0),
        notes=row.get("notes"),
        added_at=row["added_at"],
        card=card_snapshot,
    )


async def _fetch_card_snapshots(card_ids: List[str]) -> dict[str, dict]:
    """Batch-fetch lightweight card data for items rendering."""
    if not card_ids:
        return {}
    res = await asyncio.to_thread(
        lambda: supabase.table("cards")
        .select("id, name, slug, pillar_id, horizon, stage_id")
        .in_("id", card_ids)
        .execute()
    )
    return {row["id"]: row for row in (res.data or [])}


async def _fetch_portfolio_or_404(portfolio_id: str, user_id: str) -> dict:
    """Return the row, raising 404 if missing or not owned by ``user_id``."""
    res = await asyncio.to_thread(
        lambda: supabase.table("portfolios")
        .select("*")
        .eq("id", portfolio_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    row = res.data[0]
    if row["user_id"] != user_id:
        # Don't leak existence to non-owners.
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return row


async def _verify_workstream_visible(workstream_id: str, user_id: str) -> dict:
    """Same visibility rule as ``get_workstream_cards``: own or org-owned."""
    res = await asyncio.to_thread(
        lambda: supabase.table("workstreams")
        .select("id, user_id, owner_type, name")
        .eq("id", workstream_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Workstream not found")
    ws = res.data[0]
    if ws.get("owner_type") != "org" and ws.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Workstream not found")
    return ws


async def _count_items(portfolio_id: str) -> int:
    res = await asyncio.to_thread(
        lambda: supabase.table("portfolio_items")
        .select("id", count="exact")
        .eq("portfolio_id", portfolio_id)
        .execute()
    )
    return res.count or 0


async def _list_items(portfolio_id: str) -> List[PortfolioItem]:
    res = await asyncio.to_thread(
        lambda: supabase.table("portfolio_items")
        .select("*")
        .eq("portfolio_id", portfolio_id)
        .order("position", desc=False)
        .order("added_at", desc=False)
        .execute()
    )
    rows = res.data or []
    card_lookup = await _fetch_card_snapshots([r["card_id"] for r in rows])
    return [_row_to_item(r, card_lookup) for r in rows]


# ---------------------------------------------------------------------------
# List / Create / Read / Update / Delete
# ---------------------------------------------------------------------------


@router.get("/me/portfolios", response_model=List[Portfolio])
async def list_portfolios(
    workstream_id: Optional[str] = Query(
        None, description="Filter to portfolios scoped to this workstream"
    ),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    query = (
        supabase.table("portfolios")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
    )
    if workstream_id is not None:
        query = query.eq("workstream_id", workstream_id)

    res = await asyncio.to_thread(query.execute)
    rows = res.data or []
    if not rows:
        return []

    counts_res = await asyncio.to_thread(
        lambda: supabase.table("portfolio_items")
        .select("portfolio_id")
        .in_("portfolio_id", [r["id"] for r in rows])
        .execute()
    )
    counts: dict[str, int] = {}
    for r in counts_res.data or []:
        counts[r["portfolio_id"]] = counts.get(r["portfolio_id"], 0) + 1

    return [_row_to_portfolio(r, item_count=counts.get(r["id"], 0)) for r in rows]


@router.post("/me/portfolios", response_model=PortfolioWithItems, status_code=201)
async def create_portfolio(
    payload: PortfolioCreate, current_user: dict = Depends(get_current_user)
):
    user_id = current_user["id"]

    if payload.workstream_id:
        await _verify_workstream_visible(payload.workstream_id, user_id)

    initial_card_ids = list(dict.fromkeys(payload.card_ids or []))  # dedupe, preserve order
    if len(initial_card_ids) > PORTFOLIO_MAX_ITEMS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum {PORTFOLIO_MAX_ITEMS} cards per portfolio.",
        )

    insert_res = await asyncio.to_thread(
        lambda: supabase.table("portfolios")
        .insert(
            {
                "name": payload.name.strip(),
                "description": (payload.description or "").strip() or None,
                "user_id": user_id,
                "workstream_id": payload.workstream_id,
            }
        )
        .execute()
    )
    if not insert_res.data:
        raise HTTPException(status_code=500, detail="Failed to create portfolio")
    row = insert_res.data[0]

    items: List[PortfolioItem] = []
    if initial_card_ids:
        items = await _add_items_to_portfolio(row["id"], initial_card_ids)

    return PortfolioWithItems(
        **_row_to_portfolio(row, item_count=len(items)).model_dump(),
        items=items,
    )


@router.get("/me/portfolios/{portfolio_id}", response_model=PortfolioWithItems)
async def get_portfolio(
    portfolio_id: str, current_user: dict = Depends(get_current_user)
):
    row = await _fetch_portfolio_or_404(portfolio_id, current_user["id"])
    items = await _list_items(portfolio_id)
    return PortfolioWithItems(
        **_row_to_portfolio(row, item_count=len(items)).model_dump(),
        items=items,
    )


@router.patch("/me/portfolios/{portfolio_id}", response_model=Portfolio)
async def update_portfolio(
    portfolio_id: str,
    payload: PortfolioUpdate,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["id"]
    await _fetch_portfolio_or_404(portfolio_id, user_id)

    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.description is not None:
        updates["description"] = payload.description.strip() or None
    if payload.workstream_id is not None:
        # Allow explicit unscope by passing an empty string from the client.
        if payload.workstream_id == "":
            updates["workstream_id"] = None
        else:
            await _verify_workstream_visible(payload.workstream_id, user_id)
            updates["workstream_id"] = payload.workstream_id

    if not updates:
        raise HTTPException(status_code=400, detail="No updatable fields provided")

    res = await asyncio.to_thread(
        lambda: supabase.table("portfolios")
        .update(updates)
        .eq("id", portfolio_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Update failed")
    return _row_to_portfolio(res.data[0], item_count=await _count_items(portfolio_id))


@router.delete("/me/portfolios/{portfolio_id}", status_code=204)
async def delete_portfolio(
    portfolio_id: str, current_user: dict = Depends(get_current_user)
):
    await _fetch_portfolio_or_404(portfolio_id, current_user["id"])
    await asyncio.to_thread(
        lambda: supabase.table("portfolios")
        .delete()
        .eq("id", portfolio_id)
        .execute()
    )
    return None


# ---------------------------------------------------------------------------
# Items: add / remove / reorder
# ---------------------------------------------------------------------------


async def _add_items_to_portfolio(
    portfolio_id: str, card_ids: List[str]
) -> List[PortfolioItem]:
    """Insert new items at the tail. Skips cards already in the portfolio.

    Caller is responsible for the cap check ahead of time so the limit error
    surfaces with a useful message.
    """
    if not card_ids:
        return await _list_items(portfolio_id)

    existing_res = await asyncio.to_thread(
        lambda: supabase.table("portfolio_items")
        .select("card_id, position")
        .eq("portfolio_id", portfolio_id)
        .execute()
    )
    existing = {r["card_id"]: r["position"] for r in (existing_res.data or [])}
    next_pos = (max(existing.values()) + 1) if existing else 0

    new_rows = []
    for card_id in card_ids:
        if card_id in existing:
            continue
        new_rows.append(
            {
                "portfolio_id": portfolio_id,
                "card_id": card_id,
                "position": next_pos,
            }
        )
        next_pos += 1

    if new_rows:
        await asyncio.to_thread(
            lambda: supabase.table("portfolio_items").insert(new_rows).execute()
        )
        # Touch the portfolio so the list view's updated_at reflects the change.
        await asyncio.to_thread(
            lambda: supabase.table("portfolios")
            .update({"updated_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", portfolio_id)
            .execute()
        )

    return await _list_items(portfolio_id)


@router.post(
    "/me/portfolios/{portfolio_id}/items", response_model=List[PortfolioItem]
)
async def add_items(
    portfolio_id: str,
    payload: AddItemsRequest,
    current_user: dict = Depends(get_current_user),
):
    await _fetch_portfolio_or_404(portfolio_id, current_user["id"])
    incoming = list(dict.fromkeys(payload.card_ids))
    current = await _count_items(portfolio_id)
    if current + len(incoming) > PORTFOLIO_MAX_ITEMS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Adding these would exceed the {PORTFOLIO_MAX_ITEMS}-card limit "
                f"(currently {current})."
            ),
        )
    return await _add_items_to_portfolio(portfolio_id, incoming)


@router.delete("/me/portfolios/{portfolio_id}/items/{card_id}", status_code=204)
async def remove_item(
    portfolio_id: str,
    card_id: str,
    current_user: dict = Depends(get_current_user),
):
    await _fetch_portfolio_or_404(portfolio_id, current_user["id"])
    await asyncio.to_thread(
        lambda: supabase.table("portfolio_items")
        .delete()
        .eq("portfolio_id", portfolio_id)
        .eq("card_id", card_id)
        .execute()
    )
    await asyncio.to_thread(
        lambda: supabase.table("portfolios")
        .update({"updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", portfolio_id)
        .execute()
    )
    return None


@router.patch(
    "/me/portfolios/{portfolio_id}/items", response_model=List[PortfolioItem]
)
async def reorder_items(
    portfolio_id: str,
    payload: ReorderItemsRequest,
    current_user: dict = Depends(get_current_user),
):
    await _fetch_portfolio_or_404(portfolio_id, current_user["id"])
    if not payload.items:
        raise HTTPException(status_code=400, detail="No reorder entries provided")

    # Apply the new positions one at a time. Supabase Python client lacks a
    # batch upsert that scopes by composite (portfolio_id, card_id), so we
    # do N updates. N ≤ 15, so this is fine.
    for entry in payload.items:
        await asyncio.to_thread(
            lambda e=entry: supabase.table("portfolio_items")
            .update({"position": e.position})
            .eq("portfolio_id", portfolio_id)
            .eq("card_id", e.card_id)
            .execute()
        )

    await asyncio.to_thread(
        lambda: supabase.table("portfolios")
        .update({"updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", portfolio_id)
        .execute()
    )

    return await _list_items(portfolio_id)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@router.post("/me/portfolios/{portfolio_id}/export")
async def export_portfolio(
    portfolio_id: str,
    payload: PortfolioExportRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a portfolio presentation (PDF/PPTX) from the saved item list."""
    user_id = current_user["id"]
    row = await _fetch_portfolio_or_404(portfolio_id, user_id)

    items = await _list_items(portfolio_id)
    if not items:
        raise HTTPException(
            status_code=400, detail="Portfolio has no cards to export."
        )

    card_order = [it.card_id for it in items]
    deck_title = row["name"] or "Strategic Portfolio"

    response = await render_portfolio_export(
        card_order=card_order,
        deck_title=deck_title,
        format=payload.format,
        workstream_id=row.get("workstream_id"),  # None ⇒ cross-workstream lookup
    )

    # Stamp last_exported_at; failure here shouldn't break the download.
    try:
        await asyncio.to_thread(
            lambda: supabase.table("portfolios")
            .update({"last_exported_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", portfolio_id)
            .execute()
        )
    except Exception as exc:
        logger.warning("Failed to stamp last_exported_at on %s: %s", portfolio_id, exc)

    return response
