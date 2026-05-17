"""Regression tests for chat scope ownership gating.

These cover the Sentinel P0 finding that `/chat`, `/chat/suggestions`, and
`/chat/suggestions/smart` accepted an arbitrary `scope_id` for workstream
scope and forwarded it to the RAG / suggestion service without checking
ownership — letting any authenticated user read another user's workstream
metadata via the chat surface.

The fix wraps each entry point with `require_workstream_access(...)` for
workstream scope. The signal scope is intentionally not gated because cards
are a shared global library per product design (consistent with the
share_links policy).
"""

from __future__ import annotations

import asyncio
from typing import Any, Dict, List

import pytest
from fastapi import HTTPException

from app.models.chat import ChatRequest
from app.routers import chat as chat_router


# ---------------------------------------------------------------------------
# Minimal supabase stub — only handles the `workstreams` lookup that
# `require_workstream_access` performs.
# ---------------------------------------------------------------------------


class _Resp:
    def __init__(self, data: List[Dict[str, Any]]):
        self.data = data


class _Query:
    def __init__(self, rows: List[Dict[str, Any]]):
        self._rows = rows
        self._filters: Dict[str, Any] = {}

    def select(self, *_a, **_kw):
        return self

    def eq(self, key, value):
        self._filters[key] = value
        return self

    def limit(self, _n):
        return self

    def execute(self):
        rows = [
            r
            for r in self._rows
            if all(r.get(k) == v for k, v in self._filters.items())
        ]
        return _Resp(rows)


class _SupabaseStub:
    def __init__(self, workstreams: List[Dict[str, Any]], members: List[Dict[str, Any]] | None = None):
        self._workstreams = workstreams
        self._members = members or []

    def table(self, name):
        if name == "workstreams":
            return _Query(self._workstreams)
        if name == "workstream_members":
            return _Query(self._members)
        raise AssertionError(f"unexpected table lookup: {name}")


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------


OWNER_ID = "11111111-1111-1111-1111-111111111111"
ATTACKER_ID = "22222222-2222-2222-2222-222222222222"
VICTIM_WS_ID = "ws-victim"


@pytest.fixture
def stub_supabase(monkeypatch):
    """Replace `app.routers.chat.supabase` with a stub for the duration of a test."""
    stub = _SupabaseStub(
        workstreams=[
            {
                "id": VICTIM_WS_ID,
                "user_id": OWNER_ID,
                "owner_type": "user",
                "name": "victim secret workstream",
                "cloned_from_id": None,
            }
        ]
    )
    monkeypatch.setattr(chat_router, "supabase", stub)
    return stub


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


# ---------------------------------------------------------------------------
# /chat (POST)
# ---------------------------------------------------------------------------


def test_chat_endpoint_rejects_cross_tenant_workstream(stub_supabase):
    request = ChatRequest(
        scope="workstream",
        scope_id=VICTIM_WS_ID,
        message="summarize this workstream",
    )
    attacker = {"id": ATTACKER_ID, "role": "user", "account_type": "paid"}

    with pytest.raises(HTTPException) as exc:
        _run(chat_router.chat_endpoint(request, current_user=attacker))

    # 404 (not 403) — masks existence of private workstreams, matching the
    # user-vs-org read pattern documented in CLAUDE.md.
    assert exc.value.status_code == 404


def test_chat_endpoint_allows_workstream_owner(stub_supabase, monkeypatch):
    # We don't want to actually run the chat service — patch it to a no-op
    # async generator and just confirm authz lets the owner through.
    async def _stub_chat(**_kw):
        if False:
            yield  # pragma: no cover

    monkeypatch.setattr(chat_router, "chat_service_chat", _stub_chat)

    request = ChatRequest(
        scope="workstream",
        scope_id=VICTIM_WS_ID,
        message="summarize this workstream",
    )
    owner = {"id": OWNER_ID, "role": "user", "account_type": "paid"}

    response = _run(chat_router.chat_endpoint(request, current_user=owner))
    # We only care that no HTTPException was raised before reaching the
    # StreamingResponse construction.
    assert response is not None


# ---------------------------------------------------------------------------
# /chat/suggestions (GET)
# ---------------------------------------------------------------------------


def test_chat_suggestions_rejects_cross_tenant_workstream(stub_supabase):
    attacker = {"id": ATTACKER_ID, "role": "user", "account_type": "paid"}

    with pytest.raises(HTTPException) as exc:
        _run(
            chat_router.chat_suggestions(
                scope="workstream",
                scope_id=VICTIM_WS_ID,
                current_user=attacker,
            )
        )

    assert exc.value.status_code == 404


# ---------------------------------------------------------------------------
# /chat/suggestions/smart (GET)
# ---------------------------------------------------------------------------


def test_smart_chat_suggestions_rejects_cross_tenant_workstream(stub_supabase):
    attacker = {"id": ATTACKER_ID, "role": "user", "account_type": "paid"}

    with pytest.raises(HTTPException) as exc:
        _run(
            chat_router.smart_chat_suggestions(
                scope="workstream",
                scope_id=VICTIM_WS_ID,
                conversation_id=None,
                current_user=attacker,
            )
        )

    assert exc.value.status_code == 404


def test_chat_suggestions_allows_workstream_owner(stub_supabase, monkeypatch):
    async def _stub_generate(**_kw):
        return {"suggestions": []}

    monkeypatch.setattr(chat_router, "chat_generate_suggestions", _stub_generate)

    owner = {"id": OWNER_ID, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.chat_suggestions(
            scope="workstream",
            scope_id=VICTIM_WS_ID,
            current_user=owner,
        )
    )
    # Owner reached the suggestion service — authz did not block.
    assert result == {"suggestions": []}


def test_smart_chat_suggestions_allows_workstream_owner(stub_supabase, monkeypatch):
    # Patch the OpenAI client used by the smart suggestions endpoint so we
    # don't need a real API call; we only care that authz let the owner pass.
    class _StubChoice:
        def __init__(self):
            self.message = type("M", (), {"content": '{"suggestions": []}'})()

    class _StubCompletion:
        def __init__(self):
            self.choices = [_StubChoice()]

    class _StubChatCompletions:
        async def create(self, **_kw):
            return _StubCompletion()

    class _StubChat:
        def __init__(self):
            self.completions = _StubChatCompletions()

    class _StubClient:
        def __init__(self):
            self.chat = _StubChat()

    monkeypatch.setattr(chat_router, "azure_openai_async_client", _StubClient())

    owner = {"id": OWNER_ID, "role": "user", "account_type": "paid"}
    result = _run(
        chat_router.smart_chat_suggestions(
            scope="workstream",
            scope_id=VICTIM_WS_ID,
            conversation_id=None,
            current_user=owner,
        )
    )
    # Owner reached the suggestion generator — authz did not block.
    assert result is not None
