"""Pure text- and vector-similarity helpers for the discovery pipeline.

Extracted from ``discovery_service`` in PR-D2 so future per-stage modules
(triage / dedup / fetch) can pull these without importing the 4k-line
``discovery_service`` and its ``DiscoveryService`` class.

These functions are intentionally dependency-free (no Supabase, no OpenAI,
no logger) — they take primitive inputs and return primitive outputs.
"""

from __future__ import annotations

import re
from typing import List


def calculate_name_similarity(name1: str, name2: str) -> float:
    """Fuzzy similarity score between two card/concept names.

    Uses a tiered comparison: exact-match → substring-containment →
    Jaccard word-overlap. Names are normalized (lowercase, punctuation
    stripped, whitespace collapsed) before comparison.

    Returns:
        A score in ``[0.0, 1.0]``; ``1.0`` is an exact normalized match.
    """
    if not name1 or not name2:
        return 0.0

    def normalize(s: str) -> str:
        s = s.lower().strip()
        s = re.sub(r"[^\w\s]", "", s)
        return " ".join(s.split())

    n1 = normalize(name1)
    n2 = normalize(name2)

    if n1 == n2:
        return 1.0

    if n1 in n2 or n2 in n1:
        shorter = min(len(n1), len(n2))
        longer = max(len(n1), len(n2))
        return shorter / longer if longer > 0 else 0.0

    words1 = set(n1.split())
    words2 = set(n2.split())

    if not words1 or not words2:
        return 0.0

    intersection = words1 & words2
    union = words1 | words2
    return len(intersection) / len(union) if union else 0.0


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Cosine similarity between two embedding vectors.

    Pure-Python fallback used when the pgvector RPC path fails (e.g.
    extension schema issues). Returns 0.0 for mismatched / empty /
    zero-magnitude inputs rather than raising.

    Returns:
        Cosine similarity in ``[0.0, 1.0]``.
    """
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0

    dot_product = sum(a * b for a, b in zip(vec1, vec2))
    magnitude1 = sum(a * a for a in vec1) ** 0.5
    magnitude2 = sum(b * b for b in vec2) ** 0.5

    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0

    return dot_product / (magnitude1 * magnitude2)
