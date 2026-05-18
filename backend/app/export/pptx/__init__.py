"""PPTX building blocks (slide components, dimensional constants).

Submodules:
- components: hex_to_rgb conversion, header/footer, title/content/scores/description slides.
"""

from .components import (
    PPTX_BODY_FONT_SIZE,
    PPTX_CHART_HEIGHT,
    PPTX_CHART_WIDTH,
    PPTX_MARGIN,
    PPTX_SLIDE_HEIGHT,
    PPTX_SLIDE_WIDTH,
    PPTX_SMALL_FONT_SIZE,
    PPTX_SUBTITLE_FONT_SIZE,
    PPTX_TITLE_FONT_SIZE,
    add_content_slide,
    add_description_slide,
    add_pptx_footer,
    add_pptx_header,
    add_scores_slide,
    add_title_slide,
    hex_to_rgb,
)

__all__ = [
    "PPTX_BODY_FONT_SIZE",
    "PPTX_CHART_HEIGHT",
    "PPTX_CHART_WIDTH",
    "PPTX_MARGIN",
    "PPTX_SLIDE_HEIGHT",
    "PPTX_SLIDE_WIDTH",
    "PPTX_SMALL_FONT_SIZE",
    "PPTX_SUBTITLE_FONT_SIZE",
    "PPTX_TITLE_FONT_SIZE",
    "add_content_slide",
    "add_description_slide",
    "add_pptx_footer",
    "add_pptx_header",
    "add_scores_slide",
    "add_title_slide",
    "hex_to_rgb",
]
