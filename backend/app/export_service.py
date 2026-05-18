"""
Export Service for Intelligence Cards and Workstream Reports.

This service handles generation of export files in multiple formats:
- PDF: Using ReportLab for professional document generation
- PowerPoint: Using python-pptx for presentation slides
- CSV: Using pandas for tabular data export

Chart Generation:
- Score radar charts showing all dimensions
- Score bar charts for individual scores
- Pillar distribution charts for workstream reports
- All charts use matplotlib with 'Agg' backend (non-GUI)

Usage:
    export_service = ExportService(supabase_client)
    pdf_path = await export_service.generate_pdf(card_data)
    pptx_path = await export_service.generate_pptx(card_data)
    csv_content = await export_service.generate_csv(card_data)
"""

import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Tuple

import matplotlib

matplotlib.use("Agg")  # Non-GUI backend - must be set before importing pyplot


# PowerPoint imports
from pptx import Presentation
from pptx.dml.color import RGBColor

# ReportLab imports for PDF generation
from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    PageBreak,
    HRFlowable,
)

from supabase import Client

from .models.export import (
    CardExportData,
    ExportFormat,
)

# Import classification definitions from gamma_service for backup slides

# Re-exported helpers (definitions live in app.export package). Imported here so
# legacy callers can continue to reach them via app.export_service.
from .export.branding import (
    PDF_COLORS,
)
from .export import briefs as _briefs
from .export import cards as _cards
from .export import charts as _charts
from .export import csv_export as _csv_export
from .export import data_access as _data_access
from .export import portfolios as _portfolios
from .export import utils as _utils
from .export import pptx as _pptx_components
from .export import workstreams as _workstreams
from .export.charts import CHART_DPI

logger = logging.getLogger(__name__)


# ============================================================================
# Dimensional constants used by ExportService methods
# ============================================================================

# PDF settings
PDF_PAGE_SIZE = letter
PDF_MARGIN = 0.75 * inch
PDF_TITLE_FONT_SIZE = 24
PDF_HEADING_FONT_SIZE = 14
PDF_BODY_FONT_SIZE = 11
PDF_SMALL_FONT_SIZE = 9
PDF_CHART_WIDTH = 5.5 * inch
PDF_CHART_HEIGHT = 4 * inch


# ============================================================================
# Export Service
# ============================================================================


class ExportService:
    """
    Service for generating export files from intelligence cards and workstreams.

    Supports PDF, PowerPoint, and CSV export formats with embedded visualizations.
    Follows the service class pattern from research_service.py.
    """

    def __init__(self, supabase: Client):
        """
        Initialize the ExportService.

        Args:
            supabase: Supabase client for database queries
        """
        self.supabase = supabase
        logger.info("ExportService initialized")

    # ========================================================================
    # Chart Generation Methods (facade — implementations live in export.charts)
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
    # PDF Generation Methods
    # ========================================================================

    def _create_pdf_header(
        self, card_data: CardExportData, styles: Dict[str, ParagraphStyle]
    ) -> List[Any]:
        """
        Create PDF header elements for a card.

        Args:
            card_data: Card data to display
            styles: PDF styles dictionary

        Returns:
            List of flowable elements for the header
        """
        elements = []

        # Title
        title = Paragraph(card_data.name, styles["Title"])
        elements.extend((title, Spacer(1, 6)))
        # Horizontal rule
        elements.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=PDF_COLORS["primary"],
                spaceBefore=6,
                spaceAfter=12,
            )
        )

        # Metadata badges (pillar, horizon, stage)
        badge_data = []
        if card_data.pillar_name or card_data.pillar_id:
            badge_data.append(("Pillar", card_data.pillar_name or card_data.pillar_id))
        if card_data.horizon:
            badge_data.append(("Horizon", card_data.horizon))
        if card_data.stage_name or card_data.stage_id:
            badge_data.append(("Stage", card_data.stage_name or card_data.stage_id))
        if card_data.goal_name or card_data.goal_id:
            badge_data.append(("Goal", card_data.goal_name or card_data.goal_id))

        if badge_data:
            badge_table_data = [[]]
            for label, value in badge_data:
                badge_text = f"<b>{label}:</b> {value}"
                badge_table_data[0].append(Paragraph(badge_text, styles["Small"]))

            badge_table = Table(
                badge_table_data, colWidths=[1.5 * inch] * len(badge_data)
            )
            badge_table.setStyle(
                TableStyle(
                    [
                        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            elements.append(badge_table)
            elements.append(Spacer(1, 12))

        return elements

    def _create_pdf_summary_section(
        self, card_data: CardExportData, styles: Dict[str, ParagraphStyle]
    ) -> List[Any]:
        """
        Create PDF summary section for a card.

        Args:
            card_data: Card data to display
            styles: PDF styles dictionary

        Returns:
            List of flowable elements for the summary
        """
        elements = [Paragraph("Classification Overview", styles["Heading1"])]

        classification_items = []
        if card_data.pillar_name or card_data.pillar_id:
            classification_items.append(
                f"<b>Strategic Pillar:</b> {card_data.pillar_name or card_data.pillar_id}"
            )
        if card_data.goal_name or card_data.goal_id:
            classification_items.append(
                f"<b>Strategic Goal:</b> {card_data.goal_name or card_data.goal_id}"
            )
        if card_data.horizon:
            horizon_desc = {
                "H1": "Near-term (0-2 years)",
                "H2": "Mid-term (2-5 years)",
                "H3": "Long-term (5+ years)",
            }
            classification_items.append(
                f"<b>Time Horizon:</b> {card_data.horizon} - {horizon_desc.get(card_data.horizon, '')}"
            )
        if card_data.stage_name or card_data.stage_id:
            classification_items.append(
                f"<b>Maturity Stage:</b> {card_data.stage_name or card_data.stage_id}"
            )

        if classification_items:
            for item in classification_items:
                elements.append(Paragraph(item, styles["Body"]))
            elements.append(Spacer(1, 12))

        # Executive Summary
        if card_data.summary:
            elements.append(Paragraph("Executive Summary", styles["Heading1"]))
            elements.append(Paragraph(card_data.summary, styles["Body"]))
            elements.append(Spacer(1, 12))

        # Full Description
        if card_data.description:
            elements.append(Paragraph("Detailed Analysis", styles["Heading1"]))
            # Truncate very long descriptions
            description = card_data.description
            if len(description) > 3000:
                description = description[:3000] + "... [truncated]"
            elements.append(Paragraph(description, styles["Body"]))
            elements.append(Spacer(1, 12))

        return elements

    def _create_pdf_research_section(
        self, card_data: CardExportData, styles: Dict[str, ParagraphStyle]
    ) -> List[Any]:
        """
        Create PDF section for deep research report.

        Args:
            card_data: Card data containing research report
            styles: PDF styles dictionary

        Returns:
            List of flowable elements for the research section
        """
        elements = []

        if not card_data.deep_research_report:
            return elements

        elements.extend(
            (
                PageBreak(),
                Paragraph("Strategic Intelligence Report", styles["Title"]),
                Spacer(1, 6),
                Paragraph(
                    "<i>The following strategic intelligence report was generated through deep research analysis, "
                    "synthesizing multiple sources to provide actionable insights for decision-makers.</i>",
                    styles["Small"],
                ),
                Spacer(1, 12),
                HRFlowable(
                    width="100%",
                    thickness=1,
                    color=PDF_COLORS["secondary"],
                    spaceBefore=6,
                    spaceAfter=12,
                ),
            )
        )
        # Parse and render the markdown report
        # Simple markdown-to-PDF conversion for common elements
        report = card_data.deep_research_report

        # Truncate if extremely long
        if len(report) > 15000:
            report = (
                report[:15000]
                + "\n\n... [Report truncated for PDF export. View full report in the application.]"
            )

        # Process the report line by line
        lines = report.split("\n")
        for line in lines:
            line = line.strip()
            if not line:
                elements.append(Spacer(1, 6))
            elif line.startswith("# "):
                # Main heading
                elements.append(Paragraph(line[2:], styles["Heading1"]))
            elif line.startswith("## "):
                # Section heading
                elements.append(Paragraph(line[3:], styles["Heading2"]))
            elif line.startswith("### "):
                # Subsection heading
                text = f"<b>{line[4:]}</b>"
                elements.append(Paragraph(text, styles["Body"]))
            elif line.startswith("- ") or line.startswith("* "):
                # Bullet point
                text = f"• {line[2:]}"
                elements.append(Paragraph(text, styles["Body"]))
            elif line.startswith("**") and line.endswith("**"):
                # Bold text
                text = f"<b>{line[2:-2]}</b>"
                elements.append(Paragraph(text, styles["Body"]))
            else:
                # Regular paragraph
                # Escape any XML-unsafe characters
                safe_line = (
                    line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                )
                elements.append(Paragraph(safe_line, styles["Body"]))

        return elements

    def _create_pdf_scores_table(
        self, card_data: CardExportData, styles: Dict[str, ParagraphStyle]
    ) -> List[Any]:
        """
        Create PDF scores table for a card.

        Args:
            card_data: Card data to display
            styles: PDF styles dictionary

        Returns:
            List of flowable elements for the scores section
        """
        elements = [Paragraph("Scores", styles["Heading1"])]

        # Build scores table
        scores = card_data.get_all_scores()
        table_data = [["Metric", "Score", "Rating"]]

        for name, score in scores.items():
            score_display = self.format_score_display(score)

            # Determine rating based on score
            if score is None:
                rating = "Not Scored"
            elif score >= 80:
                rating = "Excellent"
            elif score >= 60:
                rating = "Good"
            elif score >= 40:
                rating = "Fair"
            else:
                rating = "Low"

            table_data.append([name, score_display, rating])

        # Create table with styling
        table = Table(table_data, colWidths=[2 * inch, 1 * inch, 1.5 * inch])
        table.setStyle(
            TableStyle(
                [
                    # Header styling
                    ("BACKGROUND", (0, 0), (-1, 0), PDF_COLORS["primary"]),
                    ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), PDF_BODY_FONT_SIZE),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    # Body styling
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), PDF_BODY_FONT_SIZE),
                    ("ALIGN", (1, 1), (1, -1), "CENTER"),  # Center score column
                    ("ALIGN", (2, 1), (2, -1), "CENTER"),  # Center rating column
                    # Alternating row colors
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -1),
                        [rl_colors.white, PDF_COLORS["light"]],
                    ),
                    # Grid
                    ("GRID", (0, 0), (-1, -1), 0.5, PDF_COLORS["light"]),
                    ("BOX", (0, 0), (-1, -1), 1, PDF_COLORS["primary"]),
                    # Padding
                    ("TOPPADDING", (0, 0), (-1, -1), 8),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            )
        )

        elements.append(table)
        elements.append(Spacer(1, 18))

        return elements

    def _create_pdf_chart_section(
        self, card_data: CardExportData, styles: Dict[str, ParagraphStyle]
    ) -> Tuple[List[Any], List[str]]:
        """
        Create PDF chart section for a card.

        Args:
            card_data: Card data to display
            styles: PDF styles dictionary

        Returns:
            Tuple of (list of flowable elements, list of temp file paths to clean up)
        """
        elements = []
        temp_files = []

        if chart_path := self.generate_score_chart(card_data, chart_type="bar"):
            temp_files.append(chart_path)
            elements.append(Paragraph("Score Visualization", styles["Heading1"]))

            try:
                img = RLImage(
                    chart_path, width=PDF_CHART_WIDTH, height=PDF_CHART_HEIGHT
                )
                elements.extend((img, Spacer(1, 12)))
            except Exception as e:
                logger.warning(f"Failed to add chart image to PDF: {e}")

        return elements, temp_files

    def _create_pdf_footer(
        self, card_data: CardExportData, styles: Dict[str, ParagraphStyle]
    ) -> List[Any]:
        """
        Create PDF footer elements for a card.

        Args:
            card_data: Card data to display
            styles: PDF styles dictionary

        Returns:
            List of flowable elements for the footer
        """
        elements = [Spacer(1, 24)]

        elements.append(
            HRFlowable(
                width="100%",
                thickness=1,
                color=PDF_COLORS["light"],
                spaceBefore=6,
                spaceAfter=6,
            )
        )

        # Metadata footer
        footer_parts = []
        if card_data.created_at:
            footer_parts.append(f"Created: {card_data.created_at.strftime('%Y-%m-%d')}")
        if card_data.updated_at:
            footer_parts.append(f"Updated: {card_data.updated_at.strftime('%Y-%m-%d')}")
        footer_parts.append(
            f"Export Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        )

        footer_text = " | ".join(footer_parts)
        elements.append(Paragraph(footer_text, styles["Small"]))

        # Branding
        elements.append(Spacer(1, 6))
        elements.append(
            Paragraph("Generated by Foresight Intelligence Platform", styles["Small"])
        )

        return elements

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
    # Utility Methods (facade — implementations live in export.utils + export.data_access)
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
    # CSV Export Methods
    # ========================================================================

    async def generate_csv(
        self,
        card_data: CardExportData,
    ) -> str:
        return await _csv_export.generate_csv(card_data)

    async def generate_csv_multi(
        self,
        cards: List[CardExportData],
    ) -> str:
        return await _csv_export.generate_csv_multi(cards)

    def _generate_empty_csv(self) -> str:
        return _csv_export.generate_empty_csv()

    # ========================================================================
    # PowerPoint Export Methods
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
    # Executive Brief Export Methods
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
        """Generate a basic PDF export for an executive brief."""
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
        """Generate a branded, mayor-ready PDF for an executive brief."""
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
        """Generate a professional PDF export for a chat response."""
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
        """Generate a PowerPoint presentation for an executive brief."""
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

    # =========================================================================
    # Portfolio Export (Bulk Brief Export)
    # =========================================================================
    # The two helpers below are still used by portfolio export methods that
    # remain on this class. They delegate to app.export.briefs.pptx so the
    # implementation stays in one place. They will be inlined into the
    # portfolios module when portfolio export is extracted.

    def _add_smart_content_slide(
        self, prs: Presentation, title: str, content: str, max_chars: int = 1000
    ) -> None:
        _briefs.add_smart_content_slide(prs, title, content, max_chars)

    def _add_ai_disclosure_slide(self, prs: Presentation) -> None:
        _briefs.add_ai_disclosure_slide(prs)

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
