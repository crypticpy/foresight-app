"""Matplotlib chart generators used by PDF and PPTX exports.

All functions render to a temp PNG file and return its path (or None on
empty input). Callers are responsible for cleanup (see ``export.utils.cleanup_temp_files``).
"""

import logging
import tempfile
from typing import Dict, Optional

import matplotlib

matplotlib.use("Agg")  # Non-GUI backend - must be set before importing pyplot
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

from ..models.export import CardExportData
from .branding import FORESIGHT_COLORS, SCORE_COLORS

logger = logging.getLogger(__name__)


# Chart dimensions
CHART_DPI = 300
CHART_FIGURE_SIZE = (8, 6)
RADAR_FIGURE_SIZE = (8, 8)


def generate_score_chart(
    card_data: CardExportData, chart_type: str = "bar", dpi: int = CHART_DPI
) -> Optional[str]:
    """Generate a bar or radar chart of a card's scores.

    Returns the path to a temp PNG, or None if the card has no valid scores
    or rendering fails.
    """
    try:
        scores = card_data.get_all_scores()
        valid_scores = {k: v for k, v in scores.items() if v is not None}

        if not valid_scores:
            logger.warning(
                f"No valid scores for card {card_data.id}, skipping chart"
            )
            return None

        if chart_type == "radar":
            return generate_radar_chart(valid_scores, card_data.name, dpi)
        return generate_bar_chart(valid_scores, card_data.name, dpi)

    except Exception as e:
        logger.error(f"Error generating score chart: {e}")
        return None


def generate_bar_chart(scores: Dict[str, int], title: str, dpi: int) -> str:
    """Generate a horizontal bar chart of scores."""
    fig, ax = plt.subplots(figsize=CHART_FIGURE_SIZE)

    try:
        labels = list(scores.keys())
        values = list(scores.values())
        colors = [
            SCORE_COLORS.get(label, FORESIGHT_COLORS["primary"]) for label in labels
        ]

        y_pos = np.arange(len(labels))

        bars = ax.barh(y_pos, values, color=colors, edgecolor="white", height=0.6)

        for bar, value in zip(bars, values):
            width = bar.get_width()
            ax.text(
                width + 2,
                bar.get_y() + bar.get_height() / 2,
                f"{value}",
                va="center",
                ha="left",
                fontsize=10,
                fontweight="bold",
                color=FORESIGHT_COLORS["dark"],
            )

        ax.set_yticks(y_pos)
        ax.set_yticklabels(labels, fontsize=11)
        ax.set_xlim(0, 110)
        ax.set_xlabel("Score (0-100)", fontsize=11)
        ax.set_title(
            f"Scores: {title[:40]}...", fontsize=12, fontweight="bold", pad=15
        )

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.spines["bottom"].set_color(FORESIGHT_COLORS["light"])
        ax.spines["left"].set_color(FORESIGHT_COLORS["light"])

        ax.xaxis.grid(True, linestyle="--", alpha=0.3)
        ax.set_axisbelow(True)

        plt.tight_layout()

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".png", delete=False, prefix="foresight_chart_"
        )
        plt.savefig(temp_file.name, dpi=dpi, bbox_inches="tight", facecolor="white")

        return temp_file.name

    finally:
        plt.close(fig)  # CRITICAL: Prevent memory leaks


def generate_radar_chart(scores: Dict[str, int], title: str, dpi: int) -> str:
    """Generate a radar/spider chart of scores."""
    fig, ax = plt.subplots(figsize=RADAR_FIGURE_SIZE, subplot_kw=dict(polar=True))

    try:
        labels = list(scores.keys())
        values = list(scores.values())

        num_vars = len(labels)
        angles = [n / float(num_vars) * 2 * np.pi for n in range(num_vars)]
        angles += angles[:1]

        values_plot = values + values[:1]

        ax.plot(
            angles,
            values_plot,
            "o-",
            linewidth=2,
            color=FORESIGHT_COLORS["primary"],
        )
        ax.fill(
            angles, values_plot, alpha=0.25, color=FORESIGHT_COLORS["secondary"]
        )

        ax.set_xticks(angles[:-1])
        ax.set_xticklabels(labels, fontsize=11)

        ax.set_ylim(0, 100)
        ax.set_yticks([20, 40, 60, 80, 100])
        ax.set_yticklabels(
            ["20", "40", "60", "80", "100"], fontsize=9, color="gray"
        )

        ax.set_title(
            f"Score Profile: {title[:35]}...",
            fontsize=12,
            fontweight="bold",
            pad=20,
        )

        plt.tight_layout()

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".png", delete=False, prefix="foresight_radar_"
        )
        plt.savefig(temp_file.name, dpi=dpi, bbox_inches="tight", facecolor="white")

        return temp_file.name

    finally:
        plt.close(fig)


def generate_pillar_distribution_chart(
    pillar_counts: Dict[str, int],
    title: str = "Pillar Distribution",
    dpi: int = CHART_DPI,
) -> Optional[str]:
    """Generate a donut chart showing distribution of cards across pillars.

    Returns None when ``pillar_counts`` is empty.
    """
    if not pillar_counts:
        logger.warning("No pillar data for distribution chart")
        return None

    fig, ax = plt.subplots(figsize=CHART_FIGURE_SIZE)

    try:
        labels = list(pillar_counts.keys())
        values = list(pillar_counts.values())

        colors = plt.cm.Set2(np.linspace(0, 1, len(labels)))

        wedges, texts, autotexts = ax.pie(
            values,
            labels=labels,
            autopct="%1.1f%%",
            colors=colors,
            pctdistance=0.75,
            wedgeprops=dict(width=0.5, edgecolor="white"),
            textprops={"fontsize": 10},
        )

        for autotext in autotexts:
            autotext.set_fontsize(9)
            autotext.set_fontweight("bold")

        ax.set_title(title, fontsize=12, fontweight="bold", pad=15)

        ax.legend(
            wedges,
            [f"{label} ({value})" for label, value in zip(labels, values)],
            title="Pillars",
            loc="center left",
            bbox_to_anchor=(1, 0, 0.5, 1),
            fontsize=9,
        )

        plt.tight_layout()

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".png", delete=False, prefix="foresight_pillar_"
        )
        plt.savefig(temp_file.name, dpi=dpi, bbox_inches="tight", facecolor="white")

        return temp_file.name

    finally:
        plt.close(fig)


def generate_horizon_distribution_chart(
    horizon_counts: Dict[str, int],
    title: str = "Horizon Distribution",
    dpi: int = CHART_DPI,
) -> Optional[str]:
    """Generate a bar chart showing distribution of cards across horizons.

    Returns None when ``horizon_counts`` is empty.
    """
    if not horizon_counts:
        logger.warning("No horizon data for distribution chart")
        return None

    fig, ax = plt.subplots(figsize=(6, 4))

    try:
        horizon_order = ["H1", "H2", "H3"]
        labels = []
        values = []

        for h in horizon_order:
            if h in horizon_counts:
                labels.append(h)
                values.append(horizon_counts[h])

        for h, v in horizon_counts.items():
            if h not in horizon_order:
                labels.append(h)
                values.append(v)

        horizon_colors = {
            "H1": FORESIGHT_COLORS["success"],
            "H2": FORESIGHT_COLORS["warning"],
            "H3": FORESIGHT_COLORS["secondary"],
        }
        colors = [
            horizon_colors.get(label, FORESIGHT_COLORS["primary"])
            for label in labels
        ]

        x_pos = np.arange(len(labels))
        bars = ax.bar(x_pos, values, color=colors, edgecolor="white", width=0.6)

        for bar, value in zip(bars, values):
            height = bar.get_height()
            ax.text(
                bar.get_x() + bar.get_width() / 2,
                height + 0.5,
                f"{value}",
                ha="center",
                va="bottom",
                fontsize=11,
                fontweight="bold",
            )

        ax.set_xticks(x_pos)
        ax.set_xticklabels(labels, fontsize=12, fontweight="bold")
        ax.set_ylabel("Number of Cards", fontsize=11)
        ax.set_title(title, fontsize=12, fontweight="bold", pad=15)

        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.yaxis.grid(True, linestyle="--", alpha=0.3)
        ax.set_axisbelow(True)

        plt.tight_layout()

        temp_file = tempfile.NamedTemporaryFile(
            suffix=".png", delete=False, prefix="foresight_horizon_"
        )
        plt.savefig(temp_file.name, dpi=dpi, bbox_inches="tight", facecolor="white")

        return temp_file.name

    finally:
        plt.close(fig)
