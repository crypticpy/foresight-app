"""Branded PDF document builder with header + footer page templates."""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional

from reportlab.lib import colors as rl_colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate

from ...openai_provider import get_chat_deployment
from ..branding import COA_LOGO_PATH, PDF_COLORS, hex_to_rl_color

logger = logging.getLogger(__name__)


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
