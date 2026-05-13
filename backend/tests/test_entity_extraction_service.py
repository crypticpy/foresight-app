"""Unit tests for entity_extraction_service.

The parser is the highest-failure surface — every test that builds a fake
LLM response goes through it. The persistence half is exercised via a
``_FakeSupabase`` that records what tables were touched and what payloads
were written, mirroring ``test_csp_goal_query_service.py``.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import entity_extraction_service as svc  # noqa: E402


# ---------------------------------------------------------------------------
# Parser
# ---------------------------------------------------------------------------


def test_parser_accepts_bare_array():
    raw = (
        '[{"canonical": "agentic AI", "aliases": ["AI agents"], '
        '"type": "tech", "salience": 0.8, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert len(out) == 1
    assert out[0].canonical == "agentic AI"
    assert out[0].aliases == ("AI agents",)
    assert out[0].type == "tech"
    assert out[0].salience == 0.8
    assert out[0].stance == "neutral"


def test_parser_strips_markdown_fences():
    raw = (
        "```json\n"
        '[{"canonical": "LIHTC", "aliases": [], "type": "program", '
        '"salience": 0.6, "stance": "support"}]\n'
        "```"
    )
    out = svc._parse_concept_tags(raw)
    assert len(out) == 1
    assert out[0].canonical == "LIHTC"


def test_parser_extracts_array_from_prose_prefix():
    raw = (
        "Sure! Here are some tags: "
        '[{"canonical": "agentic AI", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "neutral"}] '
        "hope this helps"
    )
    out = svc._parse_concept_tags(raw)
    assert len(out) == 1
    assert out[0].canonical == "agentic AI"


def test_parser_returns_empty_list_for_empty_array():
    """An empty list is a legal LLM response and must not raise."""
    assert svc._parse_concept_tags("[]") == []


def test_parser_rejects_non_array_response():
    with pytest.raises(svc.ConceptTagExtractionError):
        svc._parse_concept_tags('{"canonical": "x"}')


def test_parser_rejects_unparseable_garbage():
    with pytest.raises(svc.ConceptTagExtractionError):
        svc._parse_concept_tags("totally not json")


def test_parser_rejects_empty_input():
    with pytest.raises(svc.ConceptTagExtractionError):
        svc._parse_concept_tags("")


def test_parser_dedupes_case_insensitively():
    raw = (
        '[{"canonical": "Agentic AI", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "neutral"},'
        ' {"canonical": "agentic AI", "aliases": [], "type": "tech", '
        '"salience": 0.8, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert len(out) == 1
    # First occurrence wins (display form).
    assert out[0].canonical == "Agentic AI"


def test_parser_clamps_salience_to_unit_interval():
    raw = (
        '[{"canonical": "a", "aliases": [], "type": "tech", '
        '"salience": 1.7, "stance": "neutral"},'
        ' {"canonical": "b", "aliases": [], "type": "tech", '
        '"salience": -0.4, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert out[0].salience == 1.0
    assert out[1].salience == 0.0


def test_parser_normalizes_invalid_type_to_other():
    raw = (
        '[{"canonical": "X", "aliases": [], "type": "WILD", '
        '"salience": 0.5, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert out[0].type == "other"


def test_parser_normalizes_invalid_stance_to_unknown():
    raw = (
        '[{"canonical": "X", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "WILDCAT"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert out[0].stance == "unknown"


def test_parser_caps_tags_at_max_tags():
    items = ", ".join(
        '{"canonical": "tag%d", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "neutral"}' % i
        for i in range(20)
    )
    out = svc._parse_concept_tags(f"[{items}]")
    assert len(out) == svc.MAX_TAGS


def test_parser_clamps_canonical_length():
    long_name = "a" * (svc.MAX_CANONICAL_LEN + 50)
    raw = (
        '[{"canonical": "' + long_name + '", "aliases": [], '
        '"type": "tech", "salience": 0.5, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert len(out[0].canonical) <= svc.MAX_CANONICAL_LEN


def test_parser_dedupes_aliases_against_canonical():
    raw = (
        '[{"canonical": "agentic AI", "aliases": ["agentic ai", "AI agents", '
        '"AI Agents"], "type": "tech", "salience": 0.5, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    # canonical lowercased is in alias_keys at start; one alias survives.
    assert out[0].aliases == ("AI agents",)


def test_parser_skips_entries_with_blank_canonical():
    raw = (
        '[{"canonical": "", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "neutral"},'
        ' {"canonical": "real", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "neutral"}]'
    )
    out = svc._parse_concept_tags(raw)
    assert len(out) == 1
    assert out[0].canonical == "real"


# ---------------------------------------------------------------------------
# Persistence + control flow
# ---------------------------------------------------------------------------


class _FakeTable:
    def __init__(self, parent: "_FakeSupabase", name: str):
        self._parent = parent
        self._name = name
        self._mode = "select"
        self._filters: dict[str, Any] = {}
        self._payload: Any = None
        self._on_conflict: str | None = None

    def select(self, *_a, **_kw):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._mode = "update"
        self._payload = payload
        return self

    def upsert(self, payload, *, on_conflict: str | None = None):
        self._mode = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def execute(self):
        if self._mode == "upsert":
            self._parent.calls.append(
                ("upsert", self._name, self._payload, self._on_conflict)
            )
            if self._name == "entity_mentions":
                self._parent.mentions.extend(self._payload or [])
            return SimpleNamespace(data=list(self._payload or []))
        if self._mode == "update":
            self._parent.calls.append(
                ("update", self._name, self._payload, dict(self._filters))
            )
            if self._name == "cards":
                row_id = self._filters.get("id")
                row = self._parent.cards.setdefault(row_id, {"id": row_id})
                row.update(self._payload)
            return SimpleNamespace(data=[{"id": self._filters.get("id")}])
        return SimpleNamespace(data=[])


class _FakeSupabase:
    def __init__(self):
        self.calls: list[tuple] = []
        self.cards: dict[str, dict[str, Any]] = {}
        self.mentions: list[dict[str, Any]] = []

    def table(self, name: str):
        return _FakeTable(self, name)


def _make_llm_response(content: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


def _make_oc(content: str | Exception):
    create = AsyncMock()
    if isinstance(content, Exception):
        create.side_effect = content
    else:
        create.return_value = _make_llm_response(content)
    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=create))
    )


def _card_input(item_id: str = "card-1") -> svc.ConceptTagInput:
    return svc.ConceptTagInput(
        item_id=item_id,
        item_type="card",
        name="Austin pilots agentic AI for permitting",
        summary="Workflow uses an LLM agent.",
        description="A pilot program to automate plan review with an LLM agent.",
        pillar_id="HG",
        item_created_at="2026-05-13T12:00:00Z",
    )


def test_extract_for_item_writes_mentions_and_stamps_card():
    sb = _FakeSupabase()
    oc = _make_oc(
        '[{"canonical": "agentic AI", "aliases": ["AI agents"], '
        '"type": "tech", "salience": 0.8, "stance": "neutral"}]'
    )

    result = asyncio.run(
        svc.extract_for_item(_card_input(), supabase=sb, openai_client=oc)
    )

    assert result.prompt_version == svc.EXTRACTION_PROMPT_VERSION
    assert len(result.tags) == 1
    assert result.tags[0].canonical == "agentic AI"

    # The mention row was written with NULL entity_id and the natural-key fields.
    assert len(sb.mentions) == 1
    mention = sb.mentions[0]
    assert mention["canonical_name"] == "agentic AI"
    assert mention["entity_type"] == "tech"
    assert mention["item_id"] == "card-1"
    assert mention["item_type"] == "card"
    assert mention["pillar_id"] == "HG"
    assert mention["prompt_version"] == svc.EXTRACTION_PROMPT_VERSION
    assert "entity_id" not in mention  # left for reconciliation

    # The card row got its concept_tags + version stamp.
    card_row = sb.cards["card-1"]
    assert card_row["concept_tags_version"] == svc.EXTRACTION_PROMPT_VERSION
    assert card_row["concept_tags"] == [
        {
            "canonical": "agentic AI",
            "aliases": ["AI agents"],
            "type": "tech",
            "salience": 0.8,
            "stance": "neutral",
        }
    ]


def test_extract_for_item_empty_list_still_stamps_version():
    sb = _FakeSupabase()
    oc = _make_oc("[]")

    result = asyncio.run(
        svc.extract_for_item(_card_input("card-2"), supabase=sb, openai_client=oc)
    )

    assert result.is_empty
    # No mentions written.
    assert sb.mentions == []
    # Card was still stamped so backfill doesn't keep re-tagging it.
    assert (
        sb.cards["card-2"]["concept_tags_version"]
        == svc.EXTRACTION_PROMPT_VERSION
    )
    assert sb.cards["card-2"]["concept_tags"] == []


def test_extract_for_item_parse_error_raises_and_writes_nothing():
    sb = _FakeSupabase()
    oc = _make_oc("I'm sorry, Dave.")

    with pytest.raises(svc.ConceptTagExtractionError):
        asyncio.run(
            svc.extract_for_item(_card_input(), supabase=sb, openai_client=oc)
        )

    assert sb.mentions == []
    assert sb.cards == {}


def test_extract_for_item_source_type_raises():
    """PR-1 only handles cards; source extraction is wired in PR-2."""
    sb = _FakeSupabase()
    oc = _make_oc(
        '[{"canonical": "x", "aliases": [], "type": "tech", '
        '"salience": 0.5, "stance": "neutral"}]'
    )

    source_input = svc.ConceptTagInput(
        item_id="src-1",
        item_type="source",
        name="Some news article",
        summary="",
        description="",
        pillar_id=None,
        item_created_at="2026-05-13T12:00:00Z",
    )

    with pytest.raises(ValueError):
        asyncio.run(
            svc.extract_for_item(source_input, supabase=sb, openai_client=oc)
        )


def test_extract_for_item_writes_mentions_before_card_stamp():
    """Order matters: mentions must land first so a card-write failure
    leaves the version unstamped and the next pass retries."""

    class _ExplodingTable(_FakeTable):
        def execute(self):
            if self._mode == "update" and self._name == "cards":
                raise RuntimeError("simulated card write failure")
            return super().execute()

    class _ExplodingSupabase(_FakeSupabase):
        def table(self, name):
            return _ExplodingTable(self, name)

    sb = _ExplodingSupabase()
    oc = _make_oc(
        '[{"canonical": "agentic AI", "aliases": [], "type": "tech", '
        '"salience": 0.6, "stance": "neutral"}]'
    )

    with pytest.raises(RuntimeError):
        asyncio.run(
            svc.extract_for_item(_card_input(), supabase=sb, openai_client=oc)
        )

    # Mention got persisted; card stamp did NOT (because the write blew up).
    assert len(sb.mentions) == 1
    assert sb.cards == {}


def test_extraction_prompt_version_is_v1():
    """Guard against silent version drift — bumping requires a deliberate edit
    plus an accompanying backfill."""
    assert svc.EXTRACTION_PROMPT_VERSION == "v1"
