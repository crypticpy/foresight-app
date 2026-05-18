"""Portfolio PDF generator (ReportLab).

Builds a detailed multi-card portfolio PDF: title page, executive overview,
key themes, strategic priorities, per-card detailed sections, cross-cutting
insights, recommended actions, and AI disclosure. PDF expands more detail
per card than the PPTX since readers can absorb more on the page.
"""

import logging
import os
import re
import tempfile
from datetime import datetime, timezone
from typing import List
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from ...gamma_service import PILLAR_DEFINITIONS
from ...openai_provider import get_chat_deployment
from ..branding import COA_BRAND_COLORS

logger = logging.getLogger(__name__)


async def generate_portfolio_pdf(
    workstream_name: str,
    briefs: List,  # List of PortfolioBrief
    synthesis,  # PortfolioSynthesisData
) -> str:
    """Generate a detailed portfolio PDF document.

    Returns the path to the generated PDF file.
    """
    temp_file = tempfile.NamedTemporaryFile(
        suffix=".pdf", delete=False, prefix="foresight_portfolio_"
    )
    pdf_path = temp_file.name
    # Close the underlying file handle immediately; ReportLab writes via the
    # path. This avoids handle leaks when doc.build() raises before our
    # original temp_file.close() was reached.
    temp_file.close()

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=letter,
        rightMargin=72,
        leftMargin=72,
        topMargin=72,
        bottomMargin=72,
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "PortfolioTitle",
        parent=styles["Heading1"],
        fontSize=24,
        textColor=HexColor(COA_BRAND_COLORS["logo_blue"]),
        spaceAfter=12,
        alignment=1,
    )

    subtitle_style = ParagraphStyle(
        "PortfolioSubtitle",
        parent=styles["Normal"],
        fontSize=14,
        textColor=HexColor(COA_BRAND_COLORS["dark_gray"]),
        spaceAfter=24,
        alignment=1,
    )

    section_style = ParagraphStyle(
        "SectionTitle",
        parent=styles["Heading2"],
        fontSize=16,
        textColor=HexColor(COA_BRAND_COLORS["logo_blue"]),
        spaceBefore=18,
        spaceAfter=12,
    )

    card_title_style = ParagraphStyle(
        "CardTitle",
        parent=styles["Heading3"],
        fontSize=14,
        textColor=HexColor(COA_BRAND_COLORS["dark_blue"]),
        spaceBefore=12,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        "BodyText",
        parent=styles["Normal"],
        fontSize=11,
        textColor=HexColor(COA_BRAND_COLORS["dark_gray"]),
        spaceAfter=8,
        leading=14,
    )

    elements = [Spacer(1, inch * 2)]

    elements.append(Paragraph(xml_escape(workstream_name or ""), title_style))
    elements.append(Paragraph("Strategic Intelligence Portfolio", subtitle_style))
    elements.append(
        Paragraph(
            f"{len(briefs)} Strategic Trends | {datetime.now(timezone.utc).strftime('%B %Y')}",
            subtitle_style,
        )
    )
    elements.append(Paragraph("City of Austin | FORESIGHT Platform", subtitle_style))
    elements.append(PageBreak())

    # Executive Overview
    elements.append(Paragraph("Executive Overview", section_style))
    overview_text = synthesis.executive_overview or "Portfolio analysis in progress."
    for para in overview_text.split("\n\n"):
        if para.strip():
            elements.append(Paragraph(xml_escape(para.strip()), body_style))
    elements.append(Spacer(1, 12))

    # Key Themes
    elements.append(Paragraph("Key Themes", section_style))
    elements.extend(
        Paragraph(f"• {xml_escape(theme)}", body_style)
        for theme in (synthesis.key_themes or [])
    )
    elements.append(Spacer(1, 12))

    # Strategic Priorities
    elements.append(Paragraph("Strategic Priorities", section_style))
    matrix = synthesis.priority_matrix or {}

    if urgent := matrix.get("high_impact_urgent") or []:
        elements.append(Paragraph("<b>High Impact - Urgent Action:</b>", body_style))
        for item in urgent:
            elements.append(Paragraph(f"  • {xml_escape(item)}", body_style))

    if strategic := matrix.get("high_impact_strategic") or []:
        elements.append(
            Paragraph("<b>High Impact - Strategic Planning:</b>", body_style)
        )
        for item in strategic:
            elements.append(Paragraph(f"  • {xml_escape(item)}", body_style))

    if monitor := matrix.get("monitor") or []:
        elements.append(Paragraph("<b>Monitor &amp; Evaluate:</b>", body_style))
        for item in monitor:
            elements.append(Paragraph(f"  • {xml_escape(item)}", body_style))

    elements.append(PageBreak())

    # Per-card detailed sections (PDF gets FULL content)
    elements.append(Paragraph("Trend Analysis", section_style))

    for i, brief in enumerate(briefs, 1):
        pillar_def = PILLAR_DEFINITIONS.get(
            brief.pillar_id.upper() if brief.pillar_id else "", {}
        )
        pillar_name = xml_escape(pillar_def.get("name", brief.pillar_id or "Unknown"))
        horizon_name = xml_escape(brief.horizon or "H2")
        card_name_safe = xml_escape(brief.card_name or "")

        elements.append(Paragraph(f"{i}. {card_name_safe}", card_title_style))
        elements.append(
            Paragraph(
                f"<b>Pillar:</b> {pillar_name} | <b>Horizon:</b> {horizon_name} | "
                f"<b>Impact:</b> {brief.impact_score}/100 | <b>Relevance:</b> {brief.relevance_score}/100",
                body_style,
            )
        )

        if brief.brief_summary:
            elements.append(
                Paragraph(
                    f"<b>Summary:</b> {xml_escape(brief.brief_summary)}", body_style
                )
            )

        if brief.brief_content_markdown:
            # Escape first so any literal <, >, & in source content is safe,
            # THEN apply the bold/italic regex substitutions so the resulting
            # <b>/<i> tags stay valid ReportLab markup.
            content = xml_escape(brief.brief_content_markdown)
            content = re.sub(r"^#+\s+", "", content, flags=re.MULTILINE)
            content = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", content)
            content = re.sub(r"\*([^*]+)\*", r"<i>\1</i>", content)

            if len(content) > 2000:
                content = f"{content[:2000]}..."

            for para in content.split("\n\n")[:5]:
                if para.strip():
                    elements.append(Paragraph(para.strip(), body_style))

        elements.append(Spacer(1, 12))

    elements.append(PageBreak())

    # Cross-Cutting Insights
    elements.append(Paragraph("Cross-Cutting Insights", section_style))
    for insight in synthesis.cross_cutting_insights or []:
        elements.append(Paragraph(f"• {xml_escape(insight)}", body_style))
    elements.append(Spacer(1, 12))

    # Recommended Actions
    elements.append(Paragraph("Recommended Actions", section_style))
    for action in synthesis.recommended_actions or []:
        action_text = xml_escape(action.get("action", ""))
        owner = xml_escape(action.get("owner", "TBD"))
        timeline = xml_escape(action.get("timeline", "TBD"))
        cards = xml_escape(", ".join(action.get("cards", [])))

        elements.append(Paragraph(f"<b>{action_text}</b>", body_style))
        elements.append(
            Paragraph(f"  Owner: {owner} | Timeline: {timeline}", body_style)
        )
        if cards:
            elements.append(Paragraph(f"  Related Trends: {cards}", body_style))
        elements.append(Spacer(1, 6))

    # AI Disclosure
    elements.append(PageBreak())
    elements.append(Paragraph("About This Portfolio", section_style))
    disclosure = f"""This strategic intelligence portfolio was generated using the FORESIGHT platform,
    powered by advanced AI technologies including OpenAI {get_chat_deployment()}, GPT Researcher,
    SearXNG, Serper, trafilatura, and Gamma.app. The City of Austin is committed to transparent
    and responsible use of AI technology in public service. All AI-generated content is reviewed
    for accuracy and relevance."""
    elements.append(Paragraph(disclosure, body_style))

    try:
        doc.build(elements)
    except Exception:
        # Best-effort cleanup of the partially-written temp file on failure so
        # we don't leak it on disk. Swallow unlink errors — the original
        # exception is more useful.
        try:
            os.unlink(pdf_path)
        except OSError:
            pass
        raise

    logger.info(f"Generated portfolio PDF: {len(briefs)} cards")
    return pdf_path
