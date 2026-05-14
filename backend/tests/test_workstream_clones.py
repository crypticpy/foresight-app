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

    def update(self, payload):
        self._op = "update"
        self._payload = payload
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
        if self._op == "update":
            updated: List[Dict[str, Any]] = []
            for row in self._table.rows:
                if self._matches(row):
                    row.update(self._payload)
                    updated.append(row)
            return _MockResponse(updated)
        raise AssertionError(f"unhandled op {self._op}")


class _Table:
    def __init__(
        self,
        name: str,
        rows: List[Dict[str, Any]],
        *,
        insert_fail: bool = False,
        insert_fail_predicate=None,
        unique_keys: Optional[List[str]] = None,
    ) -> None:
        self.name = name
        self.rows = list(rows)
        self.inserted: List[Dict[str, Any]] = []
        self.upserted: List[Dict[str, Any]] = []
        self.insert_fail = insert_fail
        self.insert_fail_predicate = insert_fail_predicate
        # When set, inserting a row whose composite-key values match an
        # existing row raises (mirrors a Postgres unique-violation).
        self.unique_keys = unique_keys

    def insert(self, payload, _eq):
        rows = payload if isinstance(payload, list) else [payload]
        if self.insert_fail_predicate and any(
            self.insert_fail_predicate(r) for r in rows
        ):
            return _MockResponse([])
        if self.insert_fail:
            return _MockResponse([])
        if self.unique_keys:
            for r in rows:
                key = tuple(r.get(k) for k in self.unique_keys)
                if any(
                    tuple(existing.get(k) for k in self.unique_keys) == key
                    for existing in self.rows
                ):
                    raise RuntimeError(
                        f"duplicate key value violates unique constraint on "
                        f"{self.name}({','.join(self.unique_keys)})"
                    )
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


def test_materialize_clone_is_race_safe_on_pointer_unique_violation(
    monkeypatch, mock_supabase, template_ids
):
    """Concurrent first-touch must not leak an orphan duplicate clone.

    Regression for the Codex review on PR #91: if two requests race past
    ``_existing_clone_pointers`` and both call ``materialize_clone``, the
    loser's pointer insert hits the
    ``user_workstream_clones(user_id, template_id)`` unique constraint.
    We expect the loser to drop the orphan workstream it created and
    return the winner's clone id instead of raising — otherwise the user
    sees a duplicate row in ``/me/workstreams`` until manual cleanup.
    """
    supa, tables = mock_supabase
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", supa)

    user_id = _uuid()
    template_a = template_ids[0]
    template = next(
        ws for ws in tables["workstreams"].rows if ws["id"] == template_a
    )

    # First call: real winner. Materializes a clone + writes the pointer.
    winner_clone_id = cs.materialize_clone(template, user_id)
    assert winner_clone_id is not None
    initial_workstream_count = len(tables["workstreams"].rows)

    # Flip the pointer table to enforce the (user_id, template_id) unique
    # constraint, then call materialize_clone again to simulate the losing
    # racer arriving after the winner has already written the pointer.
    tables["user_workstream_clones"].unique_keys = ["user_id", "template_id"]

    loser_result = cs.materialize_clone(template, user_id)

    # Loser surfaces the winner's id, not a fresh one.
    assert loser_result == winner_clone_id
    # No orphan workstream survives — the loser cleaned up after itself.
    # (The matching ``workstream_cards`` rows are cleaned by Postgres FK
    # cascade in prod; this test asserts the service-layer behavior only.)
    assert len(tables["workstreams"].rows) == initial_workstream_count
    # Pointer table still has exactly one row for this (user, template).
    pointers = [
        p
        for p in tables["user_workstream_clones"].rows
        if p["user_id"] == user_id and p["template_id"] == template_a
    ]
    assert len(pointers) == 1
    assert pointers[0]["clone_workstream_id"] == winner_clone_id


# ---------------------------------------------------------------------------
# Friday fan-out tests
# ---------------------------------------------------------------------------


@pytest.fixture
def fanout_world(template_ids, card_ids):
    """Two templates, three cards in template_a's pool, two users with
    materialized clones, and a populated ``cards`` table.

    Layout:
      template_a: pool = {card[0], card[1], card[2]}
      user_alpha: clone has {card[0]} already (and no dismissals)
      user_beta:  clone has {} already; dismissed {card[2]}
      template_b: pool empty
    """
    template_a, _template_b = template_ids
    user_alpha = _uuid()
    user_beta = _uuid()
    clone_alpha = _uuid()
    clone_beta = _uuid()

    workstreams = [
        {"id": template_a, "user_id": None, "owner_type": "org", "name": "T-A"},
        {"id": _template_b, "user_id": None, "owner_type": "org", "name": "T-B"},
        {
            "id": clone_alpha,
            "user_id": user_alpha,
            "owner_type": "user_clone",
            "cloned_from_id": template_a,
            "name": "T-A (alpha)",
        },
        {
            "id": clone_beta,
            "user_id": user_beta,
            "owner_type": "user_clone",
            "cloned_from_id": template_a,
            "name": "T-A (beta)",
        },
    ]

    workstream_cards = [
        # Pool on the template (no join columns needed for fan-out, just card_id).
        {"workstream_id": template_a, "card_id": card_ids[0]},
        {"workstream_id": template_a, "card_id": card_ids[1]},
        {"workstream_id": template_a, "card_id": card_ids[2]},
        # alpha already has card[0] at position 0 in inbox.
        {
            "workstream_id": clone_alpha,
            "card_id": card_ids[0],
            "status": "inbox",
            "position": 0,
        },
    ]

    cards = [
        {"id": card_ids[0], "created_at": "2026-04-01T00:00:00Z"},
        {"id": card_ids[1], "created_at": "2026-03-01T00:00:00Z"},
        {"id": card_ids[2], "created_at": "2026-05-01T00:00:00Z"},
    ]

    pointers = [
        {
            "user_id": user_alpha,
            "template_id": template_a,
            "clone_workstream_id": clone_alpha,
            "last_fanout_at": "2026-05-07T00:00:00Z",
        },
        {
            "user_id": user_beta,
            "template_id": template_a,
            "clone_workstream_id": clone_beta,
            "last_fanout_at": "2026-05-07T00:00:00Z",
        },
    ]

    dismissals = [
        # beta dismissed card[2] previously; fan-out must skip it.
        {
            "user_id": user_beta,
            "template_id": template_a,
            "card_id": card_ids[2],
        },
    ]

    tables = {
        "workstreams": _Table("workstreams", workstreams),
        "workstream_cards": _Table("workstream_cards", workstream_cards),
        "user_workstream_clones": _Table("user_workstream_clones", pointers),
        "user_workstream_card_dismissals": _Table(
            "user_workstream_card_dismissals", dismissals
        ),
        "cards": _Table("cards", cards),
    }
    return {
        "supabase": _MockSupabase(tables),
        "tables": tables,
        "users": {"alpha": user_alpha, "beta": user_beta},
        "clones": {"alpha": clone_alpha, "beta": clone_beta},
        "template_a": template_a,
    }


def test_fan_out_delivers_new_cards_and_skips_seen_and_dismissed(
    monkeypatch, fanout_world, card_ids
):
    """Alpha gets cards 1 & 2 (already had 0); beta gets 0 & 1 (dismissed 2)."""
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", fanout_world["supabase"])

    summary = cs.fan_out_clones()
    assert summary["templates"] == 2  # template_a (work) + template_b (empty pool)
    assert summary["clones_processed"] == 2
    # alpha 2 + beta 2 = 4 cards delivered total.
    assert summary["cards_delivered"] == 4
    assert summary["failures"] == 0

    clone_alpha = fanout_world["clones"]["alpha"]
    clone_beta = fanout_world["clones"]["beta"]
    alpha_cards = [
        r
        for r in fanout_world["tables"]["workstream_cards"].rows
        if r.get("workstream_id") == clone_alpha
    ]
    beta_cards = [
        r
        for r in fanout_world["tables"]["workstream_cards"].rows
        if r.get("workstream_id") == clone_beta
    ]

    # Alpha: started with card[0] @ position 0; gains card[1] (Mar) and
    # card[2] (May) at positions 1 and 2 in creation-date ascending order.
    assert len(alpha_cards) == 3
    alpha_new = sorted(
        (r for r in alpha_cards if r.get("added_from") == "auto"),
        key=lambda r: r["position"],
    )
    assert [r["card_id"] for r in alpha_new] == [card_ids[1], card_ids[2]]
    assert [r["position"] for r in alpha_new] == [1, 2]
    assert all(r["status"] == "inbox" for r in alpha_new)

    # Beta: started empty, dismissed card[2]; gains card[1] (Mar) and
    # card[0] (Apr) at positions 0 and 1.
    assert len(beta_cards) == 2
    beta_sorted = sorted(beta_cards, key=lambda r: r["position"])
    assert [r["card_id"] for r in beta_sorted] == [card_ids[1], card_ids[0]]
    assert [r["position"] for r in beta_sorted] == [0, 1]
    assert all(r["status"] == "inbox" for r in beta_sorted)


def test_fan_out_advances_last_fanout_at_for_processed_clones(
    monkeypatch, fanout_world
):
    """Every successfully-processed pointer gets its last_fanout_at bumped."""
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", fanout_world["supabase"])

    cs.fan_out_clones()
    pointers = fanout_world["tables"]["user_workstream_clones"].rows
    assert len(pointers) == 2
    for p in pointers:
        # The fixture seeded last_fanout_at=2026-05-07; after the run it
        # should be a fresh ISO timestamp (the exact value is now() at run
        # time, so just assert it changed).
        assert p["last_fanout_at"] != "2026-05-07T00:00:00Z"
        assert p["last_fanout_at"].startswith("20")


def test_fan_out_is_idempotent_when_clones_are_up_to_date(
    monkeypatch, fanout_world
):
    """A second run after the first delivers zero new cards."""
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", fanout_world["supabase"])

    cs.fan_out_clones()
    card_count_after_first = len(
        fanout_world["tables"]["workstream_cards"].rows
    )

    second = cs.fan_out_clones()
    assert second["cards_delivered"] == 0
    assert (
        len(fanout_world["tables"]["workstream_cards"].rows)
        == card_count_after_first
    )


def test_fan_out_skips_empty_templates(monkeypatch, fanout_world):
    """Templates with no pool rows do not contribute to clones_processed."""
    import app.clone_service as cs

    monkeypatch.setattr(cs, "supabase", fanout_world["supabase"])

    # No pointers exist for template_b in the fixture, so even though the
    # template itself is iterated, clones_processed reflects template_a only.
    summary = cs.fan_out_clones()
    assert summary["clones_processed"] == 2  # alpha + beta on template_a


def test_fan_out_handles_no_org_templates(monkeypatch):
    """With zero templates the run is a clean no-op."""
    import app.clone_service as cs

    tables = {
        "workstreams": _Table("workstreams", []),
        "workstream_cards": _Table("workstream_cards", []),
        "user_workstream_clones": _Table("user_workstream_clones", []),
        "user_workstream_card_dismissals": _Table(
            "user_workstream_card_dismissals", []
        ),
        "cards": _Table("cards", []),
    }
    monkeypatch.setattr(cs, "supabase", _MockSupabase(tables))
    summary = cs.fan_out_clones()
    assert summary == {
        "templates": 0,
        "clones_processed": 0,
        "cards_delivered": 0,
        "failures": 0,
    }
