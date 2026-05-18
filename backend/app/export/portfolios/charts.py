"""Matplotlib chart generators specific to portfolio exports.

Renders portfolio-level comparison and priority-matrix charts to temp PNGs and
returns the file paths. Callers are responsible for cleanup via
``export.utils.cleanup_temp_files``.
"""

import logging
import tempfile
from typing import List, Optional

import matplotlib

matplotlib.use("Agg")  # Non-GUI backend - must be set before importing pyplot
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from ...gamma_service import PILLAR_DEFINITIONS
from ..branding import COA_BRAND_COLORS
from ..charts import CHART_DPI

logger = logging.getLogger(__name__)


def generate_portfolio_comparison_chart(
    briefs: List, dpi: int = CHART_DPI  # List of PortfolioBrief
) -> Optional[str]:
    """Generate a grouped bar chart comparing impact/relevance/velocity scores."""
    fig = None
    try:
        valid_briefs = [
            b
            for b in briefs
            if (
                b.impact_score is not None
                or b.relevance_score is not None
                or b.velocity_score is not None
            )
        ]

        if not valid_briefs:
            return None

        fig, ax = plt.subplots(figsize=(10, 6))

        names = [
            f"{b.card_name[:25]}..." if len(b.card_name) > 25 else b.card_name
            for b in valid_briefs
        ]
        impacts = [b.impact_score or 0 for b in valid_briefs]
        relevances = [b.relevance_score or 0 for b in valid_briefs]
        velocities = [b.velocity_score or 0 for b in valid_briefs]

        x = np.arange(len(names))
        width = 0.25

        ax.bar(
            x - width,
            impacts,
            width,
            label="Impact",
            color=COA_BRAND_COLORS["logo_blue"],
        )
        ax.bar(
            x,
            relevances,
            width,
            label="Relevance",
            color=COA_BRAND_COLORS["logo_green"],
        )
        ax.bar(
            x + width,
            velocities,
            width,
            label="Velocity",
            color=COA_BRAND_COLORS["dark_blue"],
        )

        ax.set_ylabel("Score (0-100)", fontsize=11)
        ax.set_title(
            "Portfolio Score Comparison",
            fontsize=14,
            fontweight="bold",
            color=COA_BRAND_COLORS["dark_blue"],
        )
        ax.set_xticks(x)
        ax.set_xticklabels(names, rotation=45, ha="right", fontsize=9)
        ax.legend(loc="upper right")
        ax.set_ylim(0, 110)

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.yaxis.grid(True, linestyle="--", alpha=0.3)

        plt.tight_layout()

        with tempfile.NamedTemporaryFile(
            suffix=".png", delete=False, prefix="foresight_portfolio_comparison_"
        ) as temp_file:
            temp_path = temp_file.name
        fig.savefig(temp_path, dpi=dpi, bbox_inches="tight", facecolor="white")

        return temp_path

    except Exception as e:
        logger.error(f"Error generating portfolio comparison chart: {e}")
        return None
    finally:
        # Close only this figure, not all figures, so concurrent chart
        # generation on other threads/coroutines isn't disturbed.
        if fig is not None:
            plt.close(fig)


def generate_priority_matrix_chart(
    briefs: List,  # List of PortfolioBrief
    synthesis,  # PortfolioSynthesisData
    dpi: int = CHART_DPI,
) -> Optional[str]:
    """Generate a visual 2x2 priority matrix chart placing cards by quadrant."""
    fig = None
    try:
        matrix = synthesis.priority_matrix or {}
        urgent = set(matrix.get("high_impact_urgent") or [])
        strategic = set(matrix.get("high_impact_strategic") or [])
        monitor = set(matrix.get("monitor") or [])

        fig, ax = plt.subplots(figsize=(10, 8))

        # Quadrant backgrounds
        ax.fill(
            [0, 50, 50, 0], [50, 50, 100, 100], color="#FEE2E2", alpha=0.5
        )  # Urgent - top left
        ax.fill(
            [50, 100, 100, 50], [50, 50, 100, 100], color="#FEF3C7", alpha=0.5
        )  # Strategic - top right
        ax.fill(
            [0, 50, 50, 0], [0, 0, 50, 50], color="#DBEAFE", alpha=0.5
        )  # Monitor - bottom left
        ax.fill(
            [50, 100, 100, 50], [0, 0, 50, 50], color="#D1FAE5", alpha=0.5
        )  # Low priority - bottom right

        # Quadrant labels
        ax.text(
            25,
            95,
            "🔴 URGENT ACTION",
            ha="center",
            va="top",
            fontsize=12,
            fontweight="bold",
            color="#DC2626",
        )
        ax.text(
            75,
            95,
            "🟡 STRATEGIC PLANNING",
            ha="center",
            va="top",
            fontsize=12,
            fontweight="bold",
            color="#D97706",
        )
        ax.text(
            25,
            5,
            "🔵 MONITOR",
            ha="center",
            va="bottom",
            fontsize=12,
            fontweight="bold",
            color="#2563EB",
        )
        ax.text(
            75,
            5,
            "🟢 EVALUATE",
            ha="center",
            va="bottom",
            fontsize=12,
            fontweight="bold",
            color="#059669",
        )

        for i, brief in enumerate(briefs):
            name = brief.card_name
            if name in urgent:
                x = 10 + (i % 3) * 12
                y = 70 + (i // 3) * 8
            elif name in strategic:
                x = 60 + (i % 3) * 12
                y = 70 + (i // 3) * 8
            elif name in monitor:
                x = 10 + (i % 3) * 12
                y = 25 + (i // 3) * 8
            else:
                x = 60 + (i % 3) * 12
                y = 25 + (i // 3) * 8

            pillar_def = PILLAR_DEFINITIONS.get(
                brief.pillar_id.upper() if brief.pillar_id else "", {}
            )
            pillar_color = pillar_def.get("color", COA_BRAND_COLORS["logo_blue"])

            ax.scatter(
                x,
                y,
                s=200,
                c=pillar_color,
                edgecolors="white",
                linewidth=2,
                zorder=5,
            )

            short_name = f"{name[:18]}.." if len(name) > 18 else name
            ax.annotate(
                short_name,
                (x, y),
                xytext=(0, -15),
                textcoords="offset points",
                ha="center",
                fontsize=8,
                color=COA_BRAND_COLORS["dark_blue"],
            )

        ax.axhline(y=50, color="gray", linewidth=2, linestyle="-", alpha=0.5)
        ax.axvline(x=50, color="gray", linewidth=2, linestyle="-", alpha=0.5)

        ax.set_xlabel(
            "← Lower Urgency          Higher Urgency →", fontsize=11, color="gray"
        )
        ax.set_ylabel(
            "← Lower Impact          Higher Impact →", fontsize=11, color="gray"
        )
        ax.set_title(
            "Strategic Priority Matrix",
            fontsize=14,
            fontweight="bold",
            color=COA_BRAND_COLORS["dark_blue"],
            pad=20,
        )

        ax.set_xlim(0, 100)
        ax.set_ylim(0, 100)
        ax.set_xticks([])
        ax.set_yticks([])

        for spine in ax.spines.values():
            spine.set_visible(False)

        plt.tight_layout()

        with tempfile.NamedTemporaryFile(
            suffix=".png", delete=False, prefix="foresight_priority_matrix_"
        ) as temp_file:
            temp_path = temp_file.name
        fig.savefig(temp_path, dpi=dpi, bbox_inches="tight", facecolor="white")

        return temp_path

    except Exception as e:
        logger.error(f"Error generating priority matrix chart: {e}")
        return None
    finally:
        # Close only this figure, not all figures, so concurrent chart
        # generation on other threads/coroutines isn't disturbed.
        if fig is not None:
            plt.close(fig)
