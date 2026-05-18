"""Reusable ReportLab building blocks: PDF styles, builder, markdown parser, classification appendix.

These were originally module-level helpers inside export_service.py and are now imported back into
ExportService and re-exported for any external callers.
"""

import logging
import re
from datetime import datetime, timezone
from html import escape as html_escape
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib import colors as rl_colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
)

from ..openai_provider import get_chat_deployment
from .branding import (
    COA_LOGO_PATH,
    HORIZON_COLORS,
    PDF_COLORS,
    PILLAR_COLORS,
    STAGE_INFO,
    hex_to_rl_color,
)

logger = logging.getLogger(__name__)


def _safe_md_paragraph(text: str) -> str:
    """Escape user/LLM-generated text for ReportLab Paragraph, then promote
    `**bold**` and `*italic*` markdown to the corresponding ReportLab tags.

    ReportLab's Paragraph parses a mini-XML; raw `<`, `>`, or `&` from
    markdown content (URLs, comparison operators, code) raises and aborts
    PDF generation. Escape first, then re-introduce the only inline tags we
    actually want.
    """
    safe = html_escape(text, quote=False)
    safe = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", safe)
    safe = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", safe)
    return safe


# ============================================================================
# Professional PDF Builder with Header/Footer
# ============================================================================


class ProfessionalPDFBuilder:
    """
    Custom PDF document builder with professional header and footer.

    Used for executive briefs and workstream reports that will be shared
    with senior city leadership.
    """

    def __init__(
        self,
        filename: str,
        title: str,
        subtitle: Optional[str] = None,
        include_logo: bool = True,
        include_ai_disclosure: bool = True,
    ):
        """
        Initialize the PDF builder.

        Args:
            filename: Output PDF file path
            title: Document title for header
            subtitle: Optional subtitle
            include_logo: Whether to include City of Austin logo
            include_ai_disclosure: Whether to include AI technology disclosure
        """
        self.filename = filename
        self.title = title
        self.subtitle = subtitle
        self.include_logo = include_logo
        self.include_ai_disclosure = include_ai_disclosure
        self.page_width, self.page_height = letter

        # Margins - extra space at top/bottom for header/footer
        self.left_margin = 0.75 * inch
        self.right_margin = 0.75 * inch
        self.top_margin = 1.4 * inch  # Extra space for header
        self.bottom_margin = 1.2 * inch  # Extra space for footer

    def _draw_header(self, canvas_obj: canvas.Canvas, doc):
        """Draw the professional header on each page."""
        canvas_obj.saveState()

        # Header background - clean white
        canvas_obj.setFillColor(rl_colors.white)
        canvas_obj.rect(
            0,
            self.page_height - 1.1 * inch,
            self.page_width,
            1.1 * inch,
            fill=True,
            stroke=False,
        )

        # Add accent line below header - primary blue for brand consistency
        canvas_obj.setStrokeColor(PDF_COLORS["primary"])
        canvas_obj.setLineWidth(2)
        canvas_obj.line(
            0,
            self.page_height - 1.1 * inch,
            self.page_width,
            self.page_height - 1.1 * inch,
        )

        # City of Austin logo (if available and enabled)
        logo_width = 0
        if self.include_logo and COA_LOGO_PATH and Path(COA_LOGO_PATH).exists():
            try:
                # Draw logo on left side of header
                logo_height = 0.55 * inch
                logo_width = 1.65 * inch  # Aspect ratio ~3:1 for horizontal logo
                canvas_obj.drawImage(
                    COA_LOGO_PATH,
                    self.left_margin,
                    self.page_height - 0.85 * inch,
                    width=logo_width,
                    height=logo_height,
                    preserveAspectRatio=True,
                    mask="auto",
                )
                logo_width += 0.25 * inch  # Add spacing after logo
            except Exception as e:
                logger.warning(f"Failed to add logo to PDF header: {e}")
                logo_width = 0

        # Vertical separator line after logo
        if logo_width > 0:
            canvas_obj.setStrokeColor(hex_to_rl_color("#E0E0E0"))
            canvas_obj.setLineWidth(1)
            sep_x = self.left_margin + logo_width + 0.1 * inch
            canvas_obj.line(
                sep_x,
                self.page_height - 0.25 * inch,
                sep_x,
                self.page_height - 0.95 * inch,
            )
            logo_width += 0.25 * inch  # Extra spacing after separator

        # Foresight branding text
        text_x = self.left_margin + logo_width

        # "FORESIGHT" title - primary blue to match website
        canvas_obj.setFillColor(PDF_COLORS["primary"])
        canvas_obj.setFont("Helvetica-Bold", 16)
        canvas_obj.drawString(text_x, self.page_height - 0.45 * inch, "FORESIGHT")

        # "Strategic Intelligence Platform" subtitle - gray
        canvas_obj.setFillColor(rl_colors.gray)
        canvas_obj.setFont("Helvetica", 9)
        canvas_obj.drawString(
            text_x, self.page_height - 0.62 * inch, "Strategic Intelligence Platform"
        )

        # Document title on right side - black
        canvas_obj.setFillColor(PDF_COLORS["dark"])
        canvas_obj.setFont("Helvetica-Bold", 11)
        title_text = f"{self.title[:45]}..." if len(self.title) > 45 else self.title
        title_width = canvas_obj.stringWidth(title_text, "Helvetica-Bold", 11)
        canvas_obj.drawString(
            self.page_width - self.right_margin - title_width,
            self.page_height - 0.45 * inch,
            title_text,
        )

        # Page generation date on right - black
        canvas_obj.setFillColor(PDF_COLORS["dark"])
        canvas_obj.setFont("Helvetica", 9)
        date_text = datetime.now(timezone.utc).strftime("%B %d, %Y")
        date_width = canvas_obj.stringWidth(date_text, "Helvetica", 9)
        canvas_obj.drawString(
            self.page_width - self.right_margin - date_width,
            self.page_height - 0.62 * inch,
            date_text,
        )

        canvas_obj.restoreState()

    def _draw_footer(self, canvas_obj: canvas.Canvas, doc):
        """Draw the professional footer on each page."""
        canvas_obj.saveState()

        # Footer background
        canvas_obj.setFillColor(hex_to_rl_color("#F8F9FA"))
        canvas_obj.rect(0, 0, self.page_width, 1.0 * inch, fill=True, stroke=False)

        # Top border line
        canvas_obj.setStrokeColor(PDF_COLORS["primary"])
        canvas_obj.setLineWidth(1)
        canvas_obj.line(
            self.left_margin,
            1.0 * inch,
            self.page_width - self.right_margin,
            1.0 * inch,
        )

        # AI Technology Disclosure (if enabled)
        if self.include_ai_disclosure:
            canvas_obj.setFillColor(PDF_COLORS["dark"])
            canvas_obj.setFont("Helvetica", 7)

            # Multi-line disclosure
            disclosure_lines = [
                f"AI-Powered Intelligence: This report was generated using OpenAI {get_chat_deployment()}, GPT Researcher,",
                "SearXNG, and Serper. The City of Austin is committed to transparent and responsible",
                "use of AI technology in public service.",
            ]

            y_pos = 0.75 * inch
            for line in disclosure_lines:
                canvas_obj.drawString(self.left_margin, y_pos, line)
                y_pos -= 0.12 * inch

        # Page number on right
        canvas_obj.setFont("Helvetica", 9)
        page_text = f"Page {doc.page}"
        page_width = canvas_obj.stringWidth(page_text, "Helvetica", 9)
        canvas_obj.drawString(
            self.page_width - self.right_margin - page_width, 0.4 * inch, page_text
        )

        # Confidentiality notice
        canvas_obj.setFont("Helvetica-Oblique", 7)
        canvas_obj.setFillColor(rl_colors.gray)
        canvas_obj.drawString(
            self.left_margin,
            0.25 * inch,
            "City of Austin Internal Document - For Official Use",
        )

        canvas_obj.restoreState()

    def _draw_header_footer(self, canvas_obj: canvas.Canvas, doc):
        """Combined callback for header and footer."""
        self._draw_header(canvas_obj, doc)
        self._draw_footer(canvas_obj, doc)

    def build(self, elements: List[Any]) -> str:
        """
        Build the PDF document with all elements.

        Args:
            elements: List of ReportLab flowable elements

        Returns:
            Path to the generated PDF file
        """
        # Create document with custom page template
        doc = BaseDocTemplate(
            self.filename,
            pagesize=letter,
            leftMargin=self.left_margin,
            rightMargin=self.right_margin,
            topMargin=self.top_margin,
            bottomMargin=self.bottom_margin,
        )

        # Create frame for content
        frame = Frame(
            self.left_margin,
            self.bottom_margin,
            self.page_width - self.left_margin - self.right_margin,
            self.page_height - self.top_margin - self.bottom_margin,
            id="normal",
        )

        # Create page template with header/footer
        template = PageTemplate(
            id="professional", frames=[frame], onPage=self._draw_header_footer
        )

        doc.addPageTemplates([template])
        doc.build(elements)

        return self.filename


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


# ============================================================================
# Robust Markdown Parser for AI-Generated Content
# ============================================================================


class MarkdownToPDFParser:
    """
    Robust parser for converting markdown to ReportLab PDF elements.

    Handles various AI-generated content formats gracefully:
    - Multiple heading styles (# ## ###, underlines, bold headings)
    - Bullet points (-, *, •, >, numbered)
    - Bold/italic formatting (**bold**, *italic*, __bold__, _italic_)
    - Links [text](url) - extracts text only for PDF
    - Code blocks (``` and inline `)
    - Horizontal rules (---, ***, ___)
    - Edge cases: mixed formatting, incomplete markers, nested lists
    """

    def __init__(self, styles: Dict[str, ParagraphStyle]):
        """Initialize with PDF styles dictionary."""
        self.styles = styles
        self.import_re()

    def import_re(self):
        """Import regex module."""
        import re

        self.re = re

    def clean_text(self, text: str) -> str:
        """
        Clean and sanitize text for PDF rendering.

        - Escapes XML special characters
        - Removes problematic unicode
        - Normalizes whitespace
        """
        if not text:
            return ""

        # Replace common problematic characters
        text = text.replace("​", "")  # Zero-width space
        text = text.replace(" ", " ")  # Non-breaking space
        text = text.replace("\r\n", "\n")
        text = text.replace("\r", "\n")

        # Normalize multiple spaces
        text = self.re.sub(r"  +", " ", text)

        return text.strip()

    def escape_xml(self, text: str) -> str:
        """Escape XML special characters for ReportLab."""
        if not text:
            return ""
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        return text.replace(">", "&gt;")

    def convert_inline_formatting(self, text: str) -> str:
        """
        Convert markdown inline formatting to ReportLab XML tags.

        Handles: **bold**, *italic*, __bold__, _italic_, `code`, [links](url)
        """
        if not text:
            return ""

        # First escape XML characters
        text = self.escape_xml(text)

        # Convert bold: **text** or __text__
        text = self.re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
        text = self.re.sub(r"__(.+?)__", r"<b>\1</b>", text)

        # Convert italic: *text* or _text_ (but not within words)
        # Be careful not to match already-converted bold markers
        text = self.re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
        text = self.re.sub(r"(?<!_)_(?!_)(.+?)(?<!_)_(?!_)", r"<i>\1</i>", text)

        # Convert inline code: `code`
        text = self.re.sub(r"`([^`]+)`", r'<font face="Courier">\1</font>', text)

        # Convert links: [text](url) -> just the text
        text = self.re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)

        # Clean up any leftover asterisks that didn't match patterns
        # This handles edge cases like "* Urgency:" which isn't meant to be italic

        return text

    def is_heading(self, line: str) -> Optional[Tuple[int, str]]:
        """
        Check if line is a heading. Returns (level, text) or None.

        Handles:
        - # Heading 1
        - ## Heading 2
        - ### Heading 3
        - **HEADING IN BOLD**
        - HEADING WITH COLON:
        """
        line = line.strip()

        if match := self.re.match(r"^(#{1,3})\s+(.+)$", line):
            level = len(match.group(1))
            text = match.group(2).strip()
            # Remove trailing # if present
            text = self.re.sub(r"\s*#+\s*$", "", text)
            return (level, text)

        # All caps section headers (common AI pattern)
        if self.re.match(r"^[A-Z][A-Z\s&\-]{5,}$", line) and not line.startswith("•"):
            return (2, line.title())

        return None

    def is_bullet_point(self, line: str) -> Optional[str]:
        """
        Check if line is a bullet point. Returns the bullet text or None.

        Handles: -, *, •, >, and numbered lists (1., 2., etc.)
        """
        line = line.strip()

        if match := self.re.match(r"^[\-\*•]\s+(.+)$", line):
            return match.group(1)

        return match.group(1) if (match := self.re.match(r"^>\s+(.+)$", line)) else None

    def is_numbered_item(self, line: str) -> Optional[Tuple[str, str]]:
        """
        Check if line is a numbered list item.
        Returns (number, text) or None.
        """
        line = line.strip()

        if match := self.re.match(r"^(\d+)[.\)]\s+(.+)$", line):
            return (match.group(1), match.group(2))

        return None

    def is_horizontal_rule(self, line: str) -> bool:
        """Check if line is a horizontal rule."""
        line = line.strip()
        return bool(self.re.match(r"^[-*_]{3,}$", line))

    def parse_to_elements(self, markdown_content: str) -> List[Any]:
        """
        Parse markdown content to ReportLab flowable elements.

        This is the main entry point for converting AI-generated markdown
        into properly formatted PDF elements.
        """
        if not markdown_content:
            return [Paragraph("No content available.", self.styles["BodyText"])]

        elements = []
        markdown_content = self.clean_text(markdown_content)
        lines = markdown_content.split("\n")

        current_paragraph_lines = []
        in_code_block = False
        code_block_content = []

        def flush_paragraph():
            """Helper to flush accumulated paragraph lines."""
            nonlocal current_paragraph_lines
            if current_paragraph_lines:
                para_text = " ".join(current_paragraph_lines)
                para_text = self.convert_inline_formatting(para_text)
                if para_text.strip():
                    elements.append(Paragraph(para_text, self.styles["BodyText"]))
                current_paragraph_lines = []

        for i, line in enumerate(lines):
            line_stripped = line.strip()

            # Handle code blocks
            if line_stripped.startswith("```"):
                if in_code_block:
                    # End code block
                    in_code_block = False
                    if code_block_content:
                        code_text = "\n".join(code_block_content)
                        code_text = self.escape_xml(code_text)
                        elements.append(
                            Paragraph(
                                f'<font face="Courier" size="9">{code_text}</font>',
                                self.styles["BodyText"],
                            )
                        )
                        code_block_content = []
                else:
                    # Start code block
                    flush_paragraph()
                    in_code_block = True
                continue

            if in_code_block:
                code_block_content.append(line)
                continue

            # Empty line - flush paragraph
            if not line_stripped:
                flush_paragraph()
                continue

            # Check for horizontal rule
            if self.is_horizontal_rule(line_stripped):
                flush_paragraph()
                elements.append(Spacer(1, 8))
                elements.append(
                    HRFlowable(
                        width="60%",
                        thickness=1,
                        color=PDF_COLORS["light"],
                        spaceBefore=4,
                        spaceAfter=8,
                    )
                )
                continue

            # Check for headings
            heading = self.is_heading(line_stripped)
            if heading:
                flush_paragraph()
                level, text = heading
                text = self.convert_inline_formatting(text)

                if level == 1:
                    elements.append(Spacer(1, 10))
                    elements.append(Paragraph(text, self.styles["SectionHeading"]))
                elif level == 2:
                    elements.append(Paragraph(text, self.styles["SubsectionHeading"]))
                else:
                    elements.append(
                        Paragraph(f"<b>{text}</b>", self.styles["BodyText"])
                    )
                continue

            # Check for numbered items
            numbered = self.is_numbered_item(line_stripped)
            if numbered:
                flush_paragraph()
                num, text = numbered
                text = self.convert_inline_formatting(text)
                elements.append(
                    Paragraph(f"<b>{num}.</b> {text}", self.styles["NumberedItem"])
                )
                continue

            # Check for bullet points
            bullet = self.is_bullet_point(line_stripped)
            if bullet:
                flush_paragraph()
                bullet_text = self.convert_inline_formatting(bullet)
                elements.append(
                    Paragraph(f"• {bullet_text}", self.styles["BulletText"])
                )
                continue

            # Regular text - accumulate for paragraph
            current_paragraph_lines.append(line_stripped)

        # Flush any remaining content
        flush_paragraph()

        if in_code_block and code_block_content:
            code_text = "\n".join(code_block_content)
            code_text = self.escape_xml(code_text)
            elements.append(
                Paragraph(
                    f'<font face="Courier" size="9">{code_text}</font>',
                    self.styles["BodyText"],
                )
            )

        return elements


def create_classification_badges(
    classification: Dict[str, str], styles: Dict[str, ParagraphStyle]
) -> List[Any]:
    """
    Create visually styled classification badges for PDF.

    Args:
        classification: Dict with 'pillar', 'horizon', 'stage' keys
        styles: PDF styles dictionary

    Returns:
        List of ReportLab flowable elements showing colored badges
    """
    if not classification:
        return []

    elements = []
    badge_parts = []

    if pillar_code := classification.get("pillar", "").upper():
        if pillar_code in PILLAR_COLORS:
            pillar_info = PILLAR_COLORS[pillar_code]
            badge_parts.append(
                f'<font color="{pillar_info["color"]}"><b>{pillar_code}</b></font> {pillar_info["name"]}'
            )
        else:
            badge_parts.append(f"<b>Pillar:</b> {pillar_code}")

    if horizon_code := classification.get("horizon", "").upper():
        if horizon_code in HORIZON_COLORS:
            horizon_info = HORIZON_COLORS[horizon_code]
            badge_parts.append(
                f'<font color="{horizon_info["color"]}"><b>{horizon_code}</b></font> {horizon_info["name"]} ({horizon_info["timeframe"]})'
            )
        else:
            badge_parts.append(f"<b>Horizon:</b> {horizon_code}")

    # Stage badge
    stage_raw = classification.get("stage", "")
    stage_num = None

    # Parse stage - can be "4", "stage 4", "4_proof", etc.
    if stage_match := re.search(r"(\d+)", str(stage_raw)):
        stage_num = int(stage_match.group(1))

    if stage_num and stage_num in STAGE_INFO:
        stage_info = STAGE_INFO[stage_num]
        horizon_for_stage = stage_info["horizon"]
        stage_color = HORIZON_COLORS.get(horizon_for_stage, {}).get("color", "#6366f1")
        badge_parts.append(
            f'<font color="{stage_color}"><b>Stage {stage_num}</b></font> {stage_info["name"]}'
        )
    elif stage_raw:
        badge_parts.append(f"<b>Stage:</b> {stage_raw}")

    if badge_parts:
        # Create a styled classification line with link hint
        badge_text = "   |   ".join(badge_parts)
        elements.extend(
            (
                Paragraph(badge_text, styles.get("MetadataText", styles["SmallText"])),
                Paragraph(
                    '<i><font size="8" color="gray">See Appendix A for classification definitions</font></i>',
                    styles.get("SmallText", styles["BodyText"]),
                ),
            )
        )
    return elements


def create_classification_appendix(styles: Dict[str, ParagraphStyle]) -> List[Any]:
    """
    Create an appendix explaining the Foresight classification system.

    Returns a list of ReportLab flowable elements.
    """
    elements = [PageBreak()]

    # Appendix title
    elements.append(
        Paragraph(
            "Appendix A: Classification Framework",
            styles.get("AppendixTitle", styles["SectionHeading"]),
        )
    )

    elements.append(
        Paragraph(
            "This report uses the City of Austin's Foresight strategic classification framework to categorize emerging trends and technologies.",
            styles.get("AppendixBody", styles["BodyText"]),
        )
    )
    elements.append(Spacer(1, 12))

    # Pillars section
    elements.append(
        Paragraph(
            "Strategic Pillars",
            styles.get("AppendixHeading", styles["SubsectionHeading"]),
        )
    )
    elements.append(
        Paragraph(
            "Pillars represent the six core areas of Austin's Comprehensive Strategic Plan (CSP):",
            styles.get("AppendixBody", styles["BodyText"]),
        )
    )

    elements.extend(
        Paragraph(
            f'<font color="{info["color"]}"><b>{code}</b></font> - <b>{info["name"]}</b>',
            styles.get("AppendixBody", styles["BodyText"]),
        )
        for code, info in PILLAR_COLORS.items()
    )
    elements.append(Spacer(1, 12))

    # Horizons section
    elements.append(
        Paragraph(
            "Planning Horizons",
            styles.get("AppendixHeading", styles["SubsectionHeading"]),
        )
    )
    elements.append(
        Paragraph(
            "Horizons indicate the expected timeline for impact:",
            styles.get("AppendixBody", styles["BodyText"]),
        )
    )

    elements.extend(
        Paragraph(
            f'<font color="{info["color"]}"><b>{code}: {info["name"]}</b></font> ({info["timeframe"]}) - {info["description"]}',
            styles.get("AppendixBody", styles["BodyText"]),
        )
        for code, info in HORIZON_COLORS.items()
    )
    elements.append(Spacer(1, 12))

    # Stages section
    elements.append(
        Paragraph(
            "Maturity Stages",
            styles.get("AppendixHeading", styles["SubsectionHeading"]),
        )
    )
    elements.append(
        Paragraph(
            "Stages indicate how mature a trend or technology is in its development lifecycle:",
            styles.get("AppendixBody", styles["BodyText"]),
        )
    )

    for stage_num, info in STAGE_INFO.items():
        horizon_color = HORIZON_COLORS.get(info["horizon"], {}).get("color", "#6366f1")
        elements.append(
            Paragraph(
                f'<font color="{horizon_color}"><b>Stage {stage_num}: {info["name"]}</b></font> ({info["horizon"]}) - {info["description"]}',
                styles.get("AppendixBody", styles["BodyText"]),
            )
        )

    return elements
