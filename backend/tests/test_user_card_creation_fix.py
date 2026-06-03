"""Regression tests for the user-facing Create-Signal 500s.

Both ``/cards/create-from-topic`` and ``/cards/create-manual`` 500'd in
production because their card insert violated three different ``cards``
constraints:

1. ``slug`` is UNIQUE NOT NULL with no DB default — the inserts never set it
   (``cards_slug`` not-null violation, 23502).
2. ``review_status`` was hardcoded ``"approved"`` — not in the CHECK set
   ``{discovered, pending_review, active, rejected}`` (23514).
3. ``stage_id`` defaulted to ``"1"`` and the form's ``stage_id`` key never bound
   to the model's ``stage`` field — ``"1"`` is not a row in ``stages`` (FK
   ``cards_stage_id_fkey``, 23503).

These tests pin the two pure helpers that close (1) and (3). ``review_status``
is a one-line literal and is covered by the insert-shape assertion below.

CI does not install pytest-asyncio (only pytest + ruff), so the async helper is
driven through ``asyncio.run`` — matching test_signal_agent_card_cap.py.
"""

from __future__ import annotations

import asyncio
import os
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers import ai_helpers as m  # noqa: E402
from app.taxonomy import STAGE_NUMBER_TO_ID  # noqa: E402


# ---------------------------------------------------------------------------
# _resolve_stage_id — bug (3): every input must map to a real stages row id
# ---------------------------------------------------------------------------


def test_resolve_stage_id_maps_form_numbers_to_db_ids():
    """The form sends bare numbers "1".."8"; each maps to its stages id."""
    for number, expected in STAGE_NUMBER_TO_ID.items():
        assert m._resolve_stage_id(str(number)) == expected


def test_resolve_stage_id_passes_through_full_ids():
    """A full stage id (e.g. an API client that already resolved it) survives."""
    assert m._resolve_stage_id("5_implementing") == "5_implementing"
    assert m._resolve_stage_id("8_declining") == "8_declining"


def test_resolve_stage_id_defaults_to_concept_for_bad_input():
    """None / empty / garbage / out-of-range never 500 — they fall back to the
    earliest stage rather than producing an invalid FK."""
    for bad in (None, "", "garbage", "0", "9", "99"):
        assert m._resolve_stage_id(bad) == "1_concept"


def test_resolve_stage_id_result_is_always_a_real_stage():
    """Whatever comes in, the output is always one of the canonical ids."""
    valid = set(STAGE_NUMBER_TO_ID.values())
    for probe in (None, "1", "4", "8", "abc", "5_implementing", "12"):
        assert m._resolve_stage_id(probe) in valid


# ---------------------------------------------------------------------------
# _make_unique_slug — bug (1): slug must always be a non-empty unique string
# ---------------------------------------------------------------------------


def _patched_supabase(*, collision: bool):
    """MagicMock whose select/eq/limit/execute chain reports a slug collision
    (or not), matching the real query in ``_make_unique_slug``."""
    sb = MagicMock()
    chain = sb.table.return_value.select.return_value.eq.return_value.limit.return_value
    chain.execute.return_value = MagicMock(data=[{"id": "x"}] if collision else [])
    return sb


def test_make_unique_slug_slugifies_a_normal_name():
    with patch.object(m, "supabase", _patched_supabase(collision=False)):
        slug = asyncio.run(m._make_unique_slug("Quantum Computing", "abcd1234-aaaa"))
    assert slug == "quantum-computing"


def test_make_unique_slug_falls_back_to_card_id_for_nameless_input():
    """Emoji-only / symbol-only topics slugify to "" — the helper must still
    return a non-empty value (the card id) so the NOT NULL constraint holds."""
    card_id = "deadbeef-1111-2222-3333-444455556666"
    with patch.object(m, "supabase", _patched_supabase(collision=False)):
        slug = asyncio.run(m._make_unique_slug("🚀🚀🚀", card_id))
    assert slug == card_id
    assert slug  # non-empty


def test_make_unique_slug_disambiguates_collisions():
    """When the base slug already exists, append a card-id fragment so the
    UNIQUE constraint can't trip."""
    card_id = "abcdef12-9999-0000-1111-222233334444"
    with patch.object(m, "supabase", _patched_supabase(collision=True)):
        slug = asyncio.run(m._make_unique_slug("Quantum Computing", card_id))
    assert slug == f"quantum-computing-{card_id[:8]}"


# ---------------------------------------------------------------------------
# TOCTOU race — the pre-check can't prevent concurrent same-name collisions, so
# the insert must retry on the UNIQUE constraint (the real arbiter)
# ---------------------------------------------------------------------------


class _UniqueViolation(Exception):
    """Stand-in for supabase-py's APIError on a Postgres 23505."""

    code = "23505"

    def __init__(self):
        super().__init__(
            "duplicate key value violates unique constraint \"cards_slug_key\""
        )


def test_is_unique_violation_detects_23505():
    assert m._is_unique_violation(_UniqueViolation())
    assert m._is_unique_violation(Exception("... code 23505 ..."))
    assert m._is_unique_violation(Exception("duplicate key value violates ..."))
    assert not m._is_unique_violation(Exception("null value in column"))


def _insert_supabase(*, fail_first: bool):
    """MagicMock whose cards insert raises a unique violation on the first call
    (then succeeds) when ``fail_first``; the ``_make_unique_slug`` pre-check
    select chain always reports no collision."""
    sb = MagicMock()
    sel = sb.table.return_value.select.return_value.eq.return_value.limit.return_value
    sel.execute.return_value = MagicMock(data=[])
    execute = sb.table.return_value.insert.return_value.execute
    if fail_first:
        execute.side_effect = [_UniqueViolation(), MagicMock(data=[{"id": "ok"}])]
    else:
        execute.return_value = MagicMock(data=[{"id": "ok"}])
    return sb, execute


def test_insert_retries_with_full_id_suffix_on_slug_collision():
    """A concurrent insert that loses the slug race retries once with the full
    card id appended (globally unique) and succeeds — no 500 surfaces."""
    card_id = "abcd1234-5678-9012-3456-7890abcdef00"
    card_data = {"id": card_id, "name": "Dup Name"}
    sb, execute = _insert_supabase(fail_first=True)
    with patch.object(m, "supabase", sb):
        result = asyncio.run(m._insert_card_with_unique_slug(card_data, "Dup Name"))
    assert result.data == [{"id": "ok"}]
    assert execute.call_count == 2
    assert card_data["slug"] == f"dup-name-{card_id}"


def test_insert_no_retry_on_clean_insert():
    """The happy path inserts exactly once and keeps the readable slug."""
    card_id = "11112222-3333-4444-5555-666677778888"
    card_data = {"id": card_id, "name": "Clean Name"}
    sb, execute = _insert_supabase(fail_first=False)
    with patch.object(m, "supabase", sb):
        asyncio.run(m._insert_card_with_unique_slug(card_data, "Clean Name"))
    assert execute.call_count == 1
    assert card_data["slug"] == "clean-name"


def test_insert_reraises_non_unique_errors():
    """A non-unique failure (e.g. a NOT NULL / FK violation) must propagate, not
    be mistaken for a slug race and retried."""
    sb = MagicMock()
    sel = sb.table.return_value.select.return_value.eq.return_value.limit.return_value
    sel.execute.return_value = MagicMock(data=[])
    sb.table.return_value.insert.return_value.execute.side_effect = RuntimeError("boom")
    with patch.object(m, "supabase", sb):
        try:
            asyncio.run(
                m._insert_card_with_unique_slug({"id": "x-id", "name": "n"}, "n")
            )
            raised = None
        except RuntimeError as exc:
            raised = exc
    assert isinstance(raised, RuntimeError)
