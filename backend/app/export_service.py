"""Export Service facade.

Thin facade over the ``app.export`` package. The export pipelines (single-card,
workstream, brief, portfolio) all live as module-level functions under
``app.export.*``; this module preserves the historical ``ExportService`` class
shape so existing routers (`card_export`, `briefs`, `chat`, `portfolio_export`)
continue to import and instantiate ``ExportService`` unchanged.

When you need to modify export behavior, edit the relevant submodule
(`app.export.cards`, `app.export.workstreams`, `app.export.briefs`,
`app.export.portfolios`, `app.export.charts`, `app.export.csv_export`,
`app.export.pptx`, `app.export.data_access`, `app.export.utils`) — not this
file. For shared portfolio export flow changes, also keep
`portfolio_export.py` aligned: it is the shared pipeline used by both
`/bulk-brief-export` and `/portfolios/{id}/export`. The methods here should
remain one-line delegations.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from pptx import Presentation
from pptx.dml.color import RGBColor
from supabase import Client

from .export import briefs as _briefs
from .export import cards as _cards
from .export import charts as _charts
from .export import csv_export as _csv_export
from .export import data_access as _data_access
from .export import portfolios as _portfolios
from .export import pptx as _pptx_components
from .export import utils as _utils
from .export import workstreams as _workstreams
from .export.charts import CHART_DPI
from .models.export import CardExportData, ExportFormat

logger = logging.getLogger(__name__)


class ExportService:
    """Facade over the modular export pipeline.

    Every method here is a one-line delegation to a function in
    ``app.export.*``. Keep it that way — implementations belong in the
    submodules.
    """

    def __init__(self, supabase: Client):
        self.supabase = supabase
        logger.info("ExportService initialized")

    # ========================================================================
    # Chart Generation
    # ========================================================================

    def generate_score_chart(
        self, card_data: CardExportData, chart_type: str = "bar", dpi: int = CHART_DPI
    ) -> Optional[str]:
        return _charts.generate_score_chart(card_data, chart_type, dpi)

    def _generate_bar_chart(
        self, scores: Dict[str, int], title: str, dpi: int
    ) -> str:
        return _charts.generate_bar_chart(scores, title, dpi)

    def _generate_radar_chart(
        self, scores: Dict[str, int], title: str, dpi: int
    ) -> str:
        return _charts.generate_radar_chart(scores, title, dpi)

    def generate_pillar_distribution_chart(
        self,
        pillar_counts: Dict[str, int],
        title: str = "Pillar Distribution",
        dpi: int = CHART_DPI,
    ) -> Optional[str]:
        return _charts.generate_pillar_distribution_chart(pillar_counts, title, dpi)

    def generate_horizon_distribution_chart(
        self,
        horizon_counts: Dict[str, int],
        title: str = "Horizon Distribution",
        dpi: int = CHART_DPI,
    ) -> Optional[str]:
        return _charts.generate_horizon_distribution_chart(horizon_counts, title, dpi)

    # ========================================================================
    # PDF Generation
    # ========================================================================

    async def generate_pdf(
        self, card_data: CardExportData, include_charts: bool = True
    ) -> str:
        return await _cards.generate_card_pdf(card_data, include_charts)

    async def generate_workstream_pdf(
        self, workstream_id: str, include_charts: bool = True, max_cards: int = 50
    ) -> str:
        return await _workstreams.generate_workstream_pdf(
            self.supabase, workstream_id, include_charts, max_cards
        )

    # ========================================================================
    # Utilities + Data Access
    # ========================================================================

    def cleanup_temp_files(self, file_paths: List[str]) -> None:
        _utils.cleanup_temp_files(file_paths)

    async def get_card_data(self, card_id: str) -> Optional[CardExportData]:
        return await _data_access.get_card_data(self.supabase, card_id)

    async def get_workstream_cards(
        self, workstream_id: str, max_cards: int = 50
    ) -> Tuple[Optional[Dict[str, Any]], List[CardExportData]]:
        return await _data_access.get_workstream_cards(
            self.supabase, workstream_id, max_cards
        )

    def format_score_display(self, score: Optional[int]) -> str:
        return _utils.format_score_display(score)

    def get_content_type(self, format: ExportFormat) -> str:
        return _utils.get_content_type(format)

    def generate_filename(self, name: str, format: ExportFormat) -> str:
        return _utils.generate_filename(name, format)

    # ========================================================================
    # CSV
    # ========================================================================

    async def generate_csv(self, card_data: CardExportData) -> str:
        return await _csv_export.generate_csv(card_data)

    async def generate_csv_multi(self, cards: List[CardExportData]) -> str:
        return await _csv_export.generate_csv_multi(cards)

    def _generate_empty_csv(self) -> str:
        return _csv_export.generate_empty_csv()

    # ========================================================================
    # PowerPoint
    # ========================================================================

    def _hex_to_rgb(self, hex_color: str) -> RGBColor:
        return _pptx_components.hex_to_rgb(hex_color)

    def _add_pptx_header(self, slide, include_logo: bool = True) -> None:
        _pptx_components.add_pptx_header(slide, include_logo)

    def _add_pptx_footer(self, slide, include_ai_disclosure: bool = True) -> None:
        _pptx_components.add_pptx_footer(slide, include_ai_disclosure)

    def _add_title_slide(
        self, prs: Presentation, title: str, subtitle: Optional[str] = None
    ) -> None:
        _pptx_components.add_title_slide(prs, title, subtitle)

    def _add_content_slide(
        self,
        prs: Presentation,
        title: str,
        content_items: List[Tuple[str, str]],
        chart_path: Optional[str] = None,
    ) -> None:
        _pptx_components.add_content_slide(prs, title, content_items, chart_path)

    def _add_scores_slide(
        self,
        prs: Presentation,
        card_data: CardExportData,
        chart_path: Optional[str] = None,
    ) -> None:
        _pptx_components.add_scores_slide(prs, card_data, chart_path)

    def _add_description_slide(
        self, prs: Presentation, title: str, description: Optional[str]
    ) -> None:
        _pptx_components.add_description_slide(prs, title, description)

    async def generate_pptx(
        self,
        card_data: CardExportData,
        include_charts: bool = True,
        include_description: bool = True,
    ) -> str:
        return await _cards.generate_card_pptx(
            card_data, include_charts, include_description
        )

    async def generate_workstream_pptx(
        self,
        workstream: Dict[str, Any],
        cards: List[CardExportData],
        include_charts: bool = True,
        include_card_details: bool = True,
    ) -> str:
        return await _workstreams.generate_workstream_pptx(
            workstream, cards, include_charts, include_card_details
        )

    # ========================================================================
    # Executive Briefs
    # ========================================================================

    async def generate_brief_pdf(
        self,
        brief_title: str,
        card_name: str,
        executive_summary: str,
        content_markdown: str,
        generated_at: Optional[datetime] = None,
        version: Optional[int] = None,
    ) -> str:
        return await _briefs.generate_brief_pdf(
            brief_title=brief_title,
            card_name=card_name,
            executive_summary=executive_summary,
            content_markdown=content_markdown,
            generated_at=generated_at,
            version=version,
        )

    async def generate_professional_brief_pdf(
        self,
        brief_title: str,
        card_name: str,
        executive_summary: str,
        content_markdown: str,
        generated_at: Optional[datetime] = None,
        version: Optional[int] = None,
        classification: Optional[Dict[str, str]] = None,
    ) -> str:
        return await _briefs.generate_professional_brief_pdf(
            brief_title=brief_title,
            card_name=card_name,
            executive_summary=executive_summary,
            content_markdown=content_markdown,
            generated_at=generated_at,
            version=version,
            classification=classification,
        )

    async def generate_chat_response_pdf(
        self,
        title: str,
        question: str,
        response_content: str,
        citations: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        scope: Optional[str] = None,
        scope_context: Optional[str] = None,
    ) -> str:
        return await _briefs.generate_chat_response_pdf(
            title=title,
            question=question,
            response_content=response_content,
            citations=citations,
            metadata=metadata,
            scope=scope,
            scope_context=scope_context,
        )

    async def generate_brief_pptx(
        self,
        brief_title: str,
        card_name: str,
        executive_summary: str,
        content_markdown: str,
        generated_at: Optional[datetime] = None,
        version: Optional[int] = None,
        classification: Optional[Dict[str, str]] = None,
        use_gamma: bool = True,
    ) -> str:
        return await _briefs.generate_brief_pptx(
            brief_title=brief_title,
            card_name=card_name,
            executive_summary=executive_summary,
            content_markdown=content_markdown,
            generated_at=generated_at,
            version=version,
            classification=classification,
            use_gamma=use_gamma,
        )

    # ========================================================================
    # Portfolio
    # ========================================================================

    def _extract_key_takeaways(self, brief_markdown: str) -> List[str]:
        return _portfolios.extract_key_takeaways(brief_markdown)

    def _extract_city_examples(self, brief_markdown: str) -> List[Dict[str, str]]:
        return _portfolios.extract_city_examples(brief_markdown)

    def _generate_portfolio_comparison_chart(
        self, briefs: List, dpi: int = CHART_DPI  # List of PortfolioBrief
    ) -> Optional[str]:
        return _portfolios.generate_portfolio_comparison_chart(briefs, dpi)

    def _generate_priority_matrix_chart(
        self,
        briefs: List,  # List of PortfolioBrief
        synthesis,  # PortfolioSynthesisData
        dpi: int = CHART_DPI,
    ) -> Optional[str]:
        return _portfolios.generate_priority_matrix_chart(briefs, synthesis, dpi)

    def _add_portfolio_dashboard_slide(
        self,
        prs: Presentation,
        briefs: List,  # List of PortfolioBrief
        comparison_chart_path: Optional[str],
        pillar_chart_path: Optional[str],
    ) -> None:
        _portfolios.add_portfolio_dashboard_slide(
            prs, briefs, comparison_chart_path, pillar_chart_path
        )

    def _add_card_deep_dive_slides(
        self,
        prs: Presentation,
        brief,  # PortfolioBrief
        index: int,
        chart_path: Optional[str] = None,
    ) -> None:
        _portfolios.add_card_deep_dive_slides(prs, brief, index, chart_path)

    async def generate_portfolio_pptx_local(
        self,
        workstream_name: str,
        briefs: List,  # List of PortfolioBrief
        synthesis,  # PortfolioSynthesisData
    ) -> str:
        return await _portfolios.generate_portfolio_pptx_local(
            workstream_name, briefs, synthesis
        )

    async def generate_portfolio_pdf(
        self,
        workstream_name: str,
        briefs: List,  # List of PortfolioBrief
        synthesis,  # PortfolioSynthesisData
    ) -> str:
        return await _portfolios.generate_portfolio_pdf(
            workstream_name, briefs, synthesis
        )
