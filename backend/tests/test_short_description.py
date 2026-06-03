"""Tests for ai_service.generate_and_store_short_description.

Mirrors the refresh_card_embedding tests (test_embedding_backfill.py): the
helper fetches name/summary/description by id, asks the mini tier for a
2-sentence blurb, and writes it to cards.short_description. It is non-fatal —
a missing row or an empty blurb yields no write and returns False.
"""
from typing import Any, Dict
from unittest.mock import AsyncMock, patch

import asyncio

import app.ai_service as ai_service


class _SingleCardQuery:
    """Supports ``select().eq().single().execute()`` read and
    ``update().eq().execute()`` write, capturing the update payload."""

    def __init__(self, row, captured):
        self._row = row
        self._captured = captured
        self._payload = None

    def select(self, *_a, **_kw):
        return self

    def update(self, payload):
        self._payload = payload
        return self

    def eq(self, *_a, **_kw):
        return self

    def single(self):
        return self

    def execute(self):
        if self._payload is not None:
            self._captured["update"] = self._payload
            return type("R", (), {"data": [{"id": "c1"}]})()
        return type("R", (), {"data": self._row})()


def _single_card_supabase(row, captured):
    class _SB:
        def table(self, _name):
            return _SingleCardQuery(row, captured)

    return _SB()


def test_short_description_writes_blurb_from_card_text():
    """Happy path: pass name/summary/description to the mini tier, store the blurb."""
    captured: Dict[str, Any] = {}
    row = {
        "name": "Quantum sensors",
        "summary": "Short blurb.",
        "description": "Long profile text.",
    }

    with patch.object(
        ai_service.AIService, "generate_short_description", new_callable=AsyncMock
    ) as gen:
        gen.return_value = "Quantum sensors detect tiny fields. They could sharpen Austin's infrastructure monitoring."
        ok = asyncio.run(
            ai_service.generate_and_store_short_description(
                _single_card_supabase(row, captured), "c1"
            )
        )

    assert ok is True
    assert (
        captured["update"]["short_description"]
        == "Quantum sensors detect tiny fields. They could sharpen Austin's infrastructure monitoring."
    )
    # The card's three text fields are handed to the generator.
    gen.assert_awaited_once_with(
        "Quantum sensors", "Short blurb.", "Long profile text."
    )


def test_short_description_false_when_card_missing():
    """Missing row -> no LLM call, no write, returns False (non-fatal)."""
    captured: Dict[str, Any] = {}

    with patch.object(
        ai_service.AIService, "generate_short_description", new_callable=AsyncMock
    ) as gen:
        ok = asyncio.run(
            ai_service.generate_and_store_short_description(
                _single_card_supabase(None, captured), "missing"
            )
        )

    assert ok is False
    gen.assert_not_awaited()
    assert "update" not in captured


def test_short_description_false_when_blurb_empty():
    """Generator returns None (empty name / LLM error) -> no write, False."""
    captured: Dict[str, Any] = {}
    row = {"name": "n", "summary": "s", "description": "d"}

    with patch.object(
        ai_service.AIService, "generate_short_description", new_callable=AsyncMock
    ) as gen:
        gen.return_value = None
        ok = asyncio.run(
            ai_service.generate_and_store_short_description(
                _single_card_supabase(row, captured), "c1"
            )
        )

    assert ok is False
    assert "update" not in captured
