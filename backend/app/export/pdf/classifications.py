"""Classification badges + framework appendix for executive PDF exports."""

import re
from typing import Any, Dict, List

from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import PageBreak, Paragraph, Spacer

from ..branding import HORIZON_COLORS, PILLAR_COLORS, STAGE_INFO


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
