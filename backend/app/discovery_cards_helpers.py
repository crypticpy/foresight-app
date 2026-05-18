"""Pure helpers for the discovery cards stage.

Extracted from ``discovery_service`` in PR-D11a. These two helpers feed
the card creation/enrichment stage (Step 7 of the run pipeline) but are
themselves stateless and side-effect free — they only inspect
``ProcessedSource`` attributes and apply similarity math, so they live
in their own module so the larger ``discovery_cards`` extraction
(PR-D11b/c) can import them without dragging in the persistence path.

Functions are pure: no Supabase, no AI calls, no I/O. They take their
inputs as explicit arguments and return their result; per-source logging
is the only side effect.
"""

from __future__ import annotations

import logging
from typing import List

from .discovery_config import DiscoveryConfig
from .discovery_text_utils import calculate_name_similarity, cosine_similarity
from .research_service import ProcessedSource

logger = logging.getLogger(__name__)


def calculate_discovery_confidence(source: ProcessedSource) -> float:
    """
    Calculate confidence score for a discovered source.

    Combines triage confidence and the analysis credibility / relevance
    / novelty scores into a single 0..1 value. Sources without an
    analysis attached return ``0.5`` (neutral).

    Args:
        source: Processed source

    Returns:
        Confidence score between 0 and 1
    """
    if not source.analysis:
        return 0.5

    # Weight different factors
    triage_weight = 0.2
    credibility_weight = 0.3
    relevance_weight = 0.3
    novelty_weight = 0.2

    # Normalize scores (credibility, relevance, novelty are 1-5 scale)
    triage_score = source.triage.confidence if source.triage else 0.5
    credibility_score = (source.analysis.credibility - 1) / 4  # Convert 1-5 to 0-1
    relevance_score = (source.analysis.relevance - 1) / 4
    novelty_score = (source.analysis.novelty - 1) / 4

    confidence = (
        triage_score * triage_weight
        + credibility_score * credibility_weight
        + relevance_score * relevance_weight
        + novelty_score * novelty_weight
    )

    return min(max(confidence, 0.0), 1.0)


def cluster_similar_concepts(
    sources: List[ProcessedSource], config: DiscoveryConfig
) -> List[List[ProcessedSource]]:
    """
    Cluster similar new concepts to avoid creating near-duplicate cards.

    Uses a two-tier approach:
    1. Embedding cosine similarity (semantic meaning) — primary signal
    2. Name similarity (word overlap) — fallback when embeddings are missing

    This prevents the situation where 5 sources about "AI in healthcare"
    create 5 different cards instead of 1 card with 5 sources.

    Args:
        sources: List of new concept sources to cluster
        config: Discovery configuration with thresholds

    Returns:
        List of clusters, where each cluster is a list of sources
    """
    if not sources:
        return []

    # Use a simple greedy clustering approach
    clusters: List[List[ProcessedSource]] = []
    used = set()

    # Threshold for embedding-based clustering (lower than dedup's 0.85
    # to catch topically-related articles that aren't exact duplicates)
    EMBEDDING_CLUSTER_THRESHOLD = 0.80
    NAME_CLUSTER_THRESHOLD = 0.6

    # Sort by confidence (highest first) to pick best source as cluster representative
    sorted_sources = sorted(
        sources, key=calculate_discovery_confidence, reverse=True
    )

    for source in sorted_sources:
        if id(source) in used:
            continue

        # Start a new cluster with this source
        cluster = [source]
        used.add(id(source))

        source_name = source.analysis.suggested_card_name if source.analysis else ""
        source_embedding = source.embedding if source.embedding else None

        if not source_name and not source_embedding:
            clusters.append(cluster)
            continue

        # Find similar sources to add to this cluster
        for other in sorted_sources:
            if id(other) in used:
                continue

            matched = False
            match_reason = ""
            match_score = 0.0

            # Tier 1: Embedding cosine similarity (semantic)
            other_embedding = other.embedding if other.embedding else None
            if source_embedding and other_embedding:
                sim = cosine_similarity(source_embedding, other_embedding)
                if sim >= EMBEDDING_CLUSTER_THRESHOLD:
                    matched = True
                    match_reason = "embedding"
                    match_score = sim

            # Tier 2: Name similarity fallback (when embeddings unavailable)
            if not matched:
                other_name = (
                    other.analysis.suggested_card_name if other.analysis else ""
                )
                if source_name and other_name:
                    name_sim = calculate_name_similarity(source_name, other_name)
                    if name_sim >= NAME_CLUSTER_THRESHOLD:
                        matched = True
                        match_reason = "name"
                        match_score = name_sim

            if matched:
                cluster.append(other)
                used.add(id(other))
                other_name = (
                    other.analysis.suggested_card_name
                    if other.analysis
                    else other.raw.title[:40]
                )
                logger.info(
                    f"Clustered '{other_name}' with '{source_name}' "
                    f"({match_reason} similarity: {match_score:.2f})"
                )

        clusters.append(cluster)

    return clusters
