"""PDF generators for executive brief and chat-response exports.

Three flavors:
- generate_brief_pdf: lightweight markdown-to-PDF using the legacy in-module
  PDF style set. Used by the basic /briefs/{id}/export?format=pdf endpoint.
- generate_professional_brief_pdf: branded mayor-ready PDF with the
  ProfessionalPDFBuilder header/footer + classification badges + appendix.
- generate_chat_response_pdf: same professional styling for chat-response
  exports, with a question callout box and citations section.
"""

import logging
import re
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape as xml_escape

from reportlab.lib import colors as rl_colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
)

from ..branding import COA_BRAND_COLORS, PDF_COLORS, hex_to_rl_color
from ..pdf import (
    MarkdownToPDFParser,
    ProfessionalPDFBuilder,
    create_classification_appendix,
    create_classification_badges,
    get_professional_pdf_styles,
)

logger = logging.getLogger(__name__)


PDF_PAGE_SIZE = letter
PDF_MARGIN = 0.75 * inch
PDF_TITLE_FONT_SIZE = 24
PDF_HEADING_FONT_SIZE = 14
PDF_BODY_FONT_SIZE = 11
PDF_SMALL_FONT_SIZE = 9


def _to_utc(dt: datetime) -> datetime:
    """Return ``dt`` as a UTC-aware datetime.

    Treats naive inputs as already-UTC; converts aware inputs to UTC so
    timestamps formatted with a literal ``UTC`` suffix are actually correct.
    """
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _get_basic_brief_styles() -> Dict[str, ParagraphStyle]:
    """Paragraph styles for the basic brief PDF flavor."""
    styles = getSampleStyleSheet()
    return {
        "Title": ParagraphStyle(
            "CustomTitle",
            parent=styles["Heading1"],
            fontSize=PDF_TITLE_FONT_SIZE,
            textColor=PDF_COLORS["primary"],
            spaceAfter=12,
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
        ),
        "Heading1": ParagraphStyle(
            "CustomHeading1",
            parent=styles["Heading1"],
            fontSize=PDF_HEADING_FONT_SIZE,
            textColor=PDF_COLORS["primary"],
            spaceBefore=18,
            spaceAfter=8,
            fontName="Helvetica-Bold",
        ),
        "Heading2": ParagraphStyle(
            "CustomHeading2",
            parent=styles["Heading2"],
            fontSize=PDF_BODY_FONT_SIZE + 1,
            textColor=PDF_COLORS["secondary"],
            spaceBefore=12,
            spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "Body": ParagraphStyle(
            "CustomBody",
            parent=styles["Normal"],
            fontSize=PDF_BODY_FONT_SIZE,
            textColor=PDF_COLORS["dark"],
            spaceBefore=4,
            spaceAfter=4,
            leading=14,
        ),
        "Small": ParagraphStyle(
            "CustomSmall",
            parent=styles["Normal"],
            fontSize=PDF_SMALL_FONT_SIZE,
            textColor=rl_colors.gray,
            spaceBefore=2,
            spaceAfter=2,
        ),
        "Badge": ParagraphStyle(
            "Badge",
            parent=styles["Normal"],
            fontSize=PDF_SMALL_FONT_SIZE,
            textColor=rl_colors.white,
            alignment=TA_CENTER,
        ),
    }


async def generate_brief_pdf(
    brief_title: str,
    card_name: str,
    executive_summary: str,
    content_markdown: str,
    generated_at: Optional[datetime] = None,
    version: Optional[int] = None,
) -> str:
    """Generate a basic PDF export for an executive brief."""
    try:
        pdf_file = tempfile.NamedTemporaryFile(
            suffix=".pdf", delete=False, prefix="foresight_brief_"
        )
        pdf_path = pdf_file.name
        pdf_file.close()

        doc = SimpleDocTemplate(
            pdf_path,
            pagesize=PDF_PAGE_SIZE,
            rightMargin=PDF_MARGIN,
            leftMargin=PDF_MARGIN,
            topMargin=PDF_MARGIN,
            bottomMargin=PDF_MARGIN,
        )

        styles = _get_basic_brief_styles()
        elements = []

        title_text = f"Executive Brief: {brief_title}"
        if version and version > 1:
            title_text += f" (v{version})"
        elements.extend(
            (
                Paragraph(title_text, styles["Title"]),
                Spacer(1, 6),
                HRFlowable(
                    width="100%",
                    thickness=2,
                    color=PDF_COLORS["primary"],
                    spaceBefore=6,
                    spaceAfter=12,
                ),
            )
        )

        meta_parts = [f"Card: {card_name}"]
        if generated_at:
            generated_at_utc = _to_utc(generated_at)
            meta_parts.append(
                f"Generated: {generated_at_utc.strftime('%Y-%m-%d %H:%M UTC')}"
            )
        if version:
            meta_parts.append(f"Version: {version}")
        elements.extend(
            (
                Paragraph(" | ".join(meta_parts), styles["Small"]),
                Spacer(1, 12),
                Paragraph("Executive Summary", styles["Heading1"]),
                Paragraph(
                    xml_escape(executive_summary)
                    if executive_summary
                    else "No summary available.",
                    styles["Body"],
                ),
                Spacer(1, 18),
                Paragraph("Full Brief", styles["Heading1"]),
                Spacer(1, 6),
            )
        )

        if content_markdown:
            paragraphs = content_markdown.split("\n\n")
            for para_text in paragraphs:
                para_text = para_text.strip()
                if not para_text:
                    continue

                if para_text.startswith("# "):
                    elements.append(
                        Paragraph(xml_escape(para_text[2:]), styles["Heading1"])
                    )
                elif para_text.startswith("## "):
                    elements.append(
                        Paragraph(xml_escape(para_text[3:]), styles["Heading2"])
                    )
                elif para_text.startswith("### "):
                    heading3_style = ParagraphStyle(
                        "Heading3",
                        parent=styles["Body"],
                        fontSize=PDF_BODY_FONT_SIZE,
                        fontName="Helvetica-Bold",
                        spaceBefore=10,
                        spaceAfter=4,
                    )
                    elements.append(
                        Paragraph(xml_escape(para_text[4:]), heading3_style)
                    )
                elif para_text.startswith("- ") or para_text.startswith("* "):
                    bullet_style = ParagraphStyle(
                        "Bullet",
                        parent=styles["Body"],
                        leftIndent=20,
                        firstLineIndent=-10,
                        spaceBefore=2,
                        spaceAfter=2,
                    )
                    lines = para_text.split("\n")
                    for line in lines:
                        line = line.strip()
                        if line.startswith("- ") or line.startswith("* "):
                            elements.append(
                                Paragraph(
                                    f"• {xml_escape(line[2:])}", bullet_style
                                )
                            )
                        elif line:
                            elements.append(
                                Paragraph(xml_escape(line), styles["Body"])
                            )
                else:
                    safe_text = xml_escape(para_text)
                    formatted = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe_text)
                    formatted = re.sub(r"\*(.+?)\*", r"<i>\1</i>", formatted)
                    formatted = formatted.replace("\n", "<br/>")
                    elements.append(Paragraph(formatted, styles["Body"]))

                elements.append(Spacer(1, 4))
        else:
            elements.append(Paragraph("No content available.", styles["Body"]))

        elements.extend(
            (
                Spacer(1, 24),
                HRFlowable(
                    width="100%",
                    thickness=1,
                    color=PDF_COLORS["light"],
                    spaceBefore=6,
                    spaceAfter=6,
                ),
            )
        )
        footer_text = (
            f"Export Date: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
        )
        elements.extend(
            (
                Paragraph(footer_text, styles["Small"]),
                Paragraph(
                    "Generated by Foresight Intelligence Platform",
                    styles["Small"],
                ),
            )
        )

        doc.build(elements)
        logger.info(f"Generated brief PDF export: {brief_title}")
        return pdf_path

    except Exception as e:
        logger.error(f"Error generating brief PDF: {e}")
        raise


async def generate_professional_brief_pdf(
    brief_title: str,
    card_name: str,
    executive_summary: str,
    content_markdown: str,
    generated_at: Optional[datetime] = None,
    version: Optional[int] = None,
    classification: Optional[Dict[str, str]] = None,
) -> str:
    """Generate a branded, mayor-ready PDF for an executive brief."""
    try:
        pdf_file = tempfile.NamedTemporaryFile(
            suffix=".pdf", delete=False, prefix="foresight_executive_brief_"
        )
        pdf_path = pdf_file.name
        pdf_file.close()

        styles = get_professional_pdf_styles()
        md_parser = MarkdownToPDFParser(styles)

        elements = [Paragraph(brief_title, styles["DocTitle"])]

        if classification:
            badge_elements = create_classification_badges(classification, styles)
            elements.extend(badge_elements)

        elements.append(Spacer(1, 8))
        elements.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=PDF_COLORS["secondary"],
                spaceBefore=4,
                spaceAfter=16,
            )
        )

        elements.append(Paragraph("Executive Summary", styles["SectionHeading"]))

        if executive_summary:
            summary_clean = md_parser.clean_text(executive_summary)
            summary_formatted = md_parser.convert_inline_formatting(summary_clean)
            summary_formatted = summary_formatted.replace("\n", "<br/>")
            elements.append(Paragraph(summary_formatted, styles["ExecutiveSummary"]))
        else:
            elements.append(Paragraph("No summary available.", styles["BodyText"]))

        elements.append(Spacer(1, 16))
        elements.append(
            Paragraph("Strategic Intelligence Report", styles["SectionHeading"])
        )
        elements.append(Spacer(1, 8))

        if content_markdown:
            content_elements = md_parser.parse_to_elements(content_markdown)
            elements.extend(content_elements)
        else:
            elements.append(Paragraph("No content available.", styles["BodyText"]))

        elements.append(Spacer(1, 20))
        elements.append(
            HRFlowable(
                width="100%",
                thickness=1,
                color=PDF_COLORS["light"],
                spaceBefore=8,
                spaceAfter=8,
            )
        )

        meta_items = []
        if generated_at:
            generated_at_utc = _to_utc(generated_at)
            meta_items.append(
                f"Generated: {generated_at_utc.strftime('%B %d, %Y at %I:%M %p UTC')}"
            )
        if version:
            meta_items.append(f"Version: {version}")
        meta_items.append(f"Card: {card_name}")

        elements.extend(Paragraph(item, styles["SmallText"]) for item in meta_items)

        if classification:
            appendix_elements = create_classification_appendix(styles)
            elements.extend(appendix_elements)

        builder = ProfessionalPDFBuilder(
            filename=pdf_path,
            title=brief_title,
            include_logo=True,
            include_ai_disclosure=True,
        )
        builder.build(elements)

        logger.info(f"Generated professional brief PDF: {brief_title}")
        return pdf_path

    except Exception as e:
        logger.error(f"Error generating professional brief PDF: {e}")
        raise


async def generate_chat_response_pdf(
    title: str,
    question: str,
    response_content: str,
    citations: Optional[List[Dict[str, Any]]] = None,
    metadata: Optional[Dict[str, Any]] = None,
    scope: Optional[str] = None,
    scope_context: Optional[str] = None,
) -> str:
    """Generate a professional PDF export for a chat response."""
    try:
        pdf_file = tempfile.NamedTemporaryFile(
            suffix=".pdf", delete=False, prefix="foresight_chat_"
        )
        pdf_path = pdf_file.name
        pdf_file.close()

        styles = get_professional_pdf_styles()
        md_parser = MarkdownToPDFParser(styles)

        elements = []

        elements.append(Paragraph(title, styles["DocTitle"]))
        elements.append(Paragraph("Intelligence Response", styles["DocSubtitle"]))

        date_str = datetime.now(timezone.utc).strftime("%B %d, %Y")
        elements.append(Paragraph(date_str, styles["MetadataText"]))

        if scope and scope_context:
            scope_label = (
                "Signal"
                if scope == "signal"
                else ("Workstream" if scope == "workstream" else "Scope")
            )
            elements.append(
                Paragraph(
                    f"<b>{scope_label}:</b> {md_parser.escape_xml(scope_context)}",
                    styles["MetadataText"],
                )
            )

        elements.append(Spacer(1, 8))
        elements.append(
            HRFlowable(
                width="100%",
                thickness=2,
                color=PDF_COLORS["secondary"],
                spaceBefore=4,
                spaceAfter=16,
            )
        )

        light_blue_bg = hex_to_rl_color(COA_BRAND_COLORS["light_blue"])
        question_box_style = ParagraphStyle(
            "QuestionBody",
            parent=styles["BodyText"],
            backColor=light_blue_bg,
            borderPadding=(10, 10, 10, 10),
            spaceBefore=4,
            spaceAfter=4,
        )
        question_label_style = ParagraphStyle(
            "QuestionLabel",
            parent=styles["BodyText"],
            fontSize=12,
            fontName="Helvetica-Bold",
            textColor=PDF_COLORS["primary"],
            backColor=light_blue_bg,
            borderPadding=(10, 10, 2, 10),
            spaceBefore=0,
            spaceAfter=0,
        )

        question_escaped = (
            md_parser.escape_xml(question) if question else "No question recorded."
        )
        elements.append(
            KeepTogether(
                [
                    Paragraph("Question", question_label_style),
                    Paragraph(question_escaped, question_box_style),
                ]
            )
        )

        elements.append(Spacer(1, 16))
        elements.append(Paragraph("Analysis", styles["SectionHeading"]))
        elements.append(Spacer(1, 8))

        if response_content:
            content_elements = md_parser.parse_to_elements(response_content)
            elements.extend(content_elements)
        else:
            elements.append(
                Paragraph("No response content available.", styles["BodyText"])
            )

        if citations:
            elements.append(Spacer(1, 16))
            elements.append(
                Paragraph("Sources &amp; References", styles["SectionHeading"])
            )
            elements.append(Spacer(1, 6))

            for idx, cite in enumerate(citations, 1):
                cite_title = md_parser.escape_xml(
                    cite.get("title", "Untitled Source")
                )
                cite_url = md_parser.escape_xml(cite.get("url", ""))
                cite_excerpt = md_parser.escape_xml(cite.get("excerpt", ""))

                citation_parts = [f"<b>{idx}.</b> <b>{cite_title}</b>"]
                if cite_url:
                    citation_parts.append(
                        f'<font size="9" color="gray">{cite_url}</font>'
                    )
                elements.append(
                    Paragraph("<br/>".join(citation_parts), styles["NumberedItem"])
                )

                if cite_excerpt:
                    excerpt_style = ParagraphStyle(
                        f"Excerpt_{idx}",
                        parent=styles["SmallText"],
                        leftIndent=25,
                        spaceBefore=1,
                        spaceAfter=6,
                        textColor=PDF_COLORS["dark"],
                        fontSize=9,
                        leading=12,
                    )
                    if len(cite_excerpt) > 300:
                        cite_excerpt = cite_excerpt[:297] + "..."
                    elements.append(
                        Paragraph(f"<i>{cite_excerpt}</i>", excerpt_style)
                    )

        if metadata:
            elements.append(Spacer(1, 20))
            elements.append(
                HRFlowable(
                    width="100%",
                    thickness=1,
                    color=PDF_COLORS["light"],
                    spaceBefore=8,
                    spaceAfter=8,
                )
            )

            meta_parts = []
            if metadata.get("source_count"):
                meta_parts.append(f"{metadata['source_count']} sources")
            if metadata.get("signal_count"):
                meta_parts.append(f"{metadata['signal_count']} signals")
            if metadata.get("model"):
                meta_parts.append(f"Model: {metadata['model']}")

            if meta_parts:
                meta_text = "Based on " + " across ".join(meta_parts)
                elements.append(Paragraph(meta_text, styles["SmallText"]))

        builder = ProfessionalPDFBuilder(
            filename=pdf_path,
            title=title,
            include_logo=True,
            include_ai_disclosure=True,
        )
        builder.build(elements)

        logger.info(f"Generated chat response PDF: {title}")
        return pdf_path

    except Exception as e:
        logger.error(f"Error generating chat response PDF: {e}")
        raise
