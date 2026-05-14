"""Unit tests for per-user workstream-clone materialization.

Covers:
- ``ensure_user_clones_for_templates`` materializes a clone for each org
  template the user doesn't yet have a pointer for.
- Second call is a no-op (idempotent).
- Failure to insert one clone does not block the others.
- Template cards are copied into the clone's inbox in card-creation-date order.
- Dismissal tombstone is written when a card is removed from a user_clone.

The tests mock the supabase fluent chain rather than spinning up the full
FastAPI app + Postgres — the goal is to lock the materialization contract,
not to re-test Supabase.

See ``docs/26_per_user_workstream_clones_plan.md`` for the design.
"""

from __future__ import annotations

import os
import sys
import uuid
from typing import Any, Dict, List, Optional

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ---------------------------------------------------------------------------
# Mock Supabase fluent chain
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


class _MockResponse:
    def __init__(self, data: Optional[List[Dict[str, Any]]] = None) -> None:
        self.data = data or []


class _Query:
    """Records the filter terms used in a builder chain so the backing
    ``_Table`` can apply them when ``execute()`` is called."""

    def __init__(self, table: "_Table", op: str = "select", payload: Any = None) -> None:
        self._table = table
        self._op = op
        self._payload = payload
        self._eq: Dict[str, Any] = {}
        self._in: Dict[str, List[Any]] = {}
        self._on_conflict: Optional[str] = None

    def select(self, *_args, **_kwargs):
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def upsert(self, payload, *, on_conflict: Optional[str] = None):
        self._op = "upsert"
        self._payload = payload
        self._on_conflict = on_conflict
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._eq[col] = val
        return self

    def in_(self, col, vals):
        self._in[col] = list(vals)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def _matches(self, row: Dict[str, Any]) -> bool:
        for col, val in self._eq.items():
            if row.get(col) != val:
                return False
        for col, vals in self._in.items():
            if row.get(col) not in vals:
                return False
        return True

    def execute(self) -> _MockResponse:
        if self._op == "select":
            return _MockResponse([r for r in self._table.rows if self._matches(r)])
        if self._op == "insert":
            return self._table.insert(self._payload, self._eq)
        if self._op == "upsert":
            return self._table.upsert(self._payload, self._on_conflict)
        if self._op == "delete":
            removed = [r for r in self._table.rows if self._matches(r)]
            self._table.rows = [r for r in self._table.rows if not self._matches(r)]
            return _MockResponse(removed)
        raise AssertionError(f"unhandled op {self._op}")


class _Table:
    def __init__(
        self,
        name: str,
        rows: List[Dict[str, Any]],
        *,
        insert_fail: bool = False,
        insert_fail_predicate=None,
    ) -> None:
        self.name = name
        self.rows = list(rows)
        self.inserted: List[Dict[str, Any]] = []
        self.upserted: List[Dict[str, Any]] = []
        self.insert_fail = insert_fail
        self.insert_fail_predicate = insert_fail_predicate

    def insert(self, payload, _eq):
        rows = payload if isinstance(payload, list) else [payload]
        if self.insert_fail_predicate and any(
            self.insert_fail_predicate(r) for r in rows
        ):
            return _MockResponse([])
        if self.insert_fail:
            return _MockResponse([])
        ack = []
        for r in rows:
            r = {**r}
            r.setdefault("id", _uuid())
            self.rows.append(r)
            self.inserted.append(r)
            ack.append(r)
        return _MockResponse(ack)

    def upsert(self, payload, on_conflict):
        rows = payload if isinstance(payload, list) else [payload]
        # PK fields are derived from on_conflict if provided.
        keys = (on_conflict or "id").split(",") if on_conflict else ["id"]
        ack = []
        for r in rows:
            r = {**r}
            existing = next(
                (
                    row
                    for row in self.rows
                    if all(row.get(k) == r.get(k) for k in keys)
                ),
                None,
            )
            if existing:
                existing.update(r)
                self.upserted.append(existing)
                ack.append(existing)
            else:
                r.setdefault("id", _uuid())
                self.rows.append(r)
                self.upserted.append(r)
                ack.append(r)
        return _MockResponse(ack)


class _MockSupabase:
    def __init__(self, tables: Dict[str, _Table]) -> None:
        self._tables = tables

    def table(self, name: str):
        if name not in self._tables:
            self._tables[name] = _Table(name, [])
        return _Query(self._tables[name])


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def template_ids():
    return [_uuid() for _ in range(2)]


@pytest.fixture
def card_ids():
    return [_uuid() for _ in range(3)]


@pytest.fixture
def mock_supabase(template_ids, card_ids):
    """Two org templates, three cards each in the first template's pool."""
    template_a, template_b = template_ids
    workstreams = [
        {
            "id": template_a,
            "user_id": None,
            "owner_type": "org",
            "name": "Climate / Infrastructure",
            "pillar_ids": ["CH"],
            "horizon": "ALL",
        },
        {
            "id": template_b,
            "user_id": None,
            "owner_type": "org",
            "name": "Intergovernmental",
            "pillar_ids": ["HG"],
            "horizon": "ALL",
        },
    ]
    # Cards joined onto workstream_cards via cards!inner — represent the join
    # eagerly so _copy_template_cards_to_clone gets back what supabase would.
    template_a_cards = [
        {
            "card_id": card_ids[0],
            "cards": {"created_at": "2026-04-01T00:00:00Z"},
            "workstream_id": template_a,
        },
        {
            "card_id": card_ids[1],
            "cards": {"created_at": "2026-03-01T00:00:00Z"},
            "workstream_id": template_a,
        },
        {
            "card_id": card_ids[2],
            "cards": {"created_at": "2026-05-01T00:00:00Z"},
            "workstream_id": template_a,
        },
    ]

    tables = {
        "workstreams": _Table("workstreams", workstreams),
        "workstream_cards": _Table("workstream_cards", template_a_cards),
        "user_workstream_clones": _Table("user_workstream_clones", []),
        "user_workstream_card_dismissals": _Table(
            "user_workstream_card_dismissals", []
        ),
    }
    return _MockSupabase(tables), tables


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_first_touch_materializes_clone_per_template(
    monkeypatch, mock_supabase, template_ids, card_ids
):
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    user_id = _uuid()
    result = cs.ensure_user_clones_for_templates(user_id)

    # A clone pointer + workstream row per template
    assert set(result.keys()) == set(template_ids)
    clone_pointers = tables["user_workstream_clones"].rows
    assert len(clone_pointers) == 2
    for pointer in clone_pointers:
        assert pointer["user_id"] == user_id
        assert pointer["template_id"] in template_ids
        assert pointer["clone_workstream_id"] in {
            ws["id"] for ws in tables["workstreams"].rows if ws.get("owner_type") == "user_clone"
        }
        # last_fanout_at is stamped at materialization so the Friday job
        # doesn't immediately re-deliver the cards we just copied.
        assert pointer["last_fanout_at"] is not None


def test_first_touch_copies_template_cards_in_creation_order(
    monkeypatch, mock_supabase, template_ids, card_ids
):
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    user_id = _uuid()
    cs.ensure_user_clones_for_templates(user_id)

    # Find the clone for template_a (the one we seeded cards in).
    template_a = template_ids[0]
    pointer = next(
        p for p in tables["user_workstream_clones"].rows if p["template_id"] == template_a
    )
    clone_id = pointer["clone_workstream_id"]

    clone_cards = [
        r
        for r in tables["workstream_cards"].rows
        if r.get("workstream_id") == clone_id
    ]
    # Three template cards copied into the clone, all inbox, positions 0..2,
    # ordered by underlying card created_at ascending (oldest first).
    assert len(clone_cards) == 3
    assert [c["status"] for c in clone_cards] == ["inbox", "inbox", "inbox"]
    assert [c["position"] for c in clone_cards] == [0, 1, 2]
    # Expected order by ascending created_at: card_ids[1] (Mar) → [0] (Apr) → [2] (May)
    assert [c["card_id"] for c in clone_cards] == [
        card_ids[1],
        card_ids[0],
        card_ids[2],
    ]
    assert all(c["added_from"] == "auto" for c in clone_cards)
    assert all(c["added_by"] == user_id for c in clone_cards)


def test_second_call_is_idempotent(monkeypatch, mock_supabase, template_ids):
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    user_id = _uuid()
    first = cs.ensure_user_clones_for_templates(user_id)
    workstream_count = len(tables["workstreams"].rows)
    card_count = len(tables["workstream_cards"].rows)
    pointer_count = len(tables["user_workstream_clones"].rows)

    second = cs.ensure_user_clones_for_templates(user_id)
    assert first == second
    assert len(tables["workstreams"].rows) == workstream_count
    assert len(tables["workstream_cards"].rows) == card_count
    assert len(tables["user_workstream_clones"].rows) == pointer_count


def test_partial_failure_doesnt_block_other_templates(
    monkeypatch, mock_supabase, template_ids
):
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    # Simulate Supabase rejecting the second template's clone insert.
    failing_template = template_ids[1]

    def fail_for_template(payload):
        return payload.get("cloned_from_id") == failing_template

    tables["workstreams"].insert_fail_predicate = fail_for_template

    user_id = _uuid()
    result = cs.ensure_user_clones_for_templates(user_id)

    # The healthy template still got a clone; the failing one is absent.
    assert template_ids[0] in result
    assert failing_template not in result


def test_template_id_for_workstream_returns_pointer_only_for_clones(
    monkeypatch, mock_supabase, template_ids
):
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    user_id = _uuid()
    cs.ensure_user_clones_for_templates(user_id)

    # Pick the clone for the first template.
    template_a = template_ids[0]
    pointer = next(
        p for p in tables["user_workstream_clones"].rows if p["template_id"] == template_a
    )
    clone_id = pointer["clone_workstream_id"]

    # Clones return their template id; templates return None (they aren't
    # cloned from anything).
    assert cs.template_id_for_workstream(clone_id) == template_a
    assert cs.template_id_for_workstream(template_a) is None


def test_record_dismissal_writes_tombstone_only_for_clones(
    monkeypatch, mock_supabase, template_ids, card_ids
):
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    user_id = _uuid()
    cs.ensure_user_clones_for_templates(user_id)

    template_a = template_ids[0]
    pointer = next(
        p for p in tables["user_workstream_clones"].rows if p["template_id"] == template_a
    )
    clone_id = pointer["clone_workstream_id"]

    # Dismissing a card on a clone writes the tombstone keyed by template id.
    assert cs.record_dismissal_if_clone(clone_id, card_ids[0]) is True
    dismissals = tables["user_workstream_card_dismissals"].rows
    assert len(dismissals) == 1
    assert dismissals[0]["user_id"] == user_id
    assert dismissals[0]["template_id"] == template_a
    assert dismissals[0]["card_id"] == card_ids[0]

    # Same card again: upsert collapses to one row.
    assert cs.record_dismissal_if_clone(clone_id, card_ids[0]) is True
    assert len(tables["user_workstream_card_dismissals"].rows) == 1

    # Dismissing a card on the template itself (not a clone) is a no-op.
    assert cs.record_dismissal_if_clone(template_a, card_ids[0]) is False


def test_record_dismissal_returns_false_for_missing_card_id(
    monkeypatch, mock_supabase
):
    supa, _tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)
    assert cs.record_dismissal_if_clone(_uuid(), "") is False
