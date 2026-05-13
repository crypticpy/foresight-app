"""Smoke tests for the entity-tag backfill script.

Focuses on the argparse surface and the candidate-query builder. The
extract + reconcile halves are already covered by their service tests; we
don't repeat that here, we just make sure the script's plumbing wires the
right filters and doesn't drift from EXTRACTION_PROMPT_VERSION.
"""

from __future__ import annotations

import importlib.util
import os
import sys
from typing import Any


sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Importing the script as a module without running main(). We use importlib
# rather than ``from scripts.backfill_entity_tags_cards import ...`` so the
# test doesn't need ``scripts`` to be a package.
_SCRIPT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "scripts", "backfill_entity_tags_cards.py"
)
spec = importlib.util.spec_from_file_location(
    "backfill_entity_tags_cards", _SCRIPT_PATH
)
backfill = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(backfill)

from app import entity_extraction_service  # noqa: E402


# ---------------------------------------------------------------------------
# Argparse
# ---------------------------------------------------------------------------


def _parse(argv: list[str]) -> Any:
    """Helper to invoke ``_parse_args`` with a synthetic argv."""
    original = sys.argv
    try:
        sys.argv = ["backfill_entity_tags_cards.py", *argv]
        return backfill._parse_args()
    finally:
        sys.argv = original


def test_argparse_defaults():
    ns = _parse([])
    assert ns.limit is None
    assert ns.force is False
    assert ns.dry_run is False
    assert ns.concurrency == 5
    assert ns.card_ids is None
    assert ns.skip_reconcile is False
    assert ns.reconcile_only is False
    assert ns.reconcile_batch_size == 200


def test_argparse_accepts_card_ids_list():
    ns = _parse(["--card-ids", "a", "b", "c"])
    assert ns.card_ids == ["a", "b", "c"]


def test_argparse_force_and_dry_run_flags():
    ns = _parse(["--force", "--dry-run"])
    assert ns.force is True
    assert ns.dry_run is True


def test_argparse_skip_reconcile_and_reconcile_only_are_independent():
    ns = _parse(["--skip-reconcile"])
    assert ns.skip_reconcile is True
    assert ns.reconcile_only is False

    ns = _parse(["--reconcile-only"])
    assert ns.skip_reconcile is False
    assert ns.reconcile_only is True


# ---------------------------------------------------------------------------
# Candidate-query builder
# ---------------------------------------------------------------------------


class _CapturingTable:
    """Captures every query-builder call for assertion."""

    def __init__(self):
        self.select_cols: str | None = None
        self.eq_calls: list[tuple[str, Any]] = []
        self.in_calls: list[tuple[str, list[Any]]] = []
        self.or_calls: list[str] = []
        self.limit_calls: list[int] = []

    def select(self, cols):
        self.select_cols = cols
        return self

    def eq(self, key, value):
        self.eq_calls.append((key, value))
        return self

    def in_(self, key, values):
        self.in_calls.append((key, list(values)))
        return self

    def or_(self, expr):
        self.or_calls.append(expr)
        return self

    def limit(self, n):
        self.limit_calls.append(n)
        return self


class _CapturingSupabase:
    def __init__(self):
        self.last_table: _CapturingTable | None = None

    def table(self, name: str):
        assert name == "cards"
        self.last_table = _CapturingTable()
        return self.last_table


def test_query_filters_to_active_pending_cards_by_default():
    sb = _CapturingSupabase()
    args = _parse([])
    backfill._build_candidate_query(sb, args)

    t = sb.last_table
    assert t is not None
    assert t.select_cols == backfill.SELECT_COLS
    assert ("status", "active") in t.eq_calls
    # Default branch: no card_ids, not force → the OR filter on concept_tags_version is applied.
    assert len(t.or_calls) == 1
    assert "concept_tags_version.is.null" in t.or_calls[0]
    assert entity_extraction_service.EXTRACTION_PROMPT_VERSION in t.or_calls[0]


def test_query_card_ids_overrides_version_filter():
    """Explicit --card-ids must skip the version predicate so targeted
    reruns are not silently no-op'd (CodeRabbit #88 / id 3237048118)."""
    sb = _CapturingSupabase()
    args = _parse(["--card-ids", "a", "b"])
    backfill._build_candidate_query(sb, args)

    t = sb.last_table
    assert t is not None
    assert t.in_calls == [("id", ["a", "b"])]
    assert t.or_calls == []


def test_query_force_skips_version_filter():
    sb = _CapturingSupabase()
    args = _parse(["--force"])
    backfill._build_candidate_query(sb, args)

    t = sb.last_table
    assert t is not None
    assert t.or_calls == []


def test_query_limit_passed_through():
    sb = _CapturingSupabase()
    args = _parse(["--limit", "25"])
    backfill._build_candidate_query(sb, args)

    t = sb.last_table
    assert t is not None
    assert t.limit_calls == [25]


def test_select_cols_includes_required_fields():
    """The card row needs name + summary + description + pillar + created_at
    for the extraction payload — drift here breaks the backfill silently."""
    for field in (
        "id",
        "name",
        "summary",
        "description",
        "pillar_id",
        "created_at",
        "concept_tags_version",
    ):
        assert field in backfill.SELECT_COLS


def test_script_carries_extraction_prompt_version_from_service():
    """The script must import the version from the service rather than
    redefining it — drift here would silently misroute backfills."""
    assert (
        backfill.EXTRACTION_PROMPT_VERSION
        == entity_extraction_service.EXTRACTION_PROMPT_VERSION
    )
