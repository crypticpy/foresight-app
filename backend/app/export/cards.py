"""Single-card export generators (PDF + PPTX).

Module-level versions of ``ExportService.generate_pdf`` and
``ExportService.generate_pptx``. They render one ``CardExportData`` into a PDF
or PPTX file (saved to a temp path) and return the path.

The class methods on ``ExportService`` are now thin facades over these
functions.
"""

import logging
import re
import tempfile

from pptx import Presentation
from reportlab.lib import colors as rl_colors
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Image as RLImage,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from ..models.export import CardExportData
from . import charts as _charts
from . import utils as _utils
from .branding import PDF_COLORS, hex_to_rl_color
from .pdf import (
    ProfessionalPDFBuilder,
    _safe_md_paragraph,
    get_professional_pdf_styles,
)
from .pptx import (
    PPTX_SLIDE_HEIGHT,
    PPTX_SLIDE_WIDTH,
    add_content_slide,
    add_description_slide,
    add_scores_slide,
    add_title_slide,
)

logger = logging.getLogger(__name__)


async def generate_card_pdf(
    card_data: CardExportData, include_charts: bool = True
) -> str:
    """Generate a single-card PDF and return the temp file path.

    Raises whatever the underlying ReportLab build raises — callers in
    ``ExportService`` re-raise after logging.
    """
    temp_files = []

    try:
        pdf_file = tempfile.NamedTemporaryFile(
            suffix=".pdf", delete=False, prefix="foresight_card_export_"
        )
        pdf_path = pdf_file.name
        pdf_file.close()

        styles = get_professional_pdf_styles()

        elements = [Paragraph(card_data.name, styles["DocTitle"])]

        # Classification subtitle
        subtitle_parts = []
        if card_data.pillar_name or card_data.pillar_id:
            subtitle_parts.append(
                f"Pillar: {card_data.pillar_name or card_data.pillar_id}"
            )
        if card_data.horizon:
            subtitle_parts.append(f"Horizon: {card_data.horizon}")
        if card_data.stage_name or card_data.stage_id:
            subtitle_parts.append(
                f"Stage: {card_data.stage_name or card_data.stage_id}"
            )
        if subtitle_parts:
            elements.append(
                Paragraph(" | ".join(subtitle_parts), styles["DocSubtitle"])
            )

        elements.append(Spacer(1, 6))
        elements.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=PDF_COLORS["secondary"],
                spaceBefore=4,
                spaceAfter=16,
            )
        )

        # Executive Summary
        if card_data.summary:
            elements.append(
                Paragraph("Executive Summary", styles["SectionHeading"])
            )
            elements.append(
                Paragraph(card_data.summary, styles["ExecutiveSummary"])
            )
            elements.append(Spacer(1, 12))

        # Detailed Analysis / Description
        if card_data.description:
            elements.append(
                Paragraph("Detailed Analysis", styles["SectionHeading"])
            )
            description = card_data.description
            if len(description) > 5000:
                description = description[:5000] + "... [truncated]"
            elements.append(Paragraph(description, styles["BodyText"]))
            elements.append(Spacer(1, 12))

        # Scores Section
        scores = card_data.get_all_scores()
        valid_scores = {k: v for k, v in scores.items() if v is not None}
        if valid_scores:
            elements.append(Paragraph("Score Analysis", styles["SectionHeading"]))

            table_data = [["Metric", "Score", "Rating"]]
            for name, score in valid_scores.items():
                if score >= 80:
                    rating = "Excellent"
                elif score >= 60:
                    rating = "Good"
                elif score >= 40:
                    rating = "Fair"
                else:
                    rating = "Low"
                table_data.append([name, str(score), rating])

            table = Table(table_data, colWidths=[2 * inch, 1 * inch, 1.2 * inch])
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), PDF_COLORS["primary"]),
                        ("TEXTCOLOR", (0, 0), (-1, 0), rl_colors.white),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, 0), 10),
                        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                        ("FONTSIZE", (0, 1), (-1, -1), 10),
                        ("ALIGN", (1, 1), (-1, -1), "CENTER"),
                        (
                            "ROWBACKGROUNDS",
                            (0, 1),
                            (-1, -1),
                            [rl_colors.white, hex_to_rl_color("#F8F9FA")],
                        ),
                        ("GRID", (0, 0), (-1, -1), 0.5, hex_to_rl_color("#E0E0E0")),
                        ("BOX", (0, 0), (-1, -1), 1, PDF_COLORS["primary"]),
                        ("TOPPADDING", (0, 0), (-1, -1), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ]
                )
            )
            elements.append(table)
            elements.append(Spacer(1, 16))

        # Charts (if enabled)
        if include_charts and valid_scores:
            if chart_path := _charts.generate_score_chart(
                card_data, chart_type="bar"
            ):
                temp_files.append(chart_path)
                try:
                    img = RLImage(chart_path, width=5 * inch, height=3.5 * inch)
                    elements.append(img)
                    elements.append(Spacer(1, 16))
                except Exception as e:
                    logger.warning(f"Failed to add chart image to PDF: {e}")

        # Deep Research Report (if available)
        if card_data.deep_research_report:
            elements.append(PageBreak())
            elements.append(Paragraph("Deep Research", styles["SectionHeading"]))
            elements.append(Spacer(1, 8))

            report = card_data.deep_research_report
            if len(report) > 20000:
                report = (
                    report[:20000] + "\n\n... [Report truncated for PDF export]"
                )

            lines = report.split("\n")
            current_paragraph = []

            for line in lines:
                line_stripped = line.strip()

                if not line_stripped:
                    if current_paragraph:
                        para_text = _safe_md_paragraph(
                            " ".join(current_paragraph)
                        )
                        elements.append(Paragraph(para_text, styles["BodyText"]))
                        current_paragraph = []
                    continue

                if line_stripped.startswith("# "):
                    if current_paragraph:
                        elements.append(
                            Paragraph(
                                _safe_md_paragraph(" ".join(current_paragraph)),
                                styles["BodyText"],
                            )
                        )
                        current_paragraph = []
                    elements.append(Spacer(1, 8))
                    elements.append(
                        Paragraph(
                            _safe_md_paragraph(line_stripped[2:]),
                            styles["SectionHeading"],
                        )
                    )
                elif line_stripped.startswith("## "):
                    if current_paragraph:
                        elements.append(
                            Paragraph(
                                _safe_md_paragraph(" ".join(current_paragraph)),
                                styles["BodyText"],
                            )
                        )
                        current_paragraph = []
                    elements.append(
                        Paragraph(
                            _safe_md_paragraph(line_stripped[3:]),
                            styles["SubsectionHeading"],
                        )
                    )
                elif line_stripped.startswith("### "):
                    if current_paragraph:
                        elements.append(
                            Paragraph(
                                _safe_md_paragraph(" ".join(current_paragraph)),
                                styles["BodyText"],
                            )
                        )
                        current_paragraph = []
                    elements.append(
                        Paragraph(
                            f"<b>{_safe_md_paragraph(line_stripped[4:])}</b>",
                            styles["BodyText"],
                        )
                    )
                elif line_stripped.startswith("- ") or line_stripped.startswith(
                    "* "
                ):
                    if current_paragraph:
                        elements.append(
                            Paragraph(
                                _safe_md_paragraph(" ".join(current_paragraph)),
                                styles["BodyText"],
                            )
                        )
                        current_paragraph = []
                    bullet_text = _safe_md_paragraph(line_stripped[2:])
                    elements.append(
                        Paragraph(f"• {bullet_text}", styles["BulletText"])
                    )
                elif re.match(r"^\d+\.\s", line_stripped):
                    if current_paragraph:
                        elements.append(
                            Paragraph(
                                _safe_md_paragraph(" ".join(current_paragraph)),
                                styles["BodyText"],
                            )
                        )
                        current_paragraph = []
                    elements.append(
                        Paragraph(
                            _safe_md_paragraph(line_stripped),
                            styles["BulletText"],
                        )
                    )
                elif line_stripped in ["---", "***"]:
                    if current_paragraph:
                        elements.append(
                            Paragraph(
                                _safe_md_paragraph(" ".join(current_paragraph)),
                                styles["BodyText"],
                            )
                        )
                        current_paragraph = []
                    elements.append(Spacer(1, 6))
                    elements.append(
                        HRFlowable(
                            width="50%", thickness=1, color=PDF_COLORS["light"]
                        )
                    )
                    elements.append(Spacer(1, 6))
                else:
                    current_paragraph.append(line_stripped)

            if current_paragraph:
                para_text = _safe_md_paragraph(" ".join(current_paragraph))
                elements.append(Paragraph(para_text, styles["BodyText"]))

        if card_data.executive_brief_report:
            elements.append(PageBreak())
            elements.append(Paragraph("Executive Brief", styles["SectionHeading"]))
            elements.append(Spacer(1, 8))
            brief = card_data.executive_brief_report
            if len(brief) > 12000:
                brief = brief[:12000] + "\n\n... [Brief truncated for PDF export]"
            for raw_line in brief.split("\n"):
                line = raw_line.strip()
                if not line:
                    elements.append(Spacer(1, 6))
                elif line.startswith("# "):
                    elements.append(
                        Paragraph(
                            _safe_md_paragraph(line[2:]),
                            styles["SectionHeading"],
                        )
                    )
                elif line.startswith("## "):
                    elements.append(
                        Paragraph(
                            _safe_md_paragraph(line[3:]),
                            styles["SubsectionHeading"],
                        )
                    )
                elif line.startswith("- ") or line.startswith("* "):
                    elements.append(
                        Paragraph(
                            f"• {_safe_md_paragraph(line[2:])}",
                            styles["BulletText"],
                        )
                    )
                else:
                    elements.append(
                        Paragraph(_safe_md_paragraph(line), styles["BodyText"])
                    )

        # Metadata footer
        elements.append(Spacer(1, 20))
        elements.append(
            HRFlowable(width="100%", thickness=1, color=PDF_COLORS["light"])
        )
        elements.append(Spacer(1, 6))

        meta_items = []
        if card_data.created_at:
            meta_items.append(
                f"Created: {card_data.created_at.strftime('%B %d, %Y')}"
            )
        if card_data.updated_at:
            meta_items.append(
                f"Updated: {card_data.updated_at.strftime('%B %d, %Y')}"
            )
        for item in meta_items:
            elements.append(Paragraph(item, styles["SmallText"]))

        builder = ProfessionalPDFBuilder(
            filename=pdf_path,
            title=card_data.name,
            include_logo=True,
            include_ai_disclosure=True,
        )
        builder.build(elements)

        logger.info(f"Generated professional PDF export for card: {card_data.name}")
        return pdf_path

    except Exception as e:
        logger.error(f"Error generating PDF for card {card_data.name}: {e}")
        raise

    finally:
        _utils.cleanup_temp_files(temp_files)


async def generate_card_pptx(
    card_data: CardExportData,
    include_charts: bool = True,
    include_description: bool = True,
) -> str:
    """Generate a single-card PPTX (title / overview / scores / description).

    Returns the temp file path. Caller owns deleting it after sending.
    """
    temp_files_to_cleanup = []

    try:
        logger.info(f"Generating PowerPoint for card: {card_data.name}")

        prs = Presentation()
        prs.slide_width = PPTX_SLIDE_WIDTH
        prs.slide_height = PPTX_SLIDE_HEIGHT

        # 1. Title slide
        add_title_slide(prs, title=card_data.name, subtitle=card_data.summary)

        # 2. Overview slide with metadata
        overview_items = [
            ("Pillar", card_data.pillar_name or card_data.pillar_id),
            ("Goal", card_data.goal_name or card_data.goal_id),
            ("Anchor", card_data.anchor_name or card_data.anchor_id),
            ("Stage", card_data.stage_name or card_data.stage_id),
            ("Horizon", card_data.horizon),
            ("Status", card_data.status),
        ]
        overview_items = [(k, v) for k, v in overview_items if v]

        add_content_slide(prs, title="Card Overview", content_items=overview_items)

        # 3. Scores slide with chart
        chart_path = None
        if include_charts:
            chart_path = _charts.generate_score_chart(card_data, chart_type="radar")
            if chart_path:
                temp_files_to_cleanup.append(chart_path)

        add_scores_slide(prs, card_data, chart_path)

        # 4. Description slide (optional)
        if include_description and card_data.description:
            add_description_slide(
                prs, title="Full Description", description=card_data.description
            )

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".pptx", delete=False, prefix="foresight_card_"
        )
        prs.save(temp_file.name)

        logger.info(f"PowerPoint generated successfully: {temp_file.name}")
        return temp_file.name

    except Exception as e:
        logger.error(f"Error generating PowerPoint: {e}")
        raise

    finally:
        _utils.cleanup_temp_files(temp_files_to_cleanup)
