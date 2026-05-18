"""Markdown-to-ReportLab parser for AI-generated content."""

import re
from html import escape as html_escape
from typing import Any, Dict, List, Optional, Tuple

from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import HRFlowable, Paragraph, Spacer

from ..branding import PDF_COLORS


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
