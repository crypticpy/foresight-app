"""Paragraph styles used across professional PDF exports."""

from typing import Dict

from reportlab.lib import colors as rl_colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet

from ..branding import PDF_COLORS, hex_to_rl_color


def get_professional_pdf_styles() -> Dict[str, ParagraphStyle]:
    """
    Create custom paragraph styles for professional PDF generation.

    Returns:
        Dictionary of ParagraphStyle objects for executive documents
    """
    styles = getSampleStyleSheet()

    return {
        "DocTitle": ParagraphStyle(
            "DocTitle",
            parent=styles["Heading1"],
            fontSize=28,
            textColor=PDF_COLORS["primary"],
            spaceAfter=16,
            spaceBefore=8,
            alignment=TA_LEFT,
            fontName="Helvetica-Bold",
            leading=34,
        ),
        "DocSubtitle": ParagraphStyle(
            "DocSubtitle",
            parent=styles["Normal"],
            fontSize=14,
            textColor=PDF_COLORS["secondary"],
            spaceAfter=20,
            fontName="Helvetica",
            leading=18,
        ),
        "SectionHeading": ParagraphStyle(
            "SectionHeading",
            parent=styles["Heading1"],
            fontSize=16,
            textColor=PDF_COLORS["primary"],
            spaceBefore=20,
            spaceAfter=10,
            fontName="Helvetica-Bold",
            borderPadding=(0, 0, 4, 0),
        ),
        "SubsectionHeading": ParagraphStyle(
            "SubsectionHeading",
            parent=styles["Heading2"],
            fontSize=13,
            textColor=PDF_COLORS["secondary"],
            spaceBefore=14,
            spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "BodyText": ParagraphStyle(
            "BodyText",
            parent=styles["Normal"],
            fontSize=11,
            textColor=PDF_COLORS["dark"],
            spaceBefore=4,
            spaceAfter=8,
            leading=15,
            alignment=TA_JUSTIFY,
        ),
        "BulletText": ParagraphStyle(
            "BulletText",
            parent=styles["Normal"],
            fontSize=11,
            textColor=PDF_COLORS["dark"],
            spaceBefore=2,
            spaceAfter=4,
            leftIndent=20,
            bulletIndent=10,
            leading=14,
        ),
        "SmallText": ParagraphStyle(
            "SmallText",
            parent=styles["Normal"],
            fontSize=9,
            textColor=rl_colors.gray,
            spaceBefore=2,
            spaceAfter=2,
        ),
        "MetadataText": ParagraphStyle(
            "MetadataText",
            parent=styles["Normal"],
            fontSize=10,
            textColor=PDF_COLORS["dark"],
            spaceBefore=2,
            spaceAfter=2,
            fontName="Helvetica",
        ),
        "CalloutText": ParagraphStyle(
            "CalloutText",
            parent=styles["Normal"],
            fontSize=11,
            textColor=PDF_COLORS["primary"],
            spaceBefore=8,
            spaceAfter=8,
            leftIndent=15,
            rightIndent=15,
            borderPadding=10,
            backColor=hex_to_rl_color("#F0F4F8"),
            leading=15,
        ),
        "ExecutiveSummary": ParagraphStyle(
            "ExecutiveSummary",
            parent=styles["Normal"],
            fontSize=12,
            textColor=PDF_COLORS["dark"],
            spaceBefore=6,
            spaceAfter=12,
            leading=17,
            alignment=TA_JUSTIFY,
            fontName="Helvetica",
        ),
        "NumberedItem": ParagraphStyle(
            "NumberedItem",
            parent=styles["Normal"],
            fontSize=11,
            textColor=PDF_COLORS["dark"],
            spaceBefore=6,
            spaceAfter=4,
            leftIndent=25,
            firstLineIndent=-15,
            leading=14,
        ),
        "AppendixTitle": ParagraphStyle(
            "AppendixTitle",
            parent=styles["Heading1"],
            fontSize=18,
            textColor=PDF_COLORS["primary"],
            spaceBefore=24,
            spaceAfter=16,
            fontName="Helvetica-Bold",
        ),
        "AppendixHeading": ParagraphStyle(
            "AppendixHeading",
            parent=styles["Heading2"],
            fontSize=14,
            textColor=PDF_COLORS["secondary"],
            spaceBefore=16,
            spaceAfter=8,
            fontName="Helvetica-Bold",
        ),
        "AppendixBody": ParagraphStyle(
            "AppendixBody",
            parent=styles["Normal"],
            fontSize=10,
            textColor=PDF_COLORS["dark"],
            spaceBefore=2,
            spaceAfter=4,
            leading=13,
        ),
    }
