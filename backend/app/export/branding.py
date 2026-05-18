"""Brand assets, color palettes, and AI disclosure copy used by PDF/PPTX exports."""

import logging
from pathlib import Path
from typing import Optional

from reportlab.lib import colors as rl_colors

from ..openai_provider import get_chat_deployment

logger = logging.getLogger(__name__)


# ============================================================================
# Color palettes
# ============================================================================

# Official City of Austin Brand Colors
# https://austin.gov/design/brand
COA_BRAND_COLORS = {
    # Official Palette
    "logo_blue": "#44499C",  # Primary - headers, titles, accents
    "logo_green": "#009F4D",  # Secondary - highlights, positive indicators
    "faded_white": "#f7f6f5",  # Backgrounds
    # Supporting Palette
    "dark_blue": "#22254E",  # Emphasis text
    "dark_green": "#005027",
    "light_blue": "#dcf2fd",  # Subtle backgrounds
    "light_green": "#dff0e3",  # Callout boxes
    # Extended Palette
    "red": "#F83125",  # Risks, concerns
    "orange": "#FF8F00",
    "yellow": "#FFC600",
    "cyan": "#009CDE",
    "dark_gray": "#636262",  # Body text
    "black": "#000000",
}

# Foresight branding colors - mapped to City of Austin brand
FORESIGHT_COLORS = {
    "primary": COA_BRAND_COLORS["logo_blue"],  # Official Logo Blue
    "secondary": COA_BRAND_COLORS["logo_green"],  # Official Logo Green
    "accent": COA_BRAND_COLORS["cyan"],  # Cyan accent
    "success": COA_BRAND_COLORS["logo_green"],  # Green for positive metrics
    "warning": COA_BRAND_COLORS["yellow"],  # Yellow for warnings
    "danger": COA_BRAND_COLORS["red"],  # Red for negative/risk
    "light": COA_BRAND_COLORS["faded_white"],  # Light background
    "dark": COA_BRAND_COLORS["dark_gray"],  # Dark text
}

# Score colors for charts - using COA brand palette
SCORE_COLORS = {
    "Novelty": COA_BRAND_COLORS["cyan"],
    "Maturity": COA_BRAND_COLORS["logo_green"],
    "Impact": COA_BRAND_COLORS["logo_blue"],
    "Relevance": COA_BRAND_COLORS["yellow"],
    "Velocity": COA_BRAND_COLORS["orange"],
    "Risk": COA_BRAND_COLORS["red"],
    "Opportunity": COA_BRAND_COLORS["dark_blue"],
}


# ============================================================================
# ReportLab color conversion + derived PDF palette
# ============================================================================


def hex_to_rl_color(hex_color: str) -> rl_colors.Color:
    """Convert hex color string to ReportLab Color object."""
    hex_color = hex_color.lstrip("#")
    r = int(hex_color[:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    return rl_colors.Color(r, g, b)


# PDF color palette using Foresight colors
PDF_COLORS = {
    "primary": hex_to_rl_color(FORESIGHT_COLORS["primary"]),
    "secondary": hex_to_rl_color(FORESIGHT_COLORS["secondary"]),
    "accent": hex_to_rl_color(FORESIGHT_COLORS["accent"]),
    "success": hex_to_rl_color(FORESIGHT_COLORS["success"]),
    "warning": hex_to_rl_color(FORESIGHT_COLORS["warning"]),
    "danger": hex_to_rl_color(FORESIGHT_COLORS["danger"]),
    "light": hex_to_rl_color(FORESIGHT_COLORS["light"]),
    "dark": hex_to_rl_color(FORESIGHT_COLORS["dark"]),
}


# ============================================================================
# Classification Taxonomy (Pillars, Horizons, Stages)
# ============================================================================

# Pillar colors matching the frontend
PILLAR_COLORS = {
    "CH": {
        "name": "Community Health & Sustainability",
        "color": "#22c55e",
        "bg": "#dcfce7",
        "icon": "♥",
    },
    "EW": {
        "name": "Economic & Workforce Development",
        "color": "#3b82f6",
        "bg": "#dbeafe",
        "icon": "💼",
    },
    "HG": {
        "name": "High-Performing Government",
        "color": "#6366f1",
        "bg": "#e0e7ff",
        "icon": "🏛",
    },
    "HH": {
        "name": "Homelessness & Housing",
        "color": "#ec4899",
        "bg": "#fce7f3",
        "icon": "🏠",
    },
    "MC": {
        "name": "Mobility & Critical Infrastructure",
        "color": "#f59e0b",
        "bg": "#fef3c7",
        "icon": "🚗",
    },
    "PS": {"name": "Public Safety", "color": "#ef4444", "bg": "#fee2e2", "icon": "🛡"},
    "ES": {
        "name": "Environmental Sustainability",
        "color": "#059669",
        "bg": "#d1fae5",
        "icon": "🌿",
    },
}

# Horizon colors matching the frontend
HORIZON_COLORS = {
    "H1": {
        "name": "Mainstream",
        "timeframe": "0-3 years",
        "color": "#22c55e",
        "bg": "#dcfce7",
        "description": "Current system, confirms baseline",
    },
    "H2": {
        "name": "Transitional",
        "timeframe": "3-7 years",
        "color": "#f59e0b",
        "bg": "#fef3c7",
        "description": "Emerging alternatives, pilots",
    },
    "H3": {
        "name": "Transformative",
        "timeframe": "7-15+ years",
        "color": "#a855f7",
        "bg": "#f3e8ff",
        "description": "Weak signals, novel possibilities",
    },
}

# Stage definitions matching the frontend
STAGE_INFO = {
    1: {
        "name": "Concept",
        "horizon": "H3",
        "description": "Academic research, theoretical exploration",
    },
    2: {
        "name": "Emerging",
        "horizon": "H3",
        "description": "Startups forming, patents filed",
    },
    3: {"name": "Prototype", "horizon": "H2", "description": "Working demos exist"},
    4: {
        "name": "Pilot",
        "horizon": "H2",
        "description": "Real-world testing (private sector)",
    },
    5: {
        "name": "Municipal Pilot",
        "horizon": "H2",
        "description": "Government entity testing",
    },
    6: {
        "name": "Early Adoption",
        "horizon": "H1",
        "description": "Multiple cities implementing",
    },
    7: {"name": "Mainstream", "horizon": "H1", "description": "Widespread adoption"},
    8: {"name": "Mature", "horizon": "H1", "description": "Established, commoditized"},
}


# ============================================================================
# Branding Assets & AI Disclosure
# ============================================================================


def _get_logo_path() -> Optional[str]:
    """Get the path to the City of Austin logo, checking multiple locations."""
    # Check relative to this file's location: app/export/branding.py -> backend/ -> project root
    base_dir = Path(__file__).parent.parent.parent.parent
    possible_paths = [
        base_dir / "branding" / "COA-Logo-Horizontal-Official-RGB.png",
        base_dir / "branding" / "COA-Icon-Official-RGB.png",
        Path(
            "/app/branding/COA-Logo-Horizontal-Official-RGB.png"
        ),  # Railway deployment
        Path("/app/branding/COA-Icon-Official-RGB.png"),  # Railway deployment fallback
    ]

    for path in possible_paths:
        if path.exists():
            return str(path)

    logger.warning("City of Austin logo not found in expected locations")
    return None


COA_LOGO_PATH = _get_logo_path()

# AI Technology Disclosure - transparent listing of all AI systems used.
# Model name is sourced from openai_provider so disclosures track the live tier
# config and don't drift on model rotations (see CLAUDE.md: "model selection
# goes through openai_provider.py — never hardcode model names").
AI_TECHNOLOGY_DISCLOSURE = f"""
AI-Powered Research & Analysis Platform

This strategic intelligence report was generated using advanced artificial intelligence technologies:

• OpenAI {get_chat_deployment()} - Strategic analysis, synthesis, classification, and report generation
• GPT Researcher - Autonomous deep research orchestration
• SearXNG and Serper - Web search aggregation
• trafilatura - Article extraction from source URLs

The City of Austin is committed to transparent and responsible use of AI technology
in public service. All AI-generated content is reviewed for accuracy and relevance
to municipal government operations.
""".strip()

# Shorter disclosure for footer
AI_DISCLOSURE_SHORT = (
    "Generated by Foresight Strategic Intelligence Platform | "
    f"AI Technologies: OpenAI {get_chat_deployment()}, GPT Researcher, SearXNG, Serper"
)
