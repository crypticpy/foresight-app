"""Unit tests for the conversation-replay and bulk-export admin endpoints.

These reuse the mock supabase chain from ``test_admin_usage_events`` but extend
it so a single ``_Supabase`` instance can serve different rows per table
(replay reads ``chat_conversations`` + ``chat_messages`` + ``llm_usage_events``
in the same call).
"""

from __future__ import annotations

import asyncio
import os
import sys
import uuid
from typing import Any

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import HTTPException

from tests.test_admin_usage_events import _Query, _bypass_admin


# ---------------------------------------------------------------------------
# Multi-table supabase mock
# ---------------------------------------------------------------------------


class _MultiSupabase:
    def __init__(self, tables: dict[str, list[dict[str, Any]]]):
        self._tables = tables

    def table(self, name: str):
        return _Query(self._tables.get(name, []))


def _patch_supabase(monkeypatch, tables: dict[str, list[dict[str, Any]]]):
    from app.routers import usage as usage_router

    monkeypatch.setattr(usage_router, "supabase", _MultiSupabase(tables))


def _admin():
    return {
        "id": str(uuid.uuid4()),
        "email": "admin@example.com",
        "role": "admin",
    }


def _bypass_rate_limit(monkeypatch):
    from app.routers import usage as usage_router

    monkeypatch.setattr(usage_router.limiter, "enabled", False)


def _request():
    return type("R", (), {})()


# ---------------------------------------------------------------------------
# Replay tests
# ---------------------------------------------------------------------------


def _call_replay(monkeypatch, conversation_id: str) -> dict[str, Any]:
    from app.routers import usage as usage_router

    _bypass_rate_limit(monkeypatch)
    return asyncio.run(
        usage_router.replay_conversation(
            request=_request(),
            conversation_id=conversation_id,
            current_user=_admin(),
        )
    )


def test_replay_interleaves_messages_and_events_in_order(monkeypatch):
    conv_id = "c-1"
    tables = {
        "chat_conversations": [
            {
                "id": conv_id,
                "user_id": "u",
                "scope": "global",
                "scope_id": None,
                "title": "Test",
                "created_at": "2026-05-09T12:00:00+00:00",
                "updated_at": "2026-05-09T12:05:00+00:00",
            }
        ],
        "chat_messages": [
            {
                "id": "m1",
                "role": "user",
                "content": "hi",
                "citations": [],
                "tokens_used": None,
                "model": None,
                "created_at": "2026-05-09T12:00:01+00:00",
                "conversation_id": conv_id,
            },
            {
                "id": "m2",
                "role": "assistant",
                "content": "hello",
                "citations": [],
                "tokens_used": 5,
                "model": "gpt-5.4",
                "created_at": "2026-05-09T12:00:05+00:00",
                "conversation_id": conv_id,
            },
        ],
        "llm_usage_events": [
            {
                "id": "e1",
                "created_at": "2026-05-09T12:00:02+00:00",
                "operation": "openai.chat.completions",
                "request_kind": "chat.completions",
                "conversation_id": conv_id,
                "estimated_cost_usd": 0.001,
            },
            {
                "id": "e2",
                "created_at": "2026-05-09T12:00:04+00:00",
                "operation": "openai.embeddings",
                "request_kind": "embeddings",
                "conversation_id": conv_id,
                "estimated_cost_usd": 0.0001,
            },
        ],
    }
    _patch_supabase(monkeypatch, tables)
    _bypass_admin(monkeypatch)

    result = _call_replay(monkeypatch, conv_id)

    assert result["conversation"]["id"] == conv_id
    assert result["message_count"] == 2
    assert result["llm_event_count"] == 2
    kinds = [item["kind"] for item in result["timeline"]]
    assert kinds == ["message", "llm_event", "llm_event", "message"]


def test_replay_returns_404_when_missing(monkeypatch):
    _patch_supabase(
        monkeypatch,
        {"chat_conversations": [], "chat_messages": [], "llm_usage_events": []},
    )
    _bypass_admin(monkeypatch)

    with pytest.raises(HTTPException) as excinfo:
        _call_replay(monkeypatch, "does-not-exist")
    assert excinfo.value.status_code == 404


def test_replay_message_sorts_before_event_on_tie(monkeypatch):
    conv_id = "c-tie"
    same_time = "2026-05-09T12:00:00+00:00"
    tables = {
        "chat_conversations": [
            {"id": conv_id, "created_at": same_time, "user_id": "u"}
        ],
        "chat_messages": [
            {
                "id": "msg",
                "role": "user",
                "content": "ping",
                "citations": [],
                "created_at": same_time,
                "conversation_id": conv_id,
            }
        ],
        "llm_usage_events": [
            {
                "id": "evt",
                "created_at": same_time,
                "operation": "openai.chat.completions",
                "conversation_id": conv_id,
            }
        ],
    }
    _patch_supabase(monkeypatch, tables)
    _bypass_admin(monkeypatch)

    result = _call_replay(monkeypatch, conv_id)
    assert [item["kind"] for item in result["timeline"]] == ["message", "llm_event"]


# ---------------------------------------------------------------------------
# Export tests
# ---------------------------------------------------------------------------


def _call_export(monkeypatch, **filter_overrides):
    from app.routers import usage as usage_router

    _bypass_rate_limit(monkeypatch)
    filters = usage_router._ExportFilters(**filter_overrides)
    return asyncio.run(
        usage_router.export_usage_events(
            request=_request(),
            filters=filters,
            current_user=_admin(),
        )
    )


def _consume(streaming_response) -> str:
    async def _drain():
        chunks: list[str] = []
        async for chunk in streaming_response.body_iterator:
            chunks.append(chunk if isinstance(chunk, str) else chunk.decode())
        return "".join(chunks)

    return asyncio.run(_drain())


def _make_event_row(**overrides) -> dict[str, Any]:
    base = {
        "id": str(uuid.uuid4()),
        "created_at": "2026-05-09T12:00:00+00:00",
        "user_id": str(uuid.uuid4()),
        "conversation_id": None,
        "provider": "openai",
        "model": "gpt-5.4",
        "operation": "openai.chat.completions",
        "request_kind": "chat.completions",
        "status": "success",
        "error_type": None,
        "input_tokens": 10,
        "output_tokens": 20,
        "cached_input_tokens": 0,
        "total_tokens": 30,
        "estimated_cost_usd": 0.001,
        "latency_ms": 200,
        "run_id": None,
        "task_id": None,
        "card_id": None,
        "workstream_id": None,
        "redaction_flags": [],
        "prompt_excerpt": None,
        "response_excerpt": None,
    }
    base.update(overrides)
    return base


def test_export_csv_default_format(monkeypatch):
    rows = [
        _make_event_row(id="r1", prompt_excerpt="hello", redaction_flags=["EMAIL"]),
        _make_event_row(id="r2", model="gpt-5.4-mini"),
    ]
    _patch_supabase(monkeypatch, {"llm_usage_events": rows})
    _bypass_admin(monkeypatch)

    response = _call_export(monkeypatch)
    body = _consume(response)

    assert response.media_type == "text/csv"
    lines = body.strip().split("\n")
    header = lines[0].split(",")
    assert "prompt_excerpt" in header
    assert "redaction_flags" in header
    assert "conversation_id" in header
    assert len(lines) == 1 + len(rows)


def test_export_ndjson_format(monkeypatch):
    rows = [_make_event_row(id="r1")]
    _patch_supabase(monkeypatch, {"llm_usage_events": rows})
    _bypass_admin(monkeypatch)

    response = _call_export(monkeypatch, format="json")
    body = _consume(response)

    assert response.media_type == "application/x-ndjson"
    import json

    parsed = [json.loads(line) for line in body.strip().split("\n") if line]
    assert len(parsed) == 1
    assert parsed[0]["id"] == "r1"


def test_export_filters_by_conversation_id(monkeypatch):
    rows = [
        _make_event_row(id="match", conversation_id="c-keep"),
        _make_event_row(id="skip", conversation_id="c-drop"),
        _make_event_row(id="null", conversation_id=None),
    ]
    _patch_supabase(monkeypatch, {"llm_usage_events": rows})
    _bypass_admin(monkeypatch)

    response = _call_export(monkeypatch, conversation_id="c-keep")
    body = _consume(response)
    data_lines = [line for line in body.strip().split("\n")[1:] if line]
    assert len(data_lines) == 1
    assert data_lines[0].startswith("match,")


def test_export_rejects_invalid_iso(monkeypatch):
    _patch_supabase(monkeypatch, {"llm_usage_events": []})
    _bypass_admin(monkeypatch)

    with pytest.raises(HTTPException) as excinfo:
        _call_export(monkeypatch, **{"from": "not-a-date"})
    assert excinfo.value.status_code == 400


def test_export_csv_escapes_formula_injection(monkeypatch):
    # CSV injection: cells starting with =, +, -, @, \t, \r are treated as
    # formulas by Excel/Sheets. We prefix a single quote so they render as
    # literal text. prompt_excerpt is the most likely vector since it's
    # caller-influenced even after PII redaction.
    rows = [
        _make_event_row(id="r1", prompt_excerpt="=SUM(A1:A2)"),
        _make_event_row(id="r2", response_excerpt="@SignedTextThing"),
        _make_event_row(id="r3", prompt_excerpt="+1 (555) 123-4567"),
        _make_event_row(id="r4", prompt_excerpt="-not a formula"),
        _make_event_row(id="r5", prompt_excerpt="\thidden tab"),
        _make_event_row(id="r6", prompt_excerpt="hello there"),  # benign
    ]
    _patch_supabase(monkeypatch, {"llm_usage_events": rows})
    _bypass_admin(monkeypatch)

    response = _call_export(monkeypatch)
    body = _consume(response)

    # Each dangerous prefix should now be quoted; the benign row should not.
    assert "'=SUM" in body
    assert "'@SignedTextThing" in body
    assert "'+1 (555)" in body
    assert "'-not a formula" in body
    assert "'\thidden tab" in body
    assert "'hello" not in body


def test_export_rbac_denies_non_admin(monkeypatch):
    from app import authz
    from app.routers import usage as usage_router

    def deny(user):
        raise HTTPException(status_code=403, detail="admin only")

    monkeypatch.setattr(authz, "require_admin", deny)
    monkeypatch.setattr(usage_router, "require_admin", deny)
    _patch_supabase(monkeypatch, {"llm_usage_events": [_make_event_row()]})

    with pytest.raises(HTTPException) as excinfo:
        _call_export(monkeypatch)
    assert excinfo.value.status_code == 403
