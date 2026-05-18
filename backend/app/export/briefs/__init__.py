"""Brief export generators (PDF + PPTX).

Submodules:
- pdf: Executive brief, professional brief, and chat-response PDF generators.
- pptx: Brief PowerPoint generation (Gamma-first with local python-pptx fallback)
  plus the markdown cleaning, section parsing, and slide helpers it uses.
"""

from .pdf import (
    generate_brief_pdf,
    generate_professional_brief_pdf,
    generate_chat_response_pdf,
)
from .pptx import (
    generate_brief_pptx,
    generate_brief_pptx_local,
    clean_markdown_for_pptx,
    parse_markdown_sections_improved,
    add_smart_content_slide,
    add_ai_disclosure_slide,
)

__all__ = [
    "generate_brief_pdf",
    "generate_professional_brief_pdf",
    "generate_chat_response_pdf",
    "generate_brief_pptx",
    "generate_brief_pptx_local",
    "clean_markdown_for_pptx",
    "parse_markdown_sections_improved",
    "add_smart_content_slide",
    "add_ai_disclosure_slide",
]
