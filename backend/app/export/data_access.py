"""Supabase fetch helpers used by export generators.

These wrap the small handful of card / workstream queries needed to feed PDF,
PPTX, and CSV exports. They were originally methods on ExportService; they
need only the supabase client, not the service instance.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

from supabase import Client

from ..models.export import CardExportData

logger = logging.getLogger(__name__)


async def get_card_data(
    supabase: Client, card_id: str
) -> Optional[CardExportData]:
    """Fetch one card by UUID. Returns None if missing or on error."""
    try:
        response = (
            supabase.table("cards")
            .select("*")
            .eq("id", card_id)
            .single()
            .execute()
        )
        return CardExportData(**response.data) if response.data else None
    except Exception as e:
        logger.error(f"Error fetching card {card_id}: {e}")
        return None


async def get_workstream_cards(
    supabase: Client, workstream_id: str, max_cards: int = 50
) -> Tuple[Optional[Dict[str, Any]], List[CardExportData]]:
    """Fetch workstream metadata + its cards (via the workstream_cards junction).

    Returns ``(None, [])`` if the workstream doesn't exist or on error.
    """
    try:
        ws_response = (
            supabase.table("workstreams")
            .select("*")
            .eq("id", workstream_id)
            .single()
            .execute()
        )

        if not ws_response.data:
            return None, []

        workstream = ws_response.data

        cards_response = (
            supabase.table("workstream_cards")
            .select("card_id, cards(*)")
            .eq("workstream_id", workstream_id)
            .limit(max_cards)
            .execute()
        )

        cards: List[CardExportData] = []
        if cards_response.data:
            cards.extend(
                CardExportData(**item["cards"])
                for item in cards_response.data
                if item.get("cards")
            )
        return workstream, cards

    except Exception as e:
        logger.error(f"Error fetching workstream {workstream_id}: {e}")
        return None, []
