"""CSV export helpers for intelligence cards.

Single-card, multi-card, and empty-header CSV generators. All three share the
``CSV_COLUMNS`` schema so the column order stays in lockstep — previously the
list was duplicated in three places in ``export_service.py``.
"""

import logging
from typing import List

import pandas as pd

from ..models.export import CardExportData

logger = logging.getLogger(__name__)


CSV_COLUMNS = (
    "id",
    "name",
    "summary",
    "description",
    "pillar_id",
    "goal_id",
    "stage_id",
    "horizon",
    "novelty_score",
    "maturity_score",
    "impact_score",
    "relevance_score",
    "velocity_score",
    "risk_score",
    "opportunity_score",
)


def _card_to_row(card_data: CardExportData) -> dict:
    """Build a single CSV row from a card. Empty string for missing text fields."""
    return {
        "id": card_data.id,
        "name": card_data.name,
        "summary": card_data.summary or "",
        "description": card_data.description or "",
        "pillar_id": card_data.pillar_id or "",
        "goal_id": card_data.goal_id or "",
        "stage_id": card_data.stage_id or "",
        "horizon": card_data.horizon or "",
        "novelty_score": card_data.novelty_score,
        "maturity_score": card_data.maturity_score,
        "impact_score": card_data.impact_score,
        "relevance_score": card_data.relevance_score,
        "velocity_score": card_data.velocity_score,
        "risk_score": card_data.risk_score,
        "opportunity_score": card_data.opportunity_score,
    }


async def generate_csv(card_data: CardExportData) -> str:
    """Generate a single-card CSV string.

    Raises ``ValueError`` on failure (callers expect this in the existing API).
    """
    try:
        df = pd.DataFrame([_card_to_row(card_data)], columns=list(CSV_COLUMNS))
        csv_content = df.to_csv(index=False)
        logger.info(
            f"Generated CSV export for card {card_data.id}: {card_data.name}"
        )
        return csv_content
    except Exception as e:
        logger.error(f"Error generating CSV for card {card_data.id}: {e}")
        raise ValueError(f"Failed to generate CSV export: {e}") from e


async def generate_csv_multi(cards: List[CardExportData]) -> str:
    """Generate a multi-card CSV string. Empty list produces a header-only CSV."""
    if not cards:
        logger.warning("No cards provided for CSV export")
        return generate_empty_csv()

    try:
        rows = [_card_to_row(card) for card in cards]
        df = pd.DataFrame(rows, columns=list(CSV_COLUMNS))
        csv_content = df.to_csv(index=False)
        logger.info(f"Generated CSV export for {len(cards)} cards")
        return csv_content
    except Exception as e:
        logger.error(f"Error generating multi-card CSV: {e}")
        raise ValueError(f"Failed to generate CSV export: {e}") from e


def generate_empty_csv() -> str:
    """Return a CSV containing only the header row."""
    df = pd.DataFrame(columns=list(CSV_COLUMNS))
    return df.to_csv(index=False)
