"""Tests for the tags router.

Covers the v1 contract:
  - POST apply: 404 on unknown card; 400 on empty/whitespace label;
    idempotent (re-apply doesn't duplicate); workstream_id propagated.
  - DELETE remove: idempotent for tags the user never applied; only removes
    the caller's row (other users' applications stay).
  - GET list_card_tags: viewer's tags first via the RPC.
  - GET list_tags (autocomplete): ILIKE escapes %/_ metacharacters.

The tests stub the supabase client with mocks; the RPC results are
handcrafted to mimic the Postgres functions added in PR 2.
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from types import SimpleNamespace
from typing import Any, Callable, Dict, List, Optional

import pytest
from fastapi import HTTPException

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _mock_request() -> Any:
    """SimpleNamespace shaped enough for handler bodies; slowapi's wrapper
    is skipped via ``limiter.enabled = False`` in tests that hit it."""
    return SimpleNamespace(
        client=SimpleNamespace(host="127.0.0.1"),
        state=SimpleNamespace(),
        scope={"type": "http"},
        method="POST",
        headers={},
    )


@pytest.fixture(autouse=True)
def _disable_limiter(monkeypatch):
    from app.deps import limiter

    monkeypatch.setattr(limiter, "enabled", False)


# ---------------------------------------------------------------------------
# Mock supabase: table chain + rpc dispatcher
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data=None, count: Optional[int] = None):
        self.data = data
        self.count = count


class _Chain:
    """Light supabase-py chain: select/eq/in_/limit/order/upsert/delete/range."""

    def __init__(self, store: Dict[str, List[dict]], table: str):
        self._store = store
        self._table = table
        self._filters: Dict[str, Any] = {}
        self._pending_upsert: Optional[dict] = None
        self._pending_delete = False
        self._upsert_ignore = False

    def select(self, *_a, **_kw):
        return self

    def insert(self, payload, **_kw):
        self._pending_upsert = dict(payload)
        self._upsert_ignore = False
        return self

    def upsert(self, payload, ignore_duplicates: bool = False, **_kw):
        self._pending_upsert = dict(payload)
        self._upsert_ignore = ignore_duplicates
        return self

    def delete(self):
        self._pending_delete = True
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def in_(self, key, values):
        self._filters[key] = list(values)
        return self

    def ilike(self, key, pattern):
        self._filters[f"__ilike__{key}"] = pattern
        return self

    def limit(self, *_a, **_kw):
        return self

    def order(self, *_a, **_kw):
        return self

    def range(self, *_a, **_kw):
        return self

    def execute(self):
        rows = self._store.setdefault(self._table, [])

        if self._pending_upsert is not None:
            payload = self._pending_upsert
            pk = _pk_for(self._table)
            if pk:
                exists = any(
                    all(row.get(k) == payload.get(k) for k in pk)
                    for row in rows
                )
                if exists and self._upsert_ignore:
                    self._pending_upsert = None
                    return _Resp([], count=0)
            rows.append(payload)
            self._pending_upsert = None
            return _Resp([payload], count=1)

        if self._pending_delete:
            kept = [r for r in rows if not _matches(r, self._filters)]
            deleted = [r for r in rows if _matches(r, self._filters)]
            self._store[self._table] = kept
            self._pending_delete = False
            return _Resp(deleted, count=len(deleted))

        matched = [r for r in rows if _matches(r, self._filters)]
        return _Resp(matched, count=len(matched))


def _pk_for(table: str) -> List[str]:
    return {
        "tags": ["slug"],
        "card_tags": ["card_id", "tag_id", "user_id"],
    }.get(table, [])


def _matches(row: dict, filters: Dict[str, Any]) -> bool:
    for key, val in filters.items():
        if key.startswith("__ilike__"):
            # Approximate ILIKE: substring match between %s.
            field = key[len("__ilike__") :]
            pat = val.lower().strip("%")
            if pat not in (row.get(field) or "").lower():
                return False
        elif isinstance(val, list):
            if row.get(key) not in val:
                return False
        else:
            if row.get(key) != val:
                return False
    return True


class _MockSupabase:
    def __init__(
        self,
        tables: Optional[Dict[str, List[dict]]] = None,
        rpcs: Optional[Dict[str, Callable[[dict], Any]]] = None,
    ):
        self._tables = tables or {}
        self._rpcs = rpcs or {}
        self.last_upserts: List[dict] = []

    def table(self, name: str) -> _Chain:
        chain = _Chain(self._tables, name)
        original = chain.execute

        def wrapped():
            if chain._pending_upsert is not None:
                self.last_upserts.append(
                    {"table": name, "payload": dict(chain._pending_upsert)}
                )
            return original()

        chain.execute = wrapped
        return chain

    def rpc(self, name: str, params: dict):
        impl = self._rpcs.get(name)
        if impl is None:
            raise AssertionError(f"unmocked rpc: {name}")

        class _RpcChain:
            def execute(_self):
                return _Resp(impl(params))

        return _RpcChain()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _uuid() -> str:
    return str(uuid.uuid4())


def _ts() -> str:
    return "2026-05-19T17:00:00+00:00"


def _patch(monkeypatch, mock_sb):
    from app.routers import tags as tags_module

    monkeypatch.setattr(tags_module, "supabase", mock_sb)
    return tags_module


def _run(coro):
    return asyncio.run(coro)


# ---------------------------------------------------------------------------
# POST /cards/{id}/tags
# ---------------------------------------------------------------------------


def test_apply_tag_404_when_card_missing(monkeypatch):
    from app.models.tag import TagApplyRequest

    user_id = _uuid()
    mock_sb = _MockSupabase(tables={"cards": []})
    tags_module = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            tags_module.apply_tag_to_card(
                request=_mock_request(),
                card_id=_uuid(),
                payload=TagApplyRequest(label="climate"),
                current_user={"id": user_id},
            )
        )
    assert exc.value.status_code == 404


def test_apply_tag_400_on_empty_label(monkeypatch):
    """find_or_create_tag returns NULL for empty slugs → 400."""
    from app.models.tag import TagApplyRequest

    user_id = _uuid()
    card_id = _uuid()

    mock_sb = _MockSupabase(
        tables={"cards": [{"id": card_id}]},
        rpcs={"find_or_create_tag": lambda _params: None},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            tags_module.apply_tag_to_card(
                request=_mock_request(),
                card_id=card_id,
                # Pydantic min_length=1 means we exercise this via punctuation
                # that normalizes to empty — labels like "!!!" → NULL slug.
                payload=TagApplyRequest(label="!!!"),
                current_user={"id": user_id},
            )
        )
    assert exc.value.status_code == 400


def test_apply_tag_idempotent(monkeypatch):
    """Re-applying the same tag does not duplicate the row."""
    from app.models.tag import TagApplyRequest

    user_id = _uuid()
    card_id = _uuid()
    tag_id = _uuid()
    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": user_id,
        "created_at": _ts(),
    }

    def _rpc_find_or_create(_params):
        return tag_row

    def _rpc_card_tag_summary(_params):
        return [
            {
                **tag_row,
                "count": 1,
                "applied_by_me": True,
            }
        ]

    mock_sb = _MockSupabase(
        tables={
            "cards": [{"id": card_id}],
            "tags": [tag_row],
            "card_tags": [],
        },
        rpcs={
            "find_or_create_tag": _rpc_find_or_create,
            "card_tag_summary": _rpc_card_tag_summary,
        },
    )
    tags_module = _patch(monkeypatch, mock_sb)

    payload = TagApplyRequest(label="climate")
    user = {"id": user_id}

    res1 = _run(
        tags_module.apply_tag_to_card(
            request=_mock_request(), card_id=card_id, payload=payload, current_user=user
        )
    )
    res2 = _run(
        tags_module.apply_tag_to_card(
            request=_mock_request(), card_id=card_id, payload=payload, current_user=user
        )
    )

    assert len(res1.tags) == 1
    assert len(res2.tags) == 1
    # card_tags table should not have grown a second row (ignore_duplicates).
    assert len(mock_sb._tables["card_tags"]) == 1


def test_apply_tag_propagates_workstream_id(monkeypatch):
    from app.models.tag import TagApplyRequest

    user_id = _uuid()
    card_id = _uuid()
    ws_id = _uuid()
    tag_id = _uuid()
    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": user_id,
        "created_at": _ts(),
    }

    mock_sb = _MockSupabase(
        tables={
            "cards": [{"id": card_id}],
            "card_tags": [],
        },
        rpcs={
            "find_or_create_tag": lambda _params: tag_row,
            "card_tag_summary": lambda _params: [
                {**tag_row, "count": 1, "applied_by_me": True}
            ],
        },
    )
    tags_module = _patch(monkeypatch, mock_sb)

    _run(
        tags_module.apply_tag_to_card(
            request=_mock_request(),
            card_id=card_id,
            payload=TagApplyRequest(label="climate", workstream_id=ws_id),
            current_user={"id": user_id},
        )
    )

    assert mock_sb.last_upserts
    upsert = mock_sb.last_upserts[-1]
    assert upsert["table"] == "card_tags"
    assert upsert["payload"]["workstream_id"] == ws_id
    assert upsert["payload"]["user_id"] == user_id


# ---------------------------------------------------------------------------
# DELETE /cards/{id}/tags/{slug}
# ---------------------------------------------------------------------------


def test_remove_tag_only_deletes_own_row(monkeypatch):
    """Deleting my row leaves other users' applications intact."""
    me = _uuid()
    other = _uuid()
    card_id = _uuid()
    tag_id = _uuid()

    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": me,
        "created_at": _ts(),
    }
    my_app = {"card_id": card_id, "tag_id": tag_id, "user_id": me}
    other_app = {"card_id": card_id, "tag_id": tag_id, "user_id": other}

    def _summary_after(_params):
        # Reflect current store state.
        rows = mock_sb._tables.get("card_tags", [])
        users = {r["user_id"] for r in rows if r["tag_id"] == tag_id}
        if not users:
            return []
        return [
            {
                **tag_row,
                "count": len(users),
                "applied_by_me": me in users,
            }
        ]

    mock_sb = _MockSupabase(
        tables={
            "tags": [tag_row],
            "card_tags": [my_app, other_app],
        },
        rpcs={"card_tag_summary": _summary_after},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.remove_tag_from_card(
            card_id=card_id, slug="climate", current_user={"id": me}
        )
    )

    remaining = mock_sb._tables["card_tags"]
    assert len(remaining) == 1
    assert remaining[0]["user_id"] == other
    # Other user still has their application — chip persists.
    assert res.tags[0].count == 1
    assert res.tags[0].applied_by_me is False


def test_remove_tag_idempotent_when_unknown(monkeypatch):
    """Deleting a slug that doesn't exist returns the unchanged list."""
    me = _uuid()
    card_id = _uuid()

    mock_sb = _MockSupabase(
        tables={"tags": [], "card_tags": []},
        rpcs={"card_tag_summary": lambda _params: []},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.remove_tag_from_card(
            card_id=card_id, slug="nonexistent", current_user={"id": me}
        )
    )
    assert res.tags == []


# ---------------------------------------------------------------------------
# GET /cards/{id}/tags
# ---------------------------------------------------------------------------


def test_list_card_tags_preserves_rpc_order(monkeypatch):
    """The router does not re-sort what the RPC returned."""
    me = _uuid()
    card_id = _uuid()

    def _summary(_params):
        # RPC orders "mine first" — viewer's tag first, then alphabetical.
        return [
            {
                "id": _uuid(),
                "slug": "mine-zulu",
                "label": "mine zulu",
                "created_by": me,
                "created_at": _ts(),
                "count": 1,
                "applied_by_me": True,
            },
            {
                "id": _uuid(),
                "slug": "alpha",
                "label": "alpha",
                "created_by": _uuid(),
                "created_at": _ts(),
                "count": 3,
                "applied_by_me": False,
            },
        ]

    mock_sb = _MockSupabase(rpcs={"card_tag_summary": _summary})
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.list_card_tags(card_id=card_id, current_user={"id": me})
    )
    assert [t.slug for t in res.tags] == ["mine-zulu", "alpha"]
    assert res.tags[0].applied_by_me is True
    assert res.tags[1].applied_by_me is False


# ---------------------------------------------------------------------------
# GET /tags (autocomplete) — ILIKE escaping
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# POST /cards/tags-batch — multi-card hydration for list views
# ---------------------------------------------------------------------------


def test_list_card_tags_batch_groups_by_card(monkeypatch):
    """Rows for multiple cards are grouped into the response dict; cards
    with no tags are omitted entirely."""
    from app.models.tag import CardTagsBatchRequest

    me = _uuid()
    card_a = _uuid()
    card_b = _uuid()
    card_c = _uuid()  # has no tags; must be absent from response
    t1, t2, t3 = _uuid(), _uuid(), _uuid()

    def _batch(_params):
        # Mirrors the SQL RPC: ordered by card_id, applied_by_me desc, label asc.
        return [
            {
                "card_id": card_a,
                "id": t1,
                "slug": "mine",
                "label": "mine",
                "created_by": me,
                "created_at": _ts(),
                "count": 2,
                "applied_by_me": True,
            },
            {
                "card_id": card_a,
                "id": t2,
                "slug": "alpha",
                "label": "alpha",
                "created_by": _uuid(),
                "created_at": _ts(),
                "count": 5,
                "applied_by_me": False,
            },
            {
                "card_id": card_b,
                "id": t3,
                "slug": "policy",
                "label": "policy",
                "created_by": _uuid(),
                "created_at": _ts(),
                "count": 1,
                "applied_by_me": False,
            },
        ]

    mock_sb = _MockSupabase(rpcs={"card_tags_batch": _batch})
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.list_card_tags_batch(
            payload=CardTagsBatchRequest(card_ids=[card_a, card_b, card_c]),
            current_user={"id": me},
        )
    )

    assert set(res.tags_by_card.keys()) == {card_a, card_b}
    assert [t.slug for t in res.tags_by_card[card_a]] == ["mine", "alpha"]
    assert res.tags_by_card[card_a][0].applied_by_me is True
    assert res.tags_by_card[card_b][0].slug == "policy"


def test_list_card_tags_batch_short_circuits_empty_input(monkeypatch):
    """No card_ids → empty payload without hitting the database."""
    from app.models.tag import CardTagsBatchRequest

    mock_sb = _MockSupabase(
        rpcs={"card_tags_batch": lambda _p: pytest.fail("RPC should not run")}
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.list_card_tags_batch(
            payload=CardTagsBatchRequest(card_ids=[]),
            current_user={"id": _uuid()},
        )
    )
    assert res.tags_by_card == {}


def test_list_card_tags_batch_rejects_oversize(monkeypatch):
    """Over the batch limit → 400, not a silently truncated query."""
    from app.models.tag import CardTagsBatchRequest, TAG_BATCH_CARD_LIMIT

    mock_sb = _MockSupabase(
        rpcs={"card_tags_batch": lambda _p: pytest.fail("RPC should not run")}
    )
    tags_module = _patch(monkeypatch, mock_sb)

    too_many = [_uuid() for _ in range(TAG_BATCH_CARD_LIMIT + 1)]
    with pytest.raises(HTTPException) as exc:
        _run(
            tags_module.list_card_tags_batch(
                payload=CardTagsBatchRequest(card_ids=too_many),
                current_user={"id": _uuid()},
            )
        )
    assert exc.value.status_code == 400


# ---------------------------------------------------------------------------
# GET /tags/{slug} — tag detail page payload
# ---------------------------------------------------------------------------


def test_get_tag_detail_404_when_slug_missing(monkeypatch):
    mock_sb = _MockSupabase(tables={"tags": []})
    tags_module = _patch(monkeypatch, mock_sb)

    with pytest.raises(HTTPException) as exc:
        _run(
            tags_module.get_tag_detail(
                slug="missing", limit=20, offset=0, current_user={"id": _uuid()}
            )
        )
    assert exc.value.status_code == 404


def test_get_tag_detail_returns_cards_in_rpc_order(monkeypatch):
    """The RPC returns card_ids ordered by most-recent application; the
    handler must preserve that order even though `cards.in_(...)` returns
    rows in arbitrary order."""
    tag_id = _uuid()
    card_a = _uuid()
    card_b = _uuid()

    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": _uuid(),
        "created_at": _ts(),
    }
    # RPC ordering: card_b is more recent, so it should appear first.
    rpc_rows = [
        {"card_id": card_b, "most_recent_at": _ts(), "total": 2},
        {"card_id": card_a, "most_recent_at": _ts(), "total": 2},
    ]
    # `cards.in_(...)` returns these in DB order; the handler must reorder
    # to match the RPC sequence.
    card_rows = [
        {
            "id": card_a,
            "status": "active",
            "slug": "card-a",
            "name": "Card A",
            "summary": "first",
            "pillar_id": "CH",
            "stage_id": "1_concept",
            "horizon": "H1",
            "impact_score": 50,
            "relevance_score": 50,
            "velocity_score": 50,
            "novelty_score": 50,
            "signal_quality_score": 50,
            "velocity_trend": None,
            "trend_direction": None,
            "top25_relevance": None,
            "created_at": _ts(),
            "updated_at": _ts(),
        },
        {
            "id": card_b,
            "status": "active",
            "slug": "card-b",
            "name": "Card B",
            "summary": "second",
            "pillar_id": "EW",
            "stage_id": "2_exploring",
            "horizon": "H2",
            "impact_score": 60,
            "relevance_score": 60,
            "velocity_score": 60,
            "novelty_score": 60,
            "signal_quality_score": 60,
            "velocity_trend": None,
            "trend_direction": None,
            "top25_relevance": None,
            "created_at": _ts(),
            "updated_at": _ts(),
        },
    ]

    mock_sb = _MockSupabase(
        tables={"tags": [tag_row], "cards": card_rows},
        rpcs={"tag_cards_page": lambda _params: rpc_rows},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.get_tag_detail(
            slug="climate", limit=20, offset=0, current_user={"id": _uuid()}
        )
    )

    assert res.tag.slug == "climate"
    assert [c.id for c in res.cards] == [card_b, card_a]
    assert res.total == 2


def test_get_tag_detail_empty_when_no_applications(monkeypatch):
    """Tag exists but has no card_tags rows → empty list, total=0."""
    tag_id = _uuid()
    tag_row = {
        "id": tag_id,
        "slug": "orphan",
        "label": "orphan",
        "created_by": _uuid(),
        "created_at": _ts(),
    }
    mock_sb = _MockSupabase(
        tables={"tags": [tag_row], "cards": []},
        rpcs={"tag_cards_page": lambda _params: []},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.get_tag_detail(
            slug="orphan", limit=20, offset=0, current_user={"id": _uuid()}
        )
    )
    assert res.cards == []
    assert res.total == 0


def test_get_tag_detail_drops_card_archived_between_rpc_and_hydrate(monkeypatch):
    """Race: card flips to archived between the RPC and the hydration
    query. The RPC saw it as active and returned its id; the hydrate
    must drop it via `.eq('status','active')` so the UI never renders a
    dead-link tile. `total` keeps the RPC value (snapshot count)."""
    tag_id = _uuid()
    card_id = _uuid()

    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": _uuid(),
        "created_at": _ts(),
    }
    # RPC ran first and considered the card active.
    rpc_rows = [{"card_id": card_id, "most_recent_at": _ts(), "total": 1}]
    # By the time the hydrate query runs, status has flipped.
    card_rows = [
        {
            "id": card_id,
            "status": "archived",
            "slug": "raced-card",
            "name": "Raced",
            "summary": "",
            "pillar_id": "CH",
            "stage_id": "1_concept",
            "horizon": "H1",
            "impact_score": 0,
            "relevance_score": 0,
            "velocity_score": 0,
            "novelty_score": 0,
            "signal_quality_score": 0,
            "velocity_trend": None,
            "trend_direction": None,
            "top25_relevance": None,
            "created_at": _ts(),
            "updated_at": _ts(),
        },
    ]

    mock_sb = _MockSupabase(
        tables={"tags": [tag_row], "cards": card_rows},
        rpcs={"tag_cards_page": lambda _params: rpc_rows},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.get_tag_detail(
            slug="climate", limit=20, offset=0, current_user={"id": _uuid()}
        )
    )
    # The raced card never reaches the response.
    assert res.cards == []
    # Total reflects the RPC snapshot — not adjusted for the race.
    assert res.total == 1


def test_get_tag_detail_excludes_archived_via_rpc_contract(monkeypatch):
    """`tag_cards_page` filters archived rows inside its CTE, so the route
    relies on the RPC's contract: only active card_ids come back and total
    reflects only active cards. The route no longer applies a second
    status filter (that would shrink already-paginated results below
    `limit`)."""
    tag_id = _uuid()
    card_active = _uuid()

    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": _uuid(),
        "created_at": _ts(),
    }
    # RPC hides archived rows entirely; only the active card_id surfaces
    # and total counts the active set.
    rpc_rows = [
        {"card_id": card_active, "most_recent_at": _ts(), "total": 1},
    ]
    card_rows = [
        {
            "id": card_active,
            "status": "active",
            "slug": "card-active",
            "name": "Active",
            "summary": "",
            "pillar_id": "CH",
            "stage_id": "1_concept",
            "horizon": "H1",
            "impact_score": 0,
            "relevance_score": 0,
            "velocity_score": 0,
            "novelty_score": 0,
            "signal_quality_score": 0,
            "velocity_trend": None,
            "trend_direction": None,
            "top25_relevance": None,
            "created_at": _ts(),
            "updated_at": _ts(),
        },
    ]

    mock_sb = _MockSupabase(
        tables={"tags": [tag_row], "cards": card_rows},
        rpcs={"tag_cards_page": lambda _params: rpc_rows},
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.get_tag_detail(
            slug="climate", limit=20, offset=0, current_user={"id": _uuid()}
        )
    )
    assert [c.id for c in res.cards] == [card_active]
    assert res.total == 1


def test_get_tag_detail_preserves_total_when_offset_past_end(monkeypatch):
    """When `offset` lands past the last row the page RPC returns 0 rows
    and the window-function total is unavailable. The route must call
    `tag_cards_count` so `total` still reflects the global count — otherwise
    pagination state on the client (e.g. 'showing N of M') breaks."""
    tag_id = _uuid()
    tag_row = {
        "id": tag_id,
        "slug": "climate",
        "label": "climate",
        "created_by": _uuid(),
        "created_at": _ts(),
    }

    mock_sb = _MockSupabase(
        tables={"tags": [tag_row], "cards": []},
        rpcs={
            "tag_cards_page": lambda _params: [],
            "tag_cards_count": lambda _params: 7,
        },
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.get_tag_detail(
            slug="climate", limit=20, offset=40, current_user={"id": _uuid()}
        )
    )
    assert res.cards == []
    assert res.total == 7


def test_get_tag_detail_skips_count_call_when_offset_is_zero(monkeypatch):
    """offset=0 + empty page means genuinely zero cards — the route must
    NOT call `tag_cards_count` (extra round-trip for no information)."""
    tag_id = _uuid()
    tag_row = {
        "id": tag_id,
        "slug": "orphan",
        "label": "orphan",
        "created_by": _uuid(),
        "created_at": _ts(),
    }

    mock_sb = _MockSupabase(
        tables={"tags": [tag_row], "cards": []},
        rpcs={
            "tag_cards_page": lambda _params: [],
            "tag_cards_count": lambda _params: pytest.fail(
                "count RPC should not run when offset=0"
            ),
        },
    )
    tags_module = _patch(monkeypatch, mock_sb)

    res = _run(
        tags_module.get_tag_detail(
            slug="orphan", limit=20, offset=0, current_user={"id": _uuid()}
        )
    )
    assert res.cards == []
    assert res.total == 0


def test_list_tags_escapes_ilike_metachars(monkeypatch):
    """% and _ in the query don't pattern-match the rest of the dictionary."""
    captured: Dict[str, Any] = {}

    class _CapturingChain(_Chain):
        def ilike(self, key, pattern):
            captured["pattern"] = pattern
            return super().ilike(key, pattern)

    class _CapturingSupabase(_MockSupabase):
        def table(self, name: str):
            chain = _CapturingChain(self._tables, name)
            return chain

    mock_sb = _CapturingSupabase(tables={"tags": []})
    tags_module = _patch(monkeypatch, mock_sb)

    _run(tags_module.list_tags(q="50%_off", limit=5, current_user={"id": _uuid()}))

    assert "pattern" in captured
    assert "\\%" in captured["pattern"]
    assert "\\_" in captured["pattern"]
