"""Portfolio export generators (PDF + PPTX) plus their helpers.

Submodules:
- extractors: Pull "key takeaways" bullets and "other-city example" phrases
  out of brief markdown for deep-dive slide content.
- charts: Portfolio-specific matplotlib charts (score comparison, 2x2 priority
  matrix). Per-card score charts come from ``export.charts``.
- slides: PPTX slide builders for the portfolio dashboard and per-card deep
  dives (overview + key insights).
- pptx: Local python-pptx generator for the full multi-card portfolio deck.
- pdf: ReportLab generator for the detailed portfolio PDF.
"""

from .charts import (
    generate_portfolio_comparison_chart,
    generate_priority_matrix_chart,
)
from .extractors import extract_city_examples, extract_key_takeaways
from .pdf import generate_portfolio_pdf
from .pptx import generate_portfolio_pptx_local
from .slides import add_card_deep_dive_slides, add_portfolio_dashboard_slide

__all__ = [
    "add_card_deep_dive_slides",
    "add_portfolio_dashboard_slide",
    "extract_city_examples",
    "extract_key_takeaways",
    "generate_portfolio_comparison_chart",
    "generate_portfolio_pdf",
    "generate_portfolio_pptx_local",
    "generate_priority_matrix_chart",
]
