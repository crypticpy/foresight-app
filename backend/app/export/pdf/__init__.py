"""PDF building blocks for export.

Public surface:
- ProfessionalPDFBuilder — branded PDF document with header/footer.
- get_professional_pdf_styles — paragraph style dictionary used across exports.
- _safe_md_paragraph — escape + light-markdown for a single paragraph string.
- MarkdownToPDFParser — convert AI-generated markdown into ReportLab flowables.
- create_classification_badges — pillar/horizon/stage badges as flowables.
- create_classification_appendix — Appendix A explaining the classification framework.
"""

from .builder import ProfessionalPDFBuilder
from .classifications import (
    create_classification_appendix,
    create_classification_badges,
)
from .markdown import MarkdownToPDFParser, _safe_md_paragraph
from .styles import get_professional_pdf_styles

__all__ = [
    "ProfessionalPDFBuilder",
    "MarkdownToPDFParser",
    "_safe_md_paragraph",
    "create_classification_appendix",
    "create_classification_badges",
    "get_professional_pdf_styles",
]
