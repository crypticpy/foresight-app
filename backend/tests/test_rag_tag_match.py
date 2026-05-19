"""Tests for the community-tag retrieval leg added to RAGEngine (PR 6).

Covers:

- ``_tag_match_cards`` is global-only — signal and workstream scopes return
  empty without hitting the RPC.
- Cards surfaced only by the tag leg are appended to the merged result list
  with their ``matched_tags`` annotation.
- Cards already present in the hybrid result keep their original score and
  pick up the matched-tag annotation.
- ``_assemble_context`` renders a ``Community tags matched:`` line when the
  card carries ``matched_tags``.
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest

from app.rag_engine import RAGEngine


def _run(coro):
    """Drive a coroutine to completion without requiring pytest-asyncio."""
    return asyncio.run(coro)


class _Resp:
    def __init__(self, data: Any):
        self.data = data


class _RpcRecorder:
    """Records every ``supabase.rpc(...)`` call for assertions."""

    def __init__(self) -> None:
        self.calls: List[Dict[str, Any]] = []
        self.next_response: Any = []

    def rpc(self, name: str, params: Dict[str, Any]):
        self.calls.append({"name": name, "params": params})
        response_data = self.next_response

        class _Exec:
            def execute(self_inner):
                return _Resp(response_data)

        return _Exec()


# ---------------------------------------------------------------------------
# _tag_match_cards — scope gating + RPC shape
# ---------------------------------------------------------------------------


def test_tag_match_skipped_for_signal_scope():
    recorder = _RpcRecorder()
    engine = RAGEngine(recorder)
    result = _run(engine._tag_match_cards("anything", scope="signal"))
    assert result == []
    assert recorder.calls == []  # RPC must not fire


def test_tag_match_skipped_for_workstream_scope():
    recorder = _RpcRecorder()
    engine = RAGEngine(recorder)
    result = _run(engine._tag_match_cards("anything", scope="workstream"))
    assert result == []
    assert recorder.calls == []


def test_tag_match_skipped_for_blank_query():
    recorder = _RpcRecorder()
    engine = RAGEngine(recorder)
    result = _run(engine._tag_match_cards("   ", scope="global"))
    assert result == []
    assert recorder.calls == []


def test_tag_match_reshapes_rpc_rows_to_card_dicts():
    recorder = _RpcRecorder()
    recorder.next_response = [
        {
            "card_id": "card-1",
            "name": "Heat Pumps",
            "slug": "heat-pumps",
            "summary": "Residential heat pump adoption.",
            "description": "Detailed description here.",
            "pillar_id": "CH",
            "horizon": "H2",
            "stage_id": "pilot",
            "impact_score": 80,
            "relevance_score": 70,
            "velocity_score": 60,
            "risk_score": 30,
            "signal_quality_score": 85,
            "matched_tag_labels": ["Climate Resilience", "Decarbonization"],
            "tag_match_score": 0.72,
        }
    ]
    engine = RAGEngine(recorder)
    result = _run(engine._tag_match_cards("climate", scope="global"))
    assert recorder.calls == [
        {
            "name": "tag_match_cards",
            "params": {"p_query": "climate", "p_limit": 10},
        }
    ]
    assert len(result) == 1
    row = result[0]
    assert row["id"] == "card-1"
    assert row["name"] == "Heat Pumps"
    assert row["rrf_score"] == pytest.approx(0.72)
    assert row["matched_tags"] == ["Climate Resilience", "Decarbonization"]
    # The leg synthesizes zero values for FTS/vector so downstream code can
    # treat tag-only matches as the same shape as hybrid_search_cards rows.
    assert row["fts_rank"] == 0.0
    assert row["vector_similarity"] == 0.0


# ---------------------------------------------------------------------------
# _merge_tag_matches — dedupe + annotation
# ---------------------------------------------------------------------------


def test_merge_tag_matches_appends_tag_only_cards():
    hybrid = [
        {"id": "card-A", "name": "A", "rrf_score": 0.9},
    ]
    tag_cards = [
        {
            "id": "card-B",
            "name": "B",
            "rrf_score": 0.55,
            "matched_tags": ["X"],
        }
    ]
    merged = RAGEngine._merge_tag_matches(hybrid, tag_cards)
    assert [c["id"] for c in merged] == ["card-A", "card-B"]
    # Tag-only card preserves matched_tags and its tag-similarity rrf_score.
    assert merged[1]["matched_tags"] == ["X"]
    assert merged[1]["rrf_score"] == pytest.approx(0.55)


def test_merge_tag_matches_annotates_overlapping_card():
    hybrid = [
        {"id": "card-A", "name": "A", "rrf_score": 0.9, "fts_rank": 1.2},
    ]
    tag_cards = [
        {
            "id": "card-A",
            "name": "A",
            "rrf_score": 0.4,
            "matched_tags": ["X", "Y"],
        }
    ]
    merged = RAGEngine._merge_tag_matches(hybrid, tag_cards)
    # Card-A appears exactly once with the original hybrid scores intact —
    # the tag leg's rrf_score does not overwrite the stronger hybrid score.
    assert len(merged) == 1
    assert merged[0]["id"] == "card-A"
    assert merged[0]["rrf_score"] == pytest.approx(0.9)
    assert merged[0]["fts_rank"] == pytest.approx(1.2)
    assert merged[0]["matched_tags"] == ["X", "Y"]


def test_merge_tag_matches_drops_rows_with_missing_id():
    hybrid = [{"id": "card-A", "name": "A"}]
    tag_cards = [{"name": "no-id-row"}, {"id": "card-B", "name": "B"}]
    merged = RAGEngine._merge_tag_matches(hybrid, tag_cards)
    assert [c["id"] for c in merged] == ["card-A", "card-B"]


# ---------------------------------------------------------------------------
# _assemble_context renders matched_tags
# ---------------------------------------------------------------------------


def test_assemble_context_renders_matched_tags_line():
    engine = RAGEngine(_RpcRecorder())
    cards = [
        {
            "id": "card-A",
            "name": "Heat Pumps",
            "slug": "heat-pumps",
            "summary": "Residential heat pump adoption.",
            "pillar_id": "CH",
            "horizon": "H2",
            "stage_id": "pilot",
            "rrf_score": 0.8,
            "matched_tags": ["Climate Resilience", "Decarbonization"],
        }
    ]
    text, meta = engine._assemble_context(
        scope="global",
        scope_id=None,
        cards=cards,
        sources=[],
        enrichment={},
        mentions=[],
        max_chars=10_000,
    )
    assert "Community tags matched: Climate Resilience, Decarbonization" in text
    assert meta["matched_cards"] == 1


def test_assemble_context_no_tags_line_when_matched_tags_absent():
    engine = RAGEngine(_RpcRecorder())
    cards = [
        {
            "id": "card-A",
            "name": "Untagged",
            "summary": "—",
            "pillar_id": "EW",
            "rrf_score": 0.6,
        }
    ]
    text, _meta = engine._assemble_context(
        scope="global",
        scope_id=None,
        cards=cards,
        sources=[],
        enrichment={},
        mentions=[],
        max_chars=10_000,
    )
    assert "Community tags matched" not in text
