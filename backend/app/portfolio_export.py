"""Shared portfolio export pipeline.

The pipeline takes an ordered list of card ids plus a deck title and produces
a FileResponse (PDF or PPTX). Two callers share it:

* ``POST /me/workstreams/{id}/bulk-brief-export`` (legacy, kanban-Brief-column)
* ``POST /me/portfolios/{id}/export`` (named/saved portfolios)

Brief lookup is scoped to a single workstream when ``workstream_id`` is
provided (Phase 1, the common case). When ``workstream_id`` is None the
lookup spans every workstream the card has ever belonged to and picks the
most recent completed brief (Phase 2, cross-workstream portfolios).
"""

from __future__ import annotations

import logging
import tempfile
from typing import List, Optional, Tuple

from fastapi import HTTPException
from fastapi.responses import FileResponse

from app.deps import supabase, openai_client

logger = logging.getLogger(__name__)

PORTFOLIO_MAX_CARDS = 15


def _safe_filename_segment(value: str, *, limit: int = 40) -> str:
    cleaned = "".join(c if c.isalnum() or c in " -_" else "_" for c in value)
    return cleaned[:limit] or "Portfolio"


async def _resolve_workstream_card_for_brief(
    card_id: str, scoped_workstream_id: Optional[str]
) -> Optional[str]:
    """Return the ``workstream_cards.id`` whose brief should be used for this card.

    Scoped lookup: limited to ``scoped_workstream_id``.
    Cross-workstream lookup: picks the most recently updated workstream_cards
    row for the card, regardless of which workstream owns it.
    """
    query = (
        supabase.table("workstream_cards")
        .select("id, workstream_id, updated_at")
        .eq("card_id", card_id)
    )
    if scoped_workstream_id is not None:
        query = query.eq("workstream_id", scoped_workstream_id)
    else:
        query = query.order("updated_at", desc=True)

    res = query.limit(1).execute()
    if not res.data:
        return None
    return res.data[0]["id"]


async def render_portfolio_export(
    *,
    card_order: List[str],
    deck_title: str,
    format: str,
    workstream_id: Optional[str],
) -> FileResponse:
    """Generate a portfolio brief presentation for the given cards.

    Args:
        card_order: Ordered list of ``cards.id`` values (length ≤ 15).
        deck_title: Display name used for the deck and download filename.
        format: ``"pdf"`` or ``"pptx"``.
        workstream_id: When set, briefs are read from that workstream only.
            When ``None``, briefs are pulled from any workstream the card
            belongs to (Phase 2 cross-workstream).
    """
    from app.brief_service import ExecutiveBriefService, PortfolioBrief
    from app.export_service import ExportService
    from app.gamma_service import (
        GammaPortfolioService,
        PortfolioCard,
        PortfolioSynthesisData,
    )

    fmt = format.lower()
    if fmt not in ("pdf", "pptx"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format: {format}. Supported: pdf, pptx",
        )
    if not card_order:
        raise HTTPException(status_code=400, detail="No cards provided for export")
    if len(card_order) > PORTFOLIO_MAX_CARDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Maximum {PORTFOLIO_MAX_CARDS} cards per portfolio. "
                "Split into separate portfolios if you need more."
            ),
        )

    brief_service = ExecutiveBriefService(supabase, openai_client)
    portfolio_briefs: List[PortfolioBrief] = []
    skipped: List[str] = []

    for card_id in card_order:
        ws_card_id = await _resolve_workstream_card_for_brief(card_id, workstream_id)
        if not ws_card_id:
            skipped.append(card_id)
            continue

        brief = await brief_service.get_latest_completed_brief(ws_card_id)
        if not brief:
            skipped.append(card_id)
            continue

        card_res = (
            supabase.table("cards")
            .select(
                "id, name, pillar_id, horizon, stage_id, "
                "impact_score, relevance_score, velocity_score"
            )
            .eq("id", card_id)
            .execute()
        )
        if not card_res.data:
            skipped.append(card_id)
            continue
        card = card_res.data[0]

        portfolio_briefs.append(
            PortfolioBrief(
                card_id=card_id,
                card_name=card.get("name", "Unknown"),
                pillar_id=card.get("pillar_id", ""),
                horizon=card.get("horizon", ""),
                stage_id=card.get("stage_id", ""),
                brief_summary=brief.get("summary", ""),
                brief_content_markdown=brief.get("content_markdown", ""),
                impact_score=card.get("impact_score", 50),
                relevance_score=card.get("relevance_score", 50),
                velocity_score=card.get("velocity_score", 50),
            )
        )

    if not portfolio_briefs:
        raise HTTPException(
            status_code=400,
            detail=(
                "No completed briefs found for the specified cards. "
                "Generate briefs first."
            ),
        )

    if skipped:
        logger.warning(
            "Portfolio export skipped %d cards without completed briefs", len(skipped)
        )

    try:
        synthesis = await brief_service.synthesize_portfolio(
            briefs=portfolio_briefs, workstream_name=deck_title
        )

        synthesis_data = PortfolioSynthesisData(
            executive_overview=synthesis.executive_overview,
            key_themes=synthesis.key_themes,
            priority_matrix=synthesis.priority_matrix,
            cross_cutting_insights=synthesis.cross_cutting_insights,
            recommended_actions=synthesis.recommended_actions,
            urgency_statement=synthesis.urgency_statement,
            implementation_guidance=synthesis.implementation_guidance,
            ninety_day_actions=synthesis.ninety_day_actions,
            risk_summary=synthesis.risk_summary,
            opportunity_summary=synthesis.opportunity_summary,
        )

        safe_name = _safe_filename_segment(deck_title)

        if fmt == "pptx":
            gamma = GammaPortfolioService()
            if gamma.is_available():
                gamma_cards = [
                    PortfolioCard(
                        card_id=b.card_id,
                        card_name=b.card_name,
                        pillar_id=b.pillar_id,
                        horizon=b.horizon,
                        stage_id=b.stage_id,
                        brief_summary=b.brief_summary,
                        brief_content=b.brief_content_markdown[:1500],
                        impact_score=b.impact_score,
                        relevance_score=b.relevance_score,
                    )
                    for b in portfolio_briefs
                ]
                result = await gamma.generate_portfolio_presentation(
                    workstream_name=deck_title,
                    cards=gamma_cards,
                    synthesis=synthesis_data,
                    include_images=True,
                    export_format="pptx",
                )
                if result.success and result.pptx_url:
                    from app.gamma_service import GammaService

                    pptx_bytes = await GammaService().download_export(result.pptx_url)
                    if pptx_bytes:
                        tmp = tempfile.NamedTemporaryFile(
                            suffix=".pptx",
                            delete=False,
                            prefix="foresight_portfolio_",
                        )
                        tmp.write(pptx_bytes)
                        tmp.close()
                        return FileResponse(
                            path=tmp.name,
                            filename=f"Portfolio_{safe_name}.pptx",
                            media_type=(
                                "application/vnd.openxmlformats-officedocument."
                                "presentationml.presentation"
                            ),
                        )
                logger.warning(
                    "Gamma portfolio failed (%s); falling back to local generator",
                    getattr(result, "error_message", "unknown"),
                )

            export_service = ExportService(supabase)
            file_path = await export_service.generate_portfolio_pptx_local(
                workstream_name=deck_title,
                briefs=portfolio_briefs,
                synthesis=synthesis_data,
            )
            return FileResponse(
                path=file_path,
                filename=f"Portfolio_{safe_name}.pptx",
                media_type=(
                    "application/vnd.openxmlformats-officedocument."
                    "presentationml.presentation"
                ),
            )

        # PDF
        export_service = ExportService(supabase)
        file_path = await export_service.generate_portfolio_pdf(
            workstream_name=deck_title,
            briefs=portfolio_briefs,
            synthesis=synthesis_data,
        )
        return FileResponse(
            path=file_path,
            filename=f"Portfolio_{safe_name}.pdf",
            media_type="application/pdf",
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Portfolio export failed: %s", exc)
        raise HTTPException(
            status_code=500, detail=f"portfolio generation failed: {type(exc).__name__}"
        ) from exc
