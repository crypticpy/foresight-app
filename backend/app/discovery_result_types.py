"""Result dataclasses and status enums for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D3 so future per-stage modules
(triage / dedup / fetch / cards) can produce/consume these types without
importing the 3k-line ``DiscoveryService`` class.

These types are intentionally pure data — they hold counts, timing, and
references, and provide small helpers (``compute()``, ``log_metrics()``,
``to_dict()``, ``add_tokens()``). They do not own any Supabase, OpenAI,
or HTTP client.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from .research_service import ProcessedSource, RawSource


class DiscoveryStatus(Enum):
    """Status of a discovery run."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CardAction(Enum):
    """Action taken for a source during discovery."""

    CREATED = "created"  # New card created
    ENRICHED = "enriched"  # Added to existing card
    AUTO_APPROVED = "auto_approved"  # New card auto-approved
    PENDING_REVIEW = "pending_review"  # Awaiting human review
    DUPLICATE = "duplicate"  # Duplicate of existing source
    BLOCKED = "blocked"  # Matched blocked topic
    FILTERED = "filtered"  # Filtered by triage


@dataclass
class DeduplicationResult:
    """Result of deduplication process."""

    unique_sources: List[ProcessedSource]
    duplicate_count: int
    enrichment_candidates: List[
        Tuple[ProcessedSource, str, float]
    ]  # (source, card_id, similarity)
    new_concept_candidates: List[ProcessedSource]


@dataclass
class CardActionResult:
    """Result of card creation/enrichment."""

    cards_created: List[str]
    cards_enriched: List[str]
    sources_added: int
    auto_approved: int
    pending_review: int
    story_cluster_count: int = 0


@dataclass
class SourceDiversityMetrics:
    """
    Comprehensive source diversity metrics for observability.

    Tracks multiple dimensions of diversity to ensure balanced content ingestion
    across all 5 source categories.
    """

    # Category distribution
    sources_by_category: Dict[str, int]
    total_sources: int
    categories_fetched: int  # Number of categories that contributed sources

    # Diversity scores (0-1 scale, higher = more diverse)
    category_coverage: float  # Percentage of categories with sources
    balance_score: float  # How evenly distributed sources are
    shannon_entropy: float  # Information-theoretic diversity measure

    # Category-level details
    dominant_category: Optional[str] = None
    underrepresented_categories: List[str] = field(default_factory=list)

    @classmethod
    def compute(cls, sources_by_category: Dict[str, int]) -> "SourceDiversityMetrics":
        """
        Compute diversity metrics from source category counts.

        Args:
            sources_by_category: Count of sources per category

        Returns:
            SourceDiversityMetrics with all computed values
        """
        total = sum(sources_by_category.values())
        active_categories = [
            cat for cat, count in sources_by_category.items() if count > 0
        ]
        num_active = len(active_categories)
        num_total_categories = 5  # Total number of source categories

        # Category coverage (0-1)
        category_coverage = (
            num_active / num_total_categories if num_total_categories > 0 else 0.0
        )

        # Balance score: 1 - normalized standard deviation
        # Perfect balance = 1.0, all in one category = 0.0
        if total > 0 and num_active > 0:
            mean_per_category = total / num_total_categories
            variance = (
                sum(
                    (count - mean_per_category) ** 2
                    for count in sources_by_category.values()
                )
                / num_total_categories
            )
            std_dev = math.sqrt(variance)
            max_std_dev = mean_per_category * math.sqrt(
                num_total_categories - 1
            )  # Worst case: all in one category
            balance_score = 1.0 - (std_dev / max_std_dev) if max_std_dev > 0 else 1.0
        else:
            balance_score = 0.0

        # Shannon entropy (normalized to 0-1)
        # H = -sum(p * log(p)) / log(n) where n is number of categories
        if total > 0 and num_active > 1:
            entropy = 0.0
            for count in sources_by_category.values():
                if count > 0:
                    p = count / total
                    entropy -= p * math.log(p)
            max_entropy = math.log(num_total_categories)
            shannon_entropy = entropy / max_entropy if max_entropy > 0 else 0.0
        else:
            shannon_entropy = 0.0

        # Find dominant and underrepresented categories
        dominant_category = None
        underrepresented = []

        if total > 0:
            max_count = max(sources_by_category.values())
            threshold = total / num_total_categories * 0.3  # 30% of expected average

            for cat, count in sources_by_category.items():
                if count == max_count and max_count > 0:
                    dominant_category = cat
                if count < threshold:
                    underrepresented.append(cat)

        return cls(
            sources_by_category=sources_by_category,
            total_sources=total,
            categories_fetched=num_active,
            category_coverage=round(category_coverage, 3),
            balance_score=round(balance_score, 3),
            shannon_entropy=round(shannon_entropy, 3),
            dominant_category=dominant_category,
            underrepresented_categories=underrepresented,
        )

    def log_metrics(self, logger_instance: logging.Logger) -> None:
        """Log diversity metrics for observability."""
        logger_instance.info(
            f"Source Diversity Metrics: "
            f"coverage={self.category_coverage:.1%}, "
            f"balance={self.balance_score:.2f}, "
            f"entropy={self.shannon_entropy:.2f}, "
            f"categories={self.categories_fetched}/5"
        )
        if self.underrepresented_categories:
            logger_instance.warning(
                f"Underrepresented source categories: {', '.join(self.underrepresented_categories)}"
            )

    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary for storage/API response."""
        return {
            "sources_by_category": self.sources_by_category,
            "total_sources": self.total_sources,
            "categories_fetched": self.categories_fetched,
            "category_coverage": self.category_coverage,
            "balance_score": self.balance_score,
            "shannon_entropy": self.shannon_entropy,
            "dominant_category": self.dominant_category,
            "underrepresented_categories": self.underrepresented_categories,
        }


@dataclass
class MultiSourceFetchResult:
    """Result of multi-source content fetching across all 5 categories."""

    sources: List[RawSource]
    sources_by_category: Dict[str, int]  # Count per category
    total_sources: int
    categories_fetched: int  # Number of categories that contributed sources
    fetch_time_seconds: float
    errors_by_category: Dict[str, List[str]]
    diversity_metrics: Optional[SourceDiversityMetrics] = None

    def __post_init__(self):
        """Compute diversity metrics after initialization."""
        if self.diversity_metrics is None and self.sources_by_category:
            self.diversity_metrics = SourceDiversityMetrics.compute(
                self.sources_by_category
            )

    @property
    def category_diversity(self) -> float:
        """Calculate diversity score (0-1) based on category distribution."""
        if self.total_sources == 0:
            return 0.0
        active_categories = sum(
            bool(count > 0) for count in self.sources_by_category.values()
        )
        return active_categories / 5.0  # 5 categories total


@dataclass
class ProcessingTimeMetrics:
    """
    Granular timing metrics for each pipeline phase.

    Provides observability into processing time distribution across
    the discovery pipeline for performance optimization and debugging.
    """

    query_generation_seconds: float = 0.0
    multi_source_fetch_seconds: float = 0.0
    query_search_seconds: float = 0.0
    triage_seconds: float = 0.0
    blocked_topic_check_seconds: float = 0.0
    deduplication_seconds: float = 0.0
    card_creation_seconds: float = 0.0
    total_seconds: float = 0.0

    def log_metrics(self, logger_instance: logging.Logger) -> None:
        """Log processing time metrics for observability."""
        logger_instance.info(
            f"Processing Time Breakdown: "
            f"query_gen={self.query_generation_seconds:.2f}s, "
            f"multi_source={self.multi_source_fetch_seconds:.2f}s, "
            f"query_search={self.query_search_seconds:.2f}s, "
            f"triage={self.triage_seconds:.2f}s, "
            f"block_check={self.blocked_topic_check_seconds:.2f}s, "
            f"dedup={self.deduplication_seconds:.2f}s, "
            f"card_create={self.card_creation_seconds:.2f}s, "
            f"total={self.total_seconds:.2f}s"
        )

    def to_dict(self) -> Dict[str, float]:
        """Convert metrics to dictionary for storage/API response."""
        return {
            "query_generation_seconds": self.query_generation_seconds,
            "multi_source_fetch_seconds": self.multi_source_fetch_seconds,
            "query_search_seconds": self.query_search_seconds,
            "triage_seconds": self.triage_seconds,
            "blocked_topic_check_seconds": self.blocked_topic_check_seconds,
            "deduplication_seconds": self.deduplication_seconds,
            "card_creation_seconds": self.card_creation_seconds,
            "total_seconds": self.total_seconds,
        }


@dataclass
class APITokenUsage:
    """
    Token usage metrics for API cost tracking.

    Tracks token consumption across different AI operations
    for cost monitoring and budget management.
    """

    triage_tokens: int = 0
    analysis_tokens: int = 0
    embedding_tokens: int = 0
    card_match_tokens: int = 0
    total_tokens: int = 0

    # Token costs (approximate, based on GPT-4 pricing)
    # These are rough estimates for monitoring purposes
    estimated_cost_usd: float = 0.0

    def add_tokens(self, operation: str, tokens: int) -> None:
        """Add tokens for a specific operation."""
        if operation == "triage":
            self.triage_tokens += tokens
        elif operation == "analysis":
            self.analysis_tokens += tokens
        elif operation == "embedding":
            self.embedding_tokens += tokens
        elif operation == "card_match":
            self.card_match_tokens += tokens
        self.total_tokens += tokens
        # Rough cost estimate: $0.03 per 1K tokens (GPT-4 average)
        self.estimated_cost_usd = self.total_tokens * 0.00003

    def log_metrics(self, logger_instance: logging.Logger) -> None:
        """Log API token usage metrics for observability."""
        logger_instance.info(
            f"API Token Usage: "
            f"triage={self.triage_tokens:,}, "
            f"analysis={self.analysis_tokens:,}, "
            f"embedding={self.embedding_tokens:,}, "
            f"card_match={self.card_match_tokens:,}, "
            f"total={self.total_tokens:,}, "
            f"est_cost=${self.estimated_cost_usd:.4f}"
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert metrics to dictionary for storage/API response."""
        return {
            "triage_tokens": self.triage_tokens,
            "analysis_tokens": self.analysis_tokens,
            "embedding_tokens": self.embedding_tokens,
            "card_match_tokens": self.card_match_tokens,
            "total_tokens": self.total_tokens,
            "estimated_cost_usd": self.estimated_cost_usd,
        }


@dataclass
class DiscoveryResult:
    """Complete result of a discovery run."""

    run_id: str
    status: DiscoveryStatus
    started_at: datetime
    completed_at: Optional[datetime]

    # Query stats
    queries_generated: int
    queries_executed: int

    # Source stats
    sources_discovered: int
    sources_triaged: int
    sources_blocked: int
    sources_duplicate: int

    # Multi-source category tracking
    sources_by_category: Dict[str, int] = field(default_factory=dict)
    categories_fetched: int = 0
    diversity_metrics: Optional[Dict[str, Any]] = None  # SourceDiversityMetrics as dict

    # Card stats
    cards_created: List[str] = field(default_factory=list)
    cards_enriched: List[str] = field(default_factory=list)
    sources_added: int = 0
    auto_approved: int = 0
    pending_review: int = 0

    # Cost and performance
    estimated_cost: float = 0.0
    execution_time_seconds: float = 0.0

    # Enhanced metrics (Phase 4)
    processing_time: Optional[Dict[str, float]] = None  # ProcessingTimeMetrics as dict
    api_token_usage: Optional[Dict[str, Any]] = None  # APITokenUsage as dict

    # Summary
    summary_report: Optional[str] = None
    errors: List[str] = field(default_factory=list)
