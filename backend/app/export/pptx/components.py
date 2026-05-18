"""Reusable PowerPoint slide components and dimensional constants.

These were originally methods on ``ExportService`` — they take a ``slide`` or
``Presentation`` and mutate it in place. Pulled out so card, workstream, brief,
and portfolio exporters can share the same header/footer + title/content/scores/
description slide building blocks.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Inches, Pt

from ...models.export import CardExportData
from ...openai_provider import get_chat_deployment
from ..branding import COA_LOGO_PATH, FORESIGHT_COLORS, SCORE_COLORS

logger = logging.getLogger(__name__)


# PowerPoint dimensional constants (16:9 widescreen)
PPTX_SLIDE_WIDTH = Inches(13.333)
PPTX_SLIDE_HEIGHT = Inches(7.5)
PPTX_TITLE_FONT_SIZE = Pt(44)
PPTX_SUBTITLE_FONT_SIZE = Pt(24)
PPTX_BODY_FONT_SIZE = Pt(18)
PPTX_SMALL_FONT_SIZE = Pt(14)
PPTX_MARGIN = Inches(0.5)
PPTX_CHART_WIDTH = Inches(5)
PPTX_CHART_HEIGHT = Inches(4)


def hex_to_rgb(hex_color: str) -> RGBColor:
    """Convert ``#RRGGBB`` (or ``RRGGBB``) to a python-pptx ``RGBColor``."""
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return RGBColor(r, g, b)


def add_pptx_header(slide, include_logo: bool = True) -> None:
    """Add the white header bar (COA logo + FORESIGHT brand + date) to ``slide``."""
    # White header background
    header_bg = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(0), PPTX_SLIDE_WIDTH, Inches(1.1)
    )
    header_bg.fill.solid()
    header_bg.fill.fore_color.rgb = RGBColor(255, 255, 255)
    header_bg.line.fill.background()

    # Blue accent line below header
    accent_line = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, Inches(0), Inches(1.08), PPTX_SLIDE_WIDTH, Inches(0.03)
    )
    accent_line.fill.solid()
    accent_line.fill.fore_color.rgb = hex_to_rgb(FORESIGHT_COLORS["primary"])
    accent_line.line.fill.background()

    # City of Austin logo (if available)
    logo_right_edge = PPTX_MARGIN
    if include_logo and COA_LOGO_PATH and Path(COA_LOGO_PATH).exists():
        try:
            logo = slide.shapes.add_picture(
                COA_LOGO_PATH, PPTX_MARGIN, Inches(0.25), height=Inches(0.6)
            )
            logo_right_edge = logo.left + logo.width + Inches(0.2)
        except Exception as e:
            logger.warning(f"Failed to add logo to PPTX slide: {e}")

    # FORESIGHT branding text - primary blue
    brand_box = slide.shapes.add_textbox(
        logo_right_edge, Inches(0.2), Inches(3), Inches(0.5)
    )
    brand_frame = brand_box.text_frame
    brand_para = brand_frame.paragraphs[0]
    brand_para.text = "FORESIGHT"
    brand_para.font.size = Pt(18)
    brand_para.font.bold = True
    brand_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["primary"])

    # Subtitle - gray
    subtitle_box = slide.shapes.add_textbox(
        logo_right_edge, Inches(0.55), Inches(3), Inches(0.4)
    )
    subtitle_frame = subtitle_box.text_frame
    subtitle_para = subtitle_frame.paragraphs[0]
    subtitle_para.text = "Strategic Intelligence Platform"
    subtitle_para.font.size = Pt(10)
    subtitle_para.font.color.rgb = RGBColor(128, 128, 128)

    # Date on right side - black
    date_box = slide.shapes.add_textbox(
        PPTX_SLIDE_WIDTH - Inches(2.5), Inches(0.4), Inches(2), Inches(0.4)
    )
    date_frame = date_box.text_frame
    date_para = date_frame.paragraphs[0]
    date_para.text = datetime.now(timezone.utc).strftime("%B %d, %Y")
    date_para.font.size = Pt(11)
    date_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["dark"])
    date_para.alignment = PP_ALIGN.RIGHT


def add_pptx_footer(slide, include_ai_disclosure: bool = True) -> None:
    """Add the light-gray footer (AI disclosure + COA notice) to ``slide``."""
    # Footer background
    footer_bg = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0),
        PPTX_SLIDE_HEIGHT - Inches(0.6),
        PPTX_SLIDE_WIDTH,
        Inches(0.6),
    )
    footer_bg.fill.solid()
    footer_bg.fill.fore_color.rgb = RGBColor(248, 249, 250)  # Light gray
    footer_bg.line.fill.background()

    # AI disclosure text
    if include_ai_disclosure:
        disclosure_box = slide.shapes.add_textbox(
            PPTX_MARGIN,
            PPTX_SLIDE_HEIGHT - Inches(0.5),
            PPTX_SLIDE_WIDTH - Inches(2),
            Inches(0.4),
        )
        disclosure_frame = disclosure_box.text_frame
        disclosure_para = disclosure_frame.paragraphs[0]
        disclosure_para.text = (
            f"AI Technologies: OpenAI {get_chat_deployment()}, "
            "GPT Researcher, SearXNG, Serper"
        )
        disclosure_para.font.size = Pt(8)
        disclosure_para.font.color.rgb = RGBColor(100, 100, 100)

    # City of Austin notice
    notice_box = slide.shapes.add_textbox(
        PPTX_SLIDE_WIDTH - Inches(3),
        PPTX_SLIDE_HEIGHT - Inches(0.5),
        Inches(2.5),
        Inches(0.4),
    )
    notice_frame = notice_box.text_frame
    notice_para = notice_frame.paragraphs[0]
    notice_para.text = "City of Austin Internal Document"
    notice_para.font.size = Pt(8)
    notice_para.font.italic = True
    notice_para.font.color.rgb = RGBColor(128, 128, 128)
    notice_para.alignment = PP_ALIGN.RIGHT


def add_title_slide(
    prs: Presentation, title: str, subtitle: Optional[str] = None
) -> None:
    """Add a title slide with optional subtitle (uses blank layout 6)."""
    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)

    # White background
    background = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE,
        Inches(0),
        Inches(0),
        PPTX_SLIDE_WIDTH,
        PPTX_SLIDE_HEIGHT,
    )
    background.fill.solid()
    background.fill.fore_color.rgb = RGBColor(255, 255, 255)
    background.line.fill.background()

    add_pptx_header(slide)

    # Main title - centered, primary blue
    title_box = slide.shapes.add_textbox(
        PPTX_MARGIN, Inches(2.8), PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN), Inches(1.5)
    )
    title_frame = title_box.text_frame
    title_frame.word_wrap = True
    title_para = title_frame.paragraphs[0]
    title_para.text = title[:80]
    title_para.font.size = PPTX_TITLE_FONT_SIZE
    title_para.font.bold = True
    title_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["primary"])
    title_para.alignment = PP_ALIGN.CENTER

    # Subtitle if provided - gray
    if subtitle:
        subtitle_box = slide.shapes.add_textbox(
            PPTX_MARGIN,
            Inches(4.3),
            PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN),
            Inches(1),
        )
        subtitle_frame = subtitle_box.text_frame
        subtitle_frame.word_wrap = True
        subtitle_para = subtitle_frame.paragraphs[0]
        subtitle_para.text = subtitle[:150]
        subtitle_para.font.size = PPTX_SUBTITLE_FONT_SIZE
        subtitle_para.font.color.rgb = RGBColor(100, 100, 100)
        subtitle_para.alignment = PP_ALIGN.CENTER

    add_pptx_footer(slide)


def add_content_slide(
    prs: Presentation,
    title: str,
    content_items: List[Tuple[str, str]],
    chart_path: Optional[str] = None,
) -> None:
    """Add a content slide with bold-label/value pairs and optional right-side chart."""
    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)

    add_pptx_header(slide)
    add_pptx_footer(slide)

    # Slide title - below header, primary blue
    title_box = slide.shapes.add_textbox(
        PPTX_MARGIN, Inches(1.25), PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN), Inches(0.6)
    )
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = title[:60]
    title_para.font.size = Pt(28)
    title_para.font.bold = True
    title_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["primary"])

    if chart_path:
        content_width = Inches(6.5)
        chart_left = Inches(7.5)
    else:
        content_width = PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN)
        chart_left = None

    content_top = Inches(1.95)
    content_box = slide.shapes.add_textbox(
        PPTX_MARGIN,
        content_top,
        content_width,
        Inches(4.5),
    )
    content_frame = content_box.text_frame
    content_frame.word_wrap = True

    for i, (label, value) in enumerate(content_items):
        para = (
            content_frame.paragraphs[0] if i == 0 else content_frame.add_paragraph()
        )
        para.space_before = Pt(8)
        para.space_after = Pt(4)

        run_label = para.add_run()
        run_label.text = f"{label}: "
        run_label.font.size = PPTX_BODY_FONT_SIZE
        run_label.font.bold = True
        run_label.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["dark"])

        run_value = para.add_run()
        run_value.text = str(value) if value else "N/A"
        run_value.font.size = PPTX_BODY_FONT_SIZE
        run_value.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["dark"])

    if chart_path and Path(chart_path).exists():
        try:
            slide.shapes.add_picture(
                chart_path,
                chart_left,
                Inches(2.0),
                width=PPTX_CHART_WIDTH,
                height=Inches(4.0),
            )
        except Exception as e:
            logger.warning(f"Failed to add chart to slide: {e}")


def add_scores_slide(
    prs: Presentation,
    card_data: CardExportData,
    chart_path: Optional[str] = None,
) -> None:
    """Add a slide showing all dimension scores, with optional left-side chart."""
    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)

    add_pptx_header(slide)
    add_pptx_footer(slide)

    # Slide title - below header
    title_box = slide.shapes.add_textbox(
        PPTX_MARGIN, Inches(1.25), PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN), Inches(0.6)
    )
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = "Score Analysis"
    title_para.font.size = Pt(28)
    title_para.font.bold = True
    title_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["primary"])

    if chart_path and Path(chart_path).exists():
        try:
            slide.shapes.add_picture(
                chart_path,
                Inches(0.5),
                Inches(2.0),
                width=Inches(5.5),
                height=Inches(4.0),
            )
        except Exception as e:
            logger.warning(f"Failed to add score chart: {e}")

    # Score details on the right side
    scores = card_data.get_all_scores()
    scores_box = slide.shapes.add_textbox(
        Inches(6.5), Inches(2.0), Inches(5.5), Inches(4.0)
    )
    scores_frame = scores_box.text_frame
    scores_frame.word_wrap = True

    for i, (score_name, score_value) in enumerate(scores.items()):
        para = (
            scores_frame.paragraphs[0] if i == 0 else scores_frame.add_paragraph()
        )
        para.space_before = Pt(12)
        para.space_after = Pt(4)

        run_name = para.add_run()
        run_name.text = f"{score_name}: "
        run_name.font.size = Pt(20)
        run_name.font.bold = True
        run_name.font.color.rgb = hex_to_rgb(
            SCORE_COLORS.get(score_name, FORESIGHT_COLORS["dark"])
        )

        run_value = para.add_run()
        run_value.text = str(score_value) if score_value is not None else "N/A"
        run_value.font.size = Pt(20)
        run_value.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["dark"])


def add_description_slide(
    prs: Presentation, title: str, description: Optional[str]
) -> None:
    """Add a slide for long-form description text (truncated to ~1800 chars).

    No-ops when ``description`` is empty.
    """
    if not description:
        return

    slide_layout = prs.slide_layouts[6]  # Blank layout
    slide = prs.slides.add_slide(slide_layout)

    add_pptx_header(slide)
    add_pptx_footer(slide)

    title_box = slide.shapes.add_textbox(
        PPTX_MARGIN, Inches(1.25), PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN), Inches(0.6)
    )
    title_frame = title_box.text_frame
    title_para = title_frame.paragraphs[0]
    title_para.text = title
    title_para.font.size = Pt(28)
    title_para.font.bold = True
    title_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["primary"])

    max_chars = 1800
    display_text = description[:max_chars]
    if len(description) > max_chars:
        display_text += "..."

    desc_box = slide.shapes.add_textbox(
        PPTX_MARGIN, Inches(1.95), PPTX_SLIDE_WIDTH - (2 * PPTX_MARGIN), Inches(4.5)
    )
    desc_frame = desc_box.text_frame
    desc_frame.word_wrap = True
    desc_para = desc_frame.paragraphs[0]
    desc_para.text = display_text
    desc_para.font.size = PPTX_BODY_FONT_SIZE
    desc_para.font.color.rgb = hex_to_rgb(FORESIGHT_COLORS["dark"])
    desc_para.line_spacing = 1.3
